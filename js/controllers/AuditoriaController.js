/**
 * Controller Layer - Auditoria Controller
 * Orchestrates data loading, rendering, and interaction logic for Auditoria.html.
 */

class AuditoriaController {
    constructor() {
        this.service = new window.ChamadosService();
        this.chamadosList = [];
        this.concludedList = [];
    }

    /**
     * Initializes the controller on DOM ready
     */
    async init() {
        console.log('🚀 [AuditoriaController] Inicializando controlador de Auditoria com Supabase...');
        if (window.AuthGuard) {
            const authData = await window.AuthGuard.requireAuth();
            if (!authData) return;
            const role = window.AuthGuard.getUserRole(authData.user, authData.profile);
            if (role !== 'admin') {
                const redirectUrl = window.AuthGuard.getRedirectUrlForUser(authData);
                try { if (document.documentElement) document.documentElement.style.display = 'none'; } catch(e) {}
                window.location.href = redirectUrl;
                return;
            }
        }
        this.syncHeaderTooltips();
        this.bindEvents();
        await this.loadData();
    }

    /**
     * Sincroniza os tooltips dos cabeçalhos da tabela de auditoria a partir de ChamadoModel.AUDIT_RULES
     */
    syncHeaderTooltips() {
        const rules = window.ChamadoModel ? window.ChamadoModel.AUDIT_RULES : [];
        if (!rules || !rules.length) return;

        const ths = document.querySelectorAll('th.th-vertical[data-col]');
        ths.forEach(th => {
            const dataCol = th.getAttribute('data-col');
            const colIdx = parseInt(dataCol, 10) - 3;
            if (colIdx >= 0 && colIdx < rules.length) {
                const rule = rules[colIdx];
                th.setAttribute('title', `Aponta SIM quando: ${rule.explicacao}`);
                th.setAttribute('data-audit-explicacao', rule.explicacao);
                const tooltipBody = th.querySelector('.header-tooltip div:last-child');
                if (tooltipBody) {
                    tooltipBody.innerHTML = rule.explicacao;
                }
            }
        });
        this.setupGlobalAuditTooltip();
    }

