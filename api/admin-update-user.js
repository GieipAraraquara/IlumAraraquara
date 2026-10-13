/**
 * Vercel Serverless Function & Node.js Endpoint: Atualização de Usuários (Status / Role)
 * Endpoint: POST /api/admin-update-user
 * 
 * Permite que administradores aprovem (status: 'aprovado', ativo: true),
 * bloqueiem (status: 'bloqueado', ativo: false) ou alterem o papel de outro usuário
 * contornando a RLS restritiva com privilégios de Service Role.
 */

const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
    const { SUPABASE_ENVIRONMENTS, AMBIENTE_ATIVO } = require('../js/config/supabaseClient.js');
    const ambiente = (process.env.SUPABASE_AMBIENTE || AMBIENTE_ATIVO || 'LOCAL').toUpperCase();
    const configAmbiente = SUPABASE_ENVIRONMENTS[ambiente] || SUPABASE_ENVIRONMENTS.LOCAL;
    const supabaseUrl = configAmbiente.URL;
    let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey && ambiente === 'LOCAL') {
        serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.6SY3guSTC4EAwhMKk7sQkkzYXdZSww9Y3rX0yY0jKLs';
    }

    if (!serviceRoleKey) {
        throw new Error(`A chave SUPABASE_SERVICE_ROLE_KEY não está configurada no .env.`);
    }

    const clientOptions = {
        auth: { autoRefreshToken: false, persistSession: false }
    };
    if (supabaseUrl.includes('ngrok')) {
        clientOptions.global = { headers: { 'ngrok-skip-browser-warning': 'true' } };
    }

    return createClient(supabaseUrl, serviceRoleKey, clientOptions);
}

async function handleAdminUpdateUser(req, res) {
    if (res.setHeader) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Authorization'
        );
    }

    if (req.method === 'OPTIONS') {
        if (res.status) return res.status(200).end();
        res.writeHead(200);
        return res.end();
    }

    if (req.method !== 'POST') {
        const payload = { error: 'Método não permitido. Utilize POST.' };
        if (res.status) return res.status(405).json(payload);
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload));
    }

    try {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
        if (!authHeader.startsWith('Bearer ')) {
            const payload = { error: 'Cabeçalho de autorização ausente.' };
            if (res.status) return res.status(401).json(payload);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        const callerToken = authHeader.replace('Bearer ', '').trim();
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }

        const { targetUserId, updates } = body || {};

        if (!targetUserId || !updates) {
            const payload = { error: 'Parâmetros "targetUserId" e "updates" são obrigatórios.' };
            if (res.status) return res.status(400).json(payload);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        const supabaseAdmin = getSupabaseAdmin();

        // 1. Validar solicitante via Token
        const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken);
        if (authErr || !callerUser) {
            const payload = { error: 'Sessão expirada ou token inválido.' };
            if (res.status) return res.status(401).json(payload);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 2. Verificar se solicitante é admin ou gestor
        let isAdmin = false;
        const appRole = (callerUser.app_metadata?.role || '').toLowerCase();
        if (['admin', 'gestor'].includes(appRole)) {
            isAdmin = true;
        } else {
            const { data: callerProfile, error: profErr } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', callerUser.id)
                .maybeSingle();

            if (!profErr && callerProfile) {
                const profileRole = (callerProfile.role || '').toLowerCase();
                if (['admin', 'gestor'].includes(profileRole)) {
                    isAdmin = true;
                }
            }
        }

        if (!isAdmin) {
            const payload = { error: 'Acesso negado: Requer privilégios de Administrador.' };
            if (res.status) return res.status(403).json(payload);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 3. Montar payload de atualização permitido
        const allowedUpdates = {};
        if (updates.ativo !== undefined) allowedUpdates.ativo = Boolean(updates.ativo);
        if (updates.status !== undefined) allowedUpdates.status = String(updates.status);
        if (updates.role !== undefined) allowedUpdates.role = String(updates.role);
        allowedUpdates.updated_at = new Date().toISOString();

        // 4. Atualizar na tabela profiles com privilégio de Admin (ignora RLS)
        const { error: updateProfileErr } = await supabaseAdmin
            .from('profiles')
            .update(allowedUpdates)
            .eq('id', targetUserId);

        if (updateProfileErr) {
            console.error('❌ [AdminUpdateUser] Erro ao atualizar tabela profiles:', updateProfileErr);
            const payload = { error: 'Erro ao atualizar profiles: ' + updateProfileErr.message };
            if (res.status) return res.status(500).json(payload);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 5. Se o papel (role) foi alterado, sincroniza também no app_metadata do Supabase Auth
        if (updates.role) {
            try {
                await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
                    app_metadata: { role: updates.role }
                });
            } catch (authMetaErr) {
                console.warn('⚠️ [AdminUpdateUser] Aviso ao sincronizar app_metadata:', authMetaErr);
            }
        }

        console.log(`✅ [AdminUpdateUser] Usuário ID ${targetUserId} atualizado com sucesso por ${callerUser.email}:`, allowedUpdates);

        const responsePayload = {
            success: true,
            message: 'Usuário atualizado com sucesso!',
            updates: allowedUpdates
        };

        if (res.status) return res.status(200).json(responsePayload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(responsePayload));

    } catch (err) {
        console.error('❌ [AdminUpdateUser] Exceção:', err);
        const payload = { error: err.message || 'Erro interno no servidor.' };
        if (res.status) return res.status(500).json(payload);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload));
    }
}

module.exports = handleAdminUpdateUser;
