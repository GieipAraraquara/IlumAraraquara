/**
 * Repositório e Serviço de Configurações do Sistema
 * Gerencia persistência no Supabase e cache local em memória/sessão.
 */

class ConfiguracoesService {
    constructor() {
        this.cache = null;
        this.tableName = 'configuracoes_sistema';
        this.defaultValues = {
            id: 1,
            prazo_baixa_prioridade_dias: 15,
            prazo_normal_dias: 7,
            prazo_alta_prioridade_dias: 3,
            prazo_urgente_horas: 24,
            prazo_emergencia_horas: 6,
            tipo_contagem_prazo: 'corridos',
            alerta_vencimento_dias: 2,
            alerta_critico_horas: 12,
            exigir_foto_antes: true,
            exigir_foto_depois: true,
            exigir_geolocalizacao_conclusao: true,
            permitir_conclusao_sem_plaqueta: false,
            prazo_tolerancia_contestacao_dias: 5,
            municipio_nome: 'Araraquara',
            orgao_contratante: 'Secretaria Municipal de Obras e Serviços Públicos',
            numero_contrato: 'Contrato nº 042/2024',
            empresa_executora: 'Consórcio Ilumina Araraquara',
            email_notificacoes: '',
            notificar_abertura_os: true,
            notificar_os_atrasada: true,
            notificar_relatorio_mensal: false
        };
    }

    /**
     * Obtém o cliente Supabase disponível
     */
    getClient() {
        return window.supabaseClient || (window.supabase ? window.supabase : null);
    }

    /**
     * Carrega as configurações do Supabase (com fallback e cache)
     * @param {boolean} forceReload Forçar busca no Supabase ignorando cache
     */
    async obterConfiguracoes(forceReload = false) {
        if (!forceReload && this.cache) {
            return this.cache;
        }

        const client = this.getClient();
        if (!client) {
            console.warn('⚠️ [ConfiguracoesService] Supabase client não encontrado. Usando padrões.');
            this.cache = { ...this.defaultValues };
            return this.cache;
        }

        try {
            const { data, error } = await client
                .from(this.tableName)
                .select('*')
                .eq('id', 1)
                .maybeSingle();

            if (error) {
                console.error('❌ [ConfiguracoesService] Erro ao carregar configurações:', error);
                throw error;
            }

            if (data) {
                this.cache = { ...this.defaultValues, ...data };
            } else {
                this.cache = { ...this.defaultValues };
            }

            // Publica no window para acesso universal
            window.AppSettings = this.cache;
            return this.cache;
        } catch (err) {
            console.warn('⚠️ [ConfiguracoesService] Falha na consulta, aplicando padrões:', err.message);
            this.cache = { ...this.defaultValues };
            window.AppSettings = this.cache;
            return this.cache;
        }
    }

    /**
     * Atualiza as configurações no Supabase
     * @param {Object} novosValores 
     */
    async salvarConfiguracoes(novosValores) {
        const client = this.getClient();
        if (!client) {
            throw new Error('Supabase client não está inicializado.');
        }

        const payload = {
            ...novosValores,
            id: 1,
            updated_at: new Date().toISOString()
        };

        // Identificar usuário logado para auditoria
        try {
            if (window.AuthGuard && window.AuthGuard._cachedAuthData && window.AuthGuard._cachedAuthData.user) {
                payload.updated_by = window.AuthGuard._cachedAuthData.user.id;
            }
        } catch (e) {}

        const { data, error } = await client
            .from(this.tableName)
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            console.error('❌ [ConfiguracoesService] Erro ao salvar configurações:', error);
            throw error;
        }

        this.cache = { ...this.defaultValues, ...data };
        window.AppSettings = this.cache;
        return this.cache;
    }
}

window.ConfiguracoesService = new ConfiguracoesService();
