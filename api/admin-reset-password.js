/**
 * Vercel Serverless Function & Node.js Endpoint: Redefinição de Senha Administrativa
 * Endpoint: POST /api/admin-reset-password
 * 
 * Segurança:
 * 1. Exige cabeçalho 'Authorization: Bearer <TOKEN_JWT_DO_SOLICITANTE>'
 * 2. Valida o Token JWT no Supabase Auth para obter o usuário real
 * 3. Valida se o solicitante possui role 'admin' ou 'gestor'
 * 4. Utiliza a SUPABASE_SERVICE_ROLE_KEY exclusivamente no backend para alterar a senha
 */

const { createClient } = require('@supabase/supabase-js');

// Helper para inicializar o cliente Supabase com a Service Role Key
function getSupabaseAdmin() {
    // Importa as configurações centrais já existentes do projeto
    const { SUPABASE_ENVIRONMENTS, AMBIENTE_ATIVO } = require('../js/config/supabaseClient.js');

    // 1. Determina o ambiente ativo (pode ser sobrescrito por variável de ambiente se desejar)
    const ambiente = (process.env.SUPABASE_AMBIENTE || AMBIENTE_ATIVO || 'LOCAL').toUpperCase();
    const configAmbiente = SUPABASE_ENVIRONMENTS[ambiente] || SUPABASE_ENVIRONMENTS.LOCAL;

    // 2. A URL vem diretamente da configuração já conhecida do sistema
    const supabaseUrl = configAmbiente.URL;

    // 3. O .env guarda EXCLUSIVAMENTE o segredo (a Service Role Key de admin)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey && ambiente === 'LOCAL') {
        serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.6SY3guSTC4EAwhMKk7sQkkzYXdZSww9Y3rX0yY0jKLs';
    }

    if (!serviceRoleKey) {
        throw new Error(`A chave SUPABASE_SERVICE_ROLE_KEY não está configurada no .env.`);
    }

    console.log(`🔌 [AdminResetPassword] Conectando ao Supabase (${ambiente}): ${supabaseUrl}`);

    const clientOptions = {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    };

    if (supabaseUrl.includes('ngrok')) {
        clientOptions.global = {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        };
    }

    return createClient(supabaseUrl, serviceRoleKey, clientOptions);
}

async function handleAdminResetPassword(req, res) {
    // Tratar CORS
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
        // 1. Extração do Bearer Token
        const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
        if (!authHeader.startsWith('Bearer ')) {
            const payload = { error: 'Cabeçalho de autorização inválido ou ausente. Faça login novamente.' };
            if (res.status) return res.status(401).json(payload);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        const callerToken = authHeader.replace('Bearer ', '').trim();

        // 2. Extração do Corpo da Requisição
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }
        const { targetUserId, newPassword } = body || {};

        if (!targetUserId || !newPassword) {
            const payload = { error: 'Parâmetros "targetUserId" e "newPassword" são obrigatórios.' };
            if (res.status) return res.status(400).json(payload);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        if (String(newPassword).length < 6) {
            const payload = { error: 'A nova senha deve possuir no mínimo 6 caracteres.' };
            if (res.status) return res.status(400).json(payload);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 3. Inicializar Supabase Admin com Service Role
        const supabaseAdmin = getSupabaseAdmin();

        // 4. Validação estrita do solicitante pelo JWT via Supabase Auth
        const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken);
        if (authErr || !callerUser) {
            console.warn('⚠️ [ResetPassword] Falha ao validar token do solicitante:', authErr);
            const payload = { error: 'Sessão expirada ou token inválido. Faça login novamente.' };
            if (res.status) return res.status(401).json(payload);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 5. Verificar se o solicitante possui permissão de ADMIN ou GESTOR
        // Primeiro checa app_metadata (blindado), depois profiles no banco
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
            console.warn(`🚨 [ResetPassword] Tentativa não autorizada pelo usuário: ${callerUser.email} (ID: ${callerUser.id})`);
            const payload = { error: 'Acesso negado: Apenas Administradores podem redefinir a senha de usuários.' };
            if (res.status) return res.status(403).json(payload);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        // 6. Executar a alteração da senha com privilégio administrativo
        const { data: updatedUserData, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            { password: newPassword }
        );

        if (updateErr) {
            console.error('❌ [ResetPassword] Erro ao atualizar senha no Supabase Auth:', updateErr);
            const payload = { error: 'Erro ao redefinir senha no Supabase: ' + updateErr.message };
            if (res.status) return res.status(500).json(payload);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(payload));
        }

        console.log(`✅ [ResetPassword] Senha do usuário ID ${targetUserId} redefinida com sucesso por ${callerUser.email}`);

        const responsePayload = {
            success: true,
            message: 'Senha redefinida com sucesso!',
            user: {
                id: updatedUserData.user.id,
                email: updatedUserData.user.email
            }
        };

        if (res.status) return res.status(200).json(responsePayload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(responsePayload));

    } catch (err) {
        console.error('❌ [ResetPassword] Exceção inesperada:', err);
        const payload = { error: err.message || 'Erro interno no servidor.' };
        if (res.status) return res.status(500).json(payload);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload));
    }
}

module.exports = handleAdminResetPassword;
