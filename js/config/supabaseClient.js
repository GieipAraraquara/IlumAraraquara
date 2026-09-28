/**
 * Infrastructure Layer - Supabase Configuration
 * Permite alternar facilmente entre o ambiente LOCAL (Self-Hosted) e ONLINE (Supabase Cloud).
 */

const SUPABASE_ENVIRONMENTS = {
    // 🏠 AMBIENTE LOCAL (Self-Hosted Docker)
    LOCAL: {
        URL: (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
            ? 'http://localhost:8001'
            : 'https://congested-synergy-affected.ngrok-free.dev',
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.ICKUfcc29vSnq8wme0GuMujaROsH5T-RlNtJVcAzFb4'
    },

    // ☁️ AMBIENTE ONLINE (Supabase Cloud)
    ONLINE: {
        URL: 'https://bqkfqedxlyipjftdhgse.supabase.co',
        KEY: 'sb_publishable_nyPJfTBioOI5QEdzjKzKLw_AHYWy60R'
    }
};

// =========================================================================
// ⚙️ SELEÇÃO DE AMBIENTE ATIVO
// Para alternar para o banco da nuvem, basta trocar 'LOCAL' por 'ONLINE' abaixo:
// =========================================================================
const AMBIENTE_ATIVO = 'LOCAL'; 

const CONFIG_ATIVA = SUPABASE_ENVIRONMENTS[AMBIENTE_ATIVO] || SUPABASE_ENVIRONMENTS.LOCAL;

const SUPABASE_URL = CONFIG_ATIVA.URL;
const SUPABASE_PUBLISHABLE_KEY = CONFIG_ATIVA.KEY;

// Exporta variáveis globais para retrocompatibilidade
if (typeof window !== 'undefined') {
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;
    window.SUPABASE_ENVIRONMENTS = SUPABASE_ENVIRONMENTS;
}

let clientInstance = null;

if (typeof window !== 'undefined' && window.supabase) {
    try {
        const clientOptions = {};
        // Se estiver acessando via túnel ngrok, adiciona cabeçalho que pula a tela de aviso do ngrok
        if (SUPABASE_URL.includes('ngrok')) {
            clientOptions.global = {
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            };
        }
        clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, clientOptions);
        console.log(`⚡ [SupabaseClient] Modo [${AMBIENTE_ATIVO}] ativado com sucesso:`, SUPABASE_URL);
    } catch (err) {
        console.error('❌ [SupabaseClient] Falha ao inicializar o Supabase Client:', err);
    }
} else if (typeof window !== 'undefined') {
    console.error('❌ [SupabaseClient] SDK do Supabase não encontrado na window.');
}

if (typeof window !== 'undefined') {
    window.supabaseClient = clientInstance;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SUPABASE_URL,
        SUPABASE_KEY: SUPABASE_PUBLISHABLE_KEY,
        SUPABASE_ENVIRONMENTS,
        AMBIENTE_ATIVO
    };
}
