/**
 * Infrastructure Layer - Chamados Repository
 * Handles direct database operations against Supabase table 'chamados'.
 */

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

    /**
     * Fetches all OSs from Supabase, prioritizing unified view vw_todas_ordens_servico,
     * falling back to ordens_servico or chamados.
     */
    async fetchAllChamados() {
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

            console.log(`📦 [ChamadosRepository] Retornados ${data?.length || 0} registros do Supabase:`, data);
            
            // Log detalhado de todos os registros para diagnóstico
            if (data && data.length > 0) {
                console.group('🔎 [ChamadosRepository] Diagnóstico Detalhado por OS');
                data.forEach((row, i) => {
                    console.log(`OS #${i+1} [${row.protocolo || row.id}] | Tipo: ${row.tipo_os || 'N/A'}:`, {
                        endereco_raw: row.endereco,
                        pontos_raw_str: JSON.stringify(row.pontos),
                        plaqueta_raw: row.plaqueta_inicial,
                        coordenada_raw: row.coordenada,
                        praca_nome_raw: row.praca_nome
                    });
                });
                console.groupEnd();
            }

            return (data || []).map((row) => window.ChamadoModel.fromRow(row));
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

            return (data || []).map(row => {
                const model = window.ChamadoModel.fromRow(row);
                if (auditMap[String(row.id)]) {
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
            } else if (newStatus === 'Aberta' || newStatus === 'Pendente' || newStatus === 'Cancelada') {
                updatePayload.data_conclusao = null;
                updatePayload.data_fechamento = null;
            }

            const executeUpdate = async (tableName, field, val, payload) => {
                let currentPayload = { ...payload };
                // A tabela ordens_servico_pracas não possui a coluna data_conclusao
                if (tableName === this.pracasTable) {
                    delete currentPayload.data_conclusao;
                    if (currentPayload.observacao_final && !currentPayload.descricao) {
                        currentPayload.descricao = currentPayload.observacao_final;
                    }
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

            const tablesToTry = [this.primaryTable, this.pracasTable];
            let updatedData = null;
            let lastError = null;

            for (const tableName of tablesToTry) {
                // 1. Tenta atualizar por ID
                let res = await executeUpdate(tableName, 'id', idOrProtocol, updatePayload);

                if (res.data && res.data.length > 0) {
                    updatedData = res.data;
                    lastError = null;
                    console.log(`✅ [ChamadosRepository] Status atualizado na tabela "${tableName}" por ID=${idOrProtocol}:`, updatedData);
                    break;
                } else if (res.error) {
                    lastError = res.error;
                    console.warn(`⚠️ [ChamadosRepository] Aviso ao atualizar na tabela "${tableName}" por ID=${idOrProtocol}:`, res.error);
                }

                // 2. Se não atualizou por ID, tenta por Protocolo
                if (idOrProtocol) {
                    res = await executeUpdate(tableName, 'protocolo', idOrProtocol, updatePayload);

                    if (res.data && res.data.length > 0) {
                        updatedData = res.data;
                        lastError = null;
                        console.log(`✅ [ChamadosRepository] Status atualizado na tabela "${tableName}" por Protocolo=${idOrProtocol}:`, updatedData);
                        break;
                    } else if (res.error) {
                        lastError = res.error;
                        console.warn(`⚠️ [ChamadosRepository] Aviso ao atualizar na tabela "${tableName}" por Protocolo=${idOrProtocol}:`, res.error);
                    }
                }
            }

            if (!updatedData || updatedData.length === 0) {
                if (lastError) {
                    console.error(`❌ [ChamadosRepository] Erro ao atualizar status no Supabase:`, lastError);
                    throw lastError;
                } else {
                    console.warn(`⚠️ [ChamadosRepository] Nenhum registro encontrado para atualizar com ID/Protocolo = "${idOrProtocol}".`);
                    throw new Error(`Nenhum registro encontrado no banco de dados para a OS (${idOrProtocol}).`);
                }
            }

            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateStatus:', err);
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

            console.log(`✅ [ChamadosRepository] Status de Auditoria da OS ${id} atualizado para "${newStatusAuditoria}".`);
            return updatedData;
        } catch (err) {
            console.error('❌ [ChamadosRepository] Exceção em updateStatusAuditoria:', err);
            return null;
        }
    }
}

window.ChamadosRepository = ChamadosRepository;
