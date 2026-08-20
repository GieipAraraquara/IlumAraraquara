/**
 * Application / Business Service Layer - Chamados Service
 * Manages domain logic, calculations, filtering, and data transformations.
 */

class ChamadosService {
    constructor(repository) {
        this.repository = repository || new window.ChamadosRepository();
    }

    /**
     * Loads list of Chamados, falling back to mock dataset if needed
     */
    async getChamadosList() {
        const remoteChamados = await this.repository.fetchAllChamados();
        if (remoteChamados && remoteChamados.length > 0) {
            return remoteChamados;
        }

        console.log('ℹ️ [ChamadosService] Nenhum registro retornado do Supabase. Carregando lista de demonstração...');
        return this.getMockChamados();
    }

    /**
     * Calculates KPI metrics from list of Chamados
     */
    calculateMetrics(chamadosList = []) {
        const totalOS = chamadosList.length;
        let emAbertoCount = 0;
        let concluidaCount = 0;
        let totalResolutionTimeMs = 0;
        let resolvedCountWithDates = 0;

        chamadosList.forEach(item => {
            const status = item.normalizedStatus;
            if (status === 'aberto' || status === 'em_andamento' || status === 'pendente') {
                emAbertoCount++;
            } else if (status === 'concluida') {
                concluidaCount++;
                if (item.dataAbertura && item.dataConclusao) {
                    const diffMs = item.dataConclusao.getTime() - item.dataAbertura.getTime();
                    if (diffMs > 0) {
                        totalResolutionTimeMs += diffMs;
                        resolvedCountWithDates++;
                    }
                }
            }
        });

        const completionRate = totalOS > 0 ? Math.round((concluidaCount / totalOS) * 100) : 0;
        
        let avgDays = 2.4;
        if (resolvedCountWithDates > 0) {
            avgDays = (totalResolutionTimeMs / (1000 * 60 * 60 * 24 * resolvedCountWithDates)).toFixed(1);
        }

        return {
            totalOS: totalOS.toLocaleString('pt-BR'),
            emAberto: emAbertoCount,
            concluidas: concluidaCount,
            completionRate: `${completionRate}%`,
            avgResolutionDays: avgDays
        };
    }

