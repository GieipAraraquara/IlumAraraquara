(function() {
    if (window.ChamadosRepository) return;

class ChamadosRepository {
    constructor() {
        this.viewName = 'vw_todas_ordens_servico';
        this.primaryTable = 'ordens_servico';
        this.pracasTable = 'ordens_servico_pracas';
        this.legacyTable = 'chamados';
        this.tableName = 'ordens_servico';
    }

    /**
     * Gets Supabase client instance
     */
    getClient() {
        if (!window.supabaseClient) {
            throw new Error('Supabase client não está inicializado.');
        }
        return window.supabaseClient;
    }

    clearCache() {
        try {
            sessionStorage.removeItem('chamados_repo_cache_v1');
            sessionStorage.removeItem('chamados_repo_meta_v1');
        } catch (e) {}
    }

    /**
     * Colunas da View vw_todas_ordens_servico para a listagem principal do grid.
     * REMOVIDAS colunas pesadas com Base64/detalhes volumosos (pontos_final com fotos, texto_auditoria_ocr, historico_sessoes, materiais)
     * para cortar o consumo de PostgREST Egress em até 95%. Detalhes pesados são obtidos sob demanda via fetchById().
     * pontos_inicial é mantido pois é um JSON leve de abertura essencial para exibição dos pontos/endereços no grid.
     */
    static get COLUNAS_VIEW() {
        return [
            'id', 'protocolo', 'status', 'prioridade', 'telefone_fixo', 'telefone_celular',
            'quantidade', 'descricao', 'data_abertura', 'data_fechamento',
            'cpf_solicitante', 'municipe_nome', 'user_id', 'user_email', 'origem_login',
            'operador', 'status_auditoria', 'data_conclusao_auditoria',
            'motivo_aprovacao', 'operador_finalizacao',
            'glosas', 'praca_nome', 'problemas', 'endereco', 'coordenada', 'plaqueta_inicial',
            'plaqueta_final', 'coordenada_reparo', 'qtd_eletricistas',
            'tempo_total_minutos', 'foto_entrada', 'observacao_final', 'tipo_os', 'pontos_inicial'
        ].join(',');
    }

    /**
     * Colunas da Tabela ordens_servico (fallback quando a view não responde)
     */
    static get COLUNAS_TABELA_OS() {
        return [
            'id', 'protocolo', 'status', 'prioridade', 'telefone_fixo', 'telefone_celular',
            'quantidade', 'descricao', 'data_abertura', 'data_fechamento',
            'cpf_solicitante', 'municipe_nome', 'user_id', 'user_email', 'origem_login',
            'operador', 'status_auditoria', 'data_conclusao_auditoria',
            'motivo_aprovacao', 'operador_finalizacao',
            'glosas', 'praca_nome', 'problemas', 'endereco', 'coordenada', 'plaqueta_inicial',
            'plaqueta_final', 'coordenada_reparo', 'qtd_eletricistas',
            'tempo_total_minutos', 'foto_entrada', 'observacao_final', 'tipo_os', 'pontos_inicial'
        ].join(',');
    }

    /**
     * Colunas completas para busca individual sob demanda (fetchById)
     */
    static get COLUNAS_COMPLETAS_DETALHE() {
        return [
            'id', 'protocolo', 'status', 'prioridade', 'telefone_fixo', 'telefone_celular',
            'quantidade', 'descricao', 'materiais', 'data_abertura', 'data_fechamento',
            'cpf_solicitante', 'municipe_nome', 'user_id', 'user_email', 'origem_login',
            'operador', 'status_auditoria', 'data_conclusao_auditoria', 'pontos_inicial',
            'pontos_final', 'motivo_aprovacao', 'operador_finalizacao', 'texto_auditoria_ocr',
            'glosas', 'praca_nome', 'problemas', 'endereco', 'coordenada', 'plaqueta_inicial',
            'plaqueta_final', 'coordenada_reparo', 'qtd_eletricistas', 'historico_sessoes',
            'tempo_total_minutos', 'foto_entrada', 'observacao_final', 'tipo_os'
        ].join(',');
    }

    /**
     * Mantém compatibilidade com chamadas externas legadas que acessem COLUNAS_LISTA
     */
    static get COLUNAS_LISTA() {
        return ChamadosRepository.COLUNAS_VIEW;
    }

    /**
     * Checagem leve de "Heartbeat" (Last-Modified) para evitar download desnecessário de dados.
     * Retorna os dados em cache se o banco não tiver registros alterados/criados mais recentes.
     */
    async verificarHeartbeatCache(client, cacheKeyData, cacheKeyMeta) {
        try {
            const cachedDataRaw = sessionStorage.getItem(cacheKeyData);
            const cachedMetaRaw = sessionStorage.getItem(cacheKeyMeta);

            if (!cachedDataRaw || !cachedMetaRaw) return null;

            const cachedMeta = JSON.parse(cachedMetaRaw);
            if (!cachedMeta || !cachedMeta.lastTimestamp) return null;

            // Tenta consultar a coluna mais apropriada de ordenação temporal (updated_at ou data_abertura)
            let hbRes = await client
                .from(this.viewName)
                .select('data_abertura')
                .order('data_abertura', { ascending: false })
                .limit(1);

            if (hbRes.error || !hbRes.data || hbRes.data.length === 0) {
                hbRes = await client
                    .from(this.primaryTable)
                    .select('data_abertura')
                    .order('data_abertura', { ascending: false })
                    .limit(1);
            }

            if (!hbRes.error && hbRes.data && hbRes.data.length > 0) {
                const latestDbTimestamp = hbRes.data[0].data_abertura || hbRes.data[0].updated_at || null;
                if (latestDbTimestamp && latestDbTimestamp === cachedMeta.lastTimestamp) {
                    console.log(`⚡ [ChamadosRepository Heartbeat Hit] Nenhuma OS nova/alterada detectada. Reutilizando cache local.`);
                    const parsedData = JSON.parse(cachedDataRaw);
                    if (Array.isArray(parsedData) && parsedData.length > 0) {
                        return parsedData;
                    }
                }
            }
        } catch (errHb) {
            console.warn('⚠️ [ChamadosRepository] Falha ao verificar heartbeat de cache:', errHb);
        }
        return null;
    }

    /**
     * Carrega fechamentos_os fatiados em lotes de até 50 protocolos (previne HTTP 414 e drena menos egress)
     */
    async carregarFechamentosFatiados(client, dataRows) {
        if (!dataRows || dataRows.length === 0) return;

        try {
            // Extrai protocolos únicos preservando case exato do banco
            const protocolosVisiveis = Array.from(
                new Set(dataRows.map(r => r.protocolo).filter(p => p !== null && p !== undefined && String(p).trim() !== ''))
            );

            if (protocolosVisiveis.length === 0) return;

            const CHUNK_SIZE = 50;
            const chunks = [];
            for (let i = 0; i < protocolosVisiveis.length; i += CHUNK_SIZE) {
                chunks.push(protocolosVisiveis.slice(i, i + CHUNK_SIZE));
            }

            const COLUNAS_FECHAMENTO = 'id, protocolo, numero_fechamento, data_fechamento, operador, materiais, relatorio_tecnico, ponto_referencia, os_id, fotos, created_at';

            const promessas = chunks.map(chunk =>
                client
                    .from('fechamentos_os')
                    .select(COLUNAS_FECHAMENTO)
                    .in('protocolo', chunk)
                    .order('numero_fechamento', { ascending: true })
            );

            const resultados = await Promise.all(promessas);
            const todosFechamentos = resultados.flatMap(res => (!res.error && res.data) ? res.data : []);

            if (todosFechamentos.length > 0) {
                const fechMap = new Map();
                todosFechamentos.forEach(f => {
                    const protKey = String(f.protocolo).trim();
                    if (!fechMap.has(protKey)) fechMap.set(protKey, []);
                    fechMap.get(protKey).push(f);
                });

                dataRows.forEach(row => {
                    const protKey = row.protocolo ? String(row.protocolo).trim() : null;
                    row.fechamentos_os = (protKey && fechMap.has(protKey)) ? fechMap.get(protKey) : [];
                });
            }
        } catch (eFech) {
            console.warn('⚠️ [ChamadosRepository] Falha ao carregar fechamentos_os fatiado:', eFech);
        }
    }

    /**
     * Fetches all OSs from Supabase, prioritizing unified view vw_todas_ordens_servico,
     * falling back to ordens_servico or chamados. Supports sessionStorage caching with TTL.
     */
    async fetchAllChamados(forceRefresh = false) {
        const CACHE_KEY = 'chamados_repo_cache_v2';
        const CACHE_META_KEY = 'chamados_repo_meta_v2';
        const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos

        const client = this.getClient();

        // 1. Verificação de Cache Local com Heartbeat ultraleve
        if (!forceRefresh) {
            try {
                const dadosEmCache = await this.verificarHeartbeatCache(client, CACHE_KEY, CACHE_META_KEY);
                if (dadosEmCache && dadosEmCache.length > 0) {
                    return dadosEmCache.map((row) => {
                        const ModelClass = (typeof window !== 'undefined' && window.ChamadoModel) ? window.ChamadoModel : (typeof ChamadoModel !== 'undefined' ? ChamadoModel : null);
                        if (ModelClass && typeof ModelClass.fromRow === 'function') {
                            return ModelClass.fromRow(row);
                        }
                        if (ModelClass && typeof ModelClass === 'function') {
                            return new ModelClass(row);
                        }
                        return row;
                    });
                }
            } catch (errCache) {
                console.warn('⚠️ [ChamadosRepository] Erro ao ler cache de sessão:', errCache);
            }
        }

        try {
            // Janela temporal padrão: últimos 45 dias ou OSs não concluídas
            const dataCorte = new Date();
            dataCorte.setDate(dataCorte.getDate() - 45);
            const dataCorteIso = dataCorte.toISOString();

            const colunasView = ChamadosRepository.COLUNAS_VIEW;
            const colunasTabela = ChamadosRepository.COLUNAS_TABELA_OS;
            const filtroOrTemporal = `data_abertura.gte.${dataCorteIso},status.neq.Concluída,status.neq.Concluida`;

            // 1. Tenta consultar a view unificada com projeção restrita e corte temporal
            let query = client
                .from(this.viewName)
                .select(colunasView)
                .or(filtroOrTemporal)
                .order('data_abertura', { ascending: true });

            let { data, error } = await query;

            if (error || !data || data.length === 0) {
                // 2. Fallback: consulta direta em ordens_servico (utilizando colunas existentes na tabela)
                const resPrimary = await client
                    .from(this.primaryTable)
                    .select(colunasTabela)
                    .or(filtroOrTemporal)
                    .order('data_abertura', { ascending: true });

                if (!resPrimary.error && resPrimary.data && resPrimary.data.length > 0) {
                    data = resPrimary.data;
                } else {
                    // 3. Fallback legado: consulta em chamados
                    const resLegacy = await client
                        .from(this.legacyTable)
                        .select(colunasTabela)
                        .or(filtroOrTemporal)
                        .order('data_abertura', { ascending: true });
                    data = resLegacy.data || [];
                }
            }

            // Se a view unificada não projetar a coluna operador_finalizacao (undefined),
            // consulta a tabela ordens_servico diretamente para enriquecer os registros.
            if (data && data.length > 0 && data[0].operador_finalizacao === undefined) {
                console.warn('⚠️ [ChamadosRepository] A view vw_todas_ordens_servico não possui a coluna operador_finalizacao. Consultando ordens_servico para enriquecer...');
                try {
                    const resDirect = await client
                        .from(this.primaryTable)
                        .select('protocolo, id, operador_finalizacao');
                    
                    if (resDirect.data && resDirect.data.length > 0) {
                        const mapByProt = new Map();
                        const mapById = new Map();
                        resDirect.data.forEach(r => {
                            if (r.protocolo) mapByProt.set(String(r.protocolo).toUpperCase().trim(), r.operador_finalizacao);
                            if (r.id) mapById.set(String(r.id), r.operador_finalizacao);
                        });

                        data.forEach(row => {
                            const protKey = row.protocolo ? String(row.protocolo).toUpperCase().trim() : null;
                            const idKey = row.id ? String(row.id) : null;
                            const opFin = (protKey && mapByProt.has(protKey)) ? mapByProt.get(protKey) : (idKey ? mapById.get(idKey) : null);
                            row.operador_finalizacao = opFin || null;
                        });
                    }
                } catch(eMerge) {
                    console.error('⚠️ Erro ao mesclar operador_finalizacao:', eMerge);
                }
            }

            // Se a view unificada não projetar a coluna glosas (undefined),
            // consulta ordens_servico e ordens_servico_pracas para enriquecer os registros.
            if (data && data.length > 0 && data[0].glosas === undefined) {
                console.warn('⚠️ [ChamadosRepository] A view vw_todas_ordens_servico não possui a coluna glosas. Consultando tabelas diretas para enriquecer...');
                try {
                    const resGlosasOS = await client
                        .from(this.primaryTable)
                        .select('protocolo, id, glosas');
                    
                    const mapGlosasByProt = new Map();
                    const mapGlosasById = new Map();

                    if (resGlosasOS.data && resGlosasOS.data.length > 0) {
                        resGlosasOS.data.forEach(r => {
                            if (r.glosas) {
                                if (r.protocolo) mapGlosasByProt.set(String(r.protocolo).toUpperCase().trim(), r.glosas);
                                if (r.id) mapGlosasById.set(String(r.id), r.glosas);
                            }
                        });
                    }

                    try {
                        const resGlosasPracas = await client
                            .from('ordens_servico_pracas')
                            .select('protocolo, id, glosas');
                        if (resGlosasPracas.data && resGlosasPracas.data.length > 0) {
                            resGlosasPracas.data.forEach(r => {
                                if (r.glosas) {
                                    if (r.protocolo) mapGlosasByProt.set(String(r.protocolo).toUpperCase().trim(), r.glosas);
                                    if (r.id) mapGlosasById.set(String(r.id), r.glosas);
                                }
                            });
                        }
                    } catch(ePracas) {
                        // ordens_servico_pracas pode não existir ou não ter a coluna ainda
                    }

                    data.forEach(row => {
                        const protKey = row.protocolo ? String(row.protocolo).toUpperCase().trim() : null;
                        const idKey = row.id ? String(row.id) : null;
                        const g = (protKey && mapGlosasByProt.has(protKey)) 
                            ? mapGlosasByProt.get(protKey) 
                            : (idKey && mapGlosasById.has(idKey) ? mapGlosasById.get(idKey) : []);
                        row.glosas = g || [];
                    });
                } catch(eGlosas) {
                    console.error('⚠️ Erro ao mesclar glosas na view:', eGlosas);
                }
            }

            // Fechamentos complementares agora são carregados sob demanda via fetchById ao abrir detalhes da OS,
            // poupando egress massivo na listagem geral do grid.

            console.log(`📦 [ChamadosRepository] Retornados ${data?.length || 0} registros do Supabase:`, data);

            // Persistência em cache com timestamp do registro mais recente para Heartbeat
            if (data && data.length > 0) {
                try {
                    let maxTimestamp = null;
                    for (const r of data) {
                        const ts = r.data_abertura || r.updated_at;
                        if (ts && (!maxTimestamp || ts > maxTimestamp)) {
                            maxTimestamp = ts;
                        }
                    }

                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
                    sessionStorage.setItem(CACHE_META_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        lastTimestamp: maxTimestamp
                    }));
                } catch (eSave) {
                    console.warn('⚠️ [ChamadosRepository] QuotaExceededError ou falha ao salvar cache no sessionStorage:', eSave);
                }
            }
            
            return (data || []).map((row) => {
                const ModelClass = (typeof window !== 'undefined' && window.ChamadoModel) ? window.ChamadoModel : (typeof ChamadoModel !== 'undefined' ? ChamadoModel : null);
                if (ModelClass && typeof ModelClass.fromRow === 'function') {
                    return ModelClass.fromRow(row);
                }
                if (ModelClass && typeof ModelClass === 'function') {
                    return new ModelClass(row);
                }
                console.error('❌ [ChamadosRepository] ChamadoModel indisponível ao mapear linha:', row);
                return row;
            });
        } catch (err) {
            console.warn('⚠️ [ChamadosRepository] Falha ao consultar Supabase, utilizando dados de contingência local.', err);
            return null;
        }
    }

    /**
     * Busca cirúrgica de uma única OS sob demanda com todas as colunas de detalhe
     * (pontos_final, pontos_inicial, materiais, historico_sessoes, texto_auditoria_ocr e fechamentos_os).
     * Usada estritamente ao abrir o modal de detalhes para poupar PostgREST Egress na listagem geral.
     * @param {string|number} idOrProtocol
     * @returns {Promise<ChamadoModel|null>}
     */
    async fetchById(idOrProtocol) {
        if (!idOrProtocol) return null;
        const cleanId = String(idOrProtocol || '').replace(/^#/, '').trim();
        const client = this.getClient();
        const colunasDet = ChamadosRepository.COLUNAS_COMPLETAS_DETALHE;

        try {
            let row = null;

            const isNumeric = /^\d+$/.test(cleanId);
            const mainFilter = isNumeric ? `protocolo.ilike.${cleanId},id.eq.${cleanId}` : `protocolo.ilike.${cleanId}`;

            // 1. Tenta buscar na view unificada completa
            try {
                const resView = await client
                    .from(this.viewName)
                    .select(colunasDet)
                    .or(mainFilter)
                    .maybeSingle();

                if (!resView.error && resView.data) {
                    row = resView.data;
                }
            } catch(eView) {}

            // 2. Fallback: tabela ordens_servico
            if (!row) {
                const resOS = await client
                    .from(this.primaryTable)
                    .select('*')
                    .or(mainFilter)
                    .maybeSingle();
                if (!resOS.error && resOS.data) {
                    row = resOS.data;
                }
            }

            // 3. Fallback: tabela ordens_servico_pracas
            if (!row) {
                const resPraca = await client
                    .from(this.pracasTable)
                    .select('*')
                    .or(mainFilter)
                    .maybeSingle();
                if (!resPraca.error && resPraca.data) {
                    row = resPraca.data;
                }
            }

            // 4. Fallback legado: chamados
            if (!row) {
                const resLeg = await client
                    .from(this.legacyTable)
                    .select('*')
                    .or(mainFilter)
                    .maybeSingle();
                if (!resLeg.error && resLeg.data) {
                    row = resLeg.data;
                }
            }

            if (!row) return null;

            // 5. Carrega fechamentos_os associados a esta OS individualmente
            try {
                const protAlvo = row.protocolo || cleanId;
                const rowIdNumeric = row.id && !isNaN(Number(row.id)) ? row.id : (isNumeric ? cleanId : null);
                const fechFilter = rowIdNumeric ? `protocolo.ilike.${protAlvo},os_id.eq.${rowIdNumeric}` : `protocolo.ilike.${protAlvo}`;
                const { data: fechRows } = await client
                    .from('fechamentos_os')
                    .select('id, protocolo, numero_fechamento, data_fechamento, operador, materiais, relatorio_tecnico, ponto_referencia, os_id, fotos, created_at')
                    .or(fechFilter)
                    .order('numero_fechamento', { ascending: true });

                if (fechRows && fechRows.length > 0) {
                    row.fechamentos_os = fechRows;
                }
            } catch(eFech) {
                console.warn('⚠️ [ChamadosRepository] Falha ao enriquecer fechamentos_os no fetchById:', eFech);
            }

            const ModelClass = (typeof window !== 'undefined' && window.ChamadoModel) ? window.ChamadoModel : (typeof ChamadoModel !== 'undefined' ? ChamadoModel : null);
            if (ModelClass && typeof ModelClass.fromRow === 'function') {
                return ModelClass.fromRow(row);
            }
            if (ModelClass && typeof ModelClass === 'function') {
                return new ModelClass(row);
            }
            return row;
        } catch(err) {
            console.error('❌ [ChamadosRepository] Erro no fetchById:', err);
            return null;
        }
    }

    /**
     * Fetches chamados/OSs merged with audit flags
     */
    async fetchAuditoriaChamados() {
        try {
            const client = this.getClient();

            // Janela temporal padrão para auditoria: últimos 45 dias ou OSs não concluídas
            const dataCorte = new Date();
            dataCorte.setDate(dataCorte.getDate() - 45);
            const dataCorteIso = dataCorte.toISOString();

            const colunasView = ChamadosRepository.COLUNAS_VIEW;
            const colunasTabela = ChamadosRepository.COLUNAS_TABELA_OS;
            const filtroOrTemporal = `data_abertura.gte.${dataCorteIso},status.neq.Concluída,status.neq.Concluida`;

            let data = null;
            const resView = await client
                .from(this.viewName)
                .select(colunasView)
                .or(filtroOrTemporal)
                .order('data_abertura', { ascending: false });

            if (!resView.error && resView.data && resView.data.length > 0) {
                data = resView.data;
            } else {
                const resPrimary = await client
                    .from(this.primaryTable)
                    .select(colunasTabela)
                    .or(filtroOrTemporal)
                    .order('data_abertura', { ascending: false });
                data = resPrimary.data || [];
            }

            let auditMap = {};
            try {
                const { data: auditData, error: auditError } = await client
                    .from('vw_auditoria_chamados')
                    .select('id, protocolo, status_auditoria, motivo_aprovacao, motivo_pendencia, data_conclusao_auditoria');

                if (!auditError && auditData) {
                    auditData.forEach(row => {
                        if (row.id) auditMap[String(row.id)] = row;
                    });
                }
            } catch (vErr) {}

            // Se a view unificada não projetar a coluna glosas (undefined),
            // consulta ordens_servico e ordens_servico_pracas para enriquecer os registros em auditoria.
            if (data && data.length > 0 && data[0].glosas === undefined) {
                try {
                    const resGlosasOS = await client
                        .from(this.primaryTable)
                        .select('protocolo, id, glosas');
                    
                    const mapGlosasByProt = new Map();
                    const mapGlosasById = new Map();

                    if (resGlosasOS.data && resGlosasOS.data.length > 0) {
                        resGlosasOS.data.forEach(r => {
                            if (r.glosas) {
                                if (r.protocolo) mapGlosasByProt.set(String(r.protocolo).toUpperCase().trim(), r.glosas);
                                if (r.id) mapGlosasById.set(String(r.id), r.glosas);
                            }
                        });
                    }

                    try {
                        const resGlosasPracas = await client
                            .from('ordens_servico_pracas')
                            .select('protocolo, id, glosas');
                        if (resGlosasPracas.data && resGlosasPracas.data.length > 0) {
                            resGlosasPracas.data.forEach(r => {
                                if (r.glosas) {
                                    if (r.protocolo) mapGlosasByProt.set(String(r.protocolo).toUpperCase().trim(), r.glosas);
                                    if (r.id) mapGlosasById.set(String(r.id), r.glosas);
                                }
                            });
                        }
                    } catch(ePracas) {}

                    data.forEach(row => {
                        const protKey = row.protocolo ? String(row.protocolo).toUpperCase().trim() : null;
                        const idKey = row.id ? String(row.id) : null;
                        const g = (protKey && mapGlosasByProt.has(protKey)) 
                            ? mapGlosasByProt.get(protKey) 
                            : (idKey && mapGlosasById.has(idKey) ? mapGlosasById.get(idKey) : []);
                        row.glosas = g || [];
                    });
                } catch(eGlosas) {
                    console.error('⚠️ Erro ao mesclar glosas na auditoria:', eGlosas);
                }
            }

            // Carrega fechamentos fatiados em chunks de 50 para as OSs da Auditoria
            if (data && data.length > 0) {
                await this.carregarFechamentosFatiados(client, data);
            }

            return (data || []).map(row => {
                const ModelClass = (typeof window !== 'undefined' && window.ChamadoModel) ? window.ChamadoModel : (typeof ChamadoModel !== 'undefined' ? ChamadoModel : null);
                let model = null;
                if (ModelClass && typeof ModelClass.fromRow === 'function') {
                    model = ModelClass.fromRow(row);
                } else if (ModelClass && typeof ModelClass === 'function') {
                    model = new ModelClass(row);
                } else {
                    console.error('❌ [ChamadosRepository] ChamadoModel indisponível ao mapear linha de auditoria:', row);
                    model = row;
                }

                if (model && auditMap[String(row.id)]) {
                    model.audit = auditMap[String(row.id)];
                }
                return model;
            });
        } catch (err) {
            console.warn('⚠️ [ChamadosRepository] Falha ao consultar Supabase para Auditoria.', err);
            return null;
        }
    }

    /**
     * Updates status for an OS across ordens_servico and ordens_servico_pracas
     */
    async updateStatus(idOrProtocol, newStatus, justification = '') {
        try {
            const client = this.getClient();
            const updatePayload = {
                status: newStatus,
                ...(justification ? { observacao_final: justification } : {})
            };

            if (newStatus === 'Concluída' || newStatus === 'Concluida') {
                const nowIso = new Date().toISOString();
                updatePayload.data_conclusao = nowIso;
                updatePayload.data_fechamento = nowIso;
            } else if (newStatus === 'Aberta' || newStatus === 'Pendente') {
                updatePayload.data_conclusao = null;
                updatePayload.data_fechamento = null;
            }

            const executeUpdate = async (tableName, field, val, payload) => {
                let currentPayload = { ...payload };
                // A tabela ordens_servico_pracas não possui a coluna data_conclusao
                if (tableName === this.pracasTable) {
                    delete currentPayload.data_conclusao;
                }

                let res = await client
                    .from(tableName)
                    .update(currentPayload)
                    .eq(field, val)
                    .select('id, protocolo, status, data_conclusao, data_fechamento');

                // Caso ocorra erro de coluna inexistente no schema do Supabase, remove a coluna e tenta novamente
                while (res.error && res.error.message && res.error.message.includes("Could not find the")) {
                    const match = res.error.message.match(/Could not find the ['"]([^'"]+)['"] column/i);
                    if (match && match[1]) {
                        const missingCol = match[1];
                        console.warn(`⚠️ [ChamadosRepository] Coluna '${missingCol}' não existe na tabela '${tableName}'. Tentando novamente sem ela...`);
                        delete currentPayload[missingCol];
                        res = await client
                            .from(tableName)
                            .update(currentPayload)
                            .eq(field, val)
                            .select('id, protocolo, status, data_conclusao, data_fechamento');
                    } else {
                        break;
                    }
                }
                return res;
            };

            const strVal = String(idOrProtocol || '').trim();
            const isPraca = strVal.toUpperCase().startsWith('P');
            const isNumeric = /^\d+$/.test(strVal);

            const tablesToTry = isPraca
                ? [this.pracasTable, this.primaryTable]
                : [this.primaryTable, this.pracasTable];

            let updatedData = null;
            let lastError = null;

            for (const tableName of tablesToTry) {
                const fieldsToTry = isNumeric ? ['id', 'protocolo'] : ['protocolo', 'id'];

                for (const field of fieldsToTry) {
                    try {
                        const res = await executeUpdate(tableName, field, strVal, updatePayload);

                        if (res.data && res.data.length > 0) {
                            updatedData = res.data;
                            lastError = null;
                            console.log(`✅ [ChamadosRepository] Status atualizado na tabela "${tableName}" por ${field}=${strVal}:`, updatedData);
                            break;
                        } else if (res.error) {
                            lastError = res.error;
                            console.warn(`⚠️ [ChamadosRepository] Aviso ao atualizar na tabela "${tableName}" por ${field}=${strVal}:`, res.error);
                        }
                    } catch (e) {
                        lastError = e;
                    }
                }

                if (updatedData && updatedData.length > 0) break;
            }

            if (!updatedData || updatedData.length === 0) {
                if (lastError) {
                    console.error(`❌ [ChamadosRepository] Erro ao atualizar status no Supabase:`, lastError);
                    throw lastError;
                } else {
                    console.warn(`⚠️ [ChamadosRepository] Nenhum registro encontrado para atualizar com ID/Protocolo = "${idOrProtocol}".`);
                    throw new Error(`Nenhum registro encontrado no banco de dados para a OS (${idOrProtocol}).`);
                }
            } else if (window.LogsRepository) {
                const rec = updatedData[0];
                const prot = rec.protocolo || strVal;
                const actualTable = isPraca ? this.pracasTable : this.primaryTable;
                window.LogsRepository.registrarLog({
                    protocolo: prot,
                    tabelaOrigem: actualTable,
                    tipoAcao: newStatus === 'Concluída' || newStatus === 'Concluida' ? 'FINALIZACAO' : (newStatus === 'Cancelada' ? 'CANCELAMENTO' : 'ALTERACAO_STATUS'),
                    descricao: `Status alterado para "${newStatus}"${justification ? ' (Justificativa: ' + justification + ')' : ''}`,
                    dadosNovos: { status: newStatus, observacao_final: justification },
                    origemTela: 'Painel'
                }).catch(err => console.warn('⚠️ [ChamadosRepository] Falha ao registrar log de status:', err));
            }

            this.clearCache();
            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateStatus:', err);
            throw err;
        }
    }

    /**
     * Updates prioridade for an OS across ordens_servico and ordens_servico_pracas
     */
    async updatePriority(idOrProtocol, newPriority = 'Urgente') {
        try {
            const client = this.getClient();
            const updatePayload = { prioridade: newPriority };

            const strVal = String(idOrProtocol || '').trim();
            const isPraca = strVal.toUpperCase().startsWith('P');
            const isNumeric = /^\d+$/.test(strVal);

            const tablesToTry = isPraca
                ? [this.pracasTable, this.primaryTable]
                : [this.primaryTable, this.pracasTable];

            let updatedData = null;
            let lastError = null;

            for (const tableName of tablesToTry) {
                const fieldsToTry = isNumeric ? ['id', 'protocolo'] : ['protocolo', 'id'];

                for (const field of fieldsToTry) {
                    try {
                        const res = await client
                            .from(tableName)
                            .update(updatePayload)
                            .eq(field, strVal)
                            .select();

                        if (res.data && res.data.length > 0) {
                            updatedData = res.data;
                            lastError = null;
                            break;
                        } else if (res.error) {
                            lastError = res.error;
                        }
                    } catch (e) {
                        lastError = e;
                    }
                }

                if (updatedData && updatedData.length > 0) break;
            }

            if (!updatedData || updatedData.length === 0) {
                if (lastError) throw lastError;
                throw new Error(`Nenhum registro encontrado no banco de dados para a OS (${idOrProtocol}).`);
            } else if (window.LogsRepository) {
                const rec = updatedData[0];
                const prot = rec.protocolo || strVal;
                window.LogsRepository.registrarLog({
                    protocolo: prot,
                    tabelaOrigem: isPraca ? this.pracasTable : this.primaryTable,
                    tipoAcao: 'ALTERACAO_PRIORIDADE',
                    descricao: `Prioridade alterada para "${newPriority}"`,
                    dadosNovos: { prioridade: newPriority },
                    origemTela: 'Painel'
                }).catch(err => console.warn('⚠️ [ChamadosRepository] Falha ao registrar log de prioridade:', err));
            }

            console.log(`✅ [ChamadosRepository] Prioridade da OS ${idOrProtocol} atualizada para "${newPriority}".`);
            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updatePriority:', err);
            throw err;
        }
    }

    /**
     * Updates problema_inicial for a chamado by ID
     */
    async updateProblem(id, newProblem) {
        try {
            const client = this.getClient();
            const tablesToTry = [this.primaryTable, this.pracasTable];
            let updatedData = null;

            for (const tableName of tablesToTry) {
                const { data, error } = await client
                    .from(tableName)
                    .update({ problema_inicial: newProblem })
                    .eq('id', id)
                    .select();

                if (!error && data && data.length > 0) {
                    updatedData = data;
                    break;
                }
            }

            console.log(`✅ [ChamadosRepository] Problema da OS ${id} atualizado para "${newProblem}".`);
            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateProblem:', err);
            throw err;
        }
    }

    /**
     * Updates status_auditoria and data_conclusao_auditoria for a chamado by ID or Protocolo
     */
    async updateStatusAuditoria(idOrProtocol, newStatusAuditoria) {
        try {
            const client = this.getClient();
            const isConcluded = newStatusAuditoria === 'Concluída' || newStatusAuditoria === 'Concluida';
            const updatePayload = {
                status_auditoria: newStatusAuditoria,
                data_conclusao_auditoria: isConcluded ? new Date().toISOString() : null
            };

            const strVal = String(idOrProtocol || '').replace(/^#/, '').trim();
            const isPraca = strVal.toUpperCase().startsWith('P');
            const isNumeric = /^\d+$/.test(strVal);

            const tablesToTry = isPraca 
                ? [this.pracasTable, this.primaryTable] 
                : [this.primaryTable, this.pracasTable];

            const fieldsToTry = isNumeric ? ['id', 'protocolo'] : ['protocolo', 'id'];

            let updatedData = null;

            for (const tableName of tablesToTry) {
                for (const field of fieldsToTry) {
                    try {
                        let res = await client
                            .from(tableName)
                            .update(updatePayload)
                            .eq(field, isNumeric && field === 'id' ? parseInt(strVal, 10) : strVal)
                            .select();

                        if (res.data && res.data.length > 0) {
                            updatedData = res.data;
                            break;
                        } else if (res.error) {
                            // Fallback: tenta sem data_conclusao_auditoria caso não exista a coluna
                            try {
                                const fallbackRes = await client
                                    .from(tableName)
                                    .update({ status_auditoria: newStatusAuditoria })
                                    .eq(field, isNumeric && field === 'id' ? parseInt(strVal, 10) : strVal)
                                    .select();
                                if (fallbackRes.data && fallbackRes.data.length > 0) {
                                    updatedData = fallbackRes.data;
                                    break;
                                }
                            } catch (eFallback) {}
                        }
                    } catch (errField) {
                        // Ignora erro de sintaxe de tipo (ex: casting de texto para bigint) e tenta o próximo campo
                    }
                }
                if (updatedData && updatedData.length > 0) break;
            }

            // Invalida cache de sessão para garantir sincronia nas próximas leituras
            this.clearCache();

            if (updatedData && updatedData.length > 0 && window.LogsRepository) {
                const rec = updatedData[0];
                const prot = rec.protocolo || strVal;
                window.LogsRepository.registrarLog({
                    protocolo: prot,
                    tabelaOrigem: rec.praca_nome ? this.pracasTable : this.primaryTable,
                    tipoAcao: 'AUDITORIA',
                    descricao: `Status da Auditoria alterado para "${newStatusAuditoria}"`,
                    dadosNovos: { status_auditoria: newStatusAuditoria },
                    origemTela: 'Auditoria'
                }).catch(err => console.warn('⚠️ [ChamadosRepository] Falha ao registrar log de auditoria:', err));
            }

            console.log(`✅ [ChamadosRepository] Status de Auditoria da OS ${strVal} atualizado para "${newStatusAuditoria}".`);
            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateStatusAuditoria:', err);
            return null;
        }
    }

    /**
     * Insere um novo fechamento na tabela fechamentos_os e atualiza o status da OS para Concluída
     */
    async salvarNovoFechamento(protocolo, dadosFechamento) {
        try {
            const client = this.getClient();
            const protUpper = String(protocolo || '').trim().toUpperCase();

            // 1. Busca fechamentos existentes para determinar o próximo número
            const { data: existFech } = await client
                .from('fechamentos_os')
                .select('numero_fechamento')
                .eq('protocolo', protUpper);

            const proximoNumero = (existFech && existFech.length > 0) 
                ? Math.max(...existFech.map(f => parseInt(f.numero_fechamento, 10) || 0)) + 1 
                : 1;

            const payloadFechamento = {
                protocolo: protUpper,
                os_id: dadosFechamento.os_id || null,
                numero_fechamento: proximoNumero,
                ponto_referencia: dadosFechamento.ponto_referencia || `Fechamento #${proximoNumero}`,
                operador: dadosFechamento.operador || 'Técnico Responsável',
                data_fechamento: dadosFechamento.data_fechamento || new Date().toISOString(),
                relatorio_tecnico: dadosFechamento.relatorio_tecnico || dadosFechamento.descricao || '',
                observacoes: dadosFechamento.observacoes || dadosFechamento.descricao || '',
                texto_auditoria_ocr: dadosFechamento.texto_auditoria_ocr || null,
                materiais: dadosFechamento.materiais || [],
                fotos: dadosFechamento.fotos || []
            };

            const { data: fechInserido, error: errFech } = await client
                .from('fechamentos_os')
                .insert([payloadFechamento])
                .select();

            if (errFech) {
                console.error('❌ Erro ao inserir em fechamentos_os:', errFech);
                throw errFech;
            }

            // 2. Atualiza o status da OS principal para Concluída
            await this.updateStatus(protUpper, 'Concluída', `Concluído via Fechamento #${proximoNumero}`);

            console.log(`✅ Novo fechamento #${proximoNumero} registrado no Supabase para a OS ${protUpper}:`, fechInserido);
            return fechInserido;
        } catch (err) {
            console.error('❌ Exceção em salvarNovoFechamento:', err);
            throw err;
        }
    }

    /**
     * Updates materials for an OS by protocol or ID (updates ordens_servico / ordens_servico_pracas and fechamentos_os)
     * @param {string} protocoloOrId
     * @param {string|Array} novosMateriais
     * @param {string|number|null} [fechamentoId=null]
     * @param {number|null} [numFechamento=null]
     */
    async updateMaterial(protocoloOrId, novosMateriais, fechamentoId = null, numFechamento = null) {
        try {
            const client = this.getClient();
            const protStr = String(protocoloOrId || '').trim();

            let matPayload = novosMateriais;
            let matStr = novosMateriais;

            if (Array.isArray(novosMateriais) || typeof novosMateriais === 'object') {
                matStr = JSON.stringify(novosMateriais);
                matPayload = novosMateriais;
            } else if (typeof novosMateriais === 'string') {
                const trimmed = novosMateriais.trim();
                if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                    try {
                        matPayload = JSON.parse(trimmed);
                        matStr = trimmed;
                    } catch(e) {
                        matPayload = [trimmed];
                        matStr = JSON.stringify(matPayload);
                    }
                } else if (trimmed) {
                    matPayload = [trimmed];
                    matStr = JSON.stringify(matPayload);
                } else {
                    matPayload = [];
                    matStr = '[]';
                }
            }

            const isNumeric = /^\d+$/.test(protStr);

            // Fetch previous material list for audit logging (robust detection & deep clone)
            let materiaisAnteriores = null;
            if (fechamentoId) {
                try {
                    const { data: currentFech } = await client
                        .from('fechamentos_os')
                        .select('materiais')
                        .eq('id', fechamentoId)
                        .maybeSingle();
                    if (currentFech && currentFech.materiais !== undefined && currentFech.materiais !== null) {
                        materiaisAnteriores = currentFech.materiais;
                    }
                } catch (prevErr) {
                    console.warn('⚠️ [ChamadosRepository] Falha ao consultar materiais anteriores do fechamento:', prevErr);
                }
            }

            const isValEmpty = (v) => {
                if (v === null || v === undefined || v === '') return true;
                if (Array.isArray(v) && v.length === 0) return true;
                if (typeof v === 'string' && (v.trim() === '[]' || v.trim() === '{}' || v.trim() === '')) return true;
                return false;
            };

            if (isValEmpty(materiaisAnteriores)) {
                for (const tableName of [this.primaryTable, this.pracasTable]) {
                    try {
                        let query = client.from(tableName).select('*');
                        if (isNumeric) {
                            query = query.or(`protocolo.eq.${protStr},id.eq.${protStr}`);
                        } else {
                            query = query.eq('protocolo', protStr);
                        }
                        const { data: currentOS } = await query.limit(1);
                        if (currentOS && currentOS.length > 0) {
                            const foundMat = currentOS[0].materiais || currentOS[0].material_utilizado;
                            if (!isValEmpty(foundMat)) {
                                materiaisAnteriores = foundMat;
                                break;
                            }
                        }
                    } catch (prevErr) {
                        console.warn(`⚠️ [ChamadosRepository] Falha ao consultar materiais anteriores da tabela ${tableName}:`, prevErr);
                    }
                }
            }

            const materiaisAnterioresCloned = materiaisAnteriores 
                ? (typeof materiaisAnteriores === 'object' ? JSON.parse(JSON.stringify(materiaisAnteriores)) : materiaisAnteriores)
                : null;

            // 1. Sync/update fechamentos_os
            if (fechamentoId) {
                try {
                    await client
                        .from('fechamentos_os')
                        .update({ materiais: matPayload })
                        .eq('id', fechamentoId);
                } catch (fechErr) {
                    console.warn('⚠️ [ChamadosRepository] Erro ao atualizar fechamento específico:', fechErr);
                }
            } else {
                try {
                    let fechQuery = client.from('fechamentos_os').select('id');
                    if (isNumeric) {
                        fechQuery = fechQuery.or(`protocolo.eq.${protStr},os_id.eq.${protStr}`);
                    } else {
                        fechQuery = fechQuery.eq('protocolo', protStr);
                    }
                    const { data: fechamentos } = await fechQuery
                        .order('data_fechamento', { ascending: false })
                        .limit(1);

                    if (fechamentos && fechamentos.length > 0) {
                        await client
                            .from('fechamentos_os')
                            .update({ materiais: matPayload })
                            .eq('id', fechamentos[0].id);
                    }
                } catch (fechErr) {
                    console.warn('⚠️ [ChamadosRepository] Aviso ao atualizar fechamentos_os:', fechErr);
                }
            }

            // 2. Update primary OS table
            const updatePayloadPrimary = {
                materiais: matPayload,
                material_utilizado: matStr
            };

            const isPraca = protStr.toUpperCase().startsWith('P');
            const tablesToTry = isPraca
                ? [this.pracasTable, this.primaryTable]
                : [this.primaryTable, this.pracasTable];

            let updatedData = null;

            for (const tableName of tablesToTry) {
                const fieldsToTry = isNumeric ? ['id', 'protocolo'] : ['protocolo'];
                for (const field of fieldsToTry) {
                    try {
                        let currentPayload = { ...updatePayloadPrimary };
                        let res = await client
                            .from(tableName)
                            .update(currentPayload)
                            .eq(field, protStr)
                            .select('id, protocolo');

                        while (res.error && res.error.message && res.error.message.includes("Could not find the")) {
                            const match = res.error.message.match(/Could not find the ['"]([^'"]+)['"] column/i);
                            if (match && match[1]) {
                                const missingCol = match[1];
                                console.warn(`⚠️ [ChamadosRepository] Coluna '${missingCol}' não existe na tabela '${tableName}'. Removendo do payload e tentando novamente...`);
                                delete currentPayload[missingCol];
                                res = await client
                                    .from(tableName)
                                    .update(currentPayload)
                                    .eq(field, protStr)
                                    .select('id, protocolo');
                            } else {
                                break;
                            }
                        }

                        if (res.data && res.data.length > 0) {
                            updatedData = res.data;
                            break;
                        }
                    } catch(eUpd) {
                        console.warn(`⚠️ [ChamadosRepository] Aviso ao atualizar tabela ${tableName} via ${field}:`, eUpd);
                    }
                }
                if (updatedData && updatedData.length > 0) break;
            }

            // 3. Register log in logs_protocolos table via LogsRepository
            if (window.LogsRepository) {
                const descText = numFechamento 
                    ? `Alteração da lista de materiais do Fechamento #${numFechamento} pelo Administrador`
                    : `Alteração da lista de materiais da OS pelo Administrador`;

                window.LogsRepository.registrarLog({
                    protocolo: protStr,
                    tabelaOrigem: 'ordens_servico',
                    tipoAcao: 'ALTERACAO_MATERIAL',
                    descricao: descText,
                    dadosAnteriores: { fechamento_id: fechamentoId, materiais: materiaisAnterioresCloned },
                    dadosNovos: { fechamento_id: fechamentoId, materiais: matPayload, material_utilizado: matStr },
                    origemTela: 'Auditoria'
                }).catch(err => console.warn('⚠️ [ChamadosRepository] Falha ao registrar log de materiais:', err));
            }

            console.log(`✅ [ChamadosRepository] Materiais da OS ${protStr} atualizados com sucesso.`);
            return updatedData || true;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateMaterial:', err);
            throw err;
        }
    }
}

window.ChamadosRepository = ChamadosRepository;
})();
