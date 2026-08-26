(function() {
    if (window.LogsRepository) return;

    class LogsRepository {
        constructor() {
            this.tableName = 'logs_protocolos';
        }

        /**
         * Obtém instância do cliente Supabase de forma segura
         */
        getClient() {
            if (!window.supabaseClient) {
                if (typeof window.obterSupabaseClient === 'function') {
                    return window.obterSupabaseClient();
                }
                return null;
            }
            return window.supabaseClient;
        }

        /**
         * Obtém com segurança as informações do usuário atual logado na sessão
         */
        async getCurrentUserInfo() {
            let email = null;
            let id = null;
            let nome = null;

            try {
                const client = this.getClient();
                if (client && client.auth) {
                    const { data: sessionData } = await client.auth.getSession();
                    const session = sessionData?.session;
                    if (session && session.user) {
                        email = session.user.email || null;
                        id = session.user.id || null;
                        nome = session.user.user_metadata?.full_name || session.user.user_metadata?.name || null;
                    }
                }
            } catch (e) {
                console.warn('⚠️ [LogsRepository] Erro ao obter sessão do usuário:', e);
            }

            if (!email) {
                email = localStorage.getItem('user_email') || localStorage.getItem('supabase_user_email') || null;
            }
            if (!nome) {
                nome = window.currentUserName || localStorage.getItem('usuario_nome') || localStorage.getItem('operador') || null;
            }
            if (!id) {
                id = localStorage.getItem('user_id') || null;
            }

            return { id, email, nome };
        }

        /**
         * Insere um novo registro de log de alteração na tabela logs_protocolos
         * 
         * @param {Object} params
         * @param {string} params.protocolo - Número do protocolo da OS (ex: IP0NNJJ270726 ou PC1FTHT280726)
         * @param {string} [params.tabelaOrigem='ordens_servico'] - Nome da tabela ('ordens_servico' ou 'ordens_servico_pracas')
         * @param {string} params.tipoAcao - Ação executada ('CRIACAO', 'ALTERACAO_STATUS', 'ALTERACAO_PRIORIDADE', 'FINALIZACAO', 'CANCELAMENTO', 'REABERTURA', 'AUDITORIA')
         * @param {string} params.descricao - Descrição resumida da alteração
         * @param {Object} [params.dadosAnteriores=null] - Dados anteriores em JSON
         * @param {Object} [params.dadosNovos=null] - Novos dados em JSON
         * @param {string} [params.origemTela='sistema'] - Tela de onde partiu a ação ('Painel', 'Mapa', 'Finalizar', 'Formulario', 'API')
         */
        async registrarLog({
            protocolo,
            tabelaOrigem = 'ordens_servico',
            tipoAcao,
            descricao,
            dadosAnteriores = null,
            dadosNovos = null,
            origemTela = 'sistema'
        }) {
            if (!protocolo) {
                console.warn('⚠️ [LogsRepository] Protocolo não fornecido para registro de log.');
                return null;
            }

            try {
                const client = this.getClient();
                if (!client) {
                    console.warn('⚠️ [LogsRepository] Supabase client não disponível para gravar log.');
                    return null;
                }

                const user = await this.getCurrentUserInfo();

                const logPayload = {
                    protocolo: String(protocolo).trim(),
                    tabela_origem: tabelaOrigem,
                    tipo_acao: tipoAcao,
                    descricao: descricao,
                    dados_anteriores: dadosAnteriores,
                    dados_novos: dadosNovos,
                    usuario_id: user.id,
                    usuario_email: user.email,
                    usuario_nome: user.nome,
                    origem_tela: origemTela,
                    created_at: new Date().toISOString()
                };

                const { data, error } = await client
                    .from(this.tableName)
                    .insert([logPayload])
                    .select();

                if (error) {
                    console.warn('⚠️ [LogsRepository] Aviso ao salvar log no Supabase:', error.message || error);
                    return null;
                }

                console.log(`📜 [LogsRepository] Log registrado com sucesso para OS ${protocolo} (${tipoAcao}):`, data);
                return data;
            } catch (err) {
                console.error('❌ [LogsRepository] Exceção ao registrar log:', err);
                return null;
            }
        }

        /**
         * Busca os logs registrados para um determinado protocolo em ordem cronológica decrescente
         * @param {string} protocolo
         */
        async buscarLogsPorProtocolo(protocolo) {
            if (!protocolo) return [];

            try {
                const client = this.getClient();
                if (!client) return [];

                const { data, error } = await client
                    .from(this.tableName)
                    .select('*')
                    .eq('protocolo', String(protocolo).trim())
                    .order('created_at', { ascending: false });

                if (error) {
                    console.warn('⚠️ [LogsRepository] Erro ao buscar logs:', error.message || error);
                    return [];
                }

                return data || [];
            } catch (err) {
                console.error('❌ [LogsRepository] Exceção ao buscar logs:', err);
                return [];
            }
        }
    }

    window.LogsRepository = new LogsRepository();
})();