    /**
     * Filters chamados list based on active UI filter criteria
     */
    filterChamados(chamadosList, filters = {}) {
        const { search, protocol, protocolPrefix, datePredicate, problem, status } = filters;
        const isManutentor = typeof window !== 'undefined' && Boolean(window.isManutentorView);

        return chamadosList.filter(item => {
            // Manutentor view rule: Never show 'pendente' OS
            const itemStatus = item.normalizedStatus || item.status;
            if (isManutentor && (itemStatus === 'pendente' || itemStatus === 'Pendente')) {
                return false;
            }

            // General top-bar search filter
            if (search) {
                const term = search.toLowerCase().trim();
                const fmt = window.ChamadoModel ? window.ChamadoModel.formatLocationText : (v => String(v || ''));
                const matchProtocol = fmt(item.protocolo).toLowerCase().includes(term);
                const matchPlaqueta = fmt(item.plaquetaInicial).toLowerCase().includes(term);
                const matchAddress = fmt(item.endereco).toLowerCase().includes(term);
                const matchCoord = fmt(item.coordenadaInicial).toLowerCase().includes(term);
                const matchMunicipe = fmt(item.municipeNome).toLowerCase().includes(term);
                if (!matchProtocol && !matchPlaqueta && !matchAddress && !matchCoord && !matchMunicipe) return false;
            }

            // Protocol prefix filter (Praça 'P' / Viária 'I')
            if (protocolPrefix) {
                const pref = protocolPrefix.toUpperCase().trim();
                const prot = String(item.protocolo || '').trim().toUpperCase();
                if (!prot.startsWith(pref)) return false;
            }

            // Protocol specific column search
            if (protocol) {
                const pTerm = protocol.toLowerCase().trim();
                const fmt = window.ChamadoModel ? window.ChamadoModel.formatLocationText : (v => String(v || ''));
                if (!fmt(item.protocolo).toLowerCase().includes(pTerm)) return false;
            }

            // Date predicate filter
            if (typeof datePredicate === 'function') {
                if (!datePredicate(item.dataAbertura)) return false;
            }

            // Problem filter
            if (problem && problem !== 'all') {
                if (Array.isArray(problem)) {
                    if (problem.length === 0) return false;
                    if (!problem.includes('all') && !problem.includes(item.problemSelectValue)) return false;
                } else if (item.problemSelectValue !== problem) {
                    return false;
                }
            }

            // Status filter
            if (status && status !== 'all') {
                if (Array.isArray(status)) {
                    if (status.length === 0) return false;
                    if (!status.includes('all') && !status.includes(item.normalizedStatus)) return false;
                } else if (item.normalizedStatus !== status) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Maps UI action status to Database string and updates Supabase
     */
    async changeChamadoStatus(id, newUIStatus, justification = '') {
        const dbStatusMap = {
            'aberto': 'Aberta',
            'em_andamento': 'Em Andamento',
            'concluida': 'Concluída',
            'cancelada': 'Cancelada',
            'rejeitada': 'Rejeitada',
            'pendente': 'Pendente'
        };

        const dbStatus = dbStatusMap[newUIStatus] || 'Aberta';
        return await this.repository.updateStatus(id, dbStatus, justification);
    }

    /**
     * Updates audit status ('Concluída' or 'Pendente') in Supabase
     */
    async changeAuditoriaStatus(id, newAuditoriaStatus) {
        return await this.repository.updateStatusAuditoria(id, newAuditoriaStatus);
    }

    /**
     * Loads list of Chamados for Auditoria, including vw_auditoria_chamados view metrics
     */
    async getAuditoriaChamadosList() {
        const remoteChamados = await this.repository.fetchAuditoriaChamados();
        if (remoteChamados && remoteChamados.length > 0) {
            return remoteChamados;
        }

        console.log('ℹ️ [ChamadosService] Nenhum registro retornado do Supabase para Auditoria. Carregando lista de demonstração...');
        return this.getMockAuditoriaChamados();
    }

    /**
     * Calculates Auditoria KPI metrics from list of Chamados
     */
    calculateAuditoriaMetrics(chamadosList = []) {
        const totalAuditadas = chamadosList.length;
        let comDivergencias = 0;
        let emConformidade = 0;

        chamadosList.forEach(item => {
            if (item.hasDivergence) {
                comDivergencias++;
            } else {
                emConformidade++;
            }
        });

        const conformityRate = totalAuditadas > 0 ? ((emConformidade / totalAuditadas) * 100).toFixed(1) : '100.0';

        return {
            totalAuditadas: totalAuditadas.toLocaleString('pt-BR'),
            comDivergencias: comDivergencias,
            emConformidade: emConformidade,
            conformityRate: `${conformityRate}%`
        };
    }

    /**
     * Fallback mock dataset based on chamados_rows.csv structure
     */
    getMockChamados() {
        const mockRows = [
            { id: '1', protocolo: 'IP1SBV0270726', data_abertura: '2026-08-07', status: 'Pendente', prioridade: 'Normal', operador: 'Adriano', municipe_nome: 'Alexandre Medeiros', plaqueta_inicial: 'C0045', problema_inicial: 'Outro', qtd_inicial: 1, endereco: 'C0045 - Av. Principal' },
            { id: '2', protocolo: 'OS-2023-002', data_abertura: '2026-08-06', status: 'Concluída', prioridade: 'Normal', operador: 'Ana', municipe_nome: 'Pma', plaqueta_inicial: '---', problema_inicial: 'Outro', qtd_inicial: 1, endereco: 'Rua das Flores, 123' },
            { id: '3', protocolo: 'IP1SBV0270726', data_abertura: '2026-08-10', status: 'Aberta', prioridade: 'Normal', operador: 'Igor', municipe_nome: 'Igor', plaqueta_inicial: 'C0011', problema_inicial: 'Lâmpada queimada', qtd_inicial: 1, endereco: 'C0011 - Praça Central' },
            { id: '4', protocolo: 'OS-2023-004', data_abertura: '2026-08-10', status: 'Aberta', prioridade: 'Normal', operador: 'Adriano', municipe_nome: 'Roberto Borges', plaqueta_inicial: 'C0010', problema_inicial: 'Lâmpada queimada', qtd_inicial: 4, endereco: 'C0010 - Av. Brasil, 500\nC0011 - Av. Brasil, 520\nC0012 - Av. Brasil, 580\nC0013 - Rua das Palmeiras, 12' },
            { id: '5', protocolo: 'OS-2023-001', data_abertura: '2026-08-05', status: 'Cancelada', prioridade: 'Normal', operador: 'Flavia', municipe_nome: 'Genesio Luiz', plaqueta_inicial: 'F6433', problema_inicial: 'Lâmpada quebrada', qtd_inicial: 1, endereco: 'Rua São José, 45' }
        ];

        return mockRows.map(row => window.ChamadoModel.fromRow(row));
    }

    /**
     * Fallback mock dataset for Auditoria with audit view structures
     */
    getMockAuditoriaChamados() {
        const mockRows = [
            {
                id: '1', protocolo: 'OS-2023-003', data_abertura: '2026-08-09', data_conclusao: '2026-08-10T14:30:00Z', status: 'Concluída', operador: 'Adriano',
                plaqueta_inicial: 'C0045', plaqueta_final: 'C0048', problema_inicial: 'Lâmpada queimada', problema_encontrado: 'Outro',
                qtd_inicial: 1, qtd_final: 1, endereco: 'C0045 - Av. Principal',
                coordenada_inicial: '-21.81607, -48.13919', coordenada_reparo: '-21.81750, -48.14020',
                material_utilizado: 'Reator 70W, Lâmpada LED',
                audit: {
                    problema_divergente: false, plaqueta_divergente: true, quantidade_divergente: false,
                    distancia_acima_100m: false, outra_plaqueta_proxima: false, outro_reparo_no_mes: false,
                    precisa_anexar_foto: false, anexo_faltante: false, material_divergente: true, problema_externo: false
                }
            },
            {
                id: '2', protocolo: 'OS-2023-002', data_abertura: '2026-08-06', data_conclusao: '2026-08-07T10:15:00Z', status: 'Concluída', operador: 'Ana',
                plaqueta_inicial: 'PLQ-88492', plaqueta_final: 'PLQ-88492', problema_inicial: 'Acesa dia', problema_encontrado: 'Acesa dia',
                qtd_inicial: 1, qtd_final: 1, endereco: 'Rua das Flores, 123',
                coordenada_inicial: '-21.81607, -48.13919', coordenada_reparo: '-21.81607, -48.13919',
                material_utilizado: 'Fotocélula 100W',
                audit: {
                    problema_divergente: false, plaqueta_divergente: false, quantidade_divergente: false,
                    distancia_acima_100m: false, outra_plaqueta_proxima: false, outro_reparo_no_mes: false,
                    precisa_anexar_foto: false, anexo_faltante: false, material_divergente: false, problema_externo: false
                }
            },
            {
                id: '3', protocolo: 'OS-2023-001', data_abertura: '2026-08-05', data_conclusao: '2026-08-06T16:45:00Z', status: 'Concluída', operador: 'Igor',
                plaqueta_inicial: 'PLQ-10492', plaqueta_final: 'PLQ-10492', problema_inicial: 'Lâmpada queimada', problema_encontrado: 'Lâmpada queimada',
                qtd_inicial: 2, qtd_final: 1, endereco: 'C0011 - Praça Central',
                coordenada_inicial: '-21.81000, -48.13000', coordenada_reparo: '-21.81250, -48.13300',
                material_utilizado: 'Lâmpada LED 50W',
                audit: {
                    problema_divergente: true, plaqueta_divergente: false, quantidade_divergente: true,
                    distancia_acima_100m: true, outra_plaqueta_proxima: false, outro_reparo_no_mes: false,
                    precisa_anexar_foto: false, anexo_faltante: false, material_divergente: false, problema_externo: false
                }
            },
            {
                id: '4', protocolo: 'IP1SBV0270726', data_abertura: '2026-08-10', data_conclusao: '2026-08-11T09:00:00Z', status: 'Concluída', operador: 'Roberto',
                plaqueta_inicial: 'C0010', plaqueta_final: 'C0010', problema_inicial: 'Outro', problema_encontrado: 'Outro',
                qtd_inicial: 1, qtd_final: 1, endereco: 'Av. Brasil, 500',
                coordenada_inicial: '-21.81111, -48.13111', coordenada_reparo: '-21.81111, -48.13111',
                material_utilizado: 'Cabo 10mm, Conector',
                audit: {
                    problema_divergente: false, plaqueta_divergente: false, quantidade_divergente: false,
                    distancia_acima_100m: false, outra_plaqueta_proxima: true, outro_reparo_no_mes: true,
                    precisa_anexar_foto: true, anexo_faltante: true, material_divergente: false, problema_externo: true
                }
            }
        ];

        return mockRows.map(row => window.ChamadoModel.fromRow(row));
    }
}

window.ChamadosService = ChamadosService;
