/**
 * enviar_notificacao_admin.js
 * Script para disparar Notificação Push Nativa (VAPID) exclusivamente
 * para usuários pertencentes à categoria 'admin'.
 * 
 * Execução: node enviar_notificacao_admin.js
 */

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// 1. Configuração das chaves VAPID (Par de Chaves Públicas/Privadas Nativas Web Push)
const VAPID_PUBLIC_KEY = 'BOfsKSI8otVOAeC-wDB09n9E6pZkX6O17N860mE_p-l-VAb4mbEDXWiHisL9ji9RgI-ltltMRhQGl4h21862HHw';
const VAPID_PRIVATE_KEY = 'j9_sHSG2d05KLH6vgtWwckv3AEn2tPXxLsBhB_yCr00';

webpush.setVapidDetails(
    'mailto:suporte@luzararaquara.com.br',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// 2. Configuração do Cliente Supabase
const SUPABASE_URL = 'https://bqkfqedxlyipjftdhgse.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nyPJfTBioOI5QEdzjKzKLw_AHYWy60R';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LOCAL_STORAGE_FILE = path.join(__dirname, 'push_subscriptions.json');

async function dispararNotificacaoAdmin() {
    console.log('===========================================================');
    console.log('🚀 [WebPush Admin] Iniciando envio de notificação segmentada...');
    console.log('🎯 Alvo: Categoria "admin"');
    console.log('===========================================================');

    // Payload da Notificação de Teste
    const payload = JSON.stringify({
        title: '🚨 Teste Notificação Admin',
        body: 'Esta notificação de teste foi enviada EXCLUSIVAMENTE para a categoria "admin"!',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        url: './Painel.html',
        tag: 'teste-admin-' + Date.now()
    });

    let assinaturas = [];

    // Tenta carregar do Supabase primeiro
    try {
        const { data, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('role', 'admin');

        if (!error && data) {
            assinaturas = data;
        } else {
            if (error && error.message.includes('push_subscriptions')) {
                console.warn('ℹ️ Tabela "push_subscriptions" ainda não criada no Supabase (verifique o SQL em Importar-BancoDeDados/criar_tabela_push_subscriptions.sql).');
            }
        }
    } catch (e) {}

    // Fallback: Tenta carregar do arquivo local se não encontrou no Supabase
    if (assinaturas.length === 0 && fs.existsSync(LOCAL_STORAGE_FILE)) {
        try {
            const fileData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE, 'utf-8'));
            assinaturas = (fileData || []).filter(sub => sub.role === 'admin');
            if (assinaturas.length > 0) {
                console.log(`📂 [Local Fallback] Carregadas ${assinaturas.length} assinaturas locais do arquivo push_subscriptions.json.`);
            }
        } catch (err) {}
    }

    if (assinaturas.length === 0) {
        console.warn('⚠️ Nenhuma assinatura registrada para a categoria "admin".');
        console.log('\n📌 COMO TESTAR NO NAVEGADOR:');
        console.log('1. Crie a tabela no Supabase executando o arquivo: Importar-BancoDeDados/criar_tabela_push_subscriptions.sql');
        console.log('2. Abra o sistema no navegador (http://localhost:8000/Painel.html).');
        console.log('3. Clique no ícone de SINO (Notificações) no cabeçalho superior direito e permita as notificações.');
        console.log('4. Execute novamente: node enviar_notificacao_admin.js\n');
        return;
    }

    console.log(`📱 Encontrada(s) ${assinaturas.length} assinatura(s) para administradores. Enviando...`);

    let sucessos = 0;
    let falhas = 0;

    for (const sub of assinaturas) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };

        try {
            await webpush.sendNotification(pushSubscription, payload);
            sucessos++;
            console.log(`✅ Notificação entregue com sucesso para admin: ${sub.user_email || sub.endpoint.slice(0, 45) + '...'}`);
        } catch (err) {
            falhas++;
            console.error(`❌ Falha ao enviar para ${sub.user_email || sub.endpoint.slice(0, 45)}:`, err.statusCode || err.message);
        }
    }

    console.log('===========================================================');
    console.log(`📊 Resultado Final: ${sucessos} entregue(s) com sucesso, ${falhas} falha(s).`);
    console.log('===========================================================');
}

dispararNotificacaoAdmin();