    /**
     * Setups a single global fixed tooltip for audit cards and table headers to avoid overflow clipping
     */
    setupGlobalAuditTooltip() {
        const getOrCreatePopover = () => {
            let popover = document.getElementById('audit-global-popover');
            if (!popover) {
                popover = document.createElement('div');
                popover.id = 'audit-global-popover';
                popover.style.cssText = 'position: fixed; display: none; padding: 10px 14px; background-color: #0f172a; color: #ffffff; font-size: 11px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5); border: 1px solid #334155; max-width: 260px; z-index: 99999999; pointer-events: none; opacity: 0; transition: opacity 0.15s ease; text-align: left;';
                popover.innerHTML = `
                    <div style="font-weight: 700; color: #fbbf24; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Aponta SIM quando:</div>
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

            const popover = getOrCreatePopover();
            const popoverText = popover.querySelector('#audit-global-popover-text');
            if (!popoverText) return;

            activeTarget = target;
            popoverText.textContent = explicacao;
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

        window.addEventListener('scroll', hideTooltip, true);
    }

    /**
     * Binds general event listeners for search and refresh
     */
    bindEvents() {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (typeof window.applyCombinedFilters === 'function') {
                    window.applyCombinedFilters();
                }
            });
        }

        // Event delegation for table row clicks
        const osTable = document.getElementById('os-table');
        if (osTable) {
            osTable.addEventListener('click', (e) => {
                if (e.target.closest('button, select, input, a')) return;
                const row = e.target.closest('tr[data-id]');
                if (row) {
                    const id = row.getAttribute('data-id');
                    if (id && typeof window.abrirDetalhesOSModal === 'function') {
                        window.abrirDetalhesOSModal(id);
                    }
                }
            });
        }
    }

    /**
     * Loads audit data from Supabase view vw_auditoria_chamados and base table
     */
    async loadData() {
        try {
            this.chamadosList = await this.service.getAuditoriaChamadosList();
            window.chamadosListCache = this.chamadosList;
            
            // Filter STRICTLY for CURRENTLY CONCLUDED OSs ('concluida')
            // Reopened OSs ('aberta') are excluded even if they retain a past data_conclusao timestamp.
            this.concludedList = this.chamadosList.filter(item => item.normalizedStatus === 'concluida');

            // Ordenar da data mais antiga para a mais nova (ascendente)
            this.concludedList.sort((a, b) => {
                const getTime = (item) => {
                    if (item.dataConclusao && !isNaN(new Date(item.dataConclusao).getTime())) return new Date(item.dataConclusao).getTime();
                    if (item.dataAbertura && !isNaN(new Date(item.dataAbertura).getTime())) return new Date(item.dataAbertura).getTime();
                    return 0;
                };
                return getTime(a) - getTime(b);
            });

            this.auditDivergentList = this.concludedList.filter(item => item.hasDivergence);

            console.log(`✅ [AuditoriaController] ${this.concludedList.length} OSs com status Concluída encontradas. (${this.auditDivergentList.length} com divergências 'S')`);

            this.updateKPIs(this.concludedList);
            this.renderOSTable(this.auditDivergentList);
            this.renderCompletedTable(this.concludedList);

            // Re-apply filter logic if available
            if (typeof window.applyCombinedFilters === 'function') {
                window.applyCombinedFilters();
            }
            if (typeof window.applyCompletedServicesFilters === 'function') {
                window.applyCompletedServicesFilters();
            }
        } catch (err) {
            console.error('❌ [AuditoriaController] Erro ao carregar dados de auditoria:', err);
        }
    }

    /**
     * Updates KPI metric cards with real data calculations for concluded OSs
     */
    updateKPIs(auditList = []) {
        const metrics = this.service.calculateAuditoriaMetrics(auditList);

        const totalCard = document.getElementById('kpi-total-auditadas');
        const divCard = document.getElementById('kpi-com-divergencias');
        const confCard = document.getElementById('kpi-em-conformidade');
        const rateCard = document.getElementById('kpi-taxa-conformidade');

        if (totalCard) totalCard.textContent = metrics.totalAuditadas;
        if (divCard) divCard.textContent = metrics.comDivergencias;
        if (confCard) confCard.textContent = metrics.emConformidade;
        if (rateCard) rateCard.textContent = metrics.conformityRate;
    }

    /**
     * Renders main Audit Table rows (Filtered strictly for Concluded OSs with at least one 'S' divergence)
     */
    renderOSTable(auditList = []) {
        const tbody = document.querySelector('#os-table tbody');
        if (!tbody) return;

        // Filter strictly for items that have at least one 'S' divergence flag
        const divergentOnly = auditList.filter(item => item.hasDivergence);

        // Keep empty state row
        const emptyRowHtml = `
            <tr id="no-audit-results" class="${divergentOnly.length === 0 ? '' : 'hidden'}">
                <td colspan="14" class="py-8 text-center text-on-surface-variant/70 font-medium bg-surface-container-lowest">
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <span class="material-symbols-outlined text-[24px] text-on-surface-variant/40">filter_alt_off</span>
                        <span class="text-xs">Nenhuma ordem de serviço com divergência (S) encontrada para auditoria.</span>
                        <button class="text-secondary font-label-md text-xs hover:underline mt-0.5 cursor-pointer" onclick="clearAllFilters()">Limpar todos os filtros</button>
                    </div>
                </td>
            </tr>
        `;

        const rowsHtml = divergentOnly.map(item => this.createAuditRowHtml(item)).join('');
        tbody.innerHTML = emptyRowHtml + rowsHtml;
    }

    /**
     * Generates HTML string for single audit row
     */
    createAuditRowHtml(item) {
        const addressLines = item.addressPoints;
        let locationDisplayHtml = '';

        if (addressLines.length > 1) {
            const firstLine = addressLines[0];
            const extraCount = addressLines.length - 1;
            const extraLinesHtml = addressLines.slice(1).map((line, idx) => `
                <button onclick="window.abrirMapaPonto('${item.id}', ${idx + 1}, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
                    <span class="material-symbols-outlined text-[16px] text-secondary/80 group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                    <span class="font-medium truncate group-hover/loc:underline" title="${line}">${line}</span>
                </button>
            `).join('');

            locationDisplayHtml = `
                <div class="flex flex-col gap-1 w-full text-left">
                    <div class="flex items-center gap-1 min-w-0 w-full">
                        <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors flex-1 min-w-0" title="Clique para abrir no mapa Mapbox">
                            <span class="material-symbols-outlined text-[16px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                            <span class="font-medium truncate group-hover/loc:underline" title="${firstLine}">${firstLine}</span>
                        </button>
                        <button class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all flex-shrink-0 cursor-pointer border border-secondary/20" onclick="toggleInlinePoints(this, ${extraCount}, event)" title="Expandir/Recolher pontos">
                            <span class="btn-text">+${extraCount}</span>
                            <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                        </button>
                    </div>
                    <div class="extra-points hidden flex-col gap-1 pt-1 border-t border-outline-variant/30 text-on-surface-variant font-normal text-xs transition-all w-full">
                        ${extraLinesHtml}
                    </div>
                </div>
            `;
        } else {
            const pointText = addressLines[0] || 'Ponto não informado';
            locationDisplayHtml = `
                <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
                    <span class="material-symbols-outlined text-[16px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                    <span class="font-medium truncate group-hover/loc:underline" title="${pointText}">${pointText}</span>
                </button>
            `;
        }

        const renderBadge = (isTrue, titleAttr = '') => `
            <span class="audit-badge ${isTrue ? 'audit-s' : 'audit-n'}" ${titleAttr ? `title="${titleAttr}"` : ''}>${isTrue ? 'S' : 'N'}</span>
        `;

        const distM = (item.distanciaCalculadaMetros !== undefined && item.distanciaCalculadaMetros !== null) 
            ? item.distanciaCalculadaMetros 
            : (window.ChamadoModel ? window.ChamadoModel.calcularDistanciaMetros(item.coordenadaInicial, item.coordenadaReparo) : null);
        const distTitle = (distM !== null && !isNaN(distM)) ? `Distância Abertura -> Reparo: ${Math.round(distM)} metros` : 'Distância não calculada';

        const isCompleted = item.isAuditoriaConcluida;

        return `
            <tr class="border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-surface-container-lowest align-middle ${isCompleted ? 'opacity-70' : ''}" data-id="${item.id}" data-completed="${isCompleted}" onclick="window.abrirDetalhesOSModal('${item.id}')">
                <td class="py-3 px-4 font-medium whitespace-nowrap truncate align-middle text-on-surface">${item.protocolo}</td>
                <td class="py-3 px-3 text-on-surface-variant whitespace-nowrap truncate align-middle">${item.formattedDateConclusaoShort}</td>
                <td class="py-3 px-4 whitespace-nowrap truncate align-middle">${locationDisplayHtml}</td>
                
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isProblemaDivergente)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isPlaquetaDivergente)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isQuantidadeDivergente)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isDistanciaAcima100m, distTitle)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isOutraPlaquetaProxima)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isPlaquetaProblematica)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isPrecisaAnexarFoto)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isAnexoFaltante)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isMaterialDivergente)}</td>
                <td class="py-3 px-1 text-center align-middle border-l border-outline-variant/20">${renderBadge(item.isProblemaExterno)}</td>
                
                <td class="py-3 px-3 whitespace-nowrap truncate text-center align-middle border-l border-outline-variant/20">
                    <div class="flex items-center justify-center gap-1 action-buttons">
                        ${isCompleted ? `
                            <button class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors btn-uncomplete cursor-pointer" onclick="desfazerAuditoria(this, event)" title="Desfazer Auditoria">
                                <span class="material-symbols-outlined text-[18px]">undo</span>
                            </button>
                        ` : `
                            <button class="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 transition-colors btn-complete cursor-pointer" onclick="concluirAuditoria(this, event)" title="Concluir Auditoria">
                                <span class="material-symbols-outlined text-[18px]">check_circle</span>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Renders Completed Services Table rows using Finalization/Conclusao data
     */
    renderCompletedTable(auditList = []) {
        const tbody = document.querySelector('#completed-services-table tbody');
        if (!tbody) return;

        const emptyRowHtml = `
            <tr id="no-completed-results" class="${auditList.length === 0 ? '' : 'hidden'}">
                <td colspan="7" class="py-8 text-center text-on-surface-variant/70 font-medium bg-surface-container-lowest">
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <span class="material-symbols-outlined text-[24px] text-on-surface-variant/40">filter_alt_off</span>
                        <span class="text-xs">Nenhum serviço finalizado encontrado.</span>
                        <button class="text-secondary font-label-md text-xs hover:underline mt-0.5 cursor-pointer" onclick="clearAllCompFilters()">Limpar filtros de serviços</button>
                    </div>
                </td>
            </tr>
        `;

        const rowsHtml = auditList.map(item => this.createCompletedRowHtml(item)).join('');
        tbody.innerHTML = emptyRowHtml + rowsHtml;

        // Update count badge
        const badge = document.querySelector('#completed-services-table')?.closest('.col-span-12')?.querySelector('.px-2\\.5');
        if (badge) {
            badge.textContent = `${auditList.length} Registros`;
        }
    }

    /**
     * Generates HTML string for single completed service row using finalization fields
     */
    createCompletedRowHtml(item) {
        // Finalization Plaqueta (plaqueta_final)
        const plaquetaFinal = item.plaquetaFinal || item.plaquetaInicial || 'Não informada';
        
        // Finalization Coordinate (coordenada_reparo or coordenada_inicial)
        const rawCoord = item.coordenadaReparo || item.coordenadaInicial;
        const coordPair = window.ChamadoModel.formatCoordPair(rawCoord);
        const lat = coordPair.lat;
        const lng = coordPair.lng;

        // Finalization Material (material_utilizado)
        const rawMat = item.materialUtilizado || item.material_utilizado || item.formattedMaterialUtilizado;
        const materialsList = (item.materialsList && Array.isArray(item.materialsList) && item.materialsList.length > 0)
            ? item.materialsList
            : (window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(rawMat) : [String(rawMat || 'Lâmpada LED 50W')]);
        let materialsDisplayHtml = '';

        if (materialsList.length > 1) {
            const firstMat = materialsList[0];
            const extraCount = materialsList.length - 1;
            const extraMatsHtml = materialsList.slice(1).map(mat => `
                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] font-medium bg-slate-100/90 text-slate-700 border border-slate-200/60 w-full min-w-0" title="${mat}">
                    <span class="material-symbols-outlined text-[13px] text-slate-400 flex-shrink-0">build</span>
                    <span class="truncate">${mat}</span>
                </div>
            `).join('');

            materialsDisplayHtml = `
                <div class="flex flex-col gap-1 w-full text-left">
                    <div class="flex items-center gap-1.5 min-w-0 w-full">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100/90 text-slate-800 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] min-w-0 flex-1" title="${firstMat}">
                            <span class="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0">inventory_2</span>
                            <span class="truncate">${firstMat}</span>
                        </span>
                        <button class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all flex-shrink-0 cursor-pointer active:scale-95 border border-secondary/20" onclick="toggleInlinePoints(this, ${extraCount}, event)" title="Expandir/Recolher materiais">
                            <span class="btn-text">+${extraCount}</span>
                            <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                        </button>
                    </div>
                    <div class="extra-points hidden flex-col gap-1 pt-1 border-t border-outline-variant/30 transition-all w-full">
                        ${extraMatsHtml}
                    </div>
                </div>
            `;
        } else {
            const singleMat = materialsList[0] || 'Lâmpada LED 50W';
            materialsDisplayHtml = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100/90 text-slate-800 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-w-full" title="${singleMat}">
                    <span class="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0">inventory_2</span>
                    <span class="truncate">${singleMat}</span>
                </span>
            `;
        }
        
        // Finalization Quantity (qtd_final)
        const qtdFinal = item.qtdFinal || item.qtdInicial || 1;

        // Finalization Problem (problema_encontrado)
        const selectedProblemVal = item.problemEncontradoSelectValue;
        const problemLabels = {
            'lampada-queimada': 'Lâmpada Queimada',
            'acesa-dia': 'Acesa Dia',
            'lampada-quebrada': 'Lâmpada Quebrada',
            'outro': 'Outro'
        };
        let problemBgColor = 'bg-[#f3f4f6] text-[#374151]';
        if (selectedProblemVal === 'lampada-queimada') problemBgColor = 'bg-[#fef3c7] text-[#92400e]';
        if (selectedProblemVal === 'acesa-dia') problemBgColor = 'bg-[#dbeafe] text-[#1e40af]';
        if (selectedProblemVal === 'lampada-quebrada') problemBgColor = 'bg-[#ffedd5] text-[#9a3412]';

        const problemText = problemLabels[selectedProblemVal] || item.problemaEncontrado || item.problemaInicial || 'Outro';

        // Finalization Date (data_conclusao)
        const dateConclusaoText = item.formattedDateConclusaoShort;

        const distM = (item.distanciaCalculadaMetros !== undefined && item.distanciaCalculadaMetros !== null) 
            ? item.distanciaCalculadaMetros 
            : (window.ChamadoModel ? window.ChamadoModel.calcularDistanciaMetros(item.coordenadaInicial, item.coordenadaReparo) : null);
        let distBadgeTable = '';
        if (distM !== null && !isNaN(distM)) {
            const distTxt = distM < 1000 ? `${Math.round(distM)}m` : `${(distM/1000).toFixed(1)}km`;
            const colorCls = distM > 100 ? 'bg-rose-100 text-rose-800 border-rose-200 font-bold' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            distBadgeTable = `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono border ${colorCls} mt-1" title="Distância entre a abertura e o reparo"><span class="material-symbols-outlined text-[11px]">straighten</span>${distTxt}</span>`;
        }

        return `
            <tr class="border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] relative z-0 hover:z-10 bg-surface-container-lowest align-middle" data-id="${item.id}" onclick="window.abrirDetalhesOSModal('${item.id}')">
                <td class="py-3 px-4 font-medium text-on-surface whitespace-nowrap truncate align-middle">${item.protocolo}</td>
                <td class="py-3 px-4 text-on-surface-variant whitespace-nowrap truncate align-middle font-medium">${dateConclusaoText}</td>
                <td class="py-3 px-4 font-semibold text-primary whitespace-nowrap truncate align-middle">${plaquetaFinal}</td>
                <td class="py-3 px-4 align-middle">
                    <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
                        <span class="material-symbols-outlined text-[16px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                        <div class="flex flex-col text-xs font-mono text-on-surface-variant group-hover/loc:text-secondary leading-tight min-w-0">
                            <span class="font-medium group-hover/loc:underline" title="${lat}">${lat}</span>
                            <span class="text-on-surface-variant/70 group-hover/loc:text-secondary/80 group-hover/loc:underline" title="${lng}">${lng}</span>
                            ${distBadgeTable}
                        </div>
                    </button>
                </td>
                <td class="py-3 px-4 whitespace-nowrap truncate align-middle" data-problem-value="${selectedProblemVal}">
                    <span class="px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[160px] ${problemBgColor}">
                        ${problemText}
                    </span>
                </td>
                <td class="py-3 px-4 text-center font-semibold text-on-surface align-middle">${qtdFinal}</td>
                <td class="py-3 px-4 align-middle">
                    ${materialsDisplayHtml}
                </td>
            </tr>
        `;
    }

    /**
     * Persists 'Concluída' audit status for specific OS ID
     */
    async concluirAuditoria(id) {
        const item = this.chamadosList.find(c => String(c.id) === String(id));
        if (item) {
            item.statusAuditoria = 'Concluída';
            item.dataConclusaoAuditoria = new Date();
        }
        return await this.service.changeAuditoriaStatus(id, 'Concluída');
    }

    /**
     * Reverts audit status to 'Pendente' for specific OS ID
     */
    async desfazerAuditoria(id) {
        const item = this.chamadosList.find(c => String(c.id) === String(id));
        if (item) {
            item.statusAuditoria = 'Pendente';
            item.dataConclusaoAuditoria = null;
        }
        return await this.service.changeAuditoriaStatus(id, 'Pendente');
    }

    /**
     * Exibe o modal de detalhes completos da Ordem de Serviço selecionada
     */
    abrirDetalhesOSModal(id) {
        const list = this.chamadosList || window.chamadosListCache || [];
        let item = list.find(c => String(c.id) === String(id) || String(c.protocolo).toUpperCase() === String(id).toUpperCase());
        
        if (!item && window.ChamadoModel) {
            // Fallback com mock realista de coordenadas para teste de audit em linhas estáticas
            const isDivergenteTest = String(id).includes('004') || String(id).includes('270726');
            item = new window.ChamadoModel({
                id: id,
                protocolo: id,
                status: 'Concluída',
                data_abertura: '2023-08-09T10:00:00Z',
                data_conclusao: '2023-08-09T14:30:00Z',
                municipe_nome: 'Munícipe (Linha Estática)',
                operador: 'Sistema',
                prioridade: 'Normal',
                problema_inicial: 'Lâmpada queimada',
                problema_encontrado: isDivergenteTest ? 'Braço de iluminação danificado' : 'Lâmpada queimada',
                plaqueta_inicial: 'P-10492',
                plaqueta_final: isDivergenteTest ? 'P-10499' : 'P-10492',
                coordenada_inicial: '-21.980500, -46.791200',
                coordenada_reparo: isDivergenteTest ? '-21.982200, -46.793100' : '-21.980850, -46.791520',
                endereco: 'Av. Principal, 500',
                materiais: 'Lâmpada LED 50W',
                status_auditoria: 'Concluída'
            });
        }
        if (!item) return;

        const elProt = document.getElementById('detalheModalProtocolo');
        if (elProt) elProt.innerText = `Protocolo #${item.protocolo}`;
        
        const elSub = document.getElementById('detalheModalDataSub');
        if (elSub) {
            const dataAb = item.dataAbertura ? item.dataAbertura.toLocaleDateString('pt-BR') : '--/--/----';
            const dataConc = item.dataConclusao ? item.dataConclusao.toLocaleDateString('pt-BR') : 'Em aberto';
            elSub.innerText = `Abertura: ${dataAb} | Conclusão: ${dataConc}`;
        }

        const elStatusBadge = document.getElementById('detalheModalStatusBadge');
        if (elStatusBadge) {
            elStatusBadge.innerText = item.statusBadgeLabel;
            const stNorm = item.normalizedStatus;
            if (stNorm === 'concluida') {
                elStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#166534]';
            } else if (stNorm === 'cancelada') {
                elStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700';
            } else {
                elStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error-container text-on-error-container';
            }
        }

        const elAuditBadge = document.getElementById('detalheModalAuditBadge');
        if (elAuditBadge) {
            const isAudConc = item.isAuditoriaConcluida;
            elAuditBadge.innerText = isAudConc ? 'Auditoria Concluída' : 'Auditoria Pendente';
            elAuditBadge.className = isAudConc 
                ? 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300';
        }

        const container = document.getElementById('detalheModalConteudo');
        if (container) {
            container.innerHTML = this.buildDetalhesOSModalHtml(item);
        }
        this.setupGlobalAuditTooltip();

        const modal = document.getElementById('modalDetalhesOSAuditoria');
        const box = document.getElementById('modalDetalhesOSBox');
        if (modal && box) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                box.classList.remove('scale-95', 'opacity-0');
                box.classList.add('scale-100', 'opacity-100');
            }, 10);
        }
    }

    /**
     * Constrói o HTML dinâmico das informações detalhadas da OS para o modal
     */
    buildDetalhesOSModalHtml(item) {
        const fotos = item.fotosEvidencias || [];
        
        const coordIni = window.ChamadoModel.formatCoordPair(item.coordenadaInicial);
        const coordFin = window.ChamadoModel.formatCoordPair(item.coordenadaReparo);
        const linkMaps = (coordFin.lat !== '--') ? `https://www.google.com/maps/search/?api=1&query=${coordFin.lat},${coordFin.lng}` : (coordIni.lat !== '--' ? `https://www.google.com/maps/search/?api=1&query=${coordIni.lat},${coordIni.lng}` : '#');

        const rulesList = (window.ChamadoModel && window.ChamadoModel.AUDIT_RULES) ? window.ChamadoModel.AUDIT_RULES : [];

        let auditBadgesHtml = rulesList.map(r => {
            const isActive = !!item[r.modelProperty];
            return `
            <div class="p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-help ${isActive ? 'bg-rose-50 border-rose-200 text-rose-900 shadow-sm' : 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'}" data-audit-explicacao="${r.explicacao}">
                <div class="flex items-start justify-between gap-1.5 mb-1.5 pointer-events-none">
                    <span class="text-[11px] font-bold leading-snug break-words ${isActive ? 'text-rose-900' : 'text-on-surface'}">${r.label}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold flex-shrink-0 ${isActive ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'}">${isActive ? 'SIM' : 'NÃO'}</span>
                </div>
                <span class="text-[10px] leading-tight opacity-75 line-clamp-2 pointer-events-none">${r.explicacao}</span>
            </div>
            `;
        }).join('');

        let fotosHtml = '';
        if (fotos.length > 0) {
            fotosHtml = `
            <div class="p-3 bg-surface-container-low border border-outline-variant/60 rounded-xl shadow-sm space-y-2">
                <div class="flex items-center justify-between">
                    <strong class="text-xs font-bold text-secondary flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px] text-amber-500">photo_library</span>
                        <span>Fotos & Evidências (${fotos.length})</span>
                    </strong>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            `;
            fotos.forEach((foto, fIdx) => {
                fotosHtml += `
                <div class="relative group rounded-lg overflow-hidden border border-outline-variant/60 cursor-pointer shadow-sm hover:shadow-md transition-all aspect-video bg-slate-900" onclick="window.abrirGaleriaFotosModal('${item.protocolo}', ${fIdx})">
                    <img src="${foto.url}" alt="${foto.titulo || 'Evidência'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1.5">
                        <span class="text-[9.5px] font-semibold text-white truncate drop-shadow">${foto.titulo || 'Evidência'}</span>
                    </div>
                    <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded p-0.5">
                        <span class="material-symbols-outlined text-[14px]">zoom_in</span>
                    </div>
                </div>`;
            });
            fotosHtml += `
                </div>
            </div>`;
        } else {
            fotosHtml = `
            <div class="p-3 bg-surface-container-low border border-outline-variant/40 rounded-xl text-center text-on-surface-variant text-xs italic">
                <span class="material-symbols-outlined text-[20px] align-middle text-outline mr-1">no_photography</span>
                <span>Nenhuma foto de evidência anexada para este protocolo.</span>
            </div>`;
        }

        const ptsList = item.addressPoints.map(p => `<li class="truncate">• ${p}</li>`).join('');

        let cIniStr = item.coordenadaInicial || item.coordenada_inicial || item.coordenada || '';
        let cRepStr = item.coordenadaReparo || item.coordenada_reparo || '';
        
        if (!cIniStr && item.rawPontos && item.rawPontos.length > 0) {
            cIniStr = item.rawPontos[0].coordenada || item.rawPontos[0].coordenada_inicial || '';
        }
        if (!cRepStr && item.rawPontos && item.rawPontos.length > 0) {
            cRepStr = item.rawPontos[0].coordenada_reparo || item.rawPontos[0].coordenada || '';
        }

        let distM = null;
        if (item.distanciaCalculadaMetros !== undefined && item.distanciaCalculadaMetros !== null) {
            distM = item.distanciaCalculadaMetros;
        } else if (cIniStr && cRepStr && window.ChamadoModel) {
            distM = window.ChamadoModel.calcularDistanciaMetros(cIniStr, cRepStr);
        }

        if ((distM === null || isNaN(distM)) && item.audit && item.audit.distancia !== undefined && item.audit.distancia !== null) {
            distM = Number(item.audit.distancia);
        }

        let distFormatted = 'Não informada (Sem coordenadas)';
        if (distM !== null && !isNaN(distM)) {
            if (distM < 1000) {
                distFormatted = `${Math.round(distM)} metros`;
            } else {
                distFormatted = `${(distM / 1000).toFixed(2)} km (${Math.round(distM)} m)`;
            }
        } else if (item.isDistanciaAcima100m) {
            distFormatted = '> 100 metros (Divergente)';
        }

        const opVal = String(item.operador || "").trim();
        const opLower = opVal.toLowerCase();
        const isGovBrOp = !opVal || opLower.includes('gov.br') || opLower === 'cidadão' || opLower === 'cidadao' || opLower.includes('gov');

        return `
        <!-- Seção 1: Dados do Solicitante & Operação -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl space-y-1">
                <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">person</span>
                    <span>Solicitante & Atendimento</span>
                </div>
                <div><b class="text-on-surface-variant font-medium">Munícipe:</b> <span class="font-medium text-on-surface">${item.municipeNome || 'Não informado'}</span></div>
                <div><b class="text-on-surface-variant font-medium">CPF Solicitante:</b> <span class="font-medium text-on-surface">${item.maskedCpfSolicitante}</span></div>
                ${!isGovBrOp ? `<div><b class="text-on-surface-variant font-medium">Operador / Atendente:</b> <span class="font-medium text-on-surface">${item.operador}</span></div>` : ''}
                <div><b class="text-on-surface-variant font-medium">Prioridade:</b> <span class="font-medium text-on-surface">${item.prioridade || 'Normal'}</span></div>
            </div>

            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl space-y-2">
                <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">build</span>
                    <span>Serviço & Manutenção</span>
                </div>
                <div class="space-y-1 text-xs">
                    <div><b class="text-on-surface-variant font-medium">Problema Inicial:</b> <span class="font-medium text-on-surface">${item.problemaInicial}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Problema Encontrado:</b> <span class="font-medium text-on-surface">${item.problemaEncontrado || item.problemaInicial}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Qtd. Inicial / Final:</b> <span class="font-medium text-on-surface">${item.qtdInicial} / ${item.qtdFinal}</span></div>
                </div>

                <!-- Seção Estruturada de Materiais Utilizados -->
                <div class="pt-2 border-t border-outline-variant/30">
                    ${(() => {
                        const rawMatModal = item.materialUtilizado || item.material_utilizado || item.formattedMaterialUtilizado;
                        const modalMats = (item.materialsList && Array.isArray(item.materialsList) && item.materialsList.length > 0)
                            ? item.materialsList
                            : (window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(rawMatModal) : [String(rawMatModal || 'Lâmpada LED 50W')]);
                        return `
                            <div class="flex items-center gap-1.5 mb-1.5">
                                <span class="material-symbols-outlined text-[15px] text-secondary">inventory_2</span>
                                <b class="text-on-surface-variant font-semibold text-xs">Materiais Utilizados (${modalMats.length}):</b>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                ${modalMats.map(mat => `
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-container-lowest text-on-surface border border-outline-variant/60 shadow-2xs">
                                        <span class="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                                        <span>${mat}</span>
                                    </span>
                                `).join('')}
                            </div>
                        `;
                    })()}
                </div>
            </div>
        </div>

        <!-- Seção 2: Localização & Plaqueta -->
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2">
            <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">location_on</span>
                    <span>Localização & Plaqueta</span>
                </span>
                ${linkMaps !== '#' ? `<a href="${linkMaps}" target="_blank" class="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">Abrir Google Maps <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>` : ''}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <strong class="block text-[11px] text-on-surface-variant mb-0.5">Endereço / Ponto(s):</strong>
                    <ul class="space-y-0.5 text-on-surface max-h-24 overflow-y-auto">${ptsList}</ul>
                </div>
                <div class="space-y-1 text-xs">
                    <div><b class="text-on-surface-variant font-medium">Plaqueta Inicial:</b> <span class="font-medium text-on-surface">${item.plaquetaInicial || 'Não informada'}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Plaqueta Final:</b> <span class="font-medium text-on-surface">${item.plaquetaFinal || item.plaquetaInicial || 'Não informada'}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Coordenada Inicial:</b> <span class="font-medium text-on-surface">${coordIni.formatted}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Coordenada Reparo:</b> <span class="font-medium text-on-surface">${coordFin.formatted}</span></div>
                    <div><b class="text-on-surface-variant font-medium">Distância Abertura ➔ Reparo:</b> <span class="font-medium ${distM > 100 ? 'text-rose-700 font-bold' : 'text-emerald-700'}">${distFormatted}</span></div>
                </div>
            </div>
        </div>

        <!-- Seção 3: Indicadores da Auditoria -->
        <div class="space-y-1.5">
            <strong class="text-xs font-bold text-secondary flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">fact_check</span>
                <span>Divergências da Auditoria</span>
            </strong>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                ${auditBadgesHtml}
            </div>
        </div>

        <!-- Seção 4: Galeria de Fotos -->
        ${fotosHtml}

        <!-- Seção 5: Trilha de Auditoria & Observações -->
        ${item.observacaoFinal ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-1">
            <strong class="text-secondary font-bold block mb-1">📜 Observações / Trilha de Auditoria:</strong>
            <div class="bg-surface-container-lowest p-2 rounded border border-outline-variant/40 font-mono text-[11px] max-h-24 overflow-y-auto leading-relaxed">
                ${item.observacaoFinal.replace(/\n/g, '<br/>')}
            </div>
        </div>` : ''}
        `;
    }
}

// Global helpers for row click details modal
window.abrirDetalhesOSModal = function(id) {
    if (window.auditoriaController && typeof window.auditoriaController.abrirDetalhesOSModal === 'function') {
        window.auditoriaController.abrirDetalhesOSModal(id);
    }
};

// Instantiate controller globally
window.AuditoriaController = AuditoriaController;
document.addEventListener('DOMContentLoaded', () => {
    window.auditoriaController = new AuditoriaController();
    window.auditoriaController.init();
});
