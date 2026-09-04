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
        } catch (e) {}
    }

    /**
     * Fetches all OSs from Supabase, prioritizing unified view vw_todas_ordens_servico,
     * falling back to ordens_servico or chamados. Supports sessionStorage caching with TTL.
     */
    async fetchAllChamados(forceRefresh = false) {
        const CACHE_KEY = 'chamados_repo_cache_v1';
        const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos

        if (!forceRefresh) {
            try {
                const cachedRaw = sessionStorage.getItem(CACHE_KEY);
                if (cachedRaw) {
                    const parsed = JSON.parse(cachedRaw);
                    if (parsed && (Date.now() - parsed.timestamp < CACHE_TTL_MS) && Array.isArray(parsed.data) && parsed.data.length > 0) {
                        console.log(`⚡ [ChamadosRepository] Retornando ${parsed.data.length} registros do cache de sessão (sessionStorage)`);
                        return parsed.data.map((row) => {
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
                }
            } catch (errCache) {
                console.warn('⚠️ [ChamadosRepository] Erro ao ler cache de sessão:', errCache);
            }
        }

        try {
            const client = this.getClient();

            // 1. Tenta consultar a view unificada de 2 tabelas
            let { data, error } = await client
                .from(this.viewName)
                .select('*')
                .order('data_abertura', { ascending: true });

            if (error || !data || data.length === 0) {
                // 2. Fallback: consulta direta em ordens_servico
                const resPrimary = await client
                    .from(this.primaryTable)
                    .select('*')
                    .order('data_abertura', { ascending: true });

                if (!resPrimary.error && resPrimary.data && resPrimary.data.length > 0) {
                    data = resPrimary.data;
                } else {
                    // 3. Fallback legado: consulta em chamados
                    const resLegacy = await client
                        .from(this.legacyTable)
                        .select('*')
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

            // Carrega todos os fechamentos complementares para associar às OSs
            if (data && data.length > 0) {
                try {
                    const { data: fechamentosData, error: fechErr } = await client
                        .from('fechamentos_os')
                        .select('*')
                        .order('numero_fechamento', { ascending: true });

                    if (!fechErr && fechamentosData && fechamentosData.length > 0) {
                        const fechMap = new Map();
                        fechamentosData.forEach(f => {
                            const protKey = f.protocolo ? String(f.protocolo).toUpperCase().trim() : null;
                            if (protKey) {
                                if (!fechMap.has(protKey)) fechMap.set(protKey, []);
                                fechMap.get(protKey).push(f);
                            }
                        });

                        data.forEach(row => {
                            const protKey = row.protocolo ? String(row.protocolo).toUpperCase().trim() : null;
                            row.fechamentos_os = (protKey && fechMap.has(protKey)) ? fechMap.get(protKey) : [];
                        });
                    }
                } catch(eFech) {
                    console.warn('⚠️ [ChamadosRepository] Não foi possível carregar fechamentos_os:', eFech);
                }
            }

            console.log(`📦 [ChamadosRepository] Retornados ${data?.length || 0} registros do Supabase:`, data);

            if (data && data.length > 0) {
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        data: data
                    }));
                } catch (eSave) {
                    console.warn('⚠️ [ChamadosRepository] Não foi possível salvar no sessionStorage:', eSave);
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
     * Fetches chamados/OSs merged with audit flags
     */
    async fetchAuditoriaChamados() {
        try {
            const client = this.getClient();

            let data = null;
            const resView = await client
                .from(this.viewName)
                .select('*')
                .order('data_abertura', { ascending: false });

            if (!resView.error && resView.data && resView.data.length > 0) {
                data = resView.data;
            } else {
                const resPrimary = await client
                    .from(this.primaryTable)
                    .select('*')
                    .order('data_abertura', { ascending: false });
                data = resPrimary.data || [];
            }

            let auditMap = {};
            try {
                const { data: auditData, error: auditError } = await client
                    .from('vw_auditoria_chamados')
                    .select('*');

                if (!auditError && auditData) {
                    auditData.forEach(row => {
                        if (row.id) auditMap[String(row.id)] = row;
                    });
                }
            } catch (vErr) {}

            // Carrega todos os fechamentos complementares para associar às OSs de Auditoria (fotos, relatórios e materiais)
            if (data && data.length > 0) {
                try {
                    const { data: fechamentosData, error: fechErr } = await client
                        .from('fechamentos_os')
                        .select('*')
                        .order('numero_fechamento', { ascending: true });

                    if (!fechErr && fechamentosData && fechamentosData.length > 0) {
                        const fechMap = new Map();
                        fechamentosData.forEach(f => {
                            const protKey = f.protocolo ? String(f.protocolo).toUpperCase().trim() : null;
                            if (protKey) {
                                if (!fechMap.has(protKey)) fechMap.set(protKey, []);
                                fechMap.get(protKey).push(f);
                            }
                        });

                        data.forEach(row => {
                            const protKey = row.protocolo ? String(row.protocolo).toUpperCase().trim() : null;
                            row.fechamentos_os = (protKey && fechMap.has(protKey)) ? fechMap.get(protKey) : [];
                        });
                    }
                } catch(eFech) {
                    console.warn('⚠️ [ChamadosRepository] Não foi possível carregar fechamentos_os para Auditoria:', eFech);
                }
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
                    .select();

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
                            .select();
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
     * Updates status_auditoria and data_conclusao_auditoria for a chamado by ID
     */
    async updateStatusAuditoria(id, newStatusAuditoria) {
        try {
            const client = this.getClient();
            const isConcluded = newStatusAuditoria === 'Concluída' || newStatusAuditoria === 'Concluida';
            const updatePayload = {
                status_auditoria: newStatusAuditoria,
                data_conclusao_auditoria: isConcluded ? new Date().toISOString() : null
            };

            const tablesToTry = [this.primaryTable, this.pracasTable];
            let updatedData = null;

            for (const tableName of tablesToTry) {
                let res = await client
                    .from(tableName)
                    .update(updatePayload)
                    .eq('id', id)
                    .select();

                if (res.data && res.data.length > 0) {
                    updatedData = res.data;
                    break;
                } else if (res.error) {
                    // Fallback attempt: if column status_auditoria doesn't exist, try updating auditoria_concluida boolean
                    try {
                        const fallbackRes = await client
                            .from(tableName)
                            .update({ auditoria_concluida: isConcluded })
                            .eq('id', id)
                            .select();
                        if (fallbackRes.data && fallbackRes.data.length > 0) {
                            updatedData = fallbackRes.data;
                            break;
                        }
                    } catch (fallbackErr) {}
                }
            }

            if (updatedData && updatedData.length > 0 && window.LogsRepository) {
                const rec = updatedData[0];
                const prot = rec.protocolo || id;
                window.LogsRepository.registrarLog({
                    protocolo: prot,
                    tabelaOrigem: rec.praca_nome ? this.pracasTable : this.primaryTable,
                    tipoAcao: 'AUDITORIA',
                    descricao: `Status da Auditoria alterado para "${newStatusAuditoria}"`,
                    dadosNovos: { status_auditoria: newStatusAuditoria },
                    origemTela: 'Auditoria'
                }).catch(err => console.warn('⚠️ [ChamadosRepository] Falha ao registrar log de auditoria:', err));
            }

            console.log(`✅ [ChamadosRepository] Status de Auditoria da OS ${id} atualizado para "${newStatusAuditoria}".`);
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
                            .select();

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
                                    .select();
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
