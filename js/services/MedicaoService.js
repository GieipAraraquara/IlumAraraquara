/**
 * MedicaoService.js
 * Motor de Cálculo de Medição e Gestão de Regras de Glosa / Desconto
 * Baseado no Termo de Referência (TR - rev03) - Prefeitura Municipal de Araraquara
 */

(function() {
    if (window.MedicaoService) return;

    // Regras Padrão Oficiais extraídas do TR - rev03 (Apenas regras detectáveis automaticamente)
    const REGRAS_PADRAO_TR = [
        {
            id: 'atraso_execucao',
            nome: 'Atraso na Conclusão da OS (Item 7.1.4)',
            descricao: 'Desconto por dia útil de atraso no atendimento com aplicação de teto/trava máxima de dias.',
            artigoTR: 'Item 7.1.4',
            ativo: true,
            tipo: 'atraso_dias_uteis',
            percentualPorDia: 10.0,
            limiteDiasUteis: 10,
            prazoDiasCorretivaSimples: 3, // Item 7.1.2.1: Troca lâmpada/relé até 3 dias corridos
            prazoDiasCorretivaGeral: 2,   // Item 7.1.2: Corretivo em geral até 2 dias úteis
            prazoDiasRotina: 7            // Item 7.1.1: Rotina em até 7 dias úteis
        },
        {
            id: 'sem_plaqueta',
            nome: 'Ausência ou Ilegibilidade de Plaqueta (Item 7.6.3)',
            descricao: 'Glosa técnica de 20% sobre o valor da OS se o braço/poste atendido não possuir a plaqueta de identificação amarela.',
            artigoTR: 'Item 7.6.3.1',
            ativo: true,
            tipo: 'fixo_os',
            percentualGlosa: 20.0
        }
    ];

    const STORAGE_KEY_REGRAS = 'sistema_os_regras_medicao_tr';
    const STORAGE_KEY_OVERRIDES = 'sistema_os_medicao_overrides';
    const STORAGE_KEY_JANELA_MEDICAO = 'sistema_os_janela_medicao_config';
    const STORAGE_KEY_REUNIOES_SEMANAIS = 'sistema_os_reunioes_semanais_tr';
    const SESSION_CACHE_PREFIX = 'cache_medicao_config_';

    class MedicaoService {
        constructor() {
            this.periodoAtual = null;
            this.regras = this.carregarRegras();
            this.overrides = this.carregarOverrides();
            this.janelaConfig = this.carregarJanelaMedicaoConfig();
            this.reunioesSemanais = this.carregarReunioesSemanais();
            this.tabelaPrecos = null;
        }

        /**
         * Retorna a instância do cliente Supabase caso disponível
         */
        getSupabase() {
            if (typeof window !== 'undefined') {
                if (window.supabaseClient) return window.supabaseClient;
                if (typeof obterSupabaseClient === 'function') return obterSupabaseClient();
            }
            return null;
        }

        /**
         * Carrega configurações do período diretamente do Supabase com cache local de sessão.
         * Respeita o plano de contenção de Egress: busca cirúrgica de 1 registro por período.
         */
        async carregarConfiguracoesPeriodo(periodoStr) {
            if (!periodoStr) return;
            this.periodoAtual = periodoStr;

            // 1. Checa cache de sessão (evita bater no banco ao alternar abas ou filtros)
            try {
                const cacheSession = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${periodoStr}`);
                if (cacheSession) {
                    const parsed = JSON.parse(cacheSession);
                    this.aplicarConfiguracaoPeriodo(parsed);
                    return;
                }
            } catch(e) {}

            const client = this.getSupabase();
            if (!client) {
                return;
            }

            try {
                // 2. Busca cirúrgica com projeção restrita no Supabase (Diretriz 1 & 2 do plano Egress)
                const { data, error } = await client
                    .from('medicao_configuracoes_tr')
                    .select('periodo, janela_medicao, regras, reunioes_semanais, overrides')
                    .eq('periodo', periodoStr)
                    .maybeSingle();

                if (!error && data) {
                    this.aplicarConfiguracaoPeriodo(data);
                    try {
                        sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${periodoStr}`, JSON.stringify(data));
                    } catch(e) {}
                    return;
                }

                // 3. Se não houver configuração específica para este mês, tenta obter a configuração padrão 'DEFAULT'
                const { data: dataDefault, error: errDef } = await client
                    .from('medicao_configuracoes_tr')
                    .select('periodo, janela_medicao, regras, reunioes_semanais, overrides')
                    .eq('periodo', 'DEFAULT')
                    .maybeSingle();

                if (!errDef && dataDefault) {
                    this.aplicarConfiguracaoPeriodo(dataDefault, false);
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoService] Falha ao carregar configurações do Supabase (usando local):', e);
            }
        }

        /**
         * Aplica em memória os dados de configuração carregados
         */
        aplicarConfiguracaoPeriodo(data, aplicarReunioes = true) {
            if (!data) return;
            const defaultsMap = new Map(REGRAS_PADRAO_TR.map(r => [r.id, r]));

            if (Array.isArray(data.regras) && data.regras.length > 0) {
                this.regras = data.regras
                    .filter(r => defaultsMap.has(r.id))
                    .map(r => ({ ...defaultsMap.get(r.id), ...r }));
            }

            if (data.janela_medicao && data.janela_medicao.diaInicio && data.janela_medicao.diaFim) {
                this.janelaConfig = data.janela_medicao;
            }

            if (data.overrides && typeof data.overrides === 'object') {
                this.overrides = { ...this.overrides, ...data.overrides };
            }

            if (aplicarReunioes && data.reunioes_semanais && Array.isArray(data.reunioes_semanais)) {
                if (!this.reunioesSemanais) this.reunioesSemanais = {};
                this.reunioesSemanais[data.periodo] = data.reunioes_semanais;
            }
        }

        /**
         * Salva as configurações do período no Supabase e no cache local
         * Respeita o plano Egress: upsert direto sem .select() (zero payload de retorno).
         */
        async persistirConfiguracoesPeriodo(periodoStr, customUser = '') {
            const periodo = periodoStr || this.periodoAtual || 'DEFAULT';
            const reunioesDoPeriodo = (this.reunioesSemanais && this.reunioesSemanais[periodo]) || [];

            const payload = {
                periodo: periodo,
                janela_medicao: this.janelaConfig,
                regras: this.regras,
                reunioes_semanais: reunioesDoPeriodo,
                overrides: this.overrides,
                atualizado_por: customUser || 'Admin',
                updated_at: new Date().toISOString()
            };

            // Atualiza cache de sessão
            try {
                sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${periodo}`, JSON.stringify(payload));
            } catch(e) {}

            // Fallback em localStorage
            try {
                localStorage.setItem(STORAGE_KEY_REGRAS, JSON.stringify(this.regras));
                localStorage.setItem(STORAGE_KEY_JANELA_MEDICAO, JSON.stringify(this.janelaConfig));
                localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(this.overrides));
                localStorage.setItem(STORAGE_KEY_REUNIOES_SEMANAIS, JSON.stringify(this.reunioesSemanais));
            } catch(e) {}

            const client = this.getSupabase();
            if (client) {
                try {
                    // Upsert cirúrgico sem .select() (Diretriz 4 do plano de Egress)
                    const { error } = await client
                        .from('medicao_configuracoes_tr')
                        .upsert(payload, { onConflict: 'periodo' });

                    if (error) {
                        console.warn('⚠️ [MedicaoService] Falha ao persistir no Supabase:', error);
                    } else {
                        console.log(`✅ [MedicaoService] Parâmetros TR persistidos no Supabase para o período: ${periodo}`);
                    }
                } catch(e) {
                    console.warn('⚠️ [MedicaoService] Erro ao sincronizar com Supabase:', e);
                }
            }
        }

        /**
         * Carrega a configuração da janela do período de medição (dia início e dia fim)
         * Padrão oficial: Dia 21 do mês anterior até dia 20 do mês de competência
         */
        carregarJanelaMedicaoConfig() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_JANELA_MEDICAO);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && parsed.diaInicio && parsed.diaFim) {
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoService] Falha ao ler janela de medição salva:', e);
            }
            return {
                diaInicio: 21,
                diaFim: 20,
                mesmoMes: false // false: dia 21 do mês anterior até dia 20 do mês atual
            };
        }

        /**
         * Salva a configuração da janela de medição
         */
        salvarJanelaMedicaoConfig(novaJanela) {
            try {
                this.janelaConfig = novaJanela;
                localStorage.setItem(STORAGE_KEY_JANELA_MEDICAO, JSON.stringify(novaJanela));
                if (this.periodoAtual) {
                    this.persistirConfiguracoesPeriodo(this.periodoAtual);
                }
                window.dispatchEvent(new CustomEvent('janela-medicao-atualizada', { detail: novaJanela }));
                return true;
            } catch (e) {
                console.error('❌ [MedicaoService] Erro ao salvar janela de medição:', e);
                return false;
            }
        }

        /**
         * Calcula as datas exatas de início e fim para a competência selecionada
         */
        getMedicaoPeriodDates(selectedMonthStr) {
            let targetY, targetM;

            if (selectedMonthStr && selectedMonthStr.includes('-')) {
                const parts = selectedMonthStr.split('-').map(Number);
                targetY = parts[0];
                targetM = parts[1]; // 1..12
            } else {
                const now = new Date();
                targetY = now.getFullYear();
                targetM = now.getMonth() + 1; // 1..12
            }

            const cfg = this.janelaConfig || this.carregarJanelaMedicaoConfig();
            const diaInicio = parseInt(cfg.diaInicio, 10) || 21;
            const diaFim = parseInt(cfg.diaFim, 10) || 20;

            let startDate, endDate;

            if (cfg.mesmoMes || diaInicio <= diaFim) {
                // Exemplo: 01 a 31 do mesmo mês
                startDate = new Date(targetY, targetM - 1, diaInicio, 0, 0, 0, 0);
                endDate = new Date(targetY, targetM - 1, diaFim, 23, 59, 59, 999);
            } else {
                // Padrão: dia 21 do mês anterior até dia 20 do mês selecionado
                startDate = new Date(targetY, targetM - 2, diaInicio, 0, 0, 0, 0);
                endDate = new Date(targetY, targetM - 1, diaFim, 23, 59, 59, 999);
            }

            const formatBR = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

            return {
                startDate,
                endDate,
                periodLabelBR: `${formatBR(startDate)} a ${formatBR(endDate)}`
            };
        }

        /**
         * Carrega as regras ativas salvas em localStorage ou restaura as do TR
         */
        carregarRegras() {
            const defaultsMap = new Map(REGRAS_PADRAO_TR.map(r => [r.id, r]));
            try {
                const saved = localStorage.getItem(STORAGE_KEY_REGRAS);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Filtra apenas as regras automáticas ativas no padrão atual e mescla com defaults para garantir novos campos
                        const filtradas = parsed
                            .filter(r => defaultsMap.has(r.id))
                            .map(r => ({ ...defaultsMap.get(r.id), ...r }));
                        if (filtradas.length > 0) {
                            return filtradas;
                        }
                    }
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoService] Falha ao ler regras salvas:', e);
            }
            return JSON.parse(JSON.stringify(REGRAS_PADRAO_TR));
        }

        /**
         * Salva as regras editadas pelo usuário no front-end
         */
        salvarRegras(novasRegras, mesAno = null) {
            try {
                this.regras = novasRegras;
                localStorage.setItem(STORAGE_KEY_REGRAS, JSON.stringify(novasRegras));
                const targetPeriodo = mesAno || this.periodoAtual;
                if (targetPeriodo) {
                    this.persistirConfiguracoesPeriodo(targetPeriodo);
                }
                window.dispatchEvent(new CustomEvent('regras-medicao-atualizadas', { detail: novasRegras }));
                return true;
            } catch (e) {
                console.error('❌ [MedicaoService] Erro ao salvar regras:', e);
                return false;
            }
        }

        /**
         * Restaura as regras para o padrão estrito do Termo de Referência (TR rev03)
         */
        restaurarPadroesTR(mesAno = null) {
            const defaults = JSON.parse(JSON.stringify(REGRAS_PADRAO_TR));
            this.salvarRegras(defaults, mesAno);
            return defaults;
        }

        /**
         * Carrega as exceções/justificativas manuais salvas pelo fiscal
         */
        carregarOverrides() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_OVERRIDES);
                return saved ? JSON.parse(saved) : {};
            } catch (e) {
                return {};
            }
        }

        /**
         * Salva ou atualiza uma anistia / alteração manual de glosa para uma OS
         */
        salvarOverrideOS(protocolo, regraId, isGlosada, justificativa = '') {
            try {
                if (!this.overrides[protocolo]) {
                    this.overrides[protocolo] = {};
                }
                this.overrides[protocolo][regraId] = {
                    ignorarGlosa: !isGlosada,
                    justificativa: justificativa,
                    dataModificacao: new Date().toISOString()
                };
                localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(this.overrides));
                if (this.periodoAtual) {
                    this.persistirConfiguracoesPeriodo(this.periodoAtual);
                }
                window.dispatchEvent(new CustomEvent('glosa-anistia-atualizada', { 
                    detail: { protocolo, regraId, isGlosada, justificativa } 
                }));
                return true;
            } catch (e) {
                console.error('❌ [MedicaoService] Erro ao salvar override:', e);
                return false;
            }
        }

        /**
         * Carrega as reuniões semanais salvas agrupadas por competência
         */
        carregarReunioesSemanais() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_REUNIOES_SEMANAIS);
                if (saved) {
                    this.reunioesSemanais = JSON.parse(saved);
                    return this.reunioesSemanais;
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoService] Falha ao carregar reuniões semanais:', e);
            }
            this.reunioesSemanais = this.reunioesSemanais || {};
            return this.reunioesSemanais;
        }

        /**
         * Salva as reuniões semanais para uma competência específica
         */
        salvarReunioesSemanais(mesAnoStr, semanasData) {
            try {
                if (!this.reunioesSemanais) this.reunioesSemanais = {};
                this.reunioesSemanais[mesAnoStr] = semanasData;
                localStorage.setItem(STORAGE_KEY_REUNIOES_SEMANAIS, JSON.stringify(this.reunioesSemanais));
                
                // Persiste no Supabase com chave do período
                this.persistirConfiguracoesPeriodo(mesAnoStr);

                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('reunioes-semanais-atualizadas', { 
                        detail: { mesAnoStr, semanasData } 
                    }));
                }
                return true;
            } catch (e) {
                console.error('❌ [MedicaoService] Erro ao salvar reuniões semanais:', e);
                return false;
            }
        }

        /**
         * Gera a lista de semanas que compõem o ciclo de medição selecionado
         * Retorna blocos com { id, semanaNumero, dataInicio, dataFim, label, status, justificativa }
         */
        gerarSemanasDoPeriodo(mesAnoStr) {
            this.carregarReunioesSemanais();
            const { startDate, endDate } = this.getMedicaoPeriodDates(mesAnoStr);
            const salvas = (this.reunioesSemanais && this.reunioesSemanais[mesAnoStr]) || [];

            const semanas = [];
            // Ajusta o início para a Segunda-feira da semana civil correspondente ao startDate
            let currStart = new Date(startDate.getTime());
            currStart.setHours(0, 0, 0, 0);
            const dayOfWeek = currStart.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            currStart.setDate(currStart.getDate() + diffToMonday);

            let semanaNum = 1;
            const formatSemAno = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

            // Continua gerando blocos completos de Segunda a Domingo enquanto cobrir o período de medição
            while (currStart.getTime() <= endDate.getTime()) {
                let currEnd = new Date(currStart.getTime());
                // Segunda + 6 dias = Domingo
                currEnd.setDate(currEnd.getDate() + 6);
                currEnd.setHours(23, 59, 59, 999);

                const semId = `sem_${semanaNum}_${currStart.getFullYear()}_${currStart.getMonth() + 1}_${currStart.getDate()}`;
                const salvaExistente = salvas.find(s => s.id === semId || s.semanaNumero === semanaNum);

                semanas.push({
                    id: semId,
                    semanaNumero: semanaNum,
                    dataInicio: new Date(currStart.getTime()),
                    dataFim: new Date(currEnd.getTime()),
                    dataInicioStr: formatSemAno(currStart),
                    dataFimStr: formatSemAno(currEnd),
                    label: `Semana ${semanaNum} (${formatSemAno(currStart)} a ${formatSemAno(currEnd)})`,
                    // Status: 'realizada' | 'nao_realizada' | 'dispensada'
                    status: salvaExistente ? salvaExistente.status : 'realizada',
                    justificativa: salvaExistente ? (salvaExistente.justificativa || '') : '',
                    dataReuniao: salvaExistente ? (salvaExistente.dataReuniao || '') : ''
                });

                // Próxima semana: próxima Segunda-feira
                currStart = new Date(currEnd.getTime());
                currStart.setDate(currStart.getDate() + 1);
                currStart.setHours(0, 0, 0, 0);
                semanaNum++;
            }

            return semanas;
        }

        /**
         * Identifica as OSs concluídas na semana anterior para cada semana faltosa (Item 8.7.1)
         * e checa se há reincidência (Item 8.7.2: 2 semanas consecutivas ou 3 no mês)
         */
        calcularGlosasReuniaoSemanal(chamados = [], mesAnoStr = '') {
            const semanas = this.gerarSemanasDoPeriodo(mesAnoStr);
            const ossPorSemanaFaltosa = {}; // { [semanaNumero]: { semanaFalta, semanaAnterior, ossAfetadas: [] } }
            const protocolosGlosadosPorReuniao = {}; // { [protocolo]: { percentual: 10, detalhe: string } }

            let totalSemanasNaoRealizadas = 0;
            let maxConsecutivas = 0;
            let currentConsecutivas = 0;

            semanas.forEach((sem, idx) => {
                if (sem.status === 'nao_realizada') {
                    totalSemanasNaoRealizadas++;
                    currentConsecutivas++;
                    if (currentConsecutivas > maxConsecutivas) {
                        maxConsecutivas = currentConsecutivas;
                    }

                    // A semana anterior à falta é a semana idx - 1 (se for a primeira semana do ciclo, pega os 7 dias antes do ciclo)
                    let dtInicioSemanaAnterior, dtFimSemanaAnterior;
                    if (idx > 0) {
                        dtInicioSemanaAnterior = semanas[idx - 1].dataInicio;
                        dtFimSemanaAnterior = semanas[idx - 1].dataFim;
                    } else {
                        // 7 dias antes do início da medição
                        dtFimSemanaAnterior = new Date(sem.dataInicio.getTime() - 1);
                        dtInicioSemanaAnterior = new Date(sem.dataInicio.getTime());
                        dtInicioSemanaAnterior.setDate(dtInicioSemanaAnterior.getDate() - 7);
                        dtInicioSemanaAnterior.setHours(0, 0, 0, 0);
                    }

                    // Identifica OSs concluídas nesta semana anterior
                    const ossAfetadas = chamados.filter(os => {
                        const st = (os.normalizedStatus || os.status || '').toLowerCase();
                        const isConc = st.includes('conclu') || st.includes('resolv') || st.includes('fechad');
                        if (!isConc) return false;
                        const dtRef = os.dataConclusao || os.dataAbertura;
                        if (!dtRef) return false;
                        const t = (dtRef instanceof Date) ? dtRef.getTime() : new Date(dtRef).getTime();
                        return t >= dtInicioSemanaAnterior.getTime() && t <= dtFimSemanaAnterior.getTime();
                    });

                    ossAfetadas.forEach(os => {
                        const prot = os.protocolo || 'OS';
                        if (!protocolosGlosadosPorReuniao[prot]) {
                            protocolosGlosadosPorReuniao[prot] = {
                                percentualGlosa: 10.0,
                                detalhe: `Reunião semanal não realizada na ${sem.label} - Glosa de 10% s/ OSs executadas na semana anterior (Item 8.7.1 do TR).`,
                                semanaFalta: sem.semanaNumero
                            };
                        }
                    });

                    ossPorSemanaFaltosa[sem.semanaNumero] = {
                        semanaFalta: sem,
                        semanaAnterior: {
                            dataInicio: dtInicioSemanaAnterior,
                            dataFim: dtFimSemanaAnterior
                        },
                        ossAfetadas: ossAfetadas
                    };
                } else {
                    currentConsecutivas = 0;
                }
            });

            // Regra 8.7.2: Reincidência de 2 semanas consecutivas ou 3 dentro do mesmo mês
            const temReincidencia = maxConsecutivas >= 2 || totalSemanasNaoRealizadas >= 3;
            const percentualMultaMensalReincidencia = temReincidencia ? 15.0 : 0.0;

            return {
                semanas,
                totalSemanasNaoRealizadas,
                maxConsecutivas,
                temReincidencia,
                percentualMultaMensalReincidencia,
                ossPorSemanaFaltosa,
                protocolosGlosadosPorReuniao
            };
        }

        /**
         * Carrega itens precificados do contrato (extracted_priced_items.json ou materiais_contrato)
         */
        async carregarTabelaPrecos() {
            if (this.tabelaPrecos && this.tabelaPrecos.length > 0) return this.tabelaPrecos;

            try {
                const resp = await fetch('extracted_priced_items.json');
                if (resp.ok) {
                    const data = await resp.json();
                    if (Array.isArray(data) && data.length > 0) {
                        this.tabelaPrecos = data;
                        return data;
                    }
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoService] Fallback de tabela de preços via fetch:', e);
            }

            try {
                const cached = localStorage.getItem('os_cached_materiais_raw');
                if (cached) {
                    this.tabelaPrecos = JSON.parse(cached);
                    return this.tabelaPrecos;
                }
            } catch (e) {}

            return [];
        }

        /**
         * Calcula dias úteis entre duas datas (exclui sábados e domingos)
         */
        calcularDiasUteis(dataInicial, dataFinal) {
            if (!dataInicial || !dataFinal) return 0;
            const d1 = new Date(dataInicial);
            const d2 = new Date(dataFinal);
            if (d2 <= d1) return 0;

            let diasUteis = 0;
            let cur = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() + 1);
            const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());

            while (cur <= end) {
                const dayOfWeek = cur.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    diasUteis++;
                }
                cur.setDate(cur.getDate() + 1);
            }
            return diasUteis;
        }

        /**
         * Calcula dias corridos entre duas datas
         */
        calcularDiasCorridos(dataInicial, dataFinal) {
            if (!dataInicial || !dataFinal) return 0;
            const d1 = new Date(dataInicial);
            const d2 = new Date(dataFinal);
            const diffMs = d2.getTime() - d1.getTime();
            if (diffMs <= 0) return 0;
            return Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        /**
         * Obtém o valor base de execução de uma OS (Serviço de Manutenção ou soma de pontos/materiais)
         */
        obterValorBaseOS(os) {
            const prob = String(os.problemaEncontrado || os.problemaInicial || '').toLowerCase();
            const qtdPontos = os.qtdFinal || os.qtdInicial || (os.rawPontosFinal ? os.rawPontosFinal.length : 1);

            let valorPonto = 219.03; // Item 1.1 com BDI (Padrão: Serviço de manutenção em iluminação pública viária)

            if (prob.includes('rele') || prob.includes('relé')) {
                valorPonto = 54.76; // Item 1.2 com BDI: Troca de relé
            } else if (prob.includes('poda')) {
                valorPonto = 74.47; // Item 1.4 com BDI: Poda de árvore
            } else if (prob.includes('plaqueta')) {
                valorPonto = 35.00; // Instalação de plaqueta
            }

            let valorMateriais = 0;
            const mats = os.materiaisConsolidados || os.materialsList || [];
            if (Array.isArray(mats) && mats.length > 0) {
                mats.forEach(m => {
                    const preco = m.valorUnitarioBdi || m.valorUnit || 0;
                    const qtd = m.quantidade || m.qtd || 1;
                    valorMateriais += (Number(preco) * Number(qtd));
                });
            }

            const valorServico = valorPonto * Math.max(1, qtdPontos);
            const valorTotalBruto = valorServico + valorMateriais;

            return {
                valorPonto,
                qtdPontos: Math.max(1, qtdPontos),
                valorServico,
                valorMateriais,
                valorTotalBruto
            };
        }

        /**
         * Avalia as regras de desconto para uma Ordem de Serviço específica
         */
        avaliarInfracoesOS(os) {
            const infracoes = [];
            const dtAbertura = os.dataAbertura ? new Date(os.dataAbertura) : null;
            const dtConclusao = os.dataConclusao ? new Date(os.dataConclusao) : null;
            const prob = String(os.problemaEncontrado || os.problemaInicial || '').toLowerCase();
            const prot = os.protocolo || 'OS';
            const osOverrides = this.overrides[prot] || {};

            // 1. REGRA: Atraso na Conclusão (Item 7.1.4)
            const rAtraso = this.regras.find(r => r.id === 'atraso_execucao');
            if (rAtraso && rAtraso.ativo && dtAbertura && dtConclusao) {
                const isSimples = prob.includes('lampada') || prob.includes('lâmpada') || prob.includes('rele') || prob.includes('relé');
                let diasTolerancia = isSimples ? (Number(rAtraso.prazoDiasCorretivaSimples) || 3) : (Number(rAtraso.prazoDiasCorretivaGeral) || 2);
                let diasPassados = isSimples ? this.calcularDiasCorridos(dtAbertura, dtConclusao) : this.calcularDiasUteis(dtAbertura, dtConclusao);
                let diasAtraso = Math.max(0, diasPassados - diasTolerancia);

                if (diasAtraso > 0) {
                    const limite = Number(rAtraso.limiteDiasUteis) || 10;
                    const diasCalculados = Math.min(diasAtraso, limite);
                    let perc = Math.min(100.0, diasCalculados * (Number(rAtraso.percentualPorDia) || 10.0));

                    const isAnistiado = osOverrides['atraso_execucao']?.ignorarGlosa;
                    const msgLimite = diasAtraso > limite ? ` (limitado ao teto de ${limite}d úteis)` : '';
                    infracoes.push({
                        regraId: 'atraso_execucao',
                        nome: rAtraso.nome,
                        artigoTR: rAtraso.artigoTR,
                        diasAtraso: diasAtraso,
                        diasCalculados: diasCalculados,
                        diasTolerancia: diasTolerancia,
                        limiteDiasUteis: limite,
                        percentualGlosa: perc,
                        anistiado: Boolean(isAnistiado),
                        justificativa: osOverrides['atraso_execucao']?.justificativa || '',
                        detalhe: `${diasAtraso} dia(s) de atraso além da tolerância (${diasTolerancia}d)${msgLimite}. Glosa: ${perc}%.`
                    });
                }
            }

            // 2. REGRA: Plaqueta de Identificação (Item 7.6.3)
            const rPlaq = this.regras.find(r => r.id === 'sem_plaqueta');
            if (rPlaq && rPlaq.ativo) {
                const plaqFin = String(os.plaquetaFinal || os.plaqueta || '').trim();
                const plaqIni = String(os.plaquetaInicial || '').trim();
                const semPlaqueta = (!plaqFin || plaqFin === '[---]' || plaqFin === '---' || plaqFin === 'SEM PLAQUETA') &&
                                    (!plaqIni || plaqIni === '[---]' || plaqIni === '---' || plaqIni === 'SEM PLAQUETA');

                if (semPlaqueta || os.anexoFaltante || os.anexoPlaquetaDivergente) {
                    const isAnistiado = osOverrides['sem_plaqueta']?.ignorarGlosa;
                    infracoes.push({
                        regraId: 'sem_plaqueta',
                        nome: rPlaq.nome,
                        artigoTR: rPlaq.artigoTR,
                        percentualGlosa: Number(rPlaq.percentualGlosa) || 20.0,
                        anistiado: Boolean(isAnistiado),
                        justificativa: osOverrides['sem_plaqueta']?.justificativa || '',
                        detalhe: 'Ausência ou avaria na plaqueta amarela de identificação do poste.'
                    });
                }
            }

            // 3. REGRA: Glosas Administrativas Salvas no Supabase (coluna 'glosas' JSONB) ou Inseridas Manualmente
            if (Array.isArray(os.glosas) && os.glosas.length > 0) {
                os.glosas.forEach((g, gIdx) => {
                    // Verifica se já não foi capturada por uma regra automática idêntica
                    const existeInf = infracoes.find(inf => inf.regraId === g.regraId && inf.regraId !== 'personalizada');
                    
                    const isAnistiado = Boolean(g.anistiado) || Boolean(osOverrides[g.id]?.ignorarGlosa);
                    const justificativa = g.justificativa_anistia || osOverrides[g.id]?.justificativa || '';

                    if (existeInf) {
                        // Apenas atualiza com o motivo/dados manuais do admin e anistia se houver
                        if (g.anistiado !== undefined) existeInf.anistiado = Boolean(g.anistiado);
                        if (g.motivo) existeInf.detalhe = g.motivo;
                        if (justificativa) existeInf.justificativa = justificativa;
                    } else {
                        infracoes.push({
                            regraId: g.id || `glosa_admin_${gIdx}`,
                            nome: g.nome || g.regra || 'Glosa Administrativa',
                            artigoTR: g.artigoTR || 'Administrativo',
                            percentualGlosa: Number(g.percentual) || 0,
                            anistiado: isAnistiado,
                            justificativa: justificativa,
                            detalhe: g.motivo || 'Penalidade aplicada pela administração.',
                            isManualAdmin: true,
                            aplicado_por: g.aplicado_por || 'Administrador'
                        });
                    }
                });
            }

            return infracoes;
        }

        /**
         * Processa o cálculo completo da medição para o mês selecionado
         */
        processarMedicao(chamados = [], mesAnoStr = '') {
            const { startDate, endDate, periodLabelBR } = this.getMedicaoPeriodDates(mesAnoStr);

            let [ano, mes] = (mesAnoStr || '').split('-').map(Number);
            if (!ano || !mes) {
                const now = new Date();
                ano = now.getFullYear();
                mes = now.getMonth() + 1;
            }

            const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const periodoLabel = `${nomesMeses[mes - 1]} de ${ano}`;

            const ossConcluidas = chamados.filter(os => {
                const st = (os.normalizedStatus || os.status || '').toLowerCase();
                const isConc = st.includes('conclu') || st.includes('resolv') || st.includes('fechad');
                if (!isConc) return false;

                const dtRef = os.dataConclusao || os.dataAbertura;
                if (!dtRef) return false;
                const t = dtRef.getTime();
                return t >= startDate.getTime() && t <= endDate.getTime();
            });

            let totalBrutoGeral = 0;
            let totalGlosasGeral = 0;
            let totalLiquidoGeral = 0;
            let totalOSsGlosadas = 0;
            const itensMedidos = [];

            // Cálculo de Glosas de Reunião Semanal do Engenheiro (Item 8.7 do TR)
            const infoReunioes = this.calcularGlosasReuniaoSemanal(chamados, mesAnoStr);
            const protocolosGlosadosPorReuniao = infoReunioes.protocolosGlosadosPorReuniao || {};
            const temReincidenciaReuniao = Boolean(infoReunioes.temReincidencia);

            ossConcluidas.forEach(os => {
                const valores = this.obterValorBaseOS(os);
                const infracoes = this.avaliarInfracoesOS(os);
                const prot = os.protocolo || 'OS';

                // Aplica glosa de reunião semanal (Item 8.7.1) caso a OS tenha sido executada na semana anterior à falta
                if (protocolosGlosadosPorReuniao[prot]) {
                    const isAnistiado = this.overrides[prot]?.['reuniao_semanal_8_7']?.ignorarGlosa;
                    infracoes.push({
                        regraId: 'reuniao_semanal_8_7',
                        nome: 'Reunião Semanal do Engenheiro (Item 8.7)',
                        artigoTR: 'Item 8.7.1',
                        percentualGlosa: protocolosGlosadosPorReuniao[prot].percentualGlosa || 10.0,
                        anistiado: Boolean(isAnistiado),
                        justificativa: this.overrides[prot]?.['reuniao_semanal_8_7']?.justificativa || '',
                        detalhe: protocolosGlosadosPorReuniao[prot].detalhe
                    });
                }

                // Aplica multa de reincidência de reuniões (Item 8.7.2): 15% sobre as OSs do mês de competência
                if (temReincidenciaReuniao) {
                    const isAnistiadoReinc = this.overrides[prot]?.['reuniao_reincidencia_8_7_2']?.ignorarGlosa;
                    infracoes.push({
                        regraId: 'reuniao_reincidencia_8_7_2',
                        nome: 'Reincidência de Reuniões Semanais (Item 8.7.2)',
                        artigoTR: 'Item 8.7.2',
                        percentualGlosa: 15.0,
                        anistiado: Boolean(isAnistiadoReinc),
                        justificativa: this.overrides[prot]?.['reuniao_reincidencia_8_7_2']?.justificativa || '',
                        detalhe: 'Multa de 15% por reincidência de faltas em reuniões semanais (2 semanas consecutivas ou 3 no mês - TR rev03, Item 8.7.2).'
                    });
                }

                let percGlosaTotal = 0;
                infracoes.forEach(inf => {
                    if (!inf.anistiado) {
                        percGlosaTotal += inf.percentualGlosa;
                    }
                });

                if (percGlosaTotal > 100) percGlosaTotal = 100;

                const valorGlosa = valores.valorTotalBruto * (percGlosaTotal / 100);
                const valorLiquido = Math.max(0, valores.valorTotalBruto - valorGlosa);

                if (percGlosaTotal > 0) {
                    totalOSsGlosadas++;
                }

                totalBrutoGeral += valores.valorTotalBruto;
                totalGlosasGeral += valorGlosa;
                totalLiquidoGeral += valorLiquido;

                itensMedidos.push({
                    protocolo: os.protocolo,
                    chamado: os,
                    endereco: os.endereco || 'Araraquara/SP',
                    operador: os.operadorFinalizacao || os.operador || 'Equipe de Campo',
                    tipo: os.isPraca ? 'Praça Pública' : 'Iluminação Viária',
                    problema: os.problemaEncontrado || os.problemaInicial || 'Manutenção geral',
                    dataAbertura: os.dataAbertura,
                    dataConclusao: os.dataConclusao,
                    valores: valores,
                    infracoes: infracoes,
                    percentualGlosa: percGlosaTotal,
                    valorGlosa: valorGlosa,
                    valorLiquido: valorLiquido,
                    statusMedicao: percGlosaTotal === 0 ? 'Aprovado Integral' : (percGlosaTotal >= 100 ? 'Glosado 100%' : 'Glosado Parcial')
                });
            });

            // Valor total correspondente aos 15% do Item 8.7.2 para fins informativos e relatórios
            let valorMultaReincidenciaMensal = temReincidenciaReuniao ? (totalBrutoGeral * 0.15) : 0;

            itensMedidos.sort((a, b) => {
                const tA = a.dataConclusao ? a.dataConclusao.getTime() : 0;
                const tB = b.dataConclusao ? b.dataConclusao.getTime() : 0;
                return tB - tA;
            });

            const taxaConformidade = ossConcluidas.length > 0 
                ? Math.round(((ossConcluidas.length - totalOSsGlosadas) / ossConcluidas.length) * 100) 
                : 100;

            return {
                periodoLabel,
                periodLabelBR,
                startDate,
                endDate,
                mesAnoStr,
                totalOSs: ossConcluidas.length,
                totalOSsGlosadas,
                taxaConformidade,
                totalBrutoGeral,
                totalGlosasGeral,
                totalLiquidoGeral,
                itens: itensMedidos,
                regrasAtivas: this.regras.filter(r => r.ativo),
                infoReunioes,
                valorMultaReincidenciaMensal
            };
        }
    }

    window.MedicaoService = MedicaoService;
})();
