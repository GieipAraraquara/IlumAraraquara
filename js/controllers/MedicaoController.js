/**
 * MedicaoController.js
 * Controlador da Tela Exclusiva de Medição e Descontos Contratuais
 * Sistema OS - Prefeitura Municipal de Araraquara
 */

(function() {
    if (window.MedicaoController && window.medicaoController) return;

    class MedicaoController {
        constructor() {
            this.medicaoService = new window.MedicaoService();
            this.chamadosService = null;
            this.chamadosList = [];
            this.dadosMedicaoAtual = null;
            this.filtroMesAno = '';
            this.filtroOperador = 'ALL';
            this.filtroStatusGlosa = 'ALL';
            this.filtroBusca = '';
            this.filtroProtocoloTexto = '';
            this.filtroProtocoloPrefixo = '';
            this.filtroLocalTexto = '';
            this.osSelecionadaParaModal = null;
            
            this.activeTab = 'materiais'; // 'materiais' ou 'glosas'
            this.medicaoFilters = {
                selectedMonth: this.filtroMesAno,
                status: 'concluida'
            };
            this.selectedMedicaoItem = null;
            this.materiaisContratoCache = [];
            this.medicaoSubView = 'material'; // 'material' ou 'protocolo'
            this.medicaoProtocoloSearch = '';
            this.medicaoProtocoloTipo = 'all'; // 'all', 'viaria', 'praca'
            this.medicaoMaterialFilter = '';
            this.medicaoColProtocolSearch = '';
            this.medicaoProtocolPrefix = '';
            this.medicaoStatusFilterList = [];
            this.medicaoConsolidadoDescFilter = '';
            this.medicaoConsolidadoProtSearch = '';
            this.medicaoConsolidadoProtPrefix = '';
            this.medicaoConsolidadoFilteredItems = null;
            this.aplicarGlosasEmMateriais = false; // Toggle: false = Bruto, true = com Glosas do TR
        }

        async init() {
            console.log('📑 [MedicaoController] Inicializando tela de medição...');

            // Verificar segurança: Admin e Manutentor
            if (window.AuthGuard) {
                try {
                    const authData = await window.AuthGuard.requireAuth();
                    if (authData) {
                        const role = window.AuthGuard.getUserRole(authData.user, authData.profile);
                        this.userRole = role;
                        if (role !== 'admin' && role !== 'manutentor') {
                            console.warn(`⛔ [MedicaoController] Acesso não autorizado para o papel '${role}'. Redirecionando...`);
                            const dest = window.AuthGuard.getRedirectUrlForUser(authData);
                            window.location.replace(dest);
                            return;
                        }

                        // Configurar visibilidade de botões exclusivos para admin
                        if (role === 'admin') {
                            const btnReunioes = document.getElementById('btn-reunioes-semanais-tr');
                            if (btnReunioes) {
                                btnReunioes.classList.remove('hidden');
                                btnReunioes.classList.add('flex');
                            }
                            const btnParametros = document.getElementById('btn-config-regras-tr');
                            if (btnParametros) {
                                btnParametros.classList.remove('hidden');
                                btnParametros.classList.add('flex');
                            }
                        }
                    }
                } catch(e) {
                    console.error('❌ [MedicaoController] Erro na verificação do AuthGuard:', e);
                }
            }

            if (window.ChamadosService) {
                this.chamadosService = new window.ChamadosService();
            }

            // Garante inicialização do PainelController auxiliar para abertura e manipulação do modal de detalhes da OS
            if (!window.painelController && window.PainelController) {
                window.painelController = new window.PainelController();
            }
            if (window.painelController) {
                window.painelController.medicaoService = this.medicaoService;
            }

            this.popularSeletorMeses();
            this.setupEventListeners();
            this.setupGlobalAuditTooltip();
            await this.carregarDados();
        }

        /**
         * Inicializa o popover flutuante no padrão de Auditoria.html para cards e células com tooltip
         */
        setupGlobalAuditTooltip() {
            const getOrCreatePopover = () => {
                let popover = document.getElementById('audit-global-popover');
                if (!popover) {
                    popover = document.createElement('div');
                    popover.id = 'audit-global-popover';
                    popover.style.cssText = 'position: fixed; display: none; padding: 10px 14px; background-color: #0f172a; color: #ffffff; font-size: 11px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5); border: 1px solid #334155; max-width: 380px; z-index: 99999999; pointer-events: none; opacity: 0; transition: opacity 0.15s ease; text-align: left;';
                    popover.innerHTML = `
                        <div style="font-weight: 700; color: #fbbf24; margin-bottom: 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;">Materiais / Composição:</div>
                        <div id="audit-global-popover-text" style="line-height: 1.4; font-size: 11px; font-weight: 400; color: #e2e8f0;"></div>
                    `;
                    document.body.appendChild(popover);
                }
                return popover;
            };

            getOrCreatePopover();

            if (window._globalAuditTooltipBound) return;
            window._globalAuditTooltipBound = true;

            let activeTarget = null;

            const showTooltip = (target) => {
                const explicacao = target.getAttribute('data-audit-explicacao');
                if (!explicacao) return;

                const customTitle = target.getAttribute('data-audit-title') || 'Informações:';

                const popover = getOrCreatePopover();
                const popoverTitle = popover.querySelector('div:first-child');
                const popoverText = popover.querySelector('#audit-global-popover-text');
                if (!popoverText) return;

                if (popoverTitle) {
                    popoverTitle.textContent = customTitle;
                }

                activeTarget = target;
                popoverText.innerHTML = explicacao;
                const isWide = explicacao.includes('Materiais / Itens Aplicados');
                popover.style.maxWidth = isWide ? '520px' : '380px';
                popover.style.display = 'block';

                const rect = target.getBoundingClientRect();
                const popoverRect = popover.getBoundingClientRect();

                let top = rect.top - popoverRect.height - 10;
                if (top < 10) {
                    top = rect.bottom + 10;
                }

                let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);
                left = Math.max(12, Math.min(window.innerWidth - popoverRect.width - 12, left));

                popover.style.top = `${top}px`;
                popover.style.left = `${left}px`;
                popover.style.opacity = '1';
            };

            const hideTooltip = () => {
                activeTarget = null;
                const popover = document.getElementById('audit-global-popover');
                if (popover) {
                    popover.style.opacity = '0';
                    setTimeout(() => {
                        if (!activeTarget && popover) {
                            popover.style.display = 'none';
                        }
                    }, 150);
                }
            };

            document.addEventListener('mouseover', (e) => {
                const card = e.target.closest('[data-audit-explicacao]');
                if (card) {
                    showTooltip(card);
                } else if (activeTarget) {
                    hideTooltip();
                }
            });

            document.addEventListener('mouseout', (e) => {
                const card = e.target.closest('[data-audit-explicacao]');
                if (card && e.relatedTarget && !card.contains(e.relatedTarget)) {
                    hideTooltip();
                }
            });
        }

        popularSeletorMeses() {
            const selectGlosas = document.getElementById('selectMesMedicao');
            const selectMateriais = document.getElementById('medicao-month-select');

            const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const now = new Date();
            const curY = now.getFullYear();
            const curM = now.getMonth() + 1;
            const baseDate = new Date(curY, curM - 1, 1);

            if (!this.filtroMesAno) {
                this.filtroMesAno = `${curY}-${String(curM).padStart(2, '0')}`;
                this.medicaoFilters.selectedMonth = this.filtroMesAno;
            }

            const optionsHtml = [];
            for (let i = 2; i >= -24; i--) {
                const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const valStr = `${y}-${String(m).padStart(2, '0')}`;
                const isSelected = valStr === this.filtroMesAno ? 'selected' : '';
                optionsHtml.push(`<option value="${valStr}" ${isSelected}>${nomesMeses[m - 1]} / ${y}</option>`);
            }

            const html = optionsHtml.join('');
            if (selectGlosas) {
                selectGlosas.innerHTML = html;
                selectGlosas.value = this.filtroMesAno;
            }
            if (selectMateriais) {
                selectMateriais.innerHTML = html;
                selectMateriais.value = this.filtroMesAno;
            }
        }

        async alterarMes(delta) {
            const [y, m] = this.filtroMesAno.split('-').map(Number);
            const d = new Date(y, m - 1 + delta, 1);
            this.filtroMesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            this.medicaoFilters.selectedMonth = this.filtroMesAno;

            const selectGlosas = document.getElementById('selectMesMedicao');
            if (selectGlosas) selectGlosas.value = this.filtroMesAno;

            const selectMateriais = document.getElementById('medicao-month-select');
            if (selectMateriais) selectMateriais.value = this.filtroMesAno;

            // Carrega parâmetros e regras do período corrente no Supabase (respeitando cache de sessão)
            if (this.medicaoService && typeof this.medicaoService.carregarConfiguracoesPeriodo === 'function') {
                await this.medicaoService.carregarConfiguracoesPeriodo(this.filtroMesAno);
            }

            this.processarECalcular();
            this.renderMedicaoMensal();
            this.atualizarBadgeReunioesSemanais();
        }

        async alterarMesMedicao(delta) {
            await this.alterarMes(delta);
        }

        async carregarDados() {
            this.exibirLoading(true);
            try {
                // Carrega configurações do período antes do cálculo
                if (this.medicaoService && typeof this.medicaoService.carregarConfiguracoesPeriodo === 'function') {
                    await this.medicaoService.carregarConfiguracoesPeriodo(this.filtroMesAno);
                }

                await this.carregarMateriaisContrato();

                if (this.chamadosService) {
                    this.chamadosList = await this.chamadosService.getChamadosList();
                } else if (window.chamadosListCache) {
                    this.chamadosList = window.chamadosListCache;
                }

                // Sincroniza cache global e com o painelController para renderizar todos os detalhes no modal
                window.chamadosListCache = this.chamadosList;
                if (window.painelController) {
                    window.painelController.chamadosList = this.chamadosList;
                    window.painelController.medicaoService = this.medicaoService;
                }

                this.popularSeletorOperadores();
                this.renderMedicaoMensal();
                this.processarECalcular();
                this.atualizarBadgeReunioesSemanais();
            } catch (e) {
                console.error('❌ [MedicaoController] Erro ao carregar chamados:', e);
            } finally {
                this.exibirLoading(false);
            }
        }

        switchTab(tabName) {
            this.activeTab = tabName;
            const tabMateriais = document.getElementById('view-tab-materiais');
            const tabGlosas = document.getElementById('view-tab-glosas');
            const btnTabMateriais = document.getElementById('btn-tab-materiais');
            const btnTabProtocolos = document.getElementById('btn-tab-protocolos');
            const btnTabGlosas = document.getElementById('btn-tab-glosas');

            const containerMaterial = document.getElementById('container-medicao-por-material');
            const containerProtocolo = document.getElementById('container-medicao-por-protocolo');

            // Resetar estilos de botões das abas
            const setInactive = (btn) => {
                if (btn) btn.className = "py-2.5 px-4 border-b-2 border-transparent font-medium text-on-surface-variant hover:text-on-surface text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap";
            };
            const setActive = (btn) => {
                if (btn) btn.className = "py-2.5 px-4 border-b-2 border-secondary font-bold text-secondary text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap";
            };

            setInactive(btnTabMateriais);
            setInactive(btnTabProtocolos);
            setInactive(btnTabGlosas);

            if (tabName === 'materiais') {
                setActive(btnTabMateriais);
                if (tabMateriais) tabMateriais.classList.remove('hidden');
                if (tabGlosas) tabGlosas.classList.add('hidden');
                if (containerMaterial) containerMaterial.classList.remove('hidden');
                if (containerProtocolo) containerProtocolo.classList.add('hidden');
                this.medicaoSubView = 'material';
                this.renderMedicaoMensal();
            } else if (tabName === 'protocolos') {
                setActive(btnTabProtocolos);
                if (tabMateriais) tabMateriais.classList.remove('hidden');
                if (tabGlosas) tabGlosas.classList.add('hidden');
                if (containerMaterial) containerMaterial.classList.add('hidden');
                if (containerProtocolo) containerProtocolo.classList.remove('hidden');
                this.medicaoSubView = 'protocolo';
                this.renderMedicaoPorProtocolo();
            } else if (tabName === 'glosas') {
                setActive(btnTabGlosas);
                if (tabMateriais) tabMateriais.classList.add('hidden');
                if (tabGlosas) tabGlosas.classList.remove('hidden');
                this.processarECalcular();
            }
        }

        popularSeletorOperadores() {
            const container = document.getElementById('medicao-operador-list-container');
            if (!container) return;

            const operadores = new Set();
            (this.chamadosList || []).forEach(os => {
                const op = os.operadorFinalizacao || os.operador || '';
                if (op && op !== 'N/A' && op.trim() !== '') operadores.add(op.trim());
            });

            const sorted = Array.from(operadores).sort();
            
            let html = `
                <label class="flex items-center gap-2 px-2 py-1 hover:bg-surface-container-low rounded cursor-pointer transition-colors font-medium">
                    <input type="radio" name="filtro-operador-opt" value="ALL" ${this.filtroOperador === 'ALL' ? 'checked' : ''} onchange="window.medicaoController.setOperadorFilter('ALL')" class="text-secondary focus:ring-secondary cursor-pointer">
                    <span>Todos os Operadores</span>
                </label>
                <div class="border-t border-outline-variant/30 my-1"></div>
            `;

            sorted.forEach(op => {
                const isChecked = this.filtroOperador === op;
                html += `
                    <label class="flex items-center gap-2 px-2 py-1 hover:bg-surface-container-low rounded cursor-pointer transition-colors truncate">
                        <input type="radio" name="filtro-operador-opt" value="${op}" ${isChecked ? 'checked' : ''} onchange="window.medicaoController.setOperadorFilter('${op}')" class="text-secondary focus:ring-secondary cursor-pointer">
                        <span class="truncate" title="${op}">${op}</span>
                    </label>
                `;
            });

            container.innerHTML = html;
        }

        processarECalcular() {
            if (!this.medicaoService) return;

            const resultado = this.medicaoService.processarMedicao(this.chamadosList, this.filtroMesAno);

            // Reajusta a medição para que o Valor Bruto considere apenas os materiais e insumos físicos aplicados + horas de eletricista em praças públicas
            let novoTotalBruto = 0;
            let novoTotalGlosas = 0;
            let novoTotalLiquido = 0;
            let novoTotalOSsGlosadas = 0;

            if (resultado && Array.isArray(resultado.itens)) {
                resultado.itens.forEach(item => {
                    const osRef = item.chamado || {};
                    const { matsDaOS } = this.extrairMateriaisDaOS(osRef);
                    const somaMateriaisComBdi = matsDaOS.reduce((acc, m) => acc + (Number(m.subtotalComBdi) || 0), 0);

                    const percGlosa = Number(item.percentualGlosa) || 0;
                    const valorGlosa = somaMateriaisComBdi * (percGlosa / 100);
                    const valorLiquido = Math.max(0, somaMateriaisComBdi - valorGlosa);

                    if (percGlosa > 0 && somaMateriaisComBdi > 0) {
                        novoTotalOSsGlosadas++;
                    }

                    item.matsDaOS = matsDaOS;
                    item.valores = {
                        ...(item.valores || {}),
                        valorMateriais: somaMateriaisComBdi,
                        valorTotalBruto: somaMateriaisComBdi,
                        qtdItensMateriais: matsDaOS.length
                    };
                    item.valorGlosa = valorGlosa;
                    item.valorLiquido = valorLiquido;

                    novoTotalBruto += somaMateriaisComBdi;
                    novoTotalGlosas += valorGlosa;
                    novoTotalLiquido += valorLiquido;
                });

                resultado.totalBrutoGeral = novoTotalBruto;
                resultado.totalGlosasGeral = novoTotalGlosas;
                resultado.totalLiquidoGeral = novoTotalLiquido;

                // Reincidência na falta de reuniões semanais (Item 8.7.2): Multa de 15% sobre o valor total da medição mensal
                if (resultado.infoReunioes && resultado.infoReunioes.temReincidencia) {
                    const multaReincidencia = novoTotalBruto * 0.15;
                    resultado.valorMultaReincidenciaMensal = multaReincidencia;
                    resultado.totalGlosasGeral += multaReincidencia;
                    resultado.totalLiquidoGeral = Math.max(0, resultado.totalLiquidoGeral - multaReincidencia);
                }

                resultado.totalOSsGlosadas = novoTotalOSsGlosadas;
                resultado.taxaConformidade = resultado.totalOSs > 0
                    ? Number((((resultado.totalOSs - novoTotalOSsGlosadas) / resultado.totalOSs) * 100).toFixed(1))
                    : 100;
            }

            this.dadosMedicaoAtual = resultado;

            this.atualizarKPIs(resultado);
            this.renderizarTabela();
        }

        atualizarKPIs(resultado) {
            const formatCurrency = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const elTotalOS = document.getElementById('kpiTotalOSMedidas');
            const elBruto = document.getElementById('kpiValorBruto');
            const elGlosas = document.getElementById('kpiTotalGlosas');
            const elLiquido = document.getElementById('kpiValorLiquido');
            const elConformidade = document.getElementById('kpiTaxaConformidade');
            const elPeriodoBadge = document.getElementById('badgePeriodoCompetencia');

            if (elTotalOS) elTotalOS.textContent = resultado.totalOSs.toLocaleString('pt-BR');
            if (elBruto) elBruto.textContent = formatCurrency(resultado.totalBrutoGeral);
            if (elGlosas) elGlosas.textContent = formatCurrency(resultado.totalGlosasGeral);
            if (elLiquido) elLiquido.textContent = formatCurrency(resultado.totalLiquidoGeral);
            if (elConformidade) elConformidade.textContent = `${resultado.taxaConformidade}%`;
            if (elPeriodoBadge) {
                elPeriodoBadge.textContent = resultado.periodLabelBR ? `${resultado.periodoLabel} (${resultado.periodLabelBR})` : resultado.periodoLabel;
            }

            const elMedicaoPeriodoBadge = document.getElementById('medicao-periodo-badge');
            if (elMedicaoPeriodoBadge) {
                elMedicaoPeriodoBadge.textContent = resultado.periodLabelBR ? `Período: ${resultado.periodLabelBR}` : 'Período: --/--/---- a --/--/----';
            }

            this.atualizarBadgeReunioesSemanais();
        }

        renderizarTabela() {
            const tbody = document.getElementById('tbodyMedicaoOS');
            const emptyState = document.getElementById('emptyStateMedicao');
            if (!tbody) return;

            if (!this.dadosMedicaoAtual || this.dadosMedicaoAtual.itens.length === 0) {
                tbody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }

            const protTerm = (this.filtroProtocoloTexto || '').toLowerCase().trim();
            const prefixo = (this.filtroProtocoloPrefixo || '').toUpperCase().trim();
            const opSel = this.filtroOperador;
            const localTerm = (this.filtroLocalTexto || '').toLowerCase().trim();
            const stSel = this.filtroStatusGlosa;
            const globalTerm = (this.filtroBusca || '').toLowerCase().trim();

            const itensFiltrados = this.dadosMedicaoAtual.itens.filter(item => {
                // 1. Filtro por Operador
                if (opSel !== 'ALL' && item.operador !== opSel) return false;

                // 2. Filtro por Status da Glosa
                if (stSel === 'sem_glosa' && item.percentualGlosa > 0) return false;
                if (stSel === 'com_glosa' && item.percentualGlosa === 0) return false;
                if (stSel === 'glosa_total' && item.percentualGlosa < 100) return false;

                // 3. Filtro por Prefixo de Protocolo (P = Praça, I = Viária)
                if (prefixo) {
                    const pStr = String(item.protocolo || '').toUpperCase();
                    if (!pStr.startsWith(prefixo)) return false;
                }

                // 4. Filtro por Busca de Protocolo
                if (protTerm) {
                    const pStr = String(item.protocolo || '').toLowerCase();
                    const tStr = String(item.tipo || '').toLowerCase();
                    if (!pStr.includes(protTerm) && !tStr.includes(protTerm)) return false;
                }

                // 5. Filtro por Local / Defeito
                if (localTerm) {
                    const matchEnd = String(item.endereco || '').toLowerCase().includes(localTerm);
                    const matchProb = String(item.problema || '').toLowerCase().includes(localTerm);
                    if (!matchEnd && !matchProb) return false;
                }

                // 6. Busca Global do Cabeçalho Superior
                if (globalTerm) {
                    const matchProt = String(item.protocolo || '').toLowerCase().includes(globalTerm);
                    const matchEnd = String(item.endereco || '').toLowerCase().includes(globalTerm);
                    const matchOp = String(item.operador || '').toLowerCase().includes(globalTerm);
                    const matchProb = String(item.problema || '').toLowerCase().includes(globalTerm);
                    if (!matchProt && !matchEnd && !matchOp && !matchProb) return false;
                }

                return true;
            });

            if (emptyState) {
                emptyState.classList.toggle('hidden', itensFiltrados.length > 0);
            }

            this.atualizarIndicadoresFiltros();

            const formatCurrency = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const formatShortDate = (dt) => {
                if (!dt) return '--/--';
                const d = (dt instanceof Date) ? dt : new Date(dt);
                if (isNaN(d.getTime())) return '--/--';
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${day}/${month}`;
            };

            tbody.innerHTML = itensFiltrados.map((item, idx) => {
                const temGlosa = item.percentualGlosa > 0;
                const statusBadge = temGlosa
                    ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-error-container text-on-error-container flex items-center gap-1 w-fit">
                         <span class="material-symbols-outlined text-[13px]">warning</span> -${item.percentualGlosa}%
                       </span>`
                    : `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-800 flex items-center gap-1 w-fit">
                         <span class="material-symbols-outlined text-[13px]">check_circle</span> Conforme
                       </span>`;

                const badgesInfracoes = item.infracoes.map(inf => {
                    const cor = inf.anistiado ? 'bg-surface-container-high text-on-surface-variant line-through' : 'bg-rose-100 text-rose-800';
                    const icon = inf.anistiado ? 'verified' : 'cancel';
                    return `<span class="text-[10px] px-1.5 py-0.5 rounded ${cor} font-semibold flex items-center gap-0.5 truncate max-w-[200px]" title="${inf.detalhe} ${inf.anistiado ? '(Anistiado pelo Fiscal)' : ''}">
                              <span class="material-symbols-outlined text-[11px]">${icon}</span> ${inf.artigoTR}: -${inf.percentualGlosa}%
                            </span>`;
                }).join('');

                const osRef = item.chamado || {};
                let addressPoints = [];
                if (osRef.addressPointsIniciais && Array.isArray(osRef.addressPointsIniciais) && osRef.addressPointsIniciais.length > 0) {
                    addressPoints = osRef.addressPointsIniciais;
                } else if (osRef.pontosDetalhados && Array.isArray(osRef.pontosDetalhados) && osRef.pontosDetalhados.length > 0) {
                    addressPoints = osRef.pontosDetalhados.map(p => p.enderecoInicial || p.enderecoFinal || osRef.endereco).filter(Boolean);
                }
                if (addressPoints.length === 0) {
                    addressPoints = [item.endereco || osRef.pracaNome || 'Endereço não informado'];
                }

                let enderecoHtml = '';
                if (addressPoints.length > 1) {
                    const firstPoint = addressPoints[0];
                    const extraPoints = addressPoints.slice(1);
                    enderecoHtml = `
                        <div class="flex flex-col gap-1 w-full">
                            <div class="flex items-start gap-1.5 w-full">
                                <button type="button" onclick="window.abrirMapaPonto('${item.protocolo}', 0, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors flex-1 min-w-0" title="Clique para abrir Ponto #1 no mapa Mapbox: ${firstPoint}">
                                    <span class="material-symbols-outlined text-[17px] text-secondary group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                                    <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${firstPoint}</span>
                                </button>
                                <button type="button" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all cursor-pointer active:scale-95 shrink-0 border border-secondary/20" onclick="window.toggleInlinePoints(this, ${extraPoints.length}, event)" title="Expandir/Recolher pontos da OS">
                                    <span class="btn-text">+${extraPoints.length}</span>
                                    <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                                </button>
                            </div>
                            <div class="extra-points hidden flex-col gap-1.5 font-medium text-on-surface mt-1.5 w-full pl-2 border-l-2 border-secondary/30">
                                ${extraPoints.map((p, pIdx) => `
                                    <button type="button" onclick="window.abrirMapaPonto('${item.protocolo}', ${pIdx + 1}, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir Ponto #${pIdx + 2} no mapa Mapbox: ${p}">
                                        <span class="material-symbols-outlined text-[15px] text-secondary/80 group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                                        <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${p}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    const pText = addressPoints[0] || item.endereco || 'Endereço não informado';
                    enderecoHtml = `
                        <button type="button" onclick="window.abrirMapaPonto('${item.protocolo}', 0, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox: ${pText}">
                            <span class="material-symbols-outlined text-[17px] text-secondary group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                            <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${pText}</span>
                        </button>
                    `;
                }

                if (item.problema) {
                    enderecoHtml += `<div class="text-[10px] text-slate-500 break-words leading-tight pl-6 mt-1" title="${item.problema}">${item.problema}</div>`;
                }

                // Extrai materiais da OS com marca e unidade de medida
                const { matsDaOS } = this.extrairMateriaisDaOS(osRef);
                let matsTooltipHtml = '';
                if (matsDaOS.length > 0) {
                    const totalSomaMatsOS = matsDaOS.reduce((acc, m) => acc + (m.subtotalComBdi || 0), 0);
                    matsTooltipHtml = `
                        <div class="flex flex-col gap-1.5 w-full text-left">
                            <div class="text-[10px] uppercase font-bold text-amber-400 border-b border-slate-700/80 pb-1 mb-1 flex items-center justify-between">
                                <span>Materiais / Itens Aplicados (${matsDaOS.length})</span>
                                <span class="font-mono text-emerald-300 font-bold">OS #${item.protocolo}</span>
                            </div>
                            <div class="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                                ${matsDaOS.map(m => {
                                    const isHoras = m.isMaoDeObra;
                                    const qtdFmt = isHoras ? m.quantidade.toFixed(2) : m.quantidade;
                                    const unitFmt = formatCurrency(m.valorUnitarioBdi || 0);
                                    const totalFmt = formatCurrency(m.subtotalComBdi);
                                    const temMultiplasUnidades = m.quantidade > 1 || isHoras;

                                    if (isHoras) {
                                        return `
                                            <div class="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded text-[11px] bg-amber-950/40 text-amber-200 border border-amber-500/30">
                                                <div class="flex items-start gap-1.5 flex-1 min-w-0">
                                                    <span class="material-symbols-outlined text-[14px] text-amber-400 shrink-0 mt-0.5">engineering</span>
                                                    <span class="font-medium text-[11.5px] leading-snug break-words">${m.descricao}</span>
                                                </div>
                                                <div class="flex flex-col items-end shrink-0 ml-2">
                                                    <span class="text-[10px] text-amber-300/80 font-mono">${qtdFmt} ${m.unidade} &times; ${unitFmt}</span>
                                                    <span class="text-emerald-400 font-bold font-mono text-[11px]">${totalFmt}</span>
                                                </div>
                                            </div>
                                        `;
                                    } else {
                                        return `
                                            <div class="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded text-[11px] bg-slate-800/80 text-slate-200 border border-slate-700/80">
                                                <div class="flex items-start gap-1.5 flex-1 min-w-0">
                                                    <span class="material-symbols-outlined text-[14px] text-sky-400 shrink-0 mt-0.5">inventory_2</span>
                                                    <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                                                        <span class="font-medium text-[11.5px] leading-snug break-words">${m.descricao}</span>
                                                        ${m.marca && m.marca !== 'PRÓPRIO' ? `<span class="text-[9.5px] font-mono px-1.5 py-0.2 bg-purple-900/60 text-purple-200 border border-purple-500/40 rounded shrink-0">${m.marca}</span>` : ''}
                                                    </div>
                                                </div>
                                                <div class="flex flex-col items-end shrink-0 ml-2">
                                                    ${temMultiplasUnidades ? `
                                                        <span class="text-[10px] text-sky-300/80 font-mono">${qtdFmt} ${m.unidade} &times; ${unitFmt}</span>
                                                        <span class="text-emerald-400 font-bold font-mono text-[11px]">${totalFmt}</span>
                                                    ` : `
                                                        <span class="text-[10px] text-slate-400 font-mono">1 ${m.unidade}</span>
                                                        <span class="text-emerald-400 font-bold font-mono text-[11px]">${totalFmt}</span>
                                                    `}
                                                </div>
                                            </div>
                                        `;
                                    }
                                }).join('')}
                            </div>
                            <div class="mt-2 pt-1.5 border-t border-slate-700/80 flex items-center justify-between text-[11px] bg-slate-900/60 px-2 py-1 rounded">
                                <span class="text-slate-300 font-semibold">Total da OS (Materiais + Mão de Obra):</span>
                                <span class="font-mono font-bold text-emerald-300 text-xs">${formatCurrency(totalSomaMatsOS)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    matsTooltipHtml = `
                        <div class="flex items-center gap-1.5 text-[11px] text-slate-300 py-1">
                            <span class="material-symbols-outlined text-[15px] text-slate-400">info</span>
                            <span>Nenhum material cadastrado para esta OS.</span>
                        </div>
                    `;
                }
                const safeMatsSummary = matsTooltipHtml.replace(/"/g, '&quot;');

                return `
                    <tr class="border-b border-outline-variant/40 hover:bg-surface-container-low/60 transition-colors text-xs cursor-pointer group" onclick="if (!event.target.closest('button, a, input, [data-audit-explicacao]')) window.abrirDetalhesOSModal('${item.protocolo}')">
                        <td class="py-3 px-3">
                            <div class="flex items-center gap-1.5 font-bold text-on-surface">
                                <span class="inline-flex items-center gap-1 text-on-surface group-hover:text-secondary transition-colors" title="OS #${item.protocolo}">
                                    <span class="group-hover:underline">#${item.protocolo}</span>
                                    <span class="material-symbols-outlined text-[15px] text-secondary">open_in_new</span>
                                </span>
                            </div>
                            <span class="text-[10px] text-on-surface-variant block">${item.tipo}</span>
                        </td>
                        <td class="py-3 px-3 whitespace-nowrap">
                            <span class="font-medium text-on-surface block">${formatShortDate(item.dataConclusao)}</span>
                            <span class="text-[10px] text-on-surface-variant">Abertura: ${formatShortDate(item.dataAbertura)}</span>
                        </td>
                        <td class="py-3 px-3 font-medium text-on-surface truncate max-w-[140px]" title="${item.operador}">
                            ${item.operador}
                        </td>
                        <td class="py-3 px-3 min-w-[200px] max-w-[320px]">
                            ${enderecoHtml}
                        </td>
                        <td class="py-3 px-3">
                            <div class="space-y-1">
                                ${statusBadge}
                                <div class="flex flex-wrap gap-1 mt-1">${badgesInfracoes}</div>
                            </div>
                        </td>
                        <td class="py-3 px-3 text-right font-medium text-on-surface">
                            <div class="cursor-help inline-block group/valor px-1 py-0.5 rounded hover:bg-surface-container transition-colors" data-audit-explicacao="${safeMatsSummary}" data-audit-title="Composição / Materiais da OS #${item.protocolo}">
                                <span class="font-bold border-b border-dotted border-outline-variant group-hover/valor:border-secondary">${formatCurrency(item.valores.valorTotalBruto)}</span>
                                <span class="text-[10px] text-on-surface-variant block">${matsDaOS.length} item(ns) físico(s)</span>
                            </div>
                        </td>
                        <td class="py-3 px-3 text-right font-bold text-error">
                            ${item.valorGlosa > 0 ? `-${formatCurrency(item.valorGlosa)}` : 'R$ 0,00'}
                        </td>
                        <td class="py-3 px-3 text-right font-extrabold text-emerald-700 text-sm">
                            ${formatCurrency(item.valorLiquido)}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        abrirModalAuditarGlosa(protocolo) {
            const item = this.dadosMedicaoAtual.itens.find(i => i.protocolo === protocolo);
            if (!item) return;

            this.osSelecionadaParaModal = item;
            const modal = document.getElementById('modalAuditarGlosa');
            const tit = document.getElementById('modalGlosaProtocolo');
            const bodyInf = document.getElementById('modalGlosaInfracoesContainer');
            
            if (tit) tit.textContent = `#${item.protocolo} - ${item.endereco}`;

            if (bodyInf) {
                if (item.infracoes.length === 0) {
                    bodyInf.innerHTML = `
                        <div class="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-center text-emerald-800 text-xs">
                            <span class="material-symbols-outlined text-3xl mb-1">check_circle</span>
                            <p class="font-bold">Nenhuma infração contratual detectada nesta OS.</p>
                            <p class="text-[11px]">Todos os requisitos de prazo, plaqueta, evidência e app foram atendidos.</p>
                        </div>
                    `;
                } else {
                    bodyInf.innerHTML = item.infracoes.map(inf => {
                        return `
                            <div class="p-3 bg-surface-container-lowest border border-outline-variant/70 rounded-xl space-y-2">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <div class="flex items-center gap-1.5">
                                            <span class="font-bold text-xs text-on-surface">${inf.nome}</span>
                                            <span class="text-[10px] px-1.5 py-0.2 bg-error-container text-on-error-container font-extrabold rounded">-${inf.percentualGlosa}%</span>
                                        </div>
                                        <p class="text-[11px] text-on-surface-variant mt-0.5">${inf.detalhe}</p>
                                    </div>
                                    <label class="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                                        <input type="checkbox" id="checkAnistia_${inf.regraId}" ${inf.anistiado ? 'checked' : ''} class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                                        <span class="text-[11px]">Relevar Glosa</span>
                                    </label>
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold uppercase text-on-surface-variant block mb-1">Justificativa da Fiscalização / Relevação:</label>
                                    <input type="text" id="justificativa_${inf.regraId}" value="${inf.justificativa || ''}" placeholder="Ex: Chuva torrencial impediu acesso ou problema resolvido sem troca física..." class="w-full text-xs border border-outline-variant rounded-lg p-2 bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-secondary outline-none">
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            if (modal) modal.classList.remove('hidden');
        }

        fecharModalAuditarGlosa() {
            const modal = document.getElementById('modalAuditarGlosa');
            if (modal) modal.classList.add('hidden');
            this.osSelecionadaParaModal = null;
        }

        salvarAuditoriaGlosa() {
            if (!this.osSelecionadaParaModal) return;
            const item = this.osSelecionadaParaModal;
            const prot = item.protocolo;

            item.infracoes.forEach(inf => {
                const chk = document.getElementById(`checkAnistia_${inf.regraId}`);
                const inp = document.getElementById(`justificativa_${inf.regraId}`);
                if (chk) {
                    const anistiar = chk.checked;
                    const justificativa = inp ? inp.value.trim() : '';
                    this.medicaoService.salvarOverrideOS(prot, inf.regraId, !anistiar, justificativa);
                }
            });

            // Atualiza também se a OS tiver registro em os.glosas
            if (item.glosas && Array.isArray(item.glosas) && item.glosas.length > 0 && window.supabaseClient) {
                let glosasAlteradas = false;
                const glosasAtualizadas = [...item.glosas];

                item.infracoes.forEach(inf => {
                    const chk = document.getElementById(`checkAnistia_${inf.regraId}`);
                    const inp = document.getElementById(`justificativa_${inf.regraId}`);
                    if (chk) {
                        const anistiar = chk.checked;
                        const justificativa = inp ? inp.value.trim() : '';
                        const gIdx = glosasAtualizadas.findIndex(g => g.id === inf.regraId || g.regraId === inf.regraId);
                        if (gIdx >= 0) {
                            glosasAtualizadas[gIdx].anistiado = anistiar;
                            glosasAtualizadas[gIdx].justificativa_anistia = justificativa;
                            glosasAlteradas = true;
                        }
                    }
                });

                if (glosasAlteradas) {
                    window.supabaseClient
                        .from('ordens_servico')
                        .update({ glosas: glosasAtualizadas })
                        .eq('protocolo', prot)
                        .then(res => {
                            if (res.error) {
                                window.supabaseClient.from('ordens_servico_pracas').update({ glosas: glosasAtualizadas }).eq('protocolo', prot);
                            }
                        })
                        .catch(e => console.warn('⚠️ Falha ao sincronizar glosas no Supabase via Medição:', e));
                }
            }

            this.fecharModalAuditarGlosa();
            this.processarECalcular();
        }

        abrirModalConfigRegras() {
            if (this.userRole && this.userRole !== 'admin') {
                alert('Acesso restrito: apenas administradores podem configurar as regras e parâmetros do TR.');
                return;
            }
            const modal = document.getElementById('modalConfigRegras');
            if (!modal) return;

            const badgePeriodo = document.getElementById('modal-regras-periodo-badge');
            if (badgePeriodo) {
                badgePeriodo.textContent = `Competência: ${this.filtroMesAno || 'Global'}`;
            }

            this.abaModalTRAtiva = this.abaModalTRAtiva || 'auto';
            this.atualizarContadoresModalTR();
            this.renderizarConteudoModalTR();

            modal.classList.remove('hidden');
        }

        atualizarContadoresModalTR() {
            const badgeAuto = document.getElementById('badge-count-regras-auto');
            const badgeManual = document.getElementById('badge-count-glosas-manuais');
            
            const numAuto = (this.medicaoService.regras || []).length;
            if (badgeAuto) badgeAuto.textContent = numAuto;

            // Coleta glosas manuais aplicadas nos chamados do mês atual
            let totalManuais = 0;
            if (this.dadosMedicaoAtual && this.dadosMedicaoAtual.itens) {
                this.dadosMedicaoAtual.itens.forEach(item => {
                    if (item.infracoes) {
                        item.infracoes.forEach(inf => {
                            if (inf.isManualAdmin) totalManuais++;
                        });
                    }
                });
            }
            if (badgeManual) badgeManual.textContent = totalManuais;
        }

        alternarAbaModalTR(aba) {
            this.abaModalTRAtiva = aba;
            const btnAuto = document.getElementById('tab-tr-auto');
            const btnManual = document.getElementById('tab-tr-manual');

            if (aba === 'auto') {
                if (btnAuto) {
                    btnAuto.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer bg-blue-50 text-blue-800 border border-blue-200 shadow-xs';
                }
                if (btnManual) {
                    btnManual.className = 'px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-transparent';
                }
            } else {
                if (btnAuto) {
                    btnAuto.className = 'px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-transparent';
                }
                if (btnManual) {
                    btnManual.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer bg-purple-50 text-purple-800 border border-purple-200 shadow-xs';
                }
            }

            this.renderizarConteudoModalTR();
        }

        renderizarConteudoModalTR() {
            const container = document.getElementById('containerListaRegrasTR');
            if (!container) return;

            if (this.abaModalTRAtiva === 'manual') {
                this.renderizarGlosasManuaisModalTR(container);
            } else {
                this.renderizarRegrasAutomaticasModalTR(container);
            }
        }

        renderizarRegrasAutomaticasModalTR(container) {
            const regras = this.medicaoService.regras;

            const bannerHtml = `
                <div class="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-blue-950 flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-blue-600 text-lg shrink-0 mt-0.5">smart_toy</span>
                    <div class="text-xs space-y-0.5">
                        <div class="font-bold flex items-center gap-1.5">
                            <span>Regras do TR de Cálculo Automático</span>
                            <span class="px-1.5 py-0.2 bg-blue-200 text-blue-900 rounded text-[10px] font-extrabold uppercase tracking-wide">Automáticas</span>
                        </div>
                        <p class="text-blue-800 text-[11px] leading-relaxed">
                            Estas regras são avaliadas pelo sistema a cada encerramento de OS (prazos de atendimento do TR e plaqueta amarela de identificação). Você pode ativar/desativar e calibrar os prazos e percentuais abaixo:
                        </p>
                    </div>
                </div>
            `;

            const cardsHtml = regras.map((r, idx) => {
                return `
                    <div class="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/70 space-y-3 relative overflow-hidden group hover:border-blue-300 transition-colors shadow-xs">
                        <div class="absolute top-0 left-0 bottom-0 w-1 bg-blue-500 rounded-l"></div>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                                    <span class="material-symbols-outlined text-[17px]">smart_toy</span>
                                </div>
                                <div>
                                    <div class="flex items-center gap-2">
                                        <h4 class="font-bold text-xs text-on-surface">${r.nome}</h4>
                                        <span class="text-[9.5px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800 border border-blue-200">Automática</span>
                                    </div>
                                    <span class="text-[10px] text-on-surface-variant font-medium">${r.artigoTR}</span>
                                </div>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer" title="Ativar ou desativar esta regra de glosa automática">
                                <input type="checkbox" id="regra_ativo_${r.id}" ${r.ativo ? 'checked' : ''} class="sr-only peer">
                                <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        <p class="text-[11px] text-on-surface-variant pl-9">${r.descricao}</p>
                        
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2.5 border-t border-outline-variant/40 pl-9">
                            ${r.percentualGlosa !== undefined ? `
                                <div>
                                    <label class="text-[10px] font-bold text-on-surface-variant block uppercase">% Glosa / Desconto:</label>
                                    <div class="flex items-center gap-1 mt-0.5">
                                        <input type="number" step="0.5" id="regra_perc_${r.id}" value="${r.percentualGlosa}" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-1.5 bg-surface-container-lowest text-on-surface focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                                        <span class="text-xs font-bold text-on-surface-variant">%</span>
                                    </div>
                                </div>
                            ` : ''}

                            ${r.percentualPorDia !== undefined ? `
                                <div>
                                    <label class="text-[10px] font-bold text-on-surface-variant block uppercase">% Desconto por Dia:</label>
                                    <div class="flex items-center gap-1 mt-0.5">
                                        <input type="number" step="0.5" id="regra_perc_dia_${r.id}" value="${r.percentualPorDia}" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-1.5 bg-surface-container-lowest text-on-surface focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                                        <span class="text-xs font-bold text-on-surface-variant">%</span>
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-on-surface-variant block uppercase" title="Teto de dias de atraso a cobrar glosa (trava máxima)">Teto Máx. Dias Atraso:</label>
                                    <input type="number" id="regra_limite_dias_${r.id}" value="${r.limiteDiasUteis}" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-1.5 bg-surface-container-lowest text-on-surface mt-0.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-on-surface-variant block uppercase" title="Prazo para lâmpada/relé (dias corridos)">Prazo Simples (Dias):</label>
                                    <input type="number" id="regra_prazo_simples_${r.id}" value="${r.prazoDiasCorretivaSimples}" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-1.5 bg-surface-container-lowest text-on-surface mt-0.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-on-surface-variant block uppercase" title="Prazo para corretiva geral (dias úteis)">Prazo Geral (Dias):</label>
                                    <input type="number" id="regra_prazo_geral_${r.id}" value="${r.prazoDiasCorretivaGeral || 2}" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-1.5 bg-surface-container-lowest text-on-surface mt-0.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = bannerHtml + cardsHtml;
        }

        renderizarGlosasManuaisModalTR(container) {
            // Reúne todas as glosas manuais aplicadas nos protocolos da medição
            const manuais = [];
            if (this.dadosMedicaoAtual && this.dadosMedicaoAtual.itens) {
                this.dadosMedicaoAtual.itens.forEach(item => {
                    if (item.infracoes) {
                        item.infracoes.forEach(inf => {
                            if (inf.isManualAdmin) {
                                manuais.push({
                                    protocolo: item.protocolo,
                                    operador: item.operador,
                                    endereco: item.endereco,
                                    inf: inf
                                });
                            }
                        });
                    }
                });
            }

            const bannerHtml = `
                <div class="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl text-purple-950 flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-purple-600 text-xl shrink-0 mt-0.5">edit_note</span>
                    <div class="text-xs space-y-1">
                        <div class="font-bold flex items-center gap-2">
                            <span>Glosas Manuais / Administrativas do Protocolo</span>
                            <span class="px-2 py-0.2 bg-purple-200 text-purple-900 rounded text-[10px] font-extrabold uppercase tracking-wide">Manual</span>
                        </div>
                        <p class="text-purple-800 text-[11px] leading-relaxed">
                            São penalidades inseridas individualmente pela fiscalização ou auditoria diretamente no protocolo da OS (ex: retrabalho, dano material, conduta). Elas somam ao percentual de desconto contratual e são sincronizadas no banco de dados.
                        </p>
                    </div>
                </div>
            `;

            let listaHtml = '';
            if (manuais.length === 0) {
                listaHtml = `
                    <div class="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/60 space-y-2">
                        <div class="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                            <span class="material-symbols-outlined text-2xl">verified</span>
                        </div>
                        <h4 class="font-bold text-xs text-on-surface">Nenhuma Glosa Manual no Período Selecionado</h4>
                        <p class="text-[11px] text-on-surface-variant max-w-md mx-auto">
                            Nenhum protocolo deste mês de competência recebeu penalidade administrativa manual. Glosas manuais podem ser lançadas ou auditadas clicando no botão de ajuste de qualquer OS na tabela.
                        </p>
                    </div>
                `;
            } else {
                listaHtml = `
                    <div class="space-y-2.5">
                        <div class="text-[11px] font-bold text-purple-900 uppercase tracking-wider flex items-center justify-between">
                            <span>Glosas Manuais Detectadas no Mês (${manuais.length})</span>
                            <span class="text-slate-500 font-normal">Sincronizadas via Protocolo</span>
                        </div>
                        ${manuais.map(m => {
                            const anist = m.inf.anistiado;
                            return `
                                <div class="bg-surface-container-lowest p-3.5 rounded-xl border border-purple-200/70 space-y-2 relative overflow-hidden shadow-xs">
                                    <div class="absolute top-0 left-0 bottom-0 w-1 bg-purple-500 rounded-l"></div>
                                    <div class="flex items-start justify-between gap-2 pl-2">
                                        <div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <button type="button" onclick="window.medicaoController.fecharModalConfigRegras(); window.abrirDetalhesOSModal('${m.protocolo}')" class="font-bold text-xs text-secondary hover:underline cursor-pointer flex items-center gap-1">
                                                    <span>#${m.protocolo}</span>
                                                    <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                                                </button>
                                                <span class="text-xs font-bold text-on-surface">${m.inf.nome}</span>
                                                <span class="text-[10px] px-1.5 py-0.2 rounded font-extrabold ${anist ? 'bg-slate-200 text-slate-700 line-through' : 'bg-purple-100 text-purple-800 border border-purple-200'}">
                                                    -${m.inf.percentualGlosa}%
                                                </span>
                                                ${anist ? `<span class="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">Relevada / Anistiada</span>` : ''}
                                            </div>
                                            <p class="text-[11px] text-on-surface-variant mt-1 italic">"${m.inf.detalhe}"</p>
                                        </div>
                                        <button type="button" onclick="window.medicaoController.fecharModalConfigRegras(); window.medicaoController.abrirModalAuditarGlosa('${m.protocolo}')" class="px-2.5 py-1 rounded-lg border border-outline-variant hover:border-purple-400 text-[11px] font-semibold text-on-surface hover:text-purple-700 bg-surface-container-high/40 transition shrink-0" title="Auditar ou Anistiar no Protocolo">
                                            Auditar OS
                                        </button>
                                    </div>
                                    <div class="flex items-center justify-between text-[10px] text-on-surface-variant pt-1.5 border-t border-outline-variant/30 pl-2">
                                        <span>Operador: <strong class="text-on-surface">${m.operador}</strong></span>
                                        <span>Aplicado por: <strong class="text-purple-900">${m.inf.aplicado_por || 'Fiscalização'}</strong></span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            container.innerHTML = bannerHtml + listaHtml;
        }

        fecharModalConfigRegras() {
            const modal = document.getElementById('modalConfigRegras');
            if (modal) modal.classList.add('hidden');
        }

        salvarConfiguracaoRegras() {
            const regras = this.medicaoService.regras;

            regras.forEach(r => {
                const elAtivo = document.getElementById(`regra_ativo_${r.id}`);
                if (elAtivo) r.ativo = elAtivo.checked;

                const elPerc = document.getElementById(`regra_perc_${r.id}`);
                if (elPerc) r.percentualGlosa = parseFloat(elPerc.value) || 0;

                const elPercDia = document.getElementById(`regra_perc_dia_${r.id}`);
                if (elPercDia) r.percentualPorDia = parseFloat(elPercDia.value) || 0;

                const elLim = document.getElementById(`regra_limite_dias_${r.id}`);
                if (elLim) r.limiteDiasUteis = parseInt(elLim.value, 10) || 10;

                const elPrazoSimples = document.getElementById(`regra_prazo_simples_${r.id}`);
                if (elPrazoSimples) r.prazoDiasCorretivaSimples = parseInt(elPrazoSimples.value, 10) || 3;

                const elPrazoGeral = document.getElementById(`regra_prazo_geral_${r.id}`);
                if (elPrazoGeral) r.prazoDiasCorretivaGeral = parseInt(elPrazoGeral.value, 10) || 2;
            });

            this.medicaoService.salvarRegras(regras, this.filtroMesAno);
            this.fecharModalConfigRegras();
            this.processarECalcular();
            this.renderMedicaoMensal();
        }

        restaurarRegrasTR() {
            if (confirm('Deseja restaurar todas as regras para os percentuais padrão estritos do Termo de Referência (TR rev03)?')) {
                this.medicaoService.restaurarPadroesTR(this.filtroMesAno);
                this.fecharModalConfigRegras();
                this.processarECalcular();
                this.renderMedicaoMensal();
            }
        }

        // =========================================================================
        // MÉTODOS DE GESTÃO DE REUNIÕES SEMANAIS DO ENGENHEIRO (ITEM 8.7 DO TR)
        // =========================================================================

        abrirModalReunioesSemanais() {
            if (this.userRole && this.userRole !== 'admin') {
                alert('Acesso restrito: apenas administradores podem gerenciar reuniões semanais e glosas do TR.');
                return;
            }
            const modal = document.getElementById('modalReunioesSemanais');
            if (!modal) return;

            let mesAno = this.filtroMesAno;
            if (!mesAno) {
                const sel = document.getElementById('selectMesMedicao') || document.getElementById('medicao-month-select');
                mesAno = (sel && sel.value) || '';
            }
            if (!mesAno) {
                const now = new Date();
                mesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
            this.filtroMesAno = mesAno;

            const descEl = document.getElementById('modal-reunioes-periodo-desc');
            const dates = this.medicaoService.getMedicaoPeriodDates(mesAno);
            if (descEl) {
                descEl.textContent = `Ciclo de Medição: ${dates.periodLabelBR} (Competência ${mesAno})`;
            }

            // Cache temporário em memória para edição no modal
            this.semanasModalTemp = this.medicaoService.gerarSemanasDoPeriodo(mesAno);

            this.renderizarModalReunioesSemanais();
            modal.classList.remove('hidden');
        }

        fecharModalReunioesSemanais() {
            const modal = document.getElementById('modalReunioesSemanais');
            if (modal) modal.classList.add('hidden');
        }

        alterarStatusReuniaoSemana(semanaIndex, novoStatus) {
            if (!this.semanasModalTemp || !this.semanasModalTemp[semanaIndex]) return;
            this.semanasModalTemp[semanaIndex].status = novoStatus;
            this.renderizarModalReunioesSemanais();
        }

        alterarJustificativaReuniaoSemana(semanaIndex, valor) {
            if (!this.semanasModalTemp || !this.semanasModalTemp[semanaIndex]) return;
            this.semanasModalTemp[semanaIndex].justificativa = valor;
        }

        alterarDataReuniaoSemana(semanaIndex, valor) {
            if (!this.semanasModalTemp || !this.semanasModalTemp[semanaIndex]) return;
            this.semanasModalTemp[semanaIndex].dataReuniao = valor;
        }

        toggleDetalhesOSsSemana(semanaNumero) {
            const box = document.getElementById(`detalhes-oss-semana-${semanaNumero}`);
            const chevron = document.getElementById(`chevron-semana-${semanaNumero}`);
            if (!box) return;

            const isHidden = box.classList.contains('hidden');
            if (isHidden) {
                box.classList.remove('hidden');
                if (chevron) chevron.textContent = 'expand_less';
            } else {
                box.classList.add('hidden');
                if (chevron) chevron.textContent = 'expand_more';
            }
        }

        renderizarModalReunioesSemanais() {
            const container = document.getElementById('containerListaSemanasTR');
            const bannerEl = document.getElementById('modal-reunioes-banner-status');
            if (!container) return;

            const semanas = this.semanasModalTemp || [];
            const chamados = this.chamadosList || [];
            const formatCurrency = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // Simula o cálculo das glosas com os dados temporários
            let totalFaltas = 0;
            let maxConsecutivas = 0;
            let currConsecutivas = 0;
            const ossPorSemana = {};

            semanas.forEach((sem, idx) => {
                if (sem.status === 'nao_realizada') {
                    totalFaltas++;
                    currConsecutivas++;
                    if (currConsecutivas > maxConsecutivas) maxConsecutivas = currConsecutivas;

                    let dtInicioSemanaAnterior, dtFimSemanaAnterior;
                    if (idx > 0) {
                        dtInicioSemanaAnterior = semanas[idx - 1].dataInicio;
                        dtFimSemanaAnterior = semanas[idx - 1].dataFim;
                    } else {
                        dtFimSemanaAnterior = new Date(sem.dataInicio.getTime() - 1);
                        dtInicioSemanaAnterior = new Date(sem.dataInicio.getTime());
                        dtInicioSemanaAnterior.setDate(dtInicioSemanaAnterior.getDate() - 7);
                        dtInicioSemanaAnterior.setHours(0, 0, 0, 0);
                    }

                    const formatSemAno = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

                    const ossAfetadas = chamados.filter(os => {
                        const st = (os.normalizedStatus || os.status || '').toLowerCase();
                        const isConc = st.includes('conclu') || st.includes('resolv') || st.includes('fechad');
                        if (!isConc) return false;
                        const dtRef = os.dataConclusao || os.dataAbertura;
                        if (!dtRef) return false;
                        const t = (dtRef instanceof Date) ? dtRef.getTime() : new Date(dtRef).getTime();
                        return t >= dtInicioSemanaAnterior.getTime() && t <= dtFimSemanaAnterior.getTime();
                    });

                    // Extrair valores das OSs afetadas
                    let somaBrutoSemanaAnterior = 0;
                    const ossListDetalhada = ossAfetadas.map(os => {
                        const { matsDaOS } = this.extrairMateriaisDaOS(os);
                        const vBruto = matsDaOS.reduce((acc, m) => acc + (Number(m.subtotalComBdi) || 0), 0);
                        somaBrutoSemanaAnterior += vBruto;
                        return {
                            protocolo: os.protocolo || 'OS',
                            dtConclusao: os.dataConclusao,
                            endereco: os.endereco || 'Araraquara/SP',
                            valorBruto: vBruto,
                            valorGlosa10: vBruto * 0.10
                        };
                    });

                    ossPorSemana[sem.semanaNumero] = {
                        periodoAnteriorLabel: `${formatSemAno(dtInicioSemanaAnterior)} a ${formatSemAno(dtFimSemanaAnterior)}`,
                        ossAfetadas: ossListDetalhada,
                        totalBruto: somaBrutoSemanaAnterior,
                        totalGlosa10: somaBrutoSemanaAnterior * 0.10
                    };
                } else {
                    currConsecutivas = 0;
                }
            });

            const temReincidencia = maxConsecutivas >= 2 || totalFaltas >= 3;

            // Renderiza Banner de Status
            if (bannerEl) {
                if (totalFaltas === 0) {
                    bannerEl.innerHTML = `
                        <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-900 text-xs">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                                <div>
                                    <span class="font-bold">Todas as Reuniões em Conformidade</span>
                                    <p class="text-[11px] text-emerald-700">Nenhuma glosa por ausência de reunião semanal aplicável neste ciclo.</p>
                                </div>
                            </div>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">100% Regular</span>
                        </div>
                    `;
                } else {
                    bannerEl.innerHTML = `
                        <div class="p-3 ${temReincidencia ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'} border rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined ${temReincidencia ? 'text-rose-600' : 'text-amber-600'} text-[22px] shrink-0">
                                    ${temReincidencia ? 'report_problem' : 'warning'}
                                </span>
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-bold ${temReincidencia ? 'text-rose-900' : 'text-amber-900'}">
                                            ${totalFaltas} ${totalFaltas === 1 ? 'semana com reunião não realizada' : 'semanas com reuniões não realizadas'}
                                        </span>
                                        ${temReincidencia ? `
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-200 text-rose-900 animate-pulse">
                                                REINCIDÊNCIA DETECTADA (+15% s/ Medição Mensal)
                                            </span>
                                        ` : ''}
                                    </div>
                                    <p class="text-[11px] ${temReincidencia ? 'text-rose-700' : 'text-amber-700'} mt-0.5">
                                        ${temReincidencia 
                                            ? `Item 8.7.2 acionado: Ausência por 2 semanas consecutivas ou 3 no mês. Multa de 15% sobre o valor mensal total somada às glosas semanais.` 
                                            : `Glosas de 10% sendo calculadas sobre as OSs executadas nas semanas anteriores às faltas (Item 8.7.1).`}
                                    </p>
                                </div>
                            </div>
                            <div class="shrink-0 font-mono font-bold text-xs ${temReincidencia ? 'text-rose-800' : 'text-amber-800'}">
                                Total Faltas: ${totalFaltas}
                            </div>
                        </div>
                    `;
                }
            }

            // Renderiza Lista de Semanas
            container.innerHTML = semanas.map((sem, idx) => {
                const infoFalta = ossPorSemana[sem.semanaNumero];
                const statusColor = sem.status === 'realizada' 
                    ? 'border-emerald-200 bg-emerald-50/20' 
                    : (sem.status === 'nao_realizada' ? 'border-rose-300 bg-rose-50/30' : 'border-blue-200 bg-blue-50/20');

                return `
                    <div class="rounded-xl border ${statusColor} p-3.5 transition-all shadow-xs space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-outline-variant/40">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-xs text-on-surface">${sem.label}</span>
                                    <span class="text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                                        sem.status === 'realizada' ? 'bg-emerald-100 text-emerald-800' : 
                                        (sem.status === 'nao_realizada' ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-blue-100 text-blue-800')
                                    }">
                                        ${sem.status === 'realizada' ? 'Realizada' : (sem.status === 'nao_realizada' ? 'Não realizada' : 'Dispensada / Justificada')}
                                    </span>
                                </div>
                                <span class="text-[11px] text-on-surface-variant">Ciclo semanal: ${sem.dataInicioStr} a ${sem.dataFimStr}</span>
                            </div>

                            <!-- Seletor de Status da Reunião -->
                            <div class="flex items-center gap-1.5 shrink-0">
                                <button type="button" onclick="window.medicaoController.alterarStatusReuniaoSemana(${idx}, 'realizada')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                    sem.status === 'realizada' 
                                        ? 'bg-emerald-600 text-white shadow-xs' 
                                        : 'bg-surface-container hover:bg-emerald-100 text-on-surface-variant hover:text-emerald-800 border border-outline-variant/60'
                                }" title="Reunião aconteceu normalmente">
                                    <span class="flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[14px]">done</span>
                                        <span>Realizada</span>
                                    </span>
                                </button>
                                <button type="button" onclick="window.medicaoController.alterarStatusReuniaoSemana(${idx}, 'nao_realizada')" class="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    sem.status === 'nao_realizada' 
                                        ? 'bg-rose-600 text-white shadow-xs' 
                                        : 'bg-surface-container hover:bg-rose-100 text-on-surface-variant hover:text-rose-800 border border-outline-variant/60'
                                }" title="Engenheiro não compareceu sem prévia autorização (Aplica Glosa 8.7)">
                                    <span class="flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[14px]">cancel</span>
                                        <span>Não Realizada</span>
                                    </span>
                                </button>
                                <button type="button" onclick="window.medicaoController.alterarStatusReuniaoSemana(${idx}, 'dispensada')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                    sem.status === 'dispensada' 
                                        ? 'bg-blue-600 text-white shadow-xs' 
                                        : 'bg-surface-container hover:bg-blue-100 text-on-surface-variant hover:text-blue-800 border border-outline-variant/60'
                                }" title="Dispensada previamente pela Fiscalização">
                                    <span>Dispensada</span>
                                </button>
                            </div>
                        </div>

                        <!-- Campos complementares: Data e Justificativa -->
                        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                            <div class="sm:col-span-4">
                                <label class="block text-[11px] font-semibold text-on-surface-variant mb-1">Data Efetiva da Reunião:</label>
                                <input type="date" value="${sem.dataReuniao || ''}" onchange="window.medicaoController.alterarDataReuniaoSemana(${idx}, this.value)" class="w-full text-xs border border-outline-variant/80 rounded-lg px-2.5 py-1.5 bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-amber-500">
                            </div>
                            <div class="sm:col-span-8">
                                <label class="block text-[11px] font-semibold text-on-surface-variant mb-1">Observação / Justificativa:</label>
                                <input type="text" placeholder="${sem.status === 'nao_realizada' ? 'Ex: Engenheiro ausente sem comunicação prévia' : 'Observações sobre a ata ou deliberações...'}" value="${(sem.justificativa || '').replace(/"/g, '&quot;')}" onchange="window.medicaoController.alterarJustificativaReuniaoSemana(${idx}, this.value)" class="w-full text-xs border border-outline-variant/80 rounded-lg px-2.5 py-1.5 bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-amber-500">
                            </div>
                        </div>

                        <!-- Box de OSs afetadas se Não Realizada -->
                        ${infoFalta ? `
                            <div class="mt-2 pt-2 border-t border-rose-200">
                                <div class="flex items-center justify-between bg-rose-100/60 p-2.5 rounded-lg">
                                    <div class="text-xs">
                                        <span class="font-bold text-rose-900 flex items-center gap-1">
                                            <span class="material-symbols-outlined text-[16px] text-rose-700">error</span>
                                            <span>OSs Executadas na Semana Anterior à Falta (${infoFalta.periodoAnteriorLabel}):</span>
                                        </span>
                                        <span class="text-[11px] text-rose-800 font-medium">
                                            ${infoFalta.ossAfetadas.length} OS(s) afetada(s) | Total Bruto: <strong class="font-mono">${formatCurrency(infoFalta.totalBruto)}</strong> | Glosa Calculada (10%): <strong class="font-mono text-rose-700">-${formatCurrency(infoFalta.totalGlosa10)}</strong>
                                        </span>
                                    </div>
                                    <button type="button" onclick="window.medicaoController.toggleDetalhesOSsSemana(${sem.semanaNumero})" class="px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-200/80 rounded-md transition-colors flex items-center gap-1 cursor-pointer">
                                        <span>Ver OSs (${infoFalta.ossAfetadas.length})</span>
                                        <span class="material-symbols-outlined text-[16px]" id="chevron-semana-${sem.semanaNumero}">expand_more</span>
                                    </button>
                                </div>

                                <div id="detalhes-oss-semana-${sem.semanaNumero}" class="hidden mt-2 max-h-48 overflow-y-auto rounded-lg border border-rose-200 bg-surface-container-lowest">
                                    ${infoFalta.ossAfetadas.length === 0 ? `
                                        <div class="p-3 text-center text-xs text-on-surface-variant">Nenhuma OS foi concluída no intervalo da semana anterior (${infoFalta.periodoAnteriorLabel}).</div>
                                    ` : `
                                        <table class="w-full text-left text-xs border-collapse">
                                            <thead class="bg-rose-50 border-b border-rose-200 text-rose-900 font-bold text-[10px] uppercase">
                                                <tr>
                                                    <th class="py-1.5 px-3">Protocolo</th>
                                                    <th class="py-1.5 px-3">Conclusão</th>
                                                    <th class="py-1.5 px-3">Endereço</th>
                                                    <th class="py-1.5 px-3 text-right">Valor Bruto</th>
                                                    <th class="py-1.5 px-3 text-right text-rose-700">Glosa 10% (8.7.1)</th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-rose-100">
                                                ${infoFalta.ossAfetadas.map(osItem => {
                                                    const dtConcStr = osItem.dtConclusao ? new Date(osItem.dtConclusao).toLocaleDateString('pt-BR') : '---';
                                                    return `
                                                        <tr class="hover:bg-rose-50/40 font-mono text-[11px]">
                                                            <td class="py-1 px-3 font-bold text-secondary">${osItem.protocolo}</td>
                                                            <td class="py-1 px-3 text-on-surface-variant">${dtConcStr}</td>
                                                            <td class="py-1 px-3 font-sans text-[11px] truncate max-w-xs text-on-surface">${osItem.endereco}</td>
                                                            <td class="py-1 px-3 text-right font-medium text-on-surface">${formatCurrency(osItem.valorBruto)}</td>
                                                            <td class="py-1 px-3 text-right font-bold text-rose-600">-${formatCurrency(osItem.valorGlosa10)}</td>
                                                        </tr>
                                                    `;
                                                }).join('')}
                                            </tbody>
                                        </table>
                                    `}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }

        salvarModalReunioesSemanais() {
            if (!this.semanasModalTemp) return;

            const mesAno = this.filtroMesAno;
            this.medicaoService.salvarReunioesSemanais(mesAno, this.semanasModalTemp);
            this.fecharModalReunioesSemanais();
            this.processarECalcular();
            this.renderMedicaoMensal();

            // Atualiza badge de reuniões faltosas no botão
            this.atualizarBadgeReunioesSemanais();
        }

        atualizarBadgeReunioesSemanais() {
            const badge = document.getElementById('badge-reunioes-faltosas');
            if (!badge) return;

            let mesAno = this.filtroMesAno;
            if (!mesAno) {
                const now = new Date();
                mesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }

            if (this.medicaoService) {
                this.medicaoService.carregarReunioesSemanais();
            }

            const semanas = (this.medicaoService && this.medicaoService.reunioesSemanais && this.medicaoService.reunioesSemanais[mesAno]) || [];
            const faltas = semanas.filter(s => s.status === 'nao_realizada').length;

            if (faltas > 0) {
                badge.textContent = `${faltas} falta${faltas > 1 ? 's' : ''}`;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        exportarCSV() {
            if (!this.dadosMedicaoAtual || this.dadosMedicaoAtual.itens.length === 0) {
                alert('Nenhum dado disponível para exportação na competência selecionada.');
                return;
            }

            const cabecalho = ['Protocolo', 'Data Conclusao', 'Operador', 'Tipo', 'Endereco', 'Problema', 'Qtd Pontos', 'Valor Bruto (R$)', 'Glosa (%)', 'Valor Glosa (R$)', 'Valor Liquido (R$)', 'Infracoes TR'];
            const linhas = this.dadosMedicaoAtual.itens.map(i => {
                const infracoesTxt = i.infracoes.map(inf => `${inf.artigoTR} (${inf.percentualGlosa}%)${inf.anistiado ? ' [ANISTIADO]' : ''}`).join('; ');
                return [
                    `"${i.protocolo}"`,
                    `"${i.dataConclusao ? new Date(i.dataConclusao).toLocaleDateString('pt-BR') : ''}"`,
                    `"${i.operador}"`,
                    `"${i.tipo}"`,
                    `"${(i.endereco || '').replace(/"/g, '""')}"`,
                    `"${(i.problema || '').replace(/"/g, '""')}"`,
                    i.valores.qtdPontos,
                    i.valores.valorTotalBruto.toFixed(2),
                    i.percentualGlosa,
                    i.valorGlosa.toFixed(2),
                    i.valorLiquido.toFixed(2),
                    `"${infracoesTxt}"`
                ].join(',');
            });

            const csvContent = '\uFEFF' + [cabecalho.join(','), ...linhas].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `Medicao_Contratual_${this.filtroMesAno}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // =========================================================================
        // MÉTODOS DE DROPDOWNS FLUTUANTES & FILTROS NO CABEÇALHO (ESTILO RELATORIO)
        // =========================================================================

        closeAllDropdowns() {
            const dropdownIds = [
                'medicao-protocol-filter-dropdown',
                'medicao-operador-filter-dropdown',
                'medicao-local-filter-dropdown',
                'medicao-glosa-filter-dropdown'
            ];
            dropdownIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.add('hidden');
                    el.style.display = 'none';
                }
            });
        }

        openFloatingDropdown(triggerBtn, dropdownEl) {
            if (!triggerBtn || !dropdownEl) return;

            if (dropdownEl.parentElement !== document.body) {
                document.body.appendChild(dropdownEl);
            }

            const isCurrentlyHidden = dropdownEl.classList.contains('hidden') || dropdownEl.style.display === 'none';
            this.closeAllDropdowns();

            if (isCurrentlyHidden) {
                dropdownEl.style.position = 'fixed';
                dropdownEl.style.zIndex = '99999';
                dropdownEl.style.display = 'block';
                dropdownEl.classList.remove('hidden');

                const rect = triggerBtn.getBoundingClientRect();
                const dropdownHeight = dropdownEl.offsetHeight || 240;
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;

                if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                    dropdownEl.style.top = `${Math.max(12, rect.top - dropdownHeight - 6)}px`;
                } else {
                    dropdownEl.style.top = `${rect.bottom + 6}px`;
                }

                dropdownEl.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 300))}px`;
                dropdownEl.style.right = 'auto';
            }
        }

        toggleMedicaoProtocoloFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-protocolo-col-filter-trigger');
            const dropdown = document.getElementById('medicao-protocol-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
            const input = document.getElementById('medicao-protocol-search-col-input');
            if (input && dropdown && !dropdown.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        toggleMedicaoProtocolPrefix(prefix) {
            if (this.filtroProtocoloPrefixo === prefix) {
                this.filtroProtocoloPrefixo = '';
            } else {
                this.filtroProtocoloPrefixo = prefix;
            }
            this.updateProtocolPrefixUI();
            this.renderizarTabela();
        }

        updateProtocolPrefixUI() {
            const btnPraca = document.getElementById('medicao-protocol-btn-praca');
            const btnViaria = document.getElementById('medicao-protocol-btn-viaria');
            const activeClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-secondary text-white border-secondary shadow-xs';
            const inactiveClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-surface-container-high border-outline-variant/60 text-on-surface hover:bg-secondary/15 hover:text-secondary hover:border-secondary/40';

            if (btnPraca) btnPraca.className = (this.filtroProtocoloPrefixo === 'P') ? activeClass : inactiveClass;
            if (btnViaria) btnViaria.className = (this.filtroProtocoloPrefixo === 'I') ? activeClass : inactiveClass;
        }

        clearMedicaoProtocolFilter() {
            this.filtroProtocoloTexto = '';
            this.filtroProtocoloPrefixo = '';
            const input = document.getElementById('medicao-protocol-search-col-input');
            if (input) input.value = '';
            this.updateProtocolPrefixUI();
            this.closeAllDropdowns();
            this.renderizarTabela();
        }

        toggleMedicaoOperadorFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-operador-col-filter-trigger');
            const dropdown = document.getElementById('medicao-operador-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
        }

        setOperadorFilter(op) {
            this.filtroOperador = op;
            this.renderizarTabela();
            this.closeAllDropdowns();
        }

        clearMedicaoOperadorFilter() {
            this.setOperadorFilter('ALL');
            this.popularSeletorOperadores();
        }

        toggleMedicaoLocalFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-local-col-filter-trigger');
            const dropdown = document.getElementById('medicao-local-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
            const input = document.getElementById('medicao-local-search-input');
            if (input && dropdown && !dropdown.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        clearMedicaoLocalFilter() {
            this.filtroLocalTexto = '';
            const input = document.getElementById('medicao-local-search-input');
            if (input) input.value = '';
            this.closeAllDropdowns();
            this.renderizarTabela();
        }

        toggleMedicaoGlosaFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-glosa-col-filter-trigger');
            const dropdown = document.getElementById('medicao-glosa-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
        }

        setGlosaFilter(status) {
            this.filtroStatusGlosa = status;
            const rbs = document.querySelectorAll('input[name="filtro-glosa-opt"]');
            rbs.forEach(rb => {
                rb.checked = (rb.value === status);
            });
            this.renderizarTabela();
            this.closeAllDropdowns();
        }

        atualizarIndicadoresFiltros() {
            // Indicador 1: Protocolo
            const indProt = document.getElementById('medicao-protocolo-filter-indicator');
            if (indProt) indProt.classList.toggle('hidden', !this.filtroProtocoloTexto && !this.filtroProtocoloPrefixo);

            // Indicador 2: Operador
            const indOp = document.getElementById('medicao-operador-filter-indicator');
            if (indOp) indOp.classList.toggle('hidden', this.filtroOperador === 'ALL');

            // Indicador 3: Local
            const indLoc = document.getElementById('medicao-local-filter-indicator');
            if (indLoc) indLoc.classList.toggle('hidden', !this.filtroLocalTexto);

            // Indicador 4: Glosa
            const indGlosa = document.getElementById('medicao-glosa-filter-indicator');
            if (indGlosa) indGlosa.classList.toggle('hidden', this.filtroStatusGlosa === 'ALL');
        }

        setupEventListeners() {
            const selMes = document.getElementById('selectMesMedicao');
            if (selMes) selMes.addEventListener('change', async (e) => {
                this.filtroMesAno = e.target.value;
                this.medicaoFilters.selectedMonth = e.target.value;
                const monthSelect = document.getElementById('medicao-month-select');
                if (monthSelect) monthSelect.value = e.target.value;
                if (this.medicaoService && typeof this.medicaoService.carregarConfiguracoesPeriodo === 'function') {
                    await this.medicaoService.carregarConfiguracoesPeriodo(this.filtroMesAno);
                }
                this.processarECalcular();
                this.renderMedicaoMensal();
                this.atualizarBadgeReunioesSemanais();
            });

            // Campo de busca no dropdown de Protocolo
            const inpProt = document.getElementById('medicao-protocol-search-col-input');
            if (inpProt) inpProt.addEventListener('input', (e) => {
                this.filtroProtocoloTexto = e.target.value;
                this.renderizarTabela();
            });

            // Campo de busca no dropdown de Local
            const inpLocal = document.getElementById('medicao-local-search-input');
            if (inpLocal) inpLocal.addEventListener('input', (e) => {
                this.filtroLocalTexto = e.target.value;
                this.renderizarTabela();
            });

            // Busca geral no header
            const headerInput = document.getElementById('inputBuscaMedicaoHeader');
            if (headerInput) headerInput.addEventListener('input', (e) => {
                this.filtroBusca = e.target.value;
                this.renderizarTabela();
            });

            const monthSelect = document.getElementById('medicao-month-select');
            if (monthSelect) {
                monthSelect.addEventListener('change', async (e) => {
                    this.filtroMesAno = e.target.value;
                    this.medicaoFilters.selectedMonth = e.target.value;
                    const selMes = document.getElementById('selectMesMedicao');
                    if (selMes) selMes.value = e.target.value;
                    if (this.medicaoService && typeof this.medicaoService.carregarConfiguracoesPeriodo === 'function') {
                        await this.medicaoService.carregarConfiguracoesPeriodo(this.filtroMesAno);
                    }
                    this.processarECalcular();
                    this.renderMedicaoMensal();
                    this.atualizarBadgeReunioesSemanais();
                });
            }

            const medicaoStatusSelect = document.getElementById('medicao-status-select');
            if (medicaoStatusSelect) {
                medicaoStatusSelect.addEventListener('change', (e) => {
                    this.medicaoFilters.status = e.target.value;
                    this.renderMedicaoMensal();
                });
            }

            const inputProtSearch = document.getElementById('medicao-protocolo-search');
            if (inputProtSearch) {
                inputProtSearch.addEventListener('input', (e) => {
                    this.medicaoProtocoloSearch = e.target.value.toLowerCase().trim();
                    this.renderMedicaoPorProtocolo();
                });
            }

            const inputMatColSearch = document.getElementById('medicao-mat-search-input');
            if (inputMatColSearch) {
                inputMatColSearch.addEventListener('input', (e) => {
                    this.medicaoMaterialFilter = e.target.value.toLowerCase().trim();
                    this.renderMedicaoPorProtocolo();
                });
            }

            const statusAllCb = document.getElementById('medicao-status-cb-all');
            if (statusAllCb) {
                statusAllCb.addEventListener('change', (e) => this.onMedicaoStatusAllChange(e));
            }

            document.querySelectorAll('.medicao-status-cb').forEach(cb => {
                cb.addEventListener('change', () => this.onMedicaoStatusCheckboxChange());
            });

            const inputMatDescSearch = document.getElementById('medicao-mat-desc-search-input');
            if (inputMatDescSearch) {
                inputMatDescSearch.addEventListener('input', (e) => {
                    this.medicaoConsolidadoDescFilter = e.target.value.trim();
                    this.renderMedicaoMensal();
                });
            }

            const inputMatProtSearch = document.getElementById('medicao-mat-prot-search-input');
            if (inputMatProtSearch) {
                inputMatProtSearch.addEventListener('input', (e) => {
                    this.medicaoConsolidadoProtSearch = e.target.value.trim();
                    this.renderMedicaoMensal();
                });
            }

            // Fechar dropdowns ao clicar fora ou apertar Escape
            document.addEventListener('click', (e) => {
                const target = e.target;
                const insideDropdown = target.closest(
                    '#medicao-protocol-filter-dropdown, #medicao-operador-filter-dropdown, #medicao-local-filter-dropdown, #medicao-glosa-filter-dropdown, #medicao-status-filter-dropdown, #medicao-mat-filter-dropdown, #medicao-mat-desc-filter-dropdown, #medicao-mat-prot-filter-dropdown'
                );
                const isTrigger = target.closest(
                    '#medicao-protocolo-col-filter-trigger, #medicao-operador-col-filter-trigger, #medicao-local-col-filter-trigger, #medicao-glosa-col-filter-trigger, #medicao-status-col-filter-trigger, #medicao-mat-filter-trigger, #medicao-mat-desc-filter-trigger, #medicao-mat-prot-filter-trigger'
                );
                if (!insideDropdown && !isTrigger) {
                    this.closeAllDropdowns();
                    this.closeAllMedicaoFilterDropdowns();
                }

                const inputLote = document.getElementById('input-novo-material-lote');
                const dropdownLote = document.getElementById('dropdown-materiais-lote');
                if (dropdownLote && inputLote && !dropdownLote.contains(e.target) && !inputLote.contains(e.target)) {
                    dropdownLote.style.display = 'none';
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeAllDropdowns();
                    this.closeAllMedicaoFilterDropdowns();
                }
            });

            // Ouvinte para anistia ou alteração de glosa vinda do modal do PainelController ou de outra aba
            window.addEventListener('glosa-anistia-atualizada', () => {
                if (this.medicaoService) {
                    this.medicaoService.overrides = this.medicaoService.carregarOverrides();
                }
                this.processarECalcular();
                this.renderMedicaoMensal();
            });

            // Sincronização entre abas diferentes do navegador caso o usuário altere em outra aba
            window.addEventListener('storage', (e) => {
                if (e.key === 'sistema_os_medicao_overrides' || e.key === 'sistema_os_regras_medicao_tr') {
                    if (this.medicaoService) {
                        this.medicaoService.regras = this.medicaoService.carregarRegras();
                        this.medicaoService.overrides = this.medicaoService.carregarOverrides();
                    }
                    this.processarECalcular();
                    this.renderMedicaoMensal();
                }
            });
        }

        // =========================================================================
        // MÉTODOS DE MEDIÇÃO MENSAL DE MATERIAIS & CONTRATO
        // =========================================================================

        async carregarMateriaisContrato() {
            if (this.materiaisContratoCache && this.materiaisContratoCache.length > 0) return this.materiaisContratoCache;
            try {
                const client = window.supabaseClient || (typeof obterSupabaseClient === 'function' ? obterSupabaseClient() : null);
                if (client) {
                    const { data, error } = await client.from('materiais_contrato').select('*');
                    if (!error && Array.isArray(data) && data.length > 0) {
                        this.materiaisContratoCache = data;
                        try { localStorage.setItem('os_cached_materiais_raw', JSON.stringify(data)); } catch(e){}
                        return data;
                    }
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoController] Falha ao carregar materiais_contrato do Supabase:', e);
            }

            try {
                const cached = localStorage.getItem('os_cached_materiais_raw');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.materiaisContratoCache = parsed;
                        return parsed;
                    }
                }
            } catch(e) {}

            this.materiaisContratoCache = [];
            return [];
        }

        normalizarTexto(str) {
            if (!str) return '';
            return String(str)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
        }

        getMedicaoPeriodDates(monthStr) {
            let targetY, targetM;
            if (monthStr && monthStr.includes('-')) {
                const parts = monthStr.split('-');
                targetY = parseInt(parts[0], 10);
                targetM = parseInt(parts[1], 10);
            } else {
                const now = new Date();
                targetY = now.getFullYear();
                targetM = now.getMonth() + 1;
            }

            let janelaConfig = { diaInicio: 21, diaFim: 20, mesmoMes: false };
            try {
                if (window.MedicaoService && typeof window.MedicaoService.carregarJanelaMedicaoConfig === 'function') {
                    janelaConfig = window.MedicaoService.carregarJanelaMedicaoConfig();
                } else {
                    const saved = localStorage.getItem('sistema_os_janela_medicao_config');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (parsed && parsed.diaInicio && parsed.diaFim) {
                            janelaConfig = parsed;
                        }
                    }
                }
            } catch (e) {
                console.warn('⚠️ [MedicaoController] Falha ao ler janela de medição:', e);
            }

            const dInicio = parseInt(janelaConfig.diaInicio, 10) || 21;
            const dFim = parseInt(janelaConfig.diaFim, 10) || 20;
            const mesmoMes = Boolean(janelaConfig.mesmoMes);

            let startDate, endDate;
            if (mesmoMes) {
                startDate = new Date(targetY, targetM - 1, dInicio, 0, 0, 0, 0);
                endDate = new Date(targetY, targetM - 1, dFim, 23, 59, 59, 999);
            } else {
                startDate = new Date(targetY, targetM - 2, dInicio, 0, 0, 0, 0);
                endDate = new Date(targetY, targetM - 1, dFim, 23, 59, 59, 999);
            }

            const formatBR = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

            return {
                startDate,
                endDate,
                periodLabelBR: `${formatBR(startDate)} a ${formatBR(endDate)}`
            };
        }

        resolveMarcaEMaterial(rawNome, defaultUnidade = 'UN') {
            if (!rawNome) return { marca: 'PRÓPRIO', desc: '', unidade: defaultUnidade, valorUnitario: 0, valorUnitarioBdi: 0 };

            if (typeof rawNome === 'object') {
                const extracted = (rawNome.nome || rawNome.descricao || rawNome.material || rawNome.material_nome || '');
                rawNome = extracted ? String(extracted) : JSON.stringify(rawNome);
            } else {
                rawNome = String(rawNome);
            }

            let nomeClean = rawNome.replace(/\(x\d+\)/i, '').trim();
            if (!nomeClean) return { marca: 'PRÓPRIO', desc: rawNome, unidade: defaultUnidade, valorUnitario: 0, valorUnitarioBdi: 0 };

            nomeClean = nomeClean.replace(/^["'\s]+|["'\s]+$/g, '').trim();
            nomeClean = nomeClean.replace(/\s*\((UN|M|H|KG|PC|PÇ|CJ|JG)\)$/i, '').trim();

            const cleanNormUpper = nomeClean.toUpperCase();
            // Se for exatamente mão de obra de eletricista (ex: "ELETRICISTA COM ENCARGOS COMPLEMENTARES", "HORA DE ELETRICISTA", etc.)
            // e NÃO for serviço viário padrão ("Serviço de manutenção em iluminação pública viaria... incluindo eletricista...")
            const isServicoViario = cleanNormUpper.includes('SERVICO') || cleanNormUpper.includes('SERVIÇO') || cleanNormUpper.includes('PONTO DE REPARO') || cleanNormUpper.includes('PONTO DE TROCA');
            if (cleanNormUpper.includes('ELETRICISTA') && !isServicoViario) {
                let precoUnit = 0;
                let precoBdi = 0;
                if (this.materiaisContratoCache && this.materiaisContratoCache.length > 0) {
                    const rowEl = this.materiaisContratoCache.find(r => {
                        const desc = (r['Material/Serviço'] || r.descricao || r.material || '').toUpperCase();
                        return desc.includes('ELETRICISTA COM ENCARGOS');
                    }) || this.materiaisContratoCache.find(r => {
                        const desc = (r['Material/Serviço'] || r.descricao || r.material || '').toUpperCase();
                        return desc.includes('ELETRICISTA') && !desc.includes('SERVIÇO') && !desc.includes('SERVICO');
                    });
                    if (rowEl) {
                        precoUnit = Number(rowEl.valor_unitario) || 0;
                        precoBdi = Number(rowEl.valor_unitario_bdi) || 0;
                    }
                }
                return {
                    marca: 'MÃO DE OBRA',
                    desc: 'ELETRICISTA COM ENCARGOS COMPLEMENTARES',
                    unidade: 'H',
                    valorUnitario: precoUnit,
                    valorUnitarioBdi: precoBdi
                };
            }

            const cleanNorm = this.normalizarTexto(nomeClean);

            if (this.materiaisContratoCache && this.materiaisContratoCache.length > 0) {
                for (const row of this.materiaisContratoCache) {
                    const dbMarca = (row.Marca || row.marca || row.Fabricante || row.fabricante || '').trim();
                    const dbDesc = (row['Material/Serviço'] || row.Material || row.Serviço || row.descricao || row.nome || row.material || row.item || row['material_servico'] || row['material/servico'] || '').trim();
                    const dbUnid = (row['Unidade de Medida'] || row.Unidade || row.unidade || row.und || row['unidade_de_medida'] || '').trim();
                    const dbValUnit = Number(row.valor_unitario || row.ValorUnitario || row.valor_unit || 0);
                    const dbValBdi = Number(row.valor_unitario_bdi || row.ValorUnitarioBdi || row.valor_bdi || 0);

                    if (dbDesc) {
                        const dbDescNorm = this.normalizarTexto(dbDesc);
                        if (cleanNorm === dbDescNorm || cleanNorm.includes(dbDescNorm) || dbDescNorm.includes(cleanNorm)) {
                            return {
                                marca: dbMarca || 'PRÓPRIO',
                                desc: dbDesc,
                                unidade: dbUnid || defaultUnidade,
                                valorUnitario: dbValUnit,
                                valorUnitarioBdi: dbValBdi
                            };
                        }
                    }
                }
            }

            if (nomeClean.includes(' - ')) {
                const parts = nomeClean.split(' - ');
                const candidateMarca = parts[0].trim();
                const candidateDesc = parts.slice(1).join(' - ').trim();

                const nonBrandNouns = [
                    'RELÉ', 'RELE', 'LUMINÁRIA', 'LUMINARIA', 'CONECTOR', 'PLACA', 'PLAQUETA',
                    'CABO', 'POSTE', 'REATOR', 'CHAVE', 'DISJUNTOR', 'FITA', 'BRAÇO', 'BRACO',
                    'PARAFUSO', 'TAMPA', 'CAIXA', 'ISOLADOR', 'LÂMPADA', 'LAMPADA', 'SERVIÇO',
                    'SERVICO', 'FORNECIMENTO', 'INSTALAÇÃO', 'INSTALACAO', 'REFLETOR'
                ];

                const startsWithNoun = nonBrandNouns.some(noun => candidateMarca.toUpperCase().startsWith(noun));

                if (candidateMarca && candidateDesc && !startsWithNoun) {
                    return {
                        marca: candidateMarca,
                        desc: candidateDesc,
                        unidade: defaultUnidade,
                        valorUnitario: 0,
                        valorUnitarioBdi: 0
                    };
                }
            }

            return {
                marca: 'PRÓPRIO',
                desc: nomeClean,
                unidade: defaultUnidade,
                valorUnitario: 0,
                valorUnitarioBdi: 0
            };
        }

        calcularMedicaoMensal() {
            const selectedMonth = this.filtroMesAno;
            const status = this.medicaoFilters.status;
            const { startDate, endDate, periodLabelBR } = this.getMedicaoPeriodDates(selectedMonth);

            const listToMeasure = (this.chamadosList || []).filter(item => {
                if (status === 'concluida' && item.normalizedStatus !== 'concluida') {
                    return false;
                }

                const refDate = item.dataConclusao || item.dataAbertura;
                if (!refDate) return false;

                const t = (refDate instanceof Date) ? refDate.getTime() : new Date(refDate).getTime();
                return t >= startDate.getTime() && t <= endDate.getTime();
            });

            const materiaisMap = {};
            const countOSsComMaterial = new Set();
            let totalHorasEletricista = 0;
            let totalValorSemBdi = 0;
            let totalValorComBdi = 0;
            let totalValorGlosa = 0;
            let totalValorLiquido = 0;
            let countItensComGlosa = 0;

            // Pré-calcular percentual de glosa de cada OS para aplicar aos materiais
            const glosaPorOS = {};
            const infoReunioes = this.medicaoService ? this.medicaoService.calcularGlosasReuniaoSemanal(this.chamadosList || [], selectedMonth) : {};
            const protocolosGlosadosPorReuniao = (infoReunioes && infoReunioes.protocolosGlosadosPorReuniao) || {};

            listToMeasure.forEach(item => {
                const prot = item.protocolo || 'OS-SEM-PROT';
                let perc = 0;
                if (this.medicaoService) {
                    const infracoes = this.medicaoService.avaliarInfracoesOS(item);
                    infracoes.forEach(inf => {
                        if (!inf.anistiado) {
                            perc += (Number(inf.percentualGlosa) || 0);
                        }
                    });

                    // Glosa de Reunião Semanal (Item 8.7.1)
                    if (protocolosGlosadosPorReuniao[prot]) {
                        const isAnistiado = this.medicaoService.overrides[prot]?.['reuniao_semanal_8_7']?.ignorarGlosa;
                        if (!isAnistiado) {
                            perc += (Number(protocolosGlosadosPorReuniao[prot].percentualGlosa) || 10.0);
                        }
                    }

                    if (perc > 100) perc = 100;
                }
                glosaPorOS[prot] = perc;
            });

            const registrarMaterial = (rawNome, qtd, protocolo, defaultUnidade = 'UN', categoria = 'Material Aplicado') => {
                if (!rawNome) return;

                const { marca, desc, unidade, valorUnitario, valorUnitarioBdi } = this.resolveMarcaEMaterial(rawNome, defaultUnidade);
                const finalUnidade = defaultUnidade !== 'UN' ? defaultUnidade : unidade;
                const key = `${marca.toUpperCase()}||${desc.toUpperCase()}`;

                if (!materiaisMap[key]) {
                    materiaisMap[key] = {
                        marca: marca,
                        descricao: desc,
                        unidade: finalUnidade,
                        quantidadeTotal: 0,
                        valorUnitario: Number(valorUnitario) || 0,
                        valorUnitarioBdi: Number(valorUnitarioBdi) || 0,
                        valorTotalSemBdi: 0,
                        valorTotalComBdi: 0,
                        valorTotalGlosa: 0,
                        valorTotalLiquido: 0,
                        qtdOSsGlosadas: 0,
                        qtdOSsSet: new Set(),
                        protocolosSet: new Set(),
                        protocolosDetalhados: {}, // { [prot]: { qtd, percGlosa, valorBruto, valorGlosa, valorLiquido } }
                        categoria: categoria
                    };
                }

                const numQtd = Number(qtd) || 1;
                const percGlosa = glosaPorOS[protocolo] || 0;
                const vBdi = materiaisMap[key].valorUnitarioBdi;
                const valorBrutoDesteRegistro = numQtd * vBdi;
                const valorGlosaDesteRegistro = valorBrutoDesteRegistro * (percGlosa / 100);

                materiaisMap[key].quantidadeTotal += numQtd;
                materiaisMap[key].valorTotalSemBdi = materiaisMap[key].quantidadeTotal * materiaisMap[key].valorUnitario;
                materiaisMap[key].valorTotalComBdi = materiaisMap[key].quantidadeTotal * vBdi;
                materiaisMap[key].valorTotalGlosa += valorGlosaDesteRegistro;
                materiaisMap[key].valorTotalLiquido = Math.max(0, materiaisMap[key].valorTotalComBdi - materiaisMap[key].valorTotalGlosa);
                
                if (!materiaisMap[key].protocolosDetalhados[protocolo]) {
                    materiaisMap[key].protocolosDetalhados[protocolo] = {
                        protocolo: protocolo,
                        qtd: 0,
                        percGlosa: percGlosa,
                        valorBruto: 0,
                        valorGlosa: 0,
                        valorLiquido: 0
                    };
                }
                materiaisMap[key].protocolosDetalhados[protocolo].qtd += numQtd;
                materiaisMap[key].protocolosDetalhados[protocolo].valorBruto += valorBrutoDesteRegistro;
                materiaisMap[key].protocolosDetalhados[protocolo].valorGlosa += valorGlosaDesteRegistro;
                materiaisMap[key].protocolosDetalhados[protocolo].valorLiquido = Math.max(0, materiaisMap[key].protocolosDetalhados[protocolo].valorBruto - materiaisMap[key].protocolosDetalhados[protocolo].valorGlosa);

                materiaisMap[key].qtdOSsSet.add(protocolo);
                materiaisMap[key].protocolosSet.add(protocolo);
                countOSsComMaterial.add(protocolo);
            };

            listToMeasure.forEach(item => {
                const prot = item.protocolo || 'OS-SEM-PROT';

                const rawMats = (item.materiaisConsolidados && Array.isArray(item.materiaisConsolidados) && item.materiaisConsolidados.length > 0)
                    ? item.materiaisConsolidados
                    : (item.materialsList || []);
                rawMats.forEach(matItem => {
                    if (!matItem) return;
                    let matStr = '';
                    let qty = 1;

                    if (typeof matItem === 'string') {
                        matStr = matItem;
                        const matchX = matStr.match(/\(x(\d+)\)/i);
                        if (matchX) {
                            qty = parseInt(matchX[1], 10) || 1;
                        } else {
                            const matchStartNum = matStr.match(/^(\d+)\s*x?\s+(.*)/i);
                            if (matchStartNum) {
                                qty = parseInt(matchStartNum[1], 10) || 1;
                                matStr = matchStartNum[2];
                            }
                        }
                    } else if (typeof matItem === 'object') {
                        matStr = String(matItem.nome || matItem.descricao || matItem.material || matItem.material_nome || '').trim();
                        qty = Number(matItem.qtd || matItem.quantidade || matItem.qtd_usada) || 1;
                    } else {
                        matStr = String(matItem).trim();
                    }

                    if (matStr) {
                        registrarMaterial(matStr, qty, prot, 'UN', 'Material de Aplicação');
                    }
                });

                const isPraca = Boolean(item.isPraca || (prot.startsWith('P') && !prot.startsWith('IP')));
                const sessoes = isPraca ? (item.sessoesList || []) : [];
                sessoes.forEach(sess => {
                    let durMin = sess.duracao_minutos;
                    if ((durMin === null || durMin === undefined || isNaN(durMin)) && sess.inicio && sess.fim) {
                        const dtInc = new Date(sess.inicio);
                        const dtFim = new Date(sess.fim);
                        if (!isNaN(dtInc.getTime()) && !isNaN(dtFim.getTime())) {
                            durMin = Math.max(1, Math.round((dtFim.getTime() - dtInc.getTime()) / 60000));
                        }
                    }

                    if (durMin && durMin > 0) {
                        const horasSessao = durMin / 60;
                        const numEletricistas = parseInt(sess.qtd_eletricistas, 10) || 1;
                        const totalHorasCalculadas = horasSessao * numEletricistas;

                        totalHorasEletricista += totalHorasCalculadas;

                        registrarMaterial(
                            'ELETRICISTA COM ENCARGOS COMPLEMENTARES (H)',
                            totalHorasCalculadas,
                            prot,
                            'H',
                            'Sessão de Praça (Mão de Obra)'
                        );
                    }

                    if (sess.materiais && Array.isArray(sess.materiais)) {
                        sess.materiais.forEach(sMat => {
                            registrarMaterial(sMat, 1, prot, 'UN', 'Material em Sessão Praça');
                        });
                    }
                });
            });

            // Contabilizar total de OSs com glosa por material
            Object.values(materiaisMap).forEach(m => {
                let ossComGlosa = 0;
                Object.values(m.protocolosDetalhados).forEach(pDet => {
                    if (pDet.percGlosa > 0) ossComGlosa++;
                });
                m.qtdOSsGlosadas = ossComGlosa;
                if (m.valorTotalGlosa > 0) countItensComGlosa++;
            });

            const arrayMateriais = Object.values(materiaisMap).sort((a, b) => b.quantidadeTotal - a.quantidadeTotal);

            totalValorSemBdi = arrayMateriais.reduce((acc, m) => acc + (m.valorTotalSemBdi || 0), 0);
            totalValorComBdi = arrayMateriais.reduce((acc, m) => acc + (m.valorTotalComBdi || 0), 0);
            totalValorGlosa = arrayMateriais.reduce((acc, m) => acc + (m.valorTotalGlosa || 0), 0);
            
            // Multa de Reincidência de Reuniões Semanais (Item 8.7.2): 15% s/ total da medição
            let valorMultaReincidenciaMensal = 0;
            if (infoReunioes && infoReunioes.temReincidencia) {
                valorMultaReincidenciaMensal = totalValorComBdi * 0.15;
                totalValorGlosa += valorMultaReincidenciaMensal;
            }

            totalValorLiquido = Math.max(0, totalValorComBdi - totalValorGlosa);

            return {
                items: arrayMateriais,
                totalOSsMedidas: countOSsComMaterial.size,
                totalHorasEletricista: totalHorasEletricista.toFixed(2),
                totalItensDiferentes: arrayMateriais.length,
                totalValorSemBdi: totalValorSemBdi,
                totalValorComBdi: totalValorComBdi,
                totalValorGlosa: totalValorGlosa,
                totalValorLiquido: totalValorLiquido,
                countItensComGlosa: countItensComGlosa,
                glosaPorOS: glosaPorOS,
                periodLabelBR: periodLabelBR,
                valorMultaReincidenciaMensal: valorMultaReincidenciaMensal,
                temReincidenciaReunioes: Boolean(infoReunioes && infoReunioes.temReincidencia)
            };
        }

        renderMedicaoMensal() {
            const tbody = document.getElementById('medicao-tbody');
            const emptyState = document.getElementById('medicao-empty-state');
            if (!tbody) return;

            const medicaoData = this.calcularMedicaoMensal();

            const badgePeriodo = document.getElementById('medicao-materiais-periodo-badge');
            if (badgePeriodo && medicaoData.periodLabelBR) {
                badgePeriodo.textContent = `Período: ${medicaoData.periodLabelBR}`;
            }

            const elTotalItens = document.getElementById('kpi-medicao-itens');
            const elTotalHoras = document.getElementById('kpi-medicao-horas');
            const elTotalOSs = document.getElementById('kpi-medicao-oss');
            const elValorBdi = document.getElementById('kpi-medicao-valor-bdi');
            const elValorSemBdi = document.getElementById('kpi-medicao-valor-sem-bdi');
            const elValorGlosa = document.getElementById('kpi-medicao-valor-glosa');
            const elValorLiquido = document.getElementById('kpi-medicao-valor-liquido');
            const elTagGlosa = document.getElementById('kpi-medicao-tag-glosa');
            const elBadgeContadorGlosas = document.getElementById('badge-contador-glosas-materiais');

            const formatCurrency = (val) => {
                return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            };

            if (elTotalItens) {
                const somaQtds = medicaoData.items.reduce((acc, i) => acc + i.quantidadeTotal, 0);
                elTotalItens.textContent = somaQtds.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
            }
            if (elTotalHoras) elTotalHoras.innerHTML = `${medicaoData.totalHorasEletricista} <span class="text-body-lg font-body-lg">H</span>`;
            if (elTotalOSs) elTotalOSs.textContent = medicaoData.totalOSsMedidas.toLocaleString('pt-BR');
            if (elValorBdi) elValorBdi.textContent = formatCurrency(medicaoData.totalValorComBdi);
            if (elValorSemBdi) elValorSemBdi.textContent = `s/ BDI: ${formatCurrency(medicaoData.totalValorSemBdi)}`;
            if (elValorGlosa) elValorGlosa.textContent = `- ${formatCurrency(medicaoData.totalValorGlosa)}`;
            if (elValorLiquido) elValorLiquido.textContent = formatCurrency(medicaoData.totalValorLiquido);
            
            if (elTagGlosa) {
                if (medicaoData.totalValorGlosa > 0) {
                    const percGlosado = medicaoData.totalValorComBdi > 0 ? ((medicaoData.totalValorGlosa / medicaoData.totalValorComBdi) * 100).toFixed(1) : '0.0';
                    elTagGlosa.textContent = `- ${percGlosado}% em glosas`;
                    elTagGlosa.classList.remove('hidden');
                } else {
                    elTagGlosa.classList.add('hidden');
                }
            }

            if (elBadgeContadorGlosas) {
                if (medicaoData.countItensComGlosa > 0) {
                    elBadgeContadorGlosas.textContent = `${medicaoData.countItensComGlosa} itens c/ glosa`;
                    elBadgeContadorGlosas.classList.remove('hidden');
                } else {
                    elBadgeContadorGlosas.classList.add('hidden');
                }
            }

            // Atualiza visibilidade dos cabeçalhos de coluna na tabela de materiais
            const thGlosa = document.getElementById('th-col-glosa');
            const thLiquido = document.getElementById('th-col-liquido');
            const thTotalBruto = document.getElementById('th-col-total-bruto');

            if (thGlosa) thGlosa.classList.toggle('hidden', !this.aplicarGlosasEmMateriais);
            if (thLiquido) thLiquido.classList.toggle('hidden', !this.aplicarGlosasEmMateriais);
            if (thTotalBruto) {
                thTotalBruto.textContent = this.aplicarGlosasEmMateriais ? 'Total Bruto' : 'Total (c/ BDI)';
                thTotalBruto.className = this.aplicarGlosasEmMateriais
                    ? 'py-3 px-3 text-right w-32 align-middle text-slate-800 font-bold'
                    : 'py-3 px-3 text-right w-32 align-middle text-emerald-800 font-bold';
            }

            // Atualiza estado visual dos botões do Toggle
            const btnBruto = document.getElementById('btn-toggle-modo-bruto');
            const btnGlosas = document.getElementById('btn-toggle-modo-glosas');
            const txtLegenda = document.getElementById('txt-legenda-modo-glosa');
            if (btnBruto && btnGlosas) {
                if (this.aplicarGlosasEmMateriais) {
                    btnBruto.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-on-surface-variant hover:text-on-surface';
                    btnGlosas.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer bg-rose-700 text-white shadow-xs';
                    if (txtLegenda) txtLegenda.textContent = 'Exibindo deduções contratuais do TR e valor líquido para faturamento.';
                } else {
                    btnBruto.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer bg-surface-container-lowest text-on-surface shadow-xs';
                    btnGlosas.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-on-surface-variant hover:text-on-surface';
                    if (txtLegenda) txtLegenda.textContent = 'Exibindo valores brutos integrais sem aplicação de glosas.';
                }
            }

            if (this.medicaoSubView === 'protocolo') {
                this.renderMedicaoPorProtocolo();
            }

            const descFilter = this.normalizarTexto(this.medicaoConsolidadoDescFilter);
            const protSearch = this.normalizarTexto(this.medicaoConsolidadoProtSearch);
            const protPrefix = (this.medicaoConsolidadoProtPrefix || '').toUpperCase();

            const indDesc = document.getElementById('medicao-mat-desc-filter-indicator');
            if (indDesc) indDesc.classList.toggle('hidden', !descFilter);

            const indProt = document.getElementById('medicao-mat-prot-filter-indicator');
            if (indProt) indProt.classList.toggle('hidden', !protSearch && !protPrefix);

            const filteredItems = medicaoData.items.filter(item => {
                if (descFilter) {
                    const descNorm = this.normalizarTexto(item.descricao);
                    const marcaNorm = this.normalizarTexto(item.marca);
                    if (!descNorm.includes(descFilter) && !marcaNorm.includes(descFilter)) {
                        return false;
                    }
                }

                if (protSearch || protPrefix) {
                    const protocols = Array.from(item.protocolosSet);
                    const hasMatch = protocols.some(p => {
                        const pUpper = String(p).toUpperCase();
                        if (protPrefix && !pUpper.startsWith(protPrefix)) return false;
                        if (protSearch && !this.normalizarTexto(p).includes(protSearch)) return false;
                        return true;
                    });
                    if (!hasMatch) return false;
                }

                return true;
            });

            this.medicaoConsolidadoFilteredItems = filteredItems;

            tbody.innerHTML = '';
            const tfoot = document.getElementById('medicao-tfoot');
            if (tfoot) tfoot.innerHTML = '';

            if (filteredItems.length === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            } else {
                if (emptyState) emptyState.classList.add('hidden');
            }

            let somaFiltradaQtd = 0;
            let somaFiltradaSemBdi = 0;
            let somaFiltradaComBdi = 0;
            let somaFiltradaGlosa = 0;
            let somaFiltradaLiquido = 0;

            filteredItems.forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-surface-container-low/50 transition-colors align-middle cursor-pointer group';
                tr.title = 'Clique para ver detalhes, glosas por OS e protocolos onde este item foi aplicado';
                tr.onclick = () => this.abrirModalDetalhesMedicao(item);

                const isHoras = item.unidade === 'H' || (item.descricao && item.descricao.toUpperCase().includes('ELETRICISTA'));
                const qtdFmt = isHoras ? item.quantidadeTotal.toFixed(2) : item.quantidadeTotal.toLocaleString('pt-BR');
                const unitSemBdiFmt = item.valorUnitario > 0 ? formatCurrency(item.valorUnitario) : '<span class="text-slate-400">R$ 0,00</span>';
                const unitComBdiFmt = item.valorUnitarioBdi > 0 ? formatCurrency(item.valorUnitarioBdi) : '<span class="text-slate-400">R$ 0,00</span>';
                const totalComBdiFmt = item.valorTotalComBdi > 0 ? formatCurrency(item.valorTotalComBdi) : '<span class="text-slate-400">R$ 0,00</span>';
                const glosaFmt = item.valorTotalGlosa > 0 ? `- ${formatCurrency(item.valorTotalGlosa)}` : '<span class="text-slate-300">—</span>';
                const liquidoFmt = formatCurrency(item.valorTotalLiquido);

                somaFiltradaQtd += item.quantidadeTotal;
                somaFiltradaSemBdi += (item.valorTotalSemBdi || 0);
                somaFiltradaComBdi += (item.valorTotalComBdi || 0);
                somaFiltradaGlosa += (item.valorTotalGlosa || 0);
                somaFiltradaLiquido += (item.valorTotalLiquido || 0);

                let badgeCategory = 'bg-blue-100 text-blue-800 border border-blue-200';
                if (isHoras) badgeCategory = 'bg-purple-100 text-purple-900 border border-purple-300 font-bold';

                const protList = Array.from(item.protocolosSet).slice(0, 3).join(', ') + (item.protocolosSet.size > 3 ? ` ... (+${item.protocolosSet.size - 3})` : '');

                let itemDisplayHtml = '';
                if (isHoras) {
                    itemDisplayHtml = `
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-amber-50 text-amber-950 border border-amber-300/80 shadow-2xs">
                            <span class="material-symbols-outlined text-amber-700 text-[16px] shrink-0">engineering</span>
                            <span class="font-semibold text-xs leading-tight">${item.descricao}</span>
                        </div>
                    `;
                } else {
                    itemDisplayHtml = `
                        <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs bg-surface-container-lowest text-slate-800 border border-outline-variant/70 shadow-2xs group-hover:border-purple-300 transition-colors">
                            <span class="material-symbols-outlined text-secondary text-[16px] shrink-0">inventory_2</span>
                            <span class="font-semibold text-xs leading-tight text-slate-800">${item.descricao}</span>
                            ${item.marca && item.marca !== 'PRÓPRIO' ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded shrink-0">${item.marca}</span>` : ''}
                        </div>
                    `;
                }

                const tdGlosaHtml = this.aplicarGlosasEmMateriais ? `
                    <td class="py-3 px-3 text-right font-mono text-xs whitespace-nowrap align-middle">
                        ${item.valorTotalGlosa > 0 ? `
                            <span class="inline-flex flex-col items-end">
                                <span class="font-bold text-rose-600">${glosaFmt}</span>
                                <span class="text-[10px] text-rose-500 font-sans font-medium">${item.qtdOSsGlosadas} OS(s) glosada(s)</span>
                            </span>
                        ` : '<span class="text-slate-300">—</span>'}
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs text-emerald-700 whitespace-nowrap align-middle">
                        ${liquidoFmt}
                    </td>
                ` : '';

                tr.innerHTML = `
                    <td class="py-3 px-4 align-middle">
                        ${itemDisplayHtml}
                    </td>
                    <td class="py-3 px-3 text-center font-bold text-xs uppercase whitespace-nowrap align-middle">
                        <span class="px-2 py-0.5 rounded ${isHoras ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}">
                            ${item.unidade}
                        </span>
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs ${isHoras ? 'text-purple-700' : 'text-secondary'} whitespace-nowrap align-middle">
                        ${qtdFmt}
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs text-purple-900 whitespace-nowrap align-middle">
                        ${unitComBdiFmt}
                    </td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs ${this.aplicarGlosasEmMateriais ? 'text-slate-800' : 'text-emerald-700'} whitespace-nowrap align-middle">
                        ${totalComBdiFmt}
                    </td>
                    ${tdGlosaHtml}
                    <td class="py-3 px-3 text-center font-bold text-xs whitespace-nowrap align-middle">${item.qtdOSsSet.size} OS(s)</td>
                    <td class="py-3 px-4 text-xs font-mono text-on-surface-variant truncate max-w-[200px] align-middle" title="${Array.from(item.protocolosSet).join(', ')}">
                        ${protList}
                    </td>
                `;

                tbody.appendChild(tr);
            });

            if (tfoot) {
                const tdTfootGlosa = this.aplicarGlosasEmMateriais ? `
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs text-rose-700">- ${formatCurrency(somaFiltradaGlosa)}</td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-xs text-emerald-800">${formatCurrency(somaFiltradaLiquido)}</td>
                ` : '';

                tfoot.innerHTML = `
                    <tr class="text-slate-800 bg-slate-100/90 border-t-2 border-slate-300">
                        <td class="py-3 px-4 uppercase tracking-wider font-bold text-xs">Totalização Geral (${filteredItems.length} itens)</td>
                        <td class="py-3 px-3 text-center text-xs text-slate-500 font-normal">--</td>
                        <td class="py-3 px-3 text-right font-mono font-bold text-xs text-secondary">${somaFiltradaQtd.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                        <td class="py-3 px-3 text-right font-mono font-bold text-xs text-purple-900">--</td>
                        <td class="py-3 px-3 text-right font-mono font-bold text-xs ${this.aplicarGlosasEmMateriais ? 'text-slate-800' : 'text-emerald-800'}">${formatCurrency(somaFiltradaComBdi)}</td>
                        ${tdTfootGlosa}
                        <td class="py-3 px-3 text-center font-bold text-xs">${medicaoData.totalOSsMedidas} OS(s)</td>
                        <td class="py-3 px-4 text-right text-[11px] text-slate-500 font-medium">BDI do Contrato: 21,50% incluso</td>
                    </tr>
                `;
            }

            this.atualizarBadgeReunioesSemanais();
        }

        switchMedicaoSubView(subView) {
            if (subView === 'protocolo') {
                this.switchTab('protocolos');
            } else {
                this.switchTab('materiais');
            }
        }

        setModoGlosa(aplicarGlosas) {
            this.aplicarGlosasEmMateriais = Boolean(aplicarGlosas);
            this.renderMedicaoMensal();
        }

        extrairMateriaisDaOS(item) {
            const matsDaOS = [];
            let totalQtdOS = 0;
            let totalHorasOS = 0;

            const rawMats = (item.materiaisConsolidados && Array.isArray(item.materiaisConsolidados) && item.materiaisConsolidados.length > 0)
                ? item.materiaisConsolidados
                : (item.materialsList || []);

            rawMats.forEach(matItem => {
                if (!matItem) return;
                let matStr = '';
                let qty = 1;

                if (typeof matItem === 'string') {
                    matStr = matItem;
                    const matchX = matStr.match(/\(x(\d+)\)/i);
                    if (matchX) {
                        qty = parseInt(matchX[1], 10) || 1;
                    } else {
                        const matchStartNum = matStr.match(/^(\d+)\s*x?\s+(.*)/i);
                        if (matchStartNum) {
                            qty = parseInt(matchStartNum[1], 10) || 1;
                            matStr = matchStartNum[2];
                        }
                    }
                } else if (typeof matItem === 'object') {
                    matStr = String(matItem.nome || matItem.descricao || matItem.material || matItem.material_nome || '').trim();
                    qty = Number(matItem.qtd || matItem.quantidade || matItem.qtd_usada) || 1;
                } else {
                    matStr = String(matItem).trim();
                }

                if (matStr) {
                    const { marca, desc, unidade, valorUnitario, valorUnitarioBdi } = this.resolveMarcaEMaterial(matStr, 'UN');
                    const vUnit = Number(valorUnitario) || 0;
                    const vUnitBdi = Number(valorUnitarioBdi) || 0;
                    matsDaOS.push({
                        marca: marca,
                        descricao: desc,
                        unidade: unidade || 'UN',
                        quantidade: qty,
                        valorUnitario: vUnit,
                        valorUnitarioBdi: vUnitBdi,
                        subtotalComBdi: qty * vUnitBdi,
                        categoria: 'Material Aplicado',
                        isMaoDeObra: false
                    });
                    totalQtdOS += qty;
                }
            });

            const prot = String(item.protocolo || '').trim().toUpperCase();
            const isPraca = Boolean(item.isPraca || (prot.startsWith('P') && !prot.startsWith('IP')));
            const sessoes = isPraca ? (item.sessoesList || []) : [];
            sessoes.forEach(sess => {
                let durMin = sess.duracao_minutos;
                if ((durMin === null || durMin === undefined || isNaN(durMin)) && sess.inicio && sess.fim) {
                    const dtInc = new Date(sess.inicio);
                    const dtFim = new Date(sess.fim);
                    if (!isNaN(dtInc.getTime()) && !isNaN(dtFim.getTime())) {
                        durMin = Math.max(1, Math.round((dtFim.getTime() - dtInc.getTime()) / 60000));
                    }
                }

                if (durMin && durMin > 0) {
                    const horasSessao = durMin / 60;
                    const numEletricistas = parseInt(sess.qtd_eletricistas, 10) || 1;
                    const totalHorasCalculadas = horasSessao * numEletricistas;

                    totalHorasOS += totalHorasCalculadas;

                    const resEletricista = this.resolveMarcaEMaterial('ELETRICISTA COM ENCARGOS COMPLEMENTARES (H)', 'H');
                    const vUnit = Number(resEletricista.valorUnitario) || 0;
                    const vUnitBdi = Number(resEletricista.valorUnitarioBdi) || 0;

                    matsDaOS.push({
                        marca: 'MÃO DE OBRA',
                        descricao: 'ELETRICISTA COM ENCARGOS COMPLEMENTARES (H)',
                        unidade: 'H',
                        quantidade: totalHorasCalculadas,
                        valorUnitario: vUnit,
                        valorUnitarioBdi: vUnitBdi,
                        subtotalComBdi: totalHorasCalculadas * vUnitBdi,
                        categoria: 'Sessão de Praça (Mão de Obra)',
                        isMaoDeObra: true
                    });
                }

                if (sess.materiais && Array.isArray(sess.materiais)) {
                    sess.materiais.forEach(sMat => {
                        const { marca, desc, unidade, valorUnitario, valorUnitarioBdi } = this.resolveMarcaEMaterial(sMat, 'UN');
                        const vUnit = Number(valorUnitario) || 0;
                        const vUnitBdi = Number(valorUnitarioBdi) || 0;
                        matsDaOS.push({
                            marca: marca,
                            descricao: desc,
                            unidade: unidade || 'UN',
                            quantidade: 1,
                            valorUnitario: vUnit,
                            valorUnitarioBdi: vUnitBdi,
                            subtotalComBdi: 1 * vUnitBdi,
                            categoria: 'Material em Sessão Praça',
                            isMaoDeObra: false
                        });
                        totalQtdOS += 1;
                    });
                }
            });

            return { matsDaOS, totalQtdOS, totalHorasOS };
        }

        calcularMedicaoPorProtocolo() {
            const selectedMonth = this.filtroMesAno;
            const status = this.medicaoFilters.status;
            const { startDate, endDate, periodLabelBR } = this.getMedicaoPeriodDates(selectedMonth);

            const listToMeasure = (this.chamadosList || []).filter(item => {
                if (status === 'concluida' && item.normalizedStatus !== 'concluida') {
                    return false;
                }

                const refDate = item.dataConclusao || item.dataAbertura;
                if (!refDate) return false;

                const t = (refDate instanceof Date) ? refDate.getTime() : new Date(refDate).getTime();
                return t >= startDate.getTime() && t <= endDate.getTime();
            });

            const protocolosResult = [];

            listToMeasure.forEach(item => {
                const prot = item.protocolo || 'OS-SEM-PROT';
                const { matsDaOS, totalQtdOS, totalHorasOS } = this.extrairMateriaisDaOS(item);

                if (matsDaOS.length > 0) {
                    const formatShortDate = (d) => {
                        if (!d) return '--/--/--';
                        const dt = (d instanceof Date) ? d : new Date(d);
                        const day = String(dt.getDate()).padStart(2, '0');
                        const month = String(dt.getMonth() + 1).padStart(2, '0');
                        const year = String(dt.getFullYear()).slice(-2);
                        return `${day}/${month}/${year}`;
                    };

                    let addressPoints = [];
                    if (item.addressPointsIniciais && Array.isArray(item.addressPointsIniciais) && item.addressPointsIniciais.length > 0) {
                        addressPoints = item.addressPointsIniciais;
                    } else if (item.pontosDetalhados && Array.isArray(item.pontosDetalhados) && item.pontosDetalhados.length > 0) {
                        addressPoints = item.pontosDetalhados.map(p => p.enderecoInicial || p.enderecoFinal || item.endereco).filter(Boolean);
                    }
                    if (addressPoints.length === 0) {
                        addressPoints = [item.endereco || item.pracaNome || 'Endereço não informado'];
                    }

                    protocolosResult.push({
                        protocolo: prot,
                        chamado: item,
                        isPraca: item.isPraca,
                        pracaNome: item.pracaNome || '',
                        tipoLabel: item.isPraca ? 'Praça Pública' : 'Viária',
                        status: item.statusBadgeLabel || item.status,
                        normalizedStatus: item.normalizedStatus,
                        dataAbertura: item.dataAbertura,
                        dataConclusao: item.dataConclusao,
                        dataRefStr: formatShortDate(item.dataConclusao || item.dataAbertura),
                        endereco: addressPoints[0] || item.endereco || item.pracaNome || 'Endereço não informado',
                        points: addressPoints,
                        problema: item.problemaEncontrado || item.problemaInicial || '',
                        materiais: matsDaOS,
                        totalQtdMateriais: totalQtdOS,
                        totalHorasEletricista: totalHorasOS,
                        tecnico: item.displayOperadorFinalizacao || item.displayOperadorAbertura || item.operador || 'Técnico Responsável'
                    });
                }
            });

            protocolosResult.sort((a, b) => {
                const dtA = a.dataConclusao ? (a.dataConclusao instanceof Date ? a.dataConclusao.getTime() : new Date(a.dataConclusao).getTime()) : (a.dataAbertura ? (a.dataAbertura instanceof Date ? a.dataAbertura.getTime() : new Date(a.dataAbertura).getTime()) : 0);
                const dtB = b.dataConclusao ? (b.dataConclusao instanceof Date ? b.dataConclusao.getTime() : new Date(b.dataConclusao).getTime()) : (b.dataAbertura ? (b.dataAbertura instanceof Date ? b.dataAbertura.getTime() : new Date(b.dataAbertura).getTime()) : 0);
                return dtB - dtA;
            });

            return {
                protocolos: protocolosResult,
                periodLabelBR: periodLabelBR
            };
        }

        renderMedicaoPorProtocolo() {
            const tbody = document.getElementById('medicao-protocolos-tbody');
            const emptyState = document.getElementById('medicao-protocolos-empty-state');
            if (!tbody) return;

            const data = this.calcularMedicaoPorProtocolo();
            const searchTerm = (this.medicaoProtocoloSearch || '').toLowerCase().trim();
            const colProtSearch = (this.medicaoColProtocolSearch || '').toLowerCase().trim();
            const tipoFilter = this.medicaoProtocoloTipo || 'all';
            const matFilter = (this.medicaoMaterialFilter || '').toLowerCase().trim();
            const statusFilterList = this.medicaoStatusFilterList || [];

            const filteredProtocols = data.protocolos.filter(os => {
                if (tipoFilter === 'viaria' && os.isPraca) return false;
                if (tipoFilter === 'praca' && !os.isPraca) return false;

                if (this.medicaoProtocolPrefix) {
                    const protUpper = String(os.protocolo || '').toUpperCase();
                    if (!protUpper.startsWith(this.medicaoProtocolPrefix)) return false;
                }

                if (colProtSearch && !String(os.protocolo || '').toLowerCase().includes(colProtSearch)) {
                    return false;
                }

                if (statusFilterList.length > 0) {
                    if (statusFilterList.includes('__none__')) return false;
                    if (!statusFilterList.includes(os.normalizedStatus)) return false;
                }

                if (matFilter) {
                    const matchMat = os.materiais.some(m => {
                        const mText = `${m.marca} ${m.descricao}`.toLowerCase();
                        return mText.includes(matFilter);
                    });
                    if (!matchMat) return false;
                }

                if (searchTerm) {
                    const matchProt = String(os.protocolo || '').toLowerCase().includes(searchTerm);
                    const matchEnd = String(os.endereco || '').toLowerCase().includes(searchTerm);
                    const matchTec = String(os.tecnico || '').toLowerCase().includes(searchTerm);
                    const matchProb = String(os.problema || '').toLowerCase().includes(searchTerm);
                    const matchMat = os.materiais.some(m => `${m.marca} ${m.descricao}`.toLowerCase().includes(searchTerm));
                    if (!matchProt && !matchEnd && !matchTec && !matchProb && !matchMat) return false;
                }

                return true;
            });

            tbody.innerHTML = '';
            if (filteredProtocols.length === 0) {
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            } else {
                if (emptyState) emptyState.classList.add('hidden');
            }

            const formatCurrency = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const formatShortDate = (dt) => {
                if (!dt) return '--/--';
                const d = (dt instanceof Date) ? dt : new Date(dt);
                if (isNaN(d.getTime())) return '--/--';
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${day}/${month}`;
            };

            filteredProtocols.forEach(os => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-surface-container-low/50 transition-colors align-top cursor-pointer group';
                tr.onclick = (e) => {
                    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
                    if (typeof window.abrirDetalhesOSModal === 'function') {
                        window.abrirDetalhesOSModal(os.protocolo);
                    }
                };

                let badgeSt = 'bg-blue-100 text-blue-800 border-blue-200';
                if (os.normalizedStatus === 'concluida') badgeSt = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                else if (os.normalizedStatus === 'cancelada' || os.normalizedStatus === 'rejeitada') badgeSt = 'bg-rose-100 text-rose-800 border-rose-200';
                else if (os.normalizedStatus === 'pendente') badgeSt = 'bg-amber-100 text-amber-800 border-amber-200';

                const materiaisChips = os.materiais.map(m => {
                    const isHoras = m.isMaoDeObra;
                    const qtdFmt = isHoras ? m.quantidade.toFixed(2) : m.quantidade;
                    const totalFmt = formatCurrency(m.subtotalComBdi);

                    if (isHoras) {
                        return `
                            <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-950 border border-amber-200 shadow-2xs font-medium">
                                <span class="material-symbols-outlined text-[13px] text-amber-700">engineering</span>
                                <span>${m.descricao}</span>
                                <span class="font-bold text-amber-800 font-mono whitespace-nowrap">(${qtdFmt} ${m.unidade})</span>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-surface-container-lowest text-slate-800 border border-outline-variant/60 shadow-2xs group-hover:border-purple-300 transition-colors">
                                <span class="material-symbols-outlined text-[13px] text-secondary">inventory_2</span>
                                <span class="font-medium">${m.descricao}</span>
                                ${m.marca && m.marca !== 'PRÓPRIO' ? `<span class="text-[9px] font-mono px-1 py-0.2 bg-purple-100 text-purple-800 border border-purple-200 rounded shrink-0">${m.marca}</span>` : ''}
                                <span class="font-bold text-secondary font-mono whitespace-nowrap">(${qtdFmt} ${m.unidade})</span>
                            </div>
                        `;
                    }
                }).join('');

                let enderecoHtml = '';
                if (os.points && os.points.length > 1) {
                    const firstPoint = os.points[0];
                    const extraPoints = os.points.slice(1);
                    enderecoHtml = `
                        <div class="flex flex-col gap-1 w-full">
                            <div class="flex items-start gap-1.5 w-full">
                                <button type="button" onclick="window.abrirMapaPonto('${os.protocolo}', 0, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors flex-1 min-w-0" title="Clique para abrir Ponto #1 no mapa Mapbox: ${firstPoint}">
                                    <span class="material-symbols-outlined text-[17px] text-secondary group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                                    <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${firstPoint}</span>
                                </button>
                                <button type="button" class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all cursor-pointer active:scale-95 shrink-0 border border-secondary/20" onclick="window.toggleInlinePoints(this, ${extraPoints.length}, event)" title="Expandir/Recolher pontos da OS">
                                    <span class="btn-text">+${extraPoints.length}</span>
                                    <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                                </button>
                            </div>
                            <div class="extra-points hidden flex-col gap-1.5 font-medium text-on-surface mt-1.5 w-full pl-2 border-l-2 border-secondary/30">
                                ${extraPoints.map((p, idx) => `
                                    <button type="button" onclick="window.abrirMapaPonto('${os.protocolo}', ${idx + 1}, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir Ponto #${idx + 2} no mapa Mapbox: ${p}">
                                        <span class="material-symbols-outlined text-[15px] text-secondary/80 group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                                        <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${p}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    const pText = (os.points && os.points[0]) || os.endereco || 'Endereço não informado';
                    enderecoHtml = `
                        <button type="button" onclick="window.abrirMapaPonto('${os.protocolo}', 0, event)" class="btn-mapa-endereco inline-flex items-start gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox: ${pText}">
                            <span class="material-symbols-outlined text-[17px] text-secondary group-hover/loc:scale-110 transition-transform shrink-0 mt-0.5">location_on</span>
                            <span class="font-medium group-hover/loc:underline text-xs leading-snug break-words text-left flex-1 min-w-0">${pText}</span>
                        </button>
                    `;
                }
                if (os.problema) {
                    enderecoHtml += `<div class="text-[10px] text-slate-500 break-words leading-tight pl-6 mt-1" title="${os.problema}">${os.problema}</div>`;
                }

                tr.innerHTML = `
                    <td class="py-3 px-3 font-mono font-bold text-xs whitespace-nowrap align-top">
                        <span class="text-secondary group-hover:underline font-bold" title="OS #${os.protocolo}">
                            ${os.protocolo}
                        </span>
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap align-top">
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeSt}">
                            ${os.status}
                        </span>
                    </td>
                    <td class="py-3 px-3 whitespace-nowrap align-top">
                        <span class="font-medium text-on-surface block">${formatShortDate(os.dataConclusao)}</span>
                        <span class="text-[10px] text-on-surface-variant">Abertura: ${formatShortDate(os.dataAbertura)}</span>
                    </td>
                    <td class="py-3 px-3 text-xs text-on-surface align-top overflow-hidden">
                        ${enderecoHtml}
                    </td>
                    <td class="py-3 px-4 align-top">
                        <div class="flex flex-wrap gap-1.5 py-0.5 w-full">
                            ${materiaisChips}
                        </div>
                    </td>
                `;

                tbody.appendChild(tr);
            });
        }

        setMedicaoProtocoloTipo(tipo) {
            this.medicaoProtocoloTipo = tipo;
            const btnAll = document.getElementById('btn-medicao-tipo-all');
            const btnViaria = document.getElementById('btn-medicao-tipo-viaria');
            const btnPraca = document.getElementById('btn-medicao-tipo-praca');

            const activeCls = 'px-2.5 py-1 text-xs font-bold rounded bg-purple-700 text-white shadow-2xs transition-all';
            const inactiveCls = 'px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:text-on-surface rounded transition-all';

            if (btnAll) btnAll.className = (tipo === 'all') ? activeCls : inactiveCls;
            if (btnViaria) btnViaria.className = (tipo === 'viaria') ? activeCls : inactiveCls;
            if (btnPraca) btnPraca.className = (tipo === 'praca') ? activeCls : inactiveCls;

            this.renderMedicaoPorProtocolo();
        }

        // =========================================================================
        // DROPDOWNS FLUTUANTES DE FILTRO (MATERIAIS E PROTOCOLOS)
        // =========================================================================

        closeAllMedicaoFilterDropdowns() {
            [
                'medicao-protocol-filter-dropdown',
                'medicao-status-filter-dropdown',
                'medicao-mat-filter-dropdown',
                'medicao-mat-desc-filter-dropdown',
                'medicao-mat-prot-filter-dropdown'
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.add('hidden');
                    el.style.display = 'none';
                }
            });
        }

        openFloatingDropdown(triggerBtn, dropdownEl, alignRight = false) {
            if (!triggerBtn || !dropdownEl) return;

            if (dropdownEl.parentElement !== document.body) {
                document.body.appendChild(dropdownEl);
            }

            const isCurrentlyHidden = dropdownEl.classList.contains('hidden') || dropdownEl.style.display === 'none';
            this.closeAllMedicaoFilterDropdowns();

            if (isCurrentlyHidden) {
                dropdownEl.style.position = 'fixed';
                dropdownEl.style.zIndex = '99999';
                dropdownEl.style.display = 'block';
                dropdownEl.classList.remove('hidden');

                const rect = triggerBtn.getBoundingClientRect();
                const dropdownHeight = dropdownEl.offsetHeight || 240;
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;

                if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                    dropdownEl.style.top = `${Math.max(12, rect.top - dropdownHeight - 6)}px`;
                } else {
                    dropdownEl.style.top = `${rect.bottom + 6}px`;
                }

                if (alignRight) {
                    dropdownEl.style.left = 'auto';
                    dropdownEl.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
                } else {
                    dropdownEl.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 300))}px`;
                    dropdownEl.style.right = 'auto';
                }
            }
        }

        toggleMedicaoProtocoloFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-protocolo-col-filter-trigger');
            const dropdown = document.getElementById('medicao-protocol-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
            const input = document.getElementById('medicao-protocol-search-col-input');
            if (input && dropdown && !dropdown.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        toggleMedicaoStatusFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-status-col-filter-trigger');
            const dropdown = document.getElementById('medicao-status-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
        }

        toggleMaterialFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const triggerBtn = document.getElementById('medicao-mat-filter-trigger');
            const dropdownEl = document.getElementById('medicao-mat-filter-dropdown');
            this.openFloatingDropdown(triggerBtn, dropdownEl);
            const input = document.getElementById('medicao-mat-search-input');
            if (input && dropdownEl && !dropdownEl.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        toggleMedicaoProtocolPrefix(prefix) {
            this.medicaoProtocolPrefix = (this.medicaoProtocolPrefix === prefix) ? '' : prefix;
            this.updateProtocolPrefixUI();
            this.renderMedicaoPorProtocolo();
        }

        updateProtocolPrefixUI() {
            const btnPraca = document.getElementById('medicao-protocol-btn-praca');
            const btnViaria = document.getElementById('medicao-protocol-btn-viaria');
            const activeClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-secondary text-white border-secondary shadow-xs';
            const inactiveClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-surface-container-high border-outline-variant/60 text-on-surface hover:bg-secondary/15 hover:text-secondary hover:border-secondary/40';

            if (btnPraca) btnPraca.className = (this.medicaoProtocolPrefix === 'P') ? activeClass : inactiveClass;
            if (btnViaria) btnViaria.className = (this.medicaoProtocolPrefix === 'I') ? activeClass : inactiveClass;
        }

        clearMedicaoProtocolFilter() {
            this.medicaoColProtocolSearch = '';
            this.medicaoProtocolPrefix = '';
            const input = document.getElementById('medicao-protocol-search-col-input');
            if (input) input.value = '';
            this.updateProtocolPrefixUI();
            this.closeAllMedicaoFilterDropdowns();
            this.renderMedicaoPorProtocolo();
        }

        clearMedicaoStatusFilter() {
            this.medicaoStatusFilterList = [];
            const allCb = document.getElementById('medicao-status-cb-all');
            if (allCb) allCb.checked = true;
            document.querySelectorAll('.medicao-status-cb').forEach(cb => cb.checked = true);
            this.closeAllMedicaoFilterDropdowns();
            this.renderMedicaoPorProtocolo();
        }

        onMedicaoStatusCheckboxChange() {
            const cbs = Array.from(document.querySelectorAll('.medicao-status-cb'));
            const allCb = document.getElementById('medicao-status-cb-all');
            const checkedValues = cbs.filter(cb => cb.checked).map(cb => cb.value);

            if (checkedValues.length === cbs.length) {
                if (allCb) allCb.checked = true;
                this.medicaoStatusFilterList = [];
            } else {
                if (allCb) allCb.checked = false;
                this.medicaoStatusFilterList = checkedValues.length > 0 ? checkedValues : ['__none__'];
            }
            this.renderMedicaoPorProtocolo();
        }

        onMedicaoStatusAllChange(e) {
            const checked = e.target.checked;
            document.querySelectorAll('.medicao-status-cb').forEach(cb => cb.checked = checked);
            this.medicaoStatusFilterList = checked ? [] : ['__none__'];
            this.renderMedicaoPorProtocolo();
        }

        clearMaterialFilter() {
            this.medicaoMaterialFilter = '';
            const input = document.getElementById('medicao-mat-search-input');
            if (input) input.value = '';
            const ind = document.getElementById('medicao-mat-filter-indicator');
            if (ind) ind.classList.add('hidden');
            this.closeAllMedicaoFilterDropdowns();
            this.renderMedicaoPorProtocolo();
        }

        toggleMedicaoMatDescFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-mat-desc-filter-trigger');
            const dropdown = document.getElementById('medicao-mat-desc-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
            const input = document.getElementById('medicao-mat-desc-search-input');
            if (input && dropdown && !dropdown.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        clearMedicaoMatDescFilter() {
            this.medicaoConsolidadoDescFilter = '';
            const input = document.getElementById('medicao-mat-desc-search-input');
            if (input) input.value = '';
            const ind = document.getElementById('medicao-mat-desc-filter-indicator');
            if (ind) ind.classList.add('hidden');
            this.closeAllMedicaoFilterDropdowns();
            this.renderMedicaoMensal();
        }

        toggleMedicaoMatProtFilterDropdown(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const trigger = document.getElementById('medicao-mat-prot-filter-trigger');
            const dropdown = document.getElementById('medicao-mat-prot-filter-dropdown');
            this.openFloatingDropdown(trigger, dropdown);
            const input = document.getElementById('medicao-mat-prot-search-input');
            if (input && dropdown && !dropdown.classList.contains('hidden')) {
                setTimeout(() => input.focus(), 50);
            }
        }

        toggleMedicaoMatProtPrefix(prefix) {
            this.medicaoConsolidadoProtPrefix = (this.medicaoConsolidadoProtPrefix === prefix) ? '' : prefix;
            this.updateMedicaoMatProtPrefixUI();
            this.renderMedicaoMensal();
        }

        updateMedicaoMatProtPrefixUI() {
            const btnPraca = document.getElementById('medicao-mat-prot-btn-praca');
            const btnViaria = document.getElementById('medicao-mat-prot-btn-viaria');
            const activeClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-secondary text-white border-secondary shadow-xs';
            const inactiveClass = 'protocol-type-btn flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all text-center flex items-center justify-center gap-1 cursor-pointer bg-surface-container-high border-outline-variant/60 text-on-surface hover:bg-secondary/15 hover:text-secondary hover:border-secondary/40';

            if (btnPraca) btnPraca.className = (this.medicaoConsolidadoProtPrefix === 'P') ? activeClass : inactiveClass;
            if (btnViaria) btnViaria.className = (this.medicaoConsolidadoProtPrefix === 'I') ? activeClass : inactiveClass;
        }

        clearMedicaoMatProtFilter() {
            this.medicaoConsolidadoProtSearch = '';
            this.medicaoConsolidadoProtPrefix = '';
            const input = document.getElementById('medicao-mat-prot-search-input');
            if (input) input.value = '';
            this.updateMedicaoMatProtPrefixUI();
            this.closeAllMedicaoFilterDropdowns();
            this.renderMedicaoMensal();
        }

        // =========================================================================
        // MODAL DE DETALHAMENTO & SUBSTITUIÇÃO EM LOTE
        // =========================================================================

        mostrarTodosMateriaisLote() {
            this.renderDropdownMateriaisLote('');
        }

        filtrarMateriaisLote() {
            const input = document.getElementById('input-novo-material-lote');
            const term = input ? input.value.toLowerCase().trim() : '';
            this.renderDropdownMateriaisLote(term);
        }

        renderDropdownMateriaisLote(filterText) {
            const dropdown = document.getElementById('dropdown-materiais-lote');
            if (!dropdown) return;
            dropdown.innerHTML = '';

            if (!this.materiaisContratoCache || this.materiaisContratoCache.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            const filtered = this.materiaisContratoCache.filter(row => {
                const dbDesc = (row['Material/Serviço'] || row.Material || row.Serviço || row.descricao || row.nome || row.material || row.item || row['material_servico'] || row['material/servico'] || '').trim();
                const dbMarca = (row.Marca || row.marca || row.Fabricante || row.fabricante || '').trim();
                const fullText = `${dbMarca} ${dbDesc}`.toLowerCase();
                return !filterText || fullText.includes(filterText);
            });

            if (filtered.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            filtered.slice(0, 40).forEach(row => {
                const dbDesc = (row['Material/Serviço'] || row.Material || row.Serviço || row.descricao || row.nome || row.material || row.item || row['material_servico'] || row['material/servico'] || '').trim();
                const dbMarca = (row.Marca || row.marca || row.Fabricante || row.fabricante || '').trim();
                const dbUnid = (row['Unidade de Medida'] || row.Unidade || row.unidade || row.und || '').trim();
                const labelStr = dbMarca ? `${dbMarca} - ${dbDesc} (${dbUnid || 'UN'})` : `${dbDesc} (${dbUnid || 'UN'})`;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'dropdown-item flex items-center justify-between gap-2';
                itemDiv.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="material-symbols-outlined text-[16px] text-purple-600 shrink-0">inventory_2</span>
                        <span class="truncate font-semibold text-slate-800 text-xs">${labelStr}</span>
                    </div>
                    ${dbMarca ? `<span class="text-[10px] font-mono font-bold uppercase bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200 shrink-0">${dbMarca}</span>` : ''}
                `;

                itemDiv.onmousedown = (e) => {
                    e.preventDefault();
                    const input = document.getElementById('input-novo-material-lote');
                    if (input) input.value = labelStr;
                    dropdown.style.display = 'none';
                };

                dropdown.appendChild(itemDiv);
            });

            dropdown.style.display = 'block';
        }

        atualizarCheckboxSelecionarTodos() {
            const checkboxes = Array.from(document.querySelectorAll('#tbody-protocolos-item .chk-protocolo-lote'));
            const checkedBoxes = Array.from(document.querySelectorAll('#tbody-protocolos-item .chk-protocolo-lote:checked'));
            const chkMaster = document.getElementById('chk-selecionar-todos-protocolos');
            if (chkMaster) {
                chkMaster.checked = (checkboxes.length > 0 && checkedBoxes.length === checkboxes.length);
                chkMaster.indeterminate = (checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length);
            }
        }

        abrirModalDetalhesMedicao(item) {
            if (!item) return;
            this.selectedMedicaoItem = item;

            const modal = document.getElementById('modal-detalhes-medicao');
            const elMarca = document.getElementById('info-modal-marca');
            const elDesc = document.getElementById('info-modal-descricao');
            const elQtdTotal = document.getElementById('info-modal-qtd-total');
            const elCountOSs = document.getElementById('info-modal-count-oss');
            const elCategoria = document.getElementById('badge-item-categoria');
            const elUnitSemBdi = document.getElementById('info-modal-unit-sem-bdi');
            const elUnitComBdi = document.getElementById('info-modal-unit-com-bdi');
            const elTotalMedido = document.getElementById('info-modal-total-medido');
            const elTotalGlosa = document.getElementById('info-modal-total-glosa');
            const elTotalLiquido = document.getElementById('info-modal-total-liquido');
            const inputNovoMat = document.getElementById('input-novo-material-lote');
            const inputQtdDe = document.getElementById('input-qtd-de-lote');
            const inputQtdPara = document.getElementById('input-qtd-para-lote');
            const tbodyProt = document.getElementById('tbody-protocolos-item');

            const formatCurrency = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            if (elMarca) elMarca.textContent = item.marca || 'PRÓPRIO';
            if (elDesc) elDesc.textContent = item.descricao || 'Item sem descrição';
            if (elQtdTotal) elQtdTotal.textContent = (item.unidade === 'H' ? item.quantidadeTotal.toFixed(2) : item.quantidadeTotal.toLocaleString('pt-BR')) + ' ' + item.unidade;
            if (elCountOSs) elCountOSs.textContent = `${item.protocolosSet.size} OS(s)`;
            if (elCategoria) elCategoria.textContent = item.categoria || 'Material';
            if (elUnitSemBdi) elUnitSemBdi.textContent = formatCurrency(item.valorUnitario);
            if (elUnitComBdi) elUnitComBdi.textContent = formatCurrency(item.valorUnitarioBdi);
            if (elTotalMedido) elTotalMedido.textContent = formatCurrency(item.valorTotalComBdi);
            if (elTotalGlosa) elTotalGlosa.textContent = item.valorTotalGlosa > 0 ? `- ${formatCurrency(item.valorTotalGlosa)}` : 'R$ 0,00';
            if (elTotalLiquido) elTotalLiquido.textContent = formatCurrency(item.valorTotalLiquido);
            if (inputNovoMat) inputNovoMat.value = '';
            if (inputQtdDe) inputQtdDe.value = '1';
            if (inputQtdPara) inputQtdPara.value = '1';

            const dropdownLote = document.getElementById('dropdown-materiais-lote');
            if (dropdownLote) dropdownLote.style.display = 'none';

            if (tbodyProt) {
                tbodyProt.innerHTML = '';
                const protArray = Array.from(item.protocolosSet);
                const chamadosEnvolvidos = (this.chamadosList || []).filter(ch => protArray.includes(ch.protocolo) || protArray.includes(ch.id));

                if (chamadosEnvolvidos.length === 0) {
                    tbodyProt.innerHTML = `
                        <tr>
                            <td colspan="8" class="py-6 text-center text-slate-500 italic">Nenhum protocolo encontrado na memória local.</td>
                        </tr>
                    `;
                } else {
                    chamadosEnvolvidos.forEach(chamado => {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-slate-100 hover:bg-purple-50/60 transition-colors align-middle cursor-pointer group';
                        
                        tr.onclick = (e) => {
                            if (e.target.tagName === 'INPUT' || e.target.closest('input') || e.target.closest('button')) return;
                            if (typeof window.abrirDetalhesOSModal === 'function') {
                                window.abrirDetalhesOSModal(chamado.protocolo);
                            }
                        };

                        const isPraca = chamado.isPraca;
                        const stNorm = chamado.normalizedStatus;

                        let badgeSt = 'bg-blue-100 text-blue-800 border-blue-200';
                        if (stNorm === 'concluida') badgeSt = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        else if (stNorm === 'cancelada' || stNorm === 'rejeitada') badgeSt = 'bg-rose-100 text-rose-800 border-rose-200';
                        else if (stNorm === 'pendente') badgeSt = 'bg-amber-100 text-amber-800 border-amber-200';

                        const rawProblemText = chamado.problemaEncontrado || chamado.problemaInicial || 'Outros problemas';
                        const problemText = (window.ChamadoModel && window.ChamadoModel.formatLocationText)
                            ? window.ChamadoModel.formatLocationText(rawProblemText)
                            : String(rawProblemText).trim();
                        const probLower = problemText.toLowerCase();

                        let problemBgColor = 'bg-slate-100 text-slate-700 border border-slate-200';
                        if (probLower.includes('queimada') || probLower.includes('apagada') || probLower.includes('intermitente') || probLower.includes('sem luz')) {
                            problemBgColor = 'bg-[#fef3c7] text-[#92400e] border border-amber-200';
                        } else if (probLower.includes('acesa')) {
                            problemBgColor = 'bg-[#dbeafe] text-[#1e40af] border border-blue-200';
                        } else if (probLower.includes('quebrada') || probLower.includes('braço') || probLower.includes('braco') || probLower.includes('danificada')) {
                            problemBgColor = 'bg-[#ffedd5] text-[#9a3412] border border-orange-200';
                        } else if (probLower.includes('nenhum')) {
                            problemBgColor = 'bg-[#d1fae5] text-[#065f46] border border-emerald-200';
                        }

                        let qtdItemNestaOS = 0;
                        const rawMats = (chamado.materiaisConsolidados && chamado.materiaisConsolidados.length > 0)
                            ? chamado.materiaisConsolidados
                            : (chamado.materialsList || []);
                        
                        rawMats.forEach(m => {
                            let mStr = typeof m === 'string' ? m : (m.nome || m.descricao || m.material || '');
                            let mQtd = typeof m === 'object' ? (m.qtd || m.quantidade || 1) : 1;
                            if (typeof m === 'string') {
                                const matchX = mStr.match(/\(x(\d+)\)/i);
                                if (matchX) mQtd = parseInt(matchX[1], 10) || 1;
                            }
                            const resolved = this.resolveMarcaEMaterial(mStr);
                            if (resolved.desc.toUpperCase() === item.descricao.toUpperCase() || mStr.toUpperCase().includes(item.descricao.toUpperCase())) {
                                qtdItemNestaOS += Number(mQtd);
                            }
                        });

                        if (qtdItemNestaOS === 0) qtdItemNestaOS = 1;

                        // Obter glosa da OS
                        let percGlosaOS = 0;
                        const pDet = item.protocolosDetalhados && item.protocolosDetalhados[chamado.protocolo];
                        if (pDet) {
                            percGlosaOS = pDet.percGlosa;
                        } else if (this.medicaoService) {
                            const infracoes = this.medicaoService.avaliarInfracoesOS(chamado);
                            infracoes.forEach(inf => {
                                if (!inf.anistiado) percGlosaOS += (Number(inf.percentualGlosa) || 0);
                            });
                            if (percGlosaOS > 100) percGlosaOS = 100;
                        }

                        const vUnitBdi = Number(item.valorUnitarioBdi) || 0;
                        const vBrutoItemOS = qtdItemNestaOS * vUnitBdi;
                        const vGlosaItemOS = vBrutoItemOS * (percGlosaOS / 100);
                        const vLiquidoItemOS = Math.max(0, vBrutoItemOS - vGlosaItemOS);

                        let badgeGlosaOS = '<span class="text-slate-300 font-mono text-xs">—</span>';
                        if (percGlosaOS > 0) {
                            badgeGlosaOS = `
                                <span class="inline-flex flex-col items-end">
                                    <span class="px-1.5 py-0.5 rounded text-[10.5px] font-bold font-mono bg-rose-100 text-rose-700 border border-rose-200">
                                        -${percGlosaOS}% (${formatCurrency(vGlosaItemOS)})
                                    </span>
                                </span>
                            `;
                        }

                        tr.innerHTML = `
                            <td class="py-2.5 px-3.5 text-center" onclick="event.stopPropagation()">
                                <input type="checkbox" class="chk-protocolo-lote rounded text-purple-700 focus:ring-purple-600 cursor-pointer" data-protocolo="${chamado.protocolo}" checked onchange="window.medicaoController.atualizarCheckboxSelecionarTodos()" />
                            </td>
                            <td class="py-2.5 px-3.5 font-mono font-bold text-slate-800 group-hover:text-purple-700 transition-colors">
                                <span class="underline underline-offset-2 decoration-purple-300">${chamado.protocolo}</span>
                            </td>
                            <td class="py-2.5 px-3.5 whitespace-nowrap">
                                <div class="flex items-center gap-1.5">
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${isPraca ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}">${isPraca ? 'Praça' : 'Viária'}</span>
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeSt}">${chamado.statusBadgeLabel || chamado.status}</span>
                                </div>
                            </td>
                            <td class="py-2.5 px-3.5 whitespace-nowrap">
                                <span class="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block text-center shadow-2xs ${problemBgColor}">
                                    ${problemText}
                                </span>
                            </td>
                            <td class="py-2.5 px-3.5 max-w-[220px] truncate text-slate-600 font-medium" title="${chamado.endereco}">
                                ${chamado.endereco || 'Sem endereço'}
                            </td>
                            <td class="py-2.5 px-3 text-center font-mono font-bold text-purple-700">
                                ${qtdItemNestaOS} ${item.unidade}
                            </td>
                            <td class="py-2.5 px-3 text-right">
                                ${badgeGlosaOS}
                            </td>
                            <td class="py-2.5 px-3 text-right font-mono font-bold text-xs text-emerald-700 whitespace-nowrap">
                                ${formatCurrency(vLiquidoItemOS)}
                            </td>
                        `;

                        tbodyProt.appendChild(tr);
                    });
                }
            }

            this.atualizarCheckboxSelecionarTodos();
            if (modal) modal.classList.remove('hidden');
        }

        fecharModalDetalhesMedicao() {
            const modal = document.getElementById('modal-detalhes-medicao');
            if (modal) modal.classList.add('hidden');
            this.selectedMedicaoItem = null;
        }

        toggleSelecionarTodosProtocolos(checked) {
            const checkboxes = document.querySelectorAll('#tbody-protocolos-item .chk-protocolo-lote');
            checkboxes.forEach(cb => cb.checked = checked);
        }

        async executarSubstituicaoLote() {
            if (!this.selectedMedicaoItem) {
                alert('Nenhum item selecionado para substituição.');
                return;
            }

            const inputNovoMat = document.getElementById('input-novo-material-lote');
            const inputQtdDe = document.getElementById('input-qtd-de-lote');
            const inputQtdPara = document.getElementById('input-qtd-para-lote');
            const btnExecutar = document.getElementById('btn-executar-substituicao-lote');

            const novoMatValue = inputNovoMat ? inputNovoMat.value.trim() : '';
            const qtdDe = inputQtdDe ? (parseInt(inputQtdDe.value, 10) || 1) : 1;
            const qtdPara = inputQtdPara ? (parseInt(inputQtdPara.value, 10) || 1) : 1;

            if (!novoMatValue) {
                alert('Por favor, digite ou selecione o novo material para realizar a substituição em lote.');
                if (inputNovoMat) inputNovoMat.focus();
                return;
            }

            const checkboxes = Array.from(document.querySelectorAll('#tbody-protocolos-item .chk-protocolo-lote:checked'));
            if (checkboxes.length === 0) {
                alert('Selecione pelo menos um protocolo na lista para aplicar a substituição.');
                return;
            }

            const itemAntigoDesc = this.selectedMedicaoItem.descricao;
            const numProtocolos = checkboxes.length;

            const confirmMsg = `Tem certeza que deseja substituir o item:\n\n` +
                `❌ ITEM ORIGINAL: "${itemAntigoDesc}"\n` +
                `✅ NOVO ITEM: "${novoMatValue}"\n\n` +
                `📊 QUANTIDADE: De ${qtdDe} para ${qtdPara}\n\n` +
                `em ${numProtocolos} protocolo(s) selecionado(s)?\n\n` +
                `Esta alteração atualizará os registros do banco de dados e gravará o histórico de auditamento com seu usuário.`;

            if (!confirm(confirmMsg)) return;

            if (btnExecutar) {
                btnExecutar.disabled = true;
                btnExecutar.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Substituindo...`;
            }

            try {
                let sucessos = 0;

                for (const cb of checkboxes) {
                    const protStr = cb.getAttribute('data-protocolo');
                    const chamado = (this.chamadosList || []).find(c => c.protocolo === protStr || c.id === protStr);

                    if (!chamado) continue;

                    if (chamado.fechamentosList && chamado.fechamentosList.length > 0) {
                        for (const fech of chamado.fechamentosList) {
                            let matArr = Array.isArray(fech.materiais) ? [...fech.materiais] : [];
                            let alterouFech = false;

                            let novosMats = matArr.map(mItem => {
                                let mNome = typeof mItem === 'string' ? mItem : (mItem.nome || mItem.descricao || mItem.material || '');
                                let mQtd = typeof mItem === 'object' ? (mItem.qtd || mItem.quantidade || 1) : 1;

                                if (typeof mItem === 'string') {
                                    const matchX = mNome.match(/\(x(\d+)\)/i);
                                    if (matchX) mQtd = parseInt(matchX[1], 10) || 1;
                                }

                                const resolved = this.resolveMarcaEMaterial(mNome);
                                if (resolved.desc.toUpperCase() === itemAntigoDesc.toUpperCase() || mNome.toUpperCase().includes(itemAntigoDesc.toUpperCase())) {
                                    alterouFech = true;
                                    return {
                                        nome: novoMatValue,
                                        qtd: qtdPara
                                    };
                                }
                                return mItem;
                            });

                            if (alterouFech && this.chamadosService) {
                                await this.chamadosService.updateMaterial(chamado.protocolo, novosMats, fech.id, fech.numero);
                            }
                        }
                    } else {
                        let matArr = Array.isArray(chamado.materialsList) ? [...chamado.materialsList] : (chamado.materialUtilizado ? [chamado.materialUtilizado] : []);
                        let alterouOS = false;

                        let novosMats = matArr.map(mItem => {
                            let mNome = typeof mItem === 'string' ? mItem : (mItem.nome || mItem.descricao || mItem.material || '');
                            let mQtd = typeof mItem === 'object' ? (mItem.qtd || mItem.quantidade || 1) : 1;

                            if (typeof mItem === 'string') {
                                const matchX = mNome.match(/\(x(\d+)\)/i);
                                if (matchX) mQtd = parseInt(matchX[1], 10) || 1;
                            }

                            const resolved = this.resolveMarcaEMaterial(mNome);
                            if (resolved.desc.toUpperCase() === itemAntigoDesc.toUpperCase() || mNome.toUpperCase().includes(itemAntigoDesc.toUpperCase())) {
                                alterouOS = true;
                                return {
                                    nome: novoMatValue,
                                    qtd: qtdPara
                                };
                            }
                            return mItem;
                        });

                        if (alterouOS && this.chamadosService) {
                            await this.chamadosService.updateMaterial(chamado.protocolo, novosMats);
                        }
                    }

                    if (window.LogsRepository) {
                        await window.LogsRepository.registrarLog({
                            protocolo: chamado.protocolo,
                            tabelaOrigem: chamado.isPraca ? 'ordens_servico_pracas' : 'ordens_servico',
                            tipoAcao: 'ALTERACAO_MATERIAL_EM_LOTE',
                            descricao: `Substituição em lote no Relatório de Medição: "${itemAntigoDesc}" alterado para "${novoMatValue}" (De ${qtdDe} para ${qtdPara})`,
                            dadosAnteriores: { material_anterior: itemAntigoDesc, quantidade_de: qtdDe },
                            dadosNovos: { material_novo: novoMatValue, quantidade_para: qtdPara },
                            origemTela: 'Medicao'
                        });
                    }

                    sucessos++;
                }

                alert(`✅ Substituição em lote realizada com sucesso em ${sucessos} protocolo(s)!`);
                this.fecharModalDetalhesMedicao();

                await this.carregarDados();
            } catch (err) {
                console.error('❌ [MedicaoController] Erro ao executar substituição em lote:', err);
                alert('⚠️ Ocorreu uma falha ao processar algumas alterações. Verifique o console para detalhes.');
            } finally {
                if (btnExecutar) {
                    btnExecutar.disabled = false;
                    btnExecutar.innerHTML = `<span class="material-symbols-outlined text-[18px]">transform</span><span>Mudar em Lote</span>`;
                }
            }
        }

        // =========================================================================
        // EXPORTAÇÃO CSV DE MEDIÇÃO
        // =========================================================================

        downloadCSV(filename, csvContent) {
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        }

        escapeCSVCell(cellValue) {
            if (cellValue === null || cellValue === undefined) return '""';
            let str = String(cellValue).replace(/"/g, '""');
            return `"${str}"`;
        }

        exportarAbaAtivaCSV() {
            if (this.activeTab === 'glosas') {
                this.exportarCSV();
            } else if (this.activeTab === 'protocolos' || this.medicaoSubView === 'protocolo') {
                this.exportarMedicaoPorProtocoloCSV();
            } else {
                this.exportarMedicaoMensalCSV();
            }
        }

        exportarMedicaoAtivaCSV() {
            this.exportarAbaAtivaCSV();
        }

        exportarMedicaoMensalCSV() {
            const medicaoData = this.calcularMedicaoMensal();
            const items = this.medicaoConsolidadoFilteredItems || medicaoData.items;
            if (!items || items.length === 0) {
                alert('Nenhum dado de medição disponível para o mês/filtro selecionado.');
                return;
            }

            const headers = [
                'Marca',
                'Descrição do Item de Contrato / Material',
                'Unidade',
                'Quantidade Medida no Mês',
                'Valor Unitário (s/ BDI)',
                'Valor Unitário (c/ BDI)',
                'Valor Total Bruto (c/ BDI)',
                'Glosa Contratual TR',
                'Valor Total Líquido',
                'Qtd. OSs Onde Foi Aplicado',
                'Qtd. OSs com Glosa',
                'Origem / Tipo de Item',
                'Protocolos de Ordens de Serviço'
            ];

            let csvLines = [headers.join(';')];

            items.forEach(item => {
                const isHoras = item.unidade === 'H' || (item.descricao && item.descricao.toUpperCase().includes('ELETRICISTA'));
                const qtdFmt = isHoras ? item.quantidadeTotal.toFixed(2) : item.quantidadeTotal;
                const unitSemBdiFmt = (item.valorUnitario || 0).toFixed(2).replace('.', ',');
                const unitComBdiFmt = (item.valorUnitarioBdi || 0).toFixed(2).replace('.', ',');
                const totalComBdiFmt = (item.valorTotalComBdi || 0).toFixed(2).replace('.', ',');
                const totalGlosaFmt = (item.valorTotalGlosa || 0).toFixed(2).replace('.', ',');
                const totalLiquidoFmt = (item.valorTotalLiquido !== undefined ? item.valorTotalLiquido : item.valorTotalComBdi).toFixed(2).replace('.', ',');

                const row = [
                    this.escapeCSVCell(item.marca),
                    this.escapeCSVCell(item.descricao),
                    this.escapeCSVCell(item.unidade),
                    this.escapeCSVCell(qtdFmt),
                    this.escapeCSVCell(`R$ ${unitSemBdiFmt}`),
                    this.escapeCSVCell(`R$ ${unitComBdiFmt}`),
                    this.escapeCSVCell(`R$ ${totalComBdiFmt}`),
                    this.escapeCSVCell(`R$ ${totalGlosaFmt}`),
                    this.escapeCSVCell(`R$ ${totalLiquidoFmt}`),
                    this.escapeCSVCell(item.qtdOSsSet.size),
                    this.escapeCSVCell(item.qtdOSsGlosadas || 0),
                    this.escapeCSVCell(item.categoria),
                    this.escapeCSVCell(Array.from(item.protocolosSet).join(' | '))
                ];
                csvLines.push(row.join(';'));
            });

            const periodLabel = this.filtroMesAno || 'Mes_Atual';
            const dateStr = new Date().toISOString().split('T')[0];
            this.downloadCSV(`Medicao_Mensal_Materiais_E_Sessoes_${periodLabel}_${dateStr}.csv`, csvLines.join('\n'));
        }

        exportarMedicaoPorProtocoloCSV() {
            const data = this.calcularMedicaoPorProtocolo();
            if (!data.protocolos || data.protocolos.length === 0) {
                alert('Nenhuma ordem de serviço com materiais disponível para o mês selecionado.');
                return;
            }

            const headers = [
                'Protocolo',
                'Tipo OS',
                'Status',
                'Data Conclusão / Referência',
                'Endereço / Praça',
                'Problema',
                'Marca Material / Serviço',
                'Descrição Material / Serviço',
                'Unidade',
                'Quantidade Utilizada',
                'Valor Unitário (s/ BDI)',
                'Valor Unitário (c/ BDI)',
                'Subtotal (c/ BDI)',
                'Categoria / Origem',
                'Técnico Responsável'
            ];

            let csvLines = [headers.join(';')];

            data.protocolos.forEach(os => {
                os.materiais.forEach(m => {
                    const qtdFmt = m.isMaoDeObra ? m.quantidade.toFixed(2) : m.quantidade;
                    const unitSemBdiFmt = (m.valorUnitario || 0).toFixed(2).replace('.', ',');
                    const unitComBdiFmt = (m.valorUnitarioBdi || 0).toFixed(2).replace('.', ',');
                    const subtotalComBdiFmt = (m.subtotalComBdi || 0).toFixed(2).replace('.', ',');

                    const row = [
                        this.escapeCSVCell(os.protocolo),
                        this.escapeCSVCell(os.tipoLabel),
                        this.escapeCSVCell(os.status),
                        this.escapeCSVCell(os.dataRefStr),
                        this.escapeCSVCell(os.endereco),
                        this.escapeCSVCell(os.problema),
                        this.escapeCSVCell(m.marca),
                        this.escapeCSVCell(m.descricao),
                        this.escapeCSVCell(m.unidade),
                        this.escapeCSVCell(qtdFmt),
                        this.escapeCSVCell(`R$ ${unitSemBdiFmt}`),
                        this.escapeCSVCell(`R$ ${unitComBdiFmt}`),
                        this.escapeCSVCell(`R$ ${subtotalComBdiFmt}`),
                        this.escapeCSVCell(m.categoria),
                        this.escapeCSVCell(os.tecnico)
                    ];
                    csvLines.push(row.join(';'));
                });
            });

            const periodLabel = this.filtroMesAno || 'Mes_Atual';
            const dateStr = new Date().toISOString().split('T')[0];
            this.downloadCSV(`Medicao_Mensal_Por_Protocolo_${periodLabel}_${dateStr}.csv`, csvLines.join('\n'));
        }

        exibirLoading(show) {
            const el = document.getElementById('loadingIndicatorMedicao');
            if (el) el.classList.toggle('hidden', !show);
        }
    }

    window.MedicaoController = MedicaoController;
    window.medicaoController = new MedicaoController();
    document.addEventListener('DOMContentLoaded', () => window.medicaoController.init());
})();
