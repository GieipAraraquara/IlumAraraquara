/**
 * Infrastructure Layer - Supabase Configuration
 * Initializes and exports the Supabase client instance using provided credentials.
 */

const SUPABASE_URL = 'https://bqkfqedxlyipjftdhgse.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nyPJfTBioOI5QEdzjKzKLw_AHYWy60R';

let clientInstance = null;

if (window.supabase) {
    try {
        clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
        console.log('⚡ [SupabaseClient] Cliente configurado com sucesso para:', SUPABASE_URL);
    } catch (err) {
        console.error('❌ [SupabaseClient] Falha ao inicializar o Supabase Client:', err);
    }
} else {
    console.error('❌ [SupabaseClient] SDK do Supabase não encontrado na window.');
}

window.supabaseClient = clientInstance;
