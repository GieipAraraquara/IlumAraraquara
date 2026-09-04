(function() {
    if (window.AuditoriaController) return;

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
            let rawList = await this.service.getAuditoriaChamadosList();
            const ModelClass = (typeof window !== 'undefined' && window.ChamadoModel) ? window.ChamadoModel : (typeof ChamadoModel !== 'undefined' ? ChamadoModel : null);
            this.chamadosList = (rawList || []).map(item => {
                if (ModelClass && !(item instanceof ModelClass)) {
                    const inst = typeof ModelClass.fromRow === 'function' ? ModelClass.fromRow(item) : new ModelClass(item);
                    if (item.audit) inst.audit = item.audit;
                    return inst;
                }
                return item;
            });
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

            // Separação entre Praças, Demandas Emergenciais (Atendimento Direto) e Viário Concluídas
            this.emergenciaServicesList = this.chamadosList.filter(item => item.isDireto);
            this.pracaServicesList = this.chamadosList.filter(item => item.isPraca && !item.isDireto);
            this.viariaConcludedList = this.concludedList.filter(item => !item.isPraca && !item.isDireto);

            // Ordenar Praças por data (ascendente)
            this.pracaServicesList.sort((a, b) => {
                const getTime = (item) => {
                    if (item.dataConclusao && !isNaN(new Date(item.dataConclusao).getTime())) return new Date(item.dataConclusao).getTime();
                    if (item.dataInicio && !isNaN(new Date(item.dataInicio).getTime())) return new Date(item.dataInicio).getTime();
                    if (item.dataAbertura && !isNaN(new Date(item.dataAbertura).getTime())) return new Date(item.dataAbertura).getTime();
                    return 0;
                };
                return getTime(a) - getTime(b);
            });

            this.auditDivergentList = this.concludedList.filter(item => item.hasDivergence);

            console.log(`✅ [AuditoriaController] ${this.concludedList.length} OSs concluídas encontradas. (${this.pracaServicesList.length} Praças, ${this.emergenciaServicesList.length} Emergenciais, ${this.viariaConcludedList.length} Viárias Concluídas, ${this.auditDivergentList.length} com divergências 'S')`);

            this.updateKPIs(this.concludedList);
            this.renderOSTable(this.auditDivergentList);
            this.renderPracaTable(this.pracaServicesList);
            this.renderCompletedTable(this.viariaConcludedList);
            this.renderEmergenciaTable(this.emergenciaServicesList);

            // Re-apply filter logic if available
            if (typeof window.applyCombinedFilters === 'function') {
                window.applyCombinedFilters();
            }
            if (typeof window.applyPracaServicesFilters === 'function') {
                window.applyPracaServicesFilters();
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
        const addressLines = item.addressPointsIniciais;
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
            <tr class="border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-surface-container-lowest align-middle ${isCompleted ? 'opacity-70' : ''}" data-id="${item.protocolo || item.id}" data-completed="${isCompleted}" onclick="window.abrirDetalhesOSModal('${item.protocolo || item.id}')">
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
     * Renders Completed Services Table for Praças ('P')
     */
    /**
     * Renders Completed Services Table for Praças ('P')
     */
    renderPracaTable(auditList = []) {
        const tbody = document.querySelector('#praca-services-table tbody');
        if (!tbody) return;

        const emptyRowHtml = `
            <tr id="no-praca-results" class="${auditList.length === 0 ? '' : 'hidden'}">
                <td colspan="6" class="py-8 text-center text-on-surface-variant/70 font-medium bg-surface-container-lowest">
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <span class="material-symbols-outlined text-[24px] text-on-surface-variant/40">filter_alt_off</span>
                        <span class="text-xs">Nenhum serviço em praça encontrado.</span>
                        <button class="text-secondary font-label-md text-xs hover:underline mt-0.5 cursor-pointer" onclick="clearAllPracaFilters()">Limpar filtros de praça</button>
                    </div>
                </td>
            </tr>
        `;

        const rowsHtml = auditList.map(item => this.createCompletedRowHtml(item, true)).join('');
        tbody.innerHTML = emptyRowHtml + rowsHtml;

        // Update count badge
        const badge = document.getElementById('praca-badge-count');
        if (badge) {
            badge.textContent = `${auditList.length} Registros`;
        }
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

        const rowsHtml = auditList.map(item => this.createCompletedRowHtml(item, false)).join('');
        tbody.innerHTML = emptyRowHtml + rowsHtml;

        // Update count badge
        const badge = document.querySelector('#completed-services-table')?.closest('.col-span-12')?.querySelector('.px-2\\.5');
        if (badge) {
            badge.textContent = `${auditList.length} Registros`;
        }
    }

    /**
     * Renders Demandas Emergenciais Table (Atendimento Direto)
     */
    renderEmergenciaTable(auditList = []) {
        const tbody = document.querySelector('#emergencia-services-table tbody');
        if (!tbody) return;

        const emptyRowHtml = `
            <tr id="no-emergencia-results" class="${auditList.length === 0 ? '' : 'hidden'}">
                <td colspan="7" class="py-8 text-center text-on-surface-variant/70 font-medium bg-surface-container-lowest">
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <span class="material-symbols-outlined text-[24px] text-amber-500/60">electric_bolt</span>
                        <span class="text-xs">Nenhuma demanda emergencial / atendimento direto encontrado.</span>
                    </div>
                </td>
            </tr>
        `;

        const rowsHtml = auditList.map(item => this.createEmergenciaRowHtml(item)).join('');
        tbody.innerHTML = emptyRowHtml + rowsHtml;

        // Update count badge
        const badge = document.getElementById('emergencia-badge-count');
        if (badge) {
            badge.textContent = `${auditList.length} Registros`;
        }
    }

    /**
     * Generates HTML string for single Demandas Emergenciais row
     */
    createEmergenciaRowHtml(item) {
        return this.createCompletedRowHtml(item, false);
    }

    /**
     * Generates HTML string for single completed service row using finalization fields
     */
    createCompletedRowHtml(item, isPraca = false) {
        // Finalization Plaqueta / Praça
        const plaquetaFinal = item.plaquetaFinal || item.plaquetaInicial || 'Não informada';
        const pracaNome = item.pracaNome || item.bairro || item.endereco || plaquetaFinal || 'Praça Pública';
        const col2Text = isPraca ? pracaNome : plaquetaFinal;
        const col2Class = isPraca ? 'text-secondary' : 'text-primary';
        
        // Finalization Coordinate (coordenada_reparo or coordenada_inicial)
        const rawCoord = item.coordenadaReparo || item.coordenadaInicial;
        const coordPair = window.ChamadoModel.formatCoordPair(rawCoord);
        const lat = coordPair.lat;
        const lng = coordPair.lng;

        // Finalization Material (material_utilizado)
        const rawMat = item.materialUtilizado || item.material_utilizado || item.formattedMaterialUtilizado;
        const materialsList = (item.materialsList && Array.isArray(item.materialsList) && item.materialsList.length > 0)
            ? item.materialsList
            : (window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(rawMat) : (rawMat ? [String(rawMat)] : []));
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
        } else if (materialsList.length === 1) {
            const singleMat = materialsList[0];
            materialsDisplayHtml = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100/90 text-slate-800 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-w-full" title="${singleMat}">
                    <span class="material-symbols-outlined text-[15px] text-slate-500 flex-shrink-0">inventory_2</span>
                    <span class="truncate">${singleMat}</span>
                </span>
            `;
        } else {
            materialsDisplayHtml = `
                <span class="text-on-surface-variant/70 italic text-xs font-medium">Nenhum material</span>
            `;
        }
        
        // Finalization Quantity (qtd_final)
        const qtdFinal = item.qtdFinal || item.qtdInicial || 1;
        const qtdTdHtml = isPraca ? '' : `<td class="py-3 px-4 text-center font-semibold text-on-surface align-middle">${qtdFinal}</td>`;

        // Finalization Problem (problema_encontrado)
        const selectedProblemVal = item.problemEncontradoSelectValue || item.problemaEncontrado || item.problemaInicial || 'Outros problemas';
        const rawProblemText = item.problemaEncontrado || item.problemaInicial || 'Outros problemas';
        const problemText = (window.ChamadoModel && window.ChamadoModel.formatLocationText) 
            ? window.ChamadoModel.formatLocationText(rawProblemText) 
            : String(rawProblemText).trim();
        const probLower = problemText.toLowerCase();

        let problemBgColor = 'bg-[#f3f4f6] text-[#374151]';
        if (probLower.includes('queimada') || probLower.includes('apagada') || probLower.includes('intermitente') || probLower.includes('sem luz')) {
            problemBgColor = 'bg-[#fef3c7] text-[#92400e]';
        } else if (probLower.includes('acesa')) {
            problemBgColor = 'bg-[#dbeafe] text-[#1e40af]';
        } else if (probLower.includes('quebrada') || probLower.includes('braço') || probLower.includes('braco') || probLower.includes('danificada')) {
            problemBgColor = 'bg-[#ffedd5] text-[#9a3412]';
        } else if (probLower.includes('nenhum')) {
            problemBgColor = 'bg-[#d1fae5] text-[#065f46]';
        }

        // Finalization Date (data_conclusao)
        const dateConclusaoText = item.formattedDateConclusaoShort || item.formattedDateShort;

        const distM = (item.distanciaCalculadaMetros !== undefined && item.distanciaCalculadaMetros !== null) 
            ? item.distanciaCalculadaMetros 
            : (window.ChamadoModel ? window.ChamadoModel.calcularDistanciaMetros(item.coordenadaInicial, item.coordenadaReparo) : null);
        let distBadgeTable = '';
        if (distM !== null && !isNaN(distM) && !item.isDireto) {
            const distTxt = distM < 1000 ? `${Math.round(distM)}m` : `${(distM/1000).toFixed(1)}km`;
            const colorCls = distM > 100 ? 'bg-rose-100 text-rose-800 border-rose-200 font-bold' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            distBadgeTable = `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono border ${colorCls} mt-1" title="Distância entre a abertura e o reparo"><span class="material-symbols-outlined text-[11px]">straighten</span>${distTxt}</span>`;
        }

        // Multi-point Repair Coordinates Display
        const coordsList = item.coordenadasReparoList || [];
        let coordsDisplayHtml = '';

        if (coordsList.length > 1) {
            const firstCoord = coordsList[0];
            const extraCoordCount = coordsList.length - 1;

            const extraCoordsHtml = coordsList.slice(1).map((c, idx) => `
                <button onclick="window.abrirMapaPonto('${item.id}', ${c.index !== undefined ? c.index : idx + 1}, event)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100/90 text-slate-800 hover:text-secondary border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-secondary/40 transition-all cursor-pointer min-w-0 w-full text-left" title="Abrir Ponto #${(c.index !== undefined ? c.index : idx + 1) + 1} no mapa Mapbox">
                    <span class="material-symbols-outlined text-[15px] text-secondary flex-shrink-0">location_on</span>
                    <span class="truncate font-semibold">${c.lat}, ${c.lng}</span>
                </button>
            `).join('');

            coordsDisplayHtml = `
                <div class="flex flex-col gap-1 w-full text-left">
                    <div class="flex items-center gap-1.5 min-w-0 w-full">
                        <button onclick="window.abrirMapaPonto('${item.id}', ${firstCoord.index || 0}, event)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100/90 text-slate-800 hover:text-secondary border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-secondary/40 transition-all cursor-pointer min-w-0 flex-1 text-left" title="Clique para abrir no mapa Mapbox">
                            <span class="material-symbols-outlined text-[15px] text-secondary flex-shrink-0">location_on</span>
                            <span class="truncate font-semibold">${firstCoord.lat}, ${firstCoord.lng}</span>
                            ${distBadgeTable}
                        </button>
                        <button class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all flex-shrink-0 cursor-pointer active:scale-95 border border-secondary/20" onclick="toggleInlinePoints(this, ${extraCoordCount}, event)" title="Expandir/Recolher coordenadas">
                            <span class="btn-text">+${extraCoordCount}</span>
                            <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                        </button>
                    </div>
                    <div class="extra-points hidden flex-col gap-1 pt-1 border-t border-outline-variant/30 transition-all w-full">
                        ${extraCoordsHtml}
                    </div>
                </div>
            `;
        } else {
            coordsDisplayHtml = `
                <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100/90 text-slate-800 hover:text-secondary border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-secondary/40 transition-all cursor-pointer min-w-0 max-w-full text-left" title="Clique para abrir no mapa Mapbox">
                    <span class="material-symbols-outlined text-[15px] text-secondary flex-shrink-0">location_on</span>
                    <span class="truncate font-semibold">${lat}, ${lng}</span>
                    ${distBadgeTable}
                </button>
            `;
        }

        // Multi-point Plaqueta Display
        const plaquetasList = (item.plaquetasFinalList && item.plaquetasFinalList.length > 0) 
            ? item.plaquetasFinalList 
            : [col2Text];

        let col2TdHtml = '';
        if (!isPraca && plaquetasList.length > 1) {
            const firstPlq = plaquetasList[0];
            const extraPlqCount = plaquetasList.length - 1;

            const extraPlqsHtml = plaquetasList.slice(1).map(plq => `
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-slate-100/90 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] w-full min-w-0" title="${plq}">
                    <span class="material-symbols-outlined text-[15px] text-primary/70 flex-shrink-0">tag</span>
                    <span class="truncate">${plq}</span>
                </div>
            `).join('');

            col2TdHtml = `
                <td class="py-3 px-4 align-middle">
                    <div class="flex flex-col gap-1 w-full text-left">
                        <div class="flex items-center gap-1.5 min-w-0 w-full">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-slate-100/90 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] min-w-0 flex-1" title="${firstPlq}">
                                <span class="material-symbols-outlined text-[15px] text-primary/70 flex-shrink-0">tag</span>
                                <span class="truncate">${firstPlq}</span>
                            </span>
                            <button class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all flex-shrink-0 cursor-pointer active:scale-95 border border-primary/20" onclick="toggleInlinePoints(this, ${extraPlqCount}, event)" title="Expandir/Recolher plaquetas">
                                <span class="btn-text">+${extraPlqCount}</span>
                                <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                            </button>
                        </div>
                        <div class="extra-points hidden flex-col gap-1 pt-1 border-t border-outline-variant/30 transition-all w-full">
                            ${extraPlqsHtml}
                        </div>
                    </div>
                </td>
            `;
        } else if (isPraca) {
            col2TdHtml = `
                <td class="py-3 px-4 align-middle">
                    <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir a localização no mapa Mapbox">
                        <span class="material-symbols-outlined text-[16px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                        <span class="font-semibold text-secondary truncate group-hover/loc:underline" title="${col2Text}">${col2Text}</span>
                    </button>
                </td>
            `;
        } else {
            col2TdHtml = `
                <td class="py-3 px-4 align-middle">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-slate-100/90 border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-w-full" title="${col2Text}">
                        <span class="material-symbols-outlined text-[15px] text-primary/70 flex-shrink-0">tag</span>
                        <span class="truncate">${col2Text}</span>
                    </span>
                </td>
            `;
        }

        // Protocol Cell
        const protocolTdHtml = `<td class="py-3 px-4 font-medium text-on-surface whitespace-nowrap truncate align-middle">${item.protocolo}</td>`;

        // Status Badge for Praça Services
        let statusBadgeClass = 'bg-slate-100 text-slate-700 border border-slate-300';
        if (item.normalizedStatus === 'aberto') statusBadgeClass = 'bg-sky-100 text-sky-800 border border-sky-300';
        if (item.normalizedStatus === 'em_andamento') statusBadgeClass = 'bg-amber-100 text-amber-800 border border-amber-300';
        if (item.statusBadgeLabel === 'Iniciado') statusBadgeClass = 'bg-blue-100 text-blue-800 border border-blue-300';
        if (item.normalizedStatus === 'concluida') statusBadgeClass = 'bg-[#dcfce7] text-[#166534]';
        if (item.normalizedStatus === 'cancelada') statusBadgeClass = 'bg-slate-200 text-slate-700';
        if (item.normalizedStatus === 'rejeitada') statusBadgeClass = 'bg-rose-100 text-rose-800 border border-rose-300';
        if (item.normalizedStatus === 'pendente') statusBadgeClass = 'bg-purple-100 text-purple-800 border border-purple-300';

        const statusBadgeHtml = `
            <span class="status-badge px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[140px] transition-colors ${statusBadgeClass}" data-status="${item.normalizedStatus}">
                ${item.statusBadgeLabel || item.status || 'Concluída'}
            </span>
        `;

        const lastColHtml = isPraca ? `
            <td class="py-3 px-4 whitespace-nowrap truncate align-middle" data-status-value="${item.normalizedStatus}">
                ${statusBadgeHtml}
            </td>
        ` : `
            <td class="py-3 px-4 align-middle">
                ${materialsDisplayHtml}
            </td>
        `;

        return `
            <tr class="border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] relative z-0 hover:z-10 bg-surface-container-lowest align-middle" data-id="${item.protocolo || item.id}" onclick="window.abrirDetalhesOSModal('${item.protocolo || item.id}')">
                ${protocolTdHtml}
                <td class="py-3 px-4 text-on-surface-variant whitespace-nowrap truncate align-middle font-medium">${dateConclusaoText}</td>
                ${col2TdHtml}
                <td class="py-3 px-4 align-middle">
                    ${coordsDisplayHtml}
                </td>
                <td class="py-3 px-4 whitespace-nowrap truncate align-middle" data-problem-value="${selectedProblemVal}">
                    <span class="px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[160px] ${problemBgColor}">
                        ${problemText}
                    </span>
                </td>
                ${qtdTdHtml}
                ${lastColHtml}
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
    /**
     * Exibe o modal de detalhes completos da Ordem de Serviço selecionada
     */
    async abrirDetalhesOSModal(id) {
        if (!id) return;
        const cleanId = String(id || '').replace(/^#/, '').trim();
        const upperClean = cleanId.toUpperCase();

        const list = this.chamadosList || window.chamadosListCache || [];
        let item = list.find(c => {
            const p = String(c.protocolo || '').replace(/^#/, '').trim().toUpperCase();
            const cid = String(c.id || '').replace(/^#/, '').trim().toUpperCase();
            return p === upperClean || cid === upperClean;
        });

        // Se não encontrar na memória local, consulta o Supabase sob demanda
        if (!item && window.supabaseClient) {
            try {
                const client = window.supabaseClient;
                let { data: row } = await client
                    .from('ordens_servico')
                    .select('*')
                    .or(`protocolo.ilike.${cleanId},id.eq.${cleanId}`)
                    .maybeSingle();

                if (!row) {
                    const resPraca = await client
                        .from('ordens_servico_pracas')
                        .select('*')
                        .or(`protocolo.ilike.${cleanId},id.eq.${cleanId}`)
                        .maybeSingle();
                    if (resPraca && resPraca.data) row = resPraca.data;
                }

                if (!row) {
                    const resLeg = await client
                        .from('chamados')
                        .select('*')
                        .or(`protocolo.ilike.${cleanId},id.eq.${cleanId}`)
                        .maybeSingle();
                    if (resLeg && resLeg.data) row = resLeg.data;
                }

                if (row && window.ChamadoModel) {
                    const ModelClass = window.ChamadoModel;
                    item = (typeof ModelClass.fromRow === 'function') ? ModelClass.fromRow(row) : new ModelClass(row);
                    if (this.chamadosList) this.chamadosList.push(item);
                    if (window.chamadosListCache) window.chamadosListCache.push(item);
                }
            } catch (errRemoto) {
                console.warn('⚠️ [AuditoriaController] Erro ao buscar OS remota sob demanda:', errRemoto);
            }
        }
        
        if (!item && window.ChamadoModel) {
            // Fallback com mock realista de coordenadas para teste de audit em linhas estáticas
            const isDivergenteTest = String(cleanId).includes('004') || String(cleanId).includes('270726');
            item = new window.ChamadoModel({
                id: cleanId,
                protocolo: cleanId,
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
                materiais: '',
                status_auditoria: 'Concluída'
            });
        }
        if (!item) return;

        const modal = document.getElementById('modalDetalhesOSAuditoria');
        const isModalAlreadyOpen = modal && !modal.classList.contains('hidden');

        if (!this.modalHistory) this.modalHistory = [];

        if (!isModalAlreadyOpen) {
            this.modalHistory = [];
        } else if (this.currentModalProtocolo && this.currentModalProtocolo !== item.protocolo && !this._isNavigatingHistory) {
            this.modalHistory.push(this.currentModalProtocolo);
        }
        this.currentModalProtocolo = item.protocolo;

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
            this.carregarLogsNoModal(item.protocolo);
        }
        this.setupGlobalAuditTooltip();

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
     * Retorna à OS anterior quando navegando por links de OSs duplicadas/vinculadas no modal
     */
    async voltarModalOS() {
        if (!this.modalHistory || this.modalHistory.length === 0) return;
        const prevProtocol = this.modalHistory.pop();
        this._isNavigatingHistory = true;
        try {
            await this.abrirDetalhesOSModal(prevProtocol);
        } finally {
            this._isNavigatingHistory = false;
        }
    }

    /**
     * Carrega e renderiza o histórico de auditoria (logs_protocolos) no modal de detalhes da OS
     */
    async carregarLogsNoModal(protocolo) {
        const listEl = document.getElementById('detalheModalLogsList');
        if (!listEl) return;

        if (!window.LogsRepository) {
            listEl.innerHTML = `<span class="text-on-surface-variant italic text-[11px]">Repositório de logs indisponível.</span>`;
            return;
        }

        try {
            const logs = await window.LogsRepository.buscarLogsPorProtocolo(protocolo);
            if (!logs || logs.length === 0) {
                listEl.innerHTML = `
                    <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant italic text-[11px] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] text-slate-400">info</span>
                        <span>Nenhum evento de alteração registrado no histórico para este protocolo.</span>
                    </div>
                `;
                return;
            }

            const mapAcaoBadge = {
                'CRIACAO': 'bg-blue-100 text-blue-800 border-blue-300',
                'ALTERACAO_STATUS': 'bg-purple-100 text-purple-800 border-purple-300',
                'ALTERACAO_PRIORIDADE': 'bg-amber-100 text-amber-800 border-amber-300',
                'ALTERACAO_MATERIAL': 'bg-indigo-100 text-indigo-800 border-indigo-300',
                'FINALIZACAO': 'bg-emerald-100 text-emerald-800 border-emerald-300',
                'CANCELAMENTO': 'bg-rose-100 text-rose-800 border-rose-300',
                'REABERTURA': 'bg-cyan-100 text-cyan-800 border-cyan-300',
                'AUDITORIA': 'bg-indigo-100 text-indigo-800 border-indigo-300'
            };

            const parseAndFormatMaterialsLog = (dataVal) => {
                if (!dataVal) return [];
                let mat = dataVal;
                if (typeof dataVal === 'object' && dataVal !== null) {
                    if (dataVal.materiais !== undefined && dataVal.materiais !== null) {
                        mat = dataVal.materiais;
                    } else if (dataVal.material_utilizado !== undefined && dataVal.material_utilizado !== null) {
                        mat = dataVal.material_utilizado;
                    }
                }
                if (window.ChamadoModel && typeof window.ChamadoModel.parseMaterialsList === 'function') {
                    return window.ChamadoModel.parseMaterialsList(mat);
                }
                if (typeof mat === 'string') {
                    const trimmed = mat.trim();
                    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                        try { mat = JSON.parse(trimmed); } catch(e) { mat = [trimmed]; }
                    } else if (trimmed) {
                        mat = [trimmed];
                    } else {
                        mat = [];
                    }
                }
                if (!Array.isArray(mat)) {
                    mat = mat ? [mat] : [];
                }
                return mat.map(item => {
                    if (!item) return '';
                    if (typeof item === 'string') return item;
                    if (typeof item === 'object') {
                        const name = item.nome || item.material || item.descricao || item.item || JSON.stringify(item);
                        const qtd = item.qtd || item.quantidade || item.qtd_utilizada || item.qtdUtilizada;
                        return (qtd && parseInt(qtd, 10) > 1) ? `${name} (x${qtd})` : name;
                    }
                    return String(item);
                }).filter(Boolean);
            };

            listEl.innerHTML = logs.map(log => {
                const dataStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : 'Data n/d';
                const badgeCls = mapAcaoBadge[log.tipo_acao] || 'bg-slate-100 text-slate-800 border-slate-300';
                const userStr = log.usuario_nome || log.usuario_email || 'Sistema / Anônimo';
                const origStr = log.origem_tela ? ` • Tela: ${log.origem_tela}` : '';

                let diffHtml = '';
                const hasAnteriores = log.dados_anteriores !== null && log.dados_anteriores !== undefined;
                const hasNovos = log.dados_novos !== null && log.dados_novos !== undefined;

                if (log.tipo_acao === 'ALTERACAO_MATERIAL' || (hasAnteriores && (log.dados_anteriores?.materiais !== undefined || log.dados_anteriores?.material_utilizado !== undefined)) || (hasNovos && (log.dados_novos?.materiais !== undefined || log.dados_novos?.material_utilizado !== undefined))) {
                    const listAnt = parseAndFormatMaterialsLog(log.dados_anteriores);
                    const listNova = parseAndFormatMaterialsLog(log.dados_novos);

                    diffHtml = `
                        <div class="mt-2.5 space-y-2 text-xs">
                            <div class="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-1.5">
                                <div class="font-bold text-rose-950 text-[11px] flex items-center justify-between">
                                    <span class="flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[15px] text-rose-600">history</span>
                                        <span>Lista Anterior (${listAnt.length}):</span>
                                    </span>
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100/80 text-rose-800 border border-rose-200/60">Antes da edição</span>
                                </div>
                                ${listAnt.length > 0 ? `
                                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                                        ${listAnt.map(mat => `
                                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white text-rose-950 border border-rose-200 shadow-2xs">
                                                <span class="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0"></span>
                                                <span>${mat}</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="text-[11px] text-slate-500 italic pt-0.5">Nenhum material cadastrado anteriormente.</div>
                                `}
                            </div>

                            <div class="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1.5">
                                <div class="font-bold text-emerald-950 text-[11px] flex items-center justify-between">
                                    <span class="flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-[15px] text-emerald-600">check_circle</span>
                                        <span>Nova Lista Atualizada (${listNova.length}):</span>
                                    </span>
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100/80 text-emerald-800 border border-emerald-200/60">Após a edição</span>
                                </div>
                                ${listNova.length > 0 ? `
                                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                                        ${listNova.map(mat => `
                                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white text-emerald-950 border border-emerald-200 shadow-2xs">
                                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0"></span>
                                                <span>${mat}</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="text-[11px] text-slate-500 italic pt-0.5">Nenhum material cadastrado.</div>
                                `}
                            </div>
                        </div>
                    `;
                } else if (hasAnteriores || hasNovos) {
                    const antStr = typeof log.dados_anteriores === 'object' ? JSON.stringify(log.dados_anteriores) : String(log.dados_anteriores || '');
                    const novStr = typeof log.dados_novos === 'object' ? JSON.stringify(log.dados_novos) : String(log.dados_novos || '');
                    if (antStr || novStr) {
                        diffHtml = `
                            <div class="mt-2 pt-2 border-t border-outline-variant/30 text-[10.5px] text-slate-600 space-y-1">
                                ${antStr ? `<div><b class="text-rose-700">Anterior:</b> <span class="font-mono">${antStr}</span></div>` : ''}
                                ${novStr ? `<div><b class="text-emerald-700">Novo:</b> <span class="font-mono">${novStr}</span></div>` : ''}
                            </div>
                        `;
                    }
                }

                return `
                    <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 space-y-1 shadow-2xs text-[11px]">
                        <div class="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-1">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeCls}">
                                ${log.tipo_acao || 'LOG'}
                            </span>
                            <span class="font-mono text-on-surface-variant text-[10px] flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">schedule</span>
                                ${dataStr}
                            </span>
                        </div>
                        <div class="text-on-surface font-medium leading-relaxed">${log.descricao || 'Alteração realizada'}</div>
                        ${diffHtml}
                        <div class="flex items-center justify-between text-[10px] text-on-surface-variant/80 pt-1 border-t border-slate-100 mt-1">
                            <span>👤 <b>Usuário:</b> ${userStr}${origStr}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.warn('⚠️ Erro ao carregar logs no modal:', err);
            listEl.innerHTML = `<span class="text-error italic text-[11px]">Erro ao buscar histórico: ${err.message}</span>`;
        }
    }

    /**
     * Constrói o HTML dinâmico das informações detalhadas da OS para o modal
     */
    buildDetalhesOSModalHtml(item) {
        const isPracaOS = Boolean(
            item.isPraca ||
            (item.protocolo && String(item.protocolo).trim().toUpperCase().startsWith('P'))
        );
        const coordIni = window.ChamadoModel.formatCoordPair(item.coordenadaInicial);
        const coordFin = window.ChamadoModel.formatCoordPair(item.coordenadaReparo);
        const linkMaps = (coordFin.lat !== '--') ? `https://www.google.com/maps/search/?api=1&query=${coordFin.lat},${coordFin.lng}` : (coordIni.lat !== '--' ? `https://www.google.com/maps/search/?api=1&query=${coordIni.lat},${coordIni.lng}` : '#');

        const ptsList = (item.addressPoints || [item.endereco || 'Endereço não informado']).map(p => `<li class="truncate">• ${p}</li>`).join('');

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

        let isAdminUser = false;
        let isManutentorUser = false;
        try {
            if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
                const r = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
                if (r === 'admin') isAdminUser = true;
                if (r === 'manutentor') isManutentorUser = true;
            }
            if (!isAdminUser && window.usuarioLogadoSupabase) {
                const r = String(window.usuarioLogadoSupabase.role || window.usuarioLogadoSupabase.cargo || '').toLowerCase();
                if (r.includes('admin') || r.includes('gestor') || r.includes('supervisor')) isAdminUser = true;
            }
            if (!isManutentorUser && window.usuarioLogadoSupabase) {
                const r = String(window.usuarioLogadoSupabase.role || window.usuarioLogadoSupabase.cargo || '').toLowerCase();
                if (r.includes('manutencao') || r.includes('manutentor') || r.includes('tecnico')) isManutentorUser = true;
            }
            if (!isAdminUser && String(localStorage.getItem('user_role') || '').toLowerCase().includes('admin')) {
                isAdminUser = true;
            }
            if (!isManutentorUser && String(localStorage.getItem('user_role') || '').toLowerCase().includes('manutentor')) {
                isManutentorUser = true;
            }
            if (!isManutentorUser && (window.isManutentorView || (document.body && document.body.classList.contains('manutentor-view')) || window.location.href.toLowerCase().includes('manutentor'))) {
                isManutentorUser = true;
            }
        } catch(e) {}

        const isJaUrgente = (String(item.prioridade || '').trim().toLowerCase() === 'urgente');
        const isJaCancelada = (item.normalizedStatus === 'cancelada');
        const isJaRejeitada = (item.normalizedStatus === 'rejeitada');
        const isConcluida = (item.normalizedStatus === 'concluida');
        const isPendente = (item.normalizedStatus === 'pendente');

        const getCleanOp = (v) => {
            if (!v) return '';
            const s = String(v).trim();
            if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'não informado' || s.toLowerCase() === 'nao informado') return '';
            return s;
        };

        const opAbertura = getCleanOp(item.displayOperadorAbertura) ||
                           getCleanOp(item.operadorAbertura) ||
                           getCleanOp(item.operador) ||
                           getCleanOp(item.userEmail) ||
                           getCleanOp(item.user_email) ||
                           getCleanOp(item.rawRow?.user_email) ||
                           getCleanOp(item.rawRow?.operador) ||
                           getCleanOp(item.municipeNome) ||
                           'Não informado';
        const opFinalizacao = getCleanOp(item.displayOperadorFinalizacao) || getCleanOp(item.operadorFinalizacao) || 'Pendente finalização';

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

        const historyBannerHtml = (this.modalHistory && this.modalHistory.length > 0) ? `
            <div class="p-2.5 bg-blue-50/95 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 shadow-2xs mb-3">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-blue-600 shrink-0">link</span>
                    <span>Visualizando OS referenciada como duplicata <strong class="font-mono font-bold text-blue-800">#${item.protocolo}</strong></span>
                </div>
                <button type="button" onclick="window.auditoriaController.voltarModalOS()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 hover:bg-blue-100 hover:text-blue-900 border border-blue-300 hover:border-blue-400 active:scale-95 transition-all shadow-2xs cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Voltar para #${this.modalHistory[this.modalHistory.length - 1]}</span>
                </button>
            </div>
        ` : '';

        const motivoAprovacaoHtml = item.motivoAprovacao 
            ? (window.ChamadoModel && typeof window.ChamadoModel.formatarMotivoHtml === 'function' ? window.ChamadoModel.formatarMotivoHtml(item.motivoAprovacao, { isTable: false }) : item.motivoAprovacao)
            : '';

        return `
        ${historyBannerHtml}
        <!-- Seção 1: Solicitante & Ações Administrativas no Topo -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl space-y-1">
                <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">person</span>
                    <span>Solicitante & Atendimento</span>
                </div>
                <div><b class="text-on-surface-variant font-medium">Munícipe:</b> <span class="font-medium text-on-surface">${item.municipeNome || 'Não informado'}</span></div>
                <div><b class="text-on-surface-variant font-medium">CPF Solicitante:</b> <span class="font-medium text-on-surface">${item.maskedCpfSolicitante || 'Não informado'}</span></div>
                <div><b class="text-on-surface-variant font-medium">Cadastrado por (Abertura):</b> <span class="font-semibold text-blue-700">${opAbertura}</span></div>
                <div><b class="text-on-surface-variant font-medium">Finalizado por (Conclusão):</b> <span class="font-semibold ${item.normalizedStatus === 'concluida' ? 'text-emerald-700' : 'text-on-surface-variant'}">${opFinalizacao}</span></div>
                <div><b class="text-on-surface-variant font-medium">Prioridade:</b> <span class="font-medium text-on-surface">${item.prioridade || 'Normal'}</span></div>
                ${item.motivoAprovacao ? `<div class="mt-1"><b class="text-amber-800 font-medium">Motivo Pendência/Aprovação:</b> <span class="font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-flex items-center flex-wrap gap-1 mt-0.5 shadow-2xs">${motivoAprovacaoHtml}</span></div>` : ''}
            </div>

            <!-- Bloco 2: Ações Administrativas -->
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl space-y-2 flex flex-col justify-between">
                <div>
                    <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                        <span class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                            <span>Ações Administrativas</span>
                        </span>
                        ${isAdminUser ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Painel Admin</span>` : ''}
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-2 pt-2">
                        ${isManutentorUser ? `
                            ${!isJaRejeitada && !isConcluida && !isJaCancelada ? `
                            <button type="button" onclick="window.rejeitarOSManutentor('${item.protocolo || item.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">thumb_down</span>
                                <span>Rejeitar OS</span>
                            </button>` : (isJaRejeitada ? `
                            <button type="button" disabled class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300 opacity-70 cursor-not-allowed">
                                <span class="material-symbols-outlined text-[15px]">thumb_down</span>
                                <span>OS Rejeitada</span>
                            </button>` : '')}
                        ` : ''}

                        ${isAdminUser ? `
                            ${isPendente ? `
                            <button type="button" onclick="window.aprovarOSAdmin('${item.protocolo || item.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">check</span>
                                <span>Aprovar OS</span>
                            </button>` : ''}

                            <button type="button" onclick="window.editarMateriaisAdmin('${item.protocolo || item.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-2xs cursor-pointer" title="Editar lista de materiais desta OS">
                                <span class="material-symbols-outlined text-[16px]">edit_note</span>
                                <span>Editar Materiais</span>
                            </button>

                            ${(!isConcluida && !isJaCancelada && !isJaRejeitada) ? (
                                !isJaUrgente ? `
                                <button type="button" onclick="window.alterarPrioridadeOS('${item.protocolo || item.id}', 'Urgente')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">priority_high</span>
                                    <span>Priorizar para Urgente</span>
                                </button>` : `
                                <button type="button" onclick="window.alterarPrioridadeOS('${item.protocolo || item.id}', 'Normal')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">restart_alt</span>
                                    <span>Retornar para Normal</span>
                                </button>`
                            ) : ''}

                            ${(isConcluida || isJaCancelada || isJaRejeitada) ? `
                            <button type="button" onclick="window.reabrirOSAdmin('${item.protocolo || item.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">undo</span>
                                <span>${isJaCancelada ? 'Reabrir OS Cancelada' : (isConcluida ? 'Reabrir OS Concluída' : 'Reabrir OS Rejeitada')}</span>
                            </button>` : ''}

                            ${!isConcluida ? (
                                !isJaCancelada ? `
                                <button type="button" onclick="window.cancelarOSAdmin('${item.protocolo || item.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                    <span class="material-symbols-outlined text-[16px]">block</span>
                                    <span>Cancelar OS</span>
                                </button>` : `
                                <button type="button" disabled class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-300 opacity-70 cursor-not-allowed">
                                    <span class="material-symbols-outlined text-[15px]">block</span>
                                    <span>OS Cancelada</span>
                                </button>`
                            ) : ''}
                        ` : ''}

                        ${(!isAdminUser && !isManutentorUser) ? `
                            <div class="text-slate-500 italic text-xs py-1">Atendimento registrado no sistema. Sem ações pendentes.</div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- Seção Especial Auditoria: Divergências da Auditoria (Apenas para Protocolos Viários 'I') -->
        ${!isPracaOS ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-1.5">
            <strong class="text-xs font-bold text-secondary flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">fact_check</span>
                <span>Divergências da Auditoria</span>
            </strong>
            ${item.isDireto ? `
                <div class="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-center gap-2 font-medium">
                    <span class="material-symbols-outlined text-[18px] text-amber-600">info</span>
                    <span>Atendimento Direto — Isento de conferência de critérios de auditoria.</span>
                </div>
            ` : `
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    ${auditBadgesHtml}
                </div>
            `}
        </div>
        ` : ''}

        <!-- Seção 2: Observações de Abertura (Munícipe / Solicitante) -->
        ${(() => {
            const obsIni = (item.observacaoInicial || item.descricao || (item.raw && (item.raw.observacao_inicial || item.raw.observacao || item.raw.observacoes || item.raw.descricao)) || '').trim();
            const obsFin = (item.observacaoFinal || (item.raw && (item.raw.observacao_final || item.raw.justificativa)) || '').trim();

            if (!obsIni && !obsFin) return '';

            let bodyObs = '';
            if (obsIni && obsFin && obsIni !== obsFin) {
                bodyObs = `<div><b class="text-slate-700 font-semibold">📌 Abertura / Solicitante:</b> ${obsIni.replace(/\n/g, '<br/>')}</div><div class="mt-2 pt-2 border-t border-slate-200/60"><b class="text-slate-700 font-semibold">📝 Observação Complementar:</b> ${obsFin.replace(/\n/g, '<br/>')}</div>`;
            } else {
                bodyObs = `<div>${(obsIni || obsFin).replace(/\n/g, '<br/>')}</div>`;
            }

            return `
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-1.5">
                <strong class="text-secondary font-bold flex items-center gap-1.5 mb-1">
                    <span class="material-symbols-outlined text-[16px]">chat</span>
                    <span>Observações de Abertura (Munícipe / Solicitante)</span>
                </strong>
                <div class="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/40 text-[11.5px] text-on-surface leading-relaxed italic">
                    ${bodyObs}
                </div>
            </div>`;
        })()}

        <!-- Seção 3: Pontos de Manutenção (Exclusivo para Protocolos Viários 'I') -->
        ${!isPracaOS ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2">
            <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                <span class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">location_on</span>
                    <span>Pontos de Manutenção (${(item.pontosDetalhados || []).length})</span>
                </span>
            </div>

            <!-- Lista Estruturada dos Pontos -->
            <div class="space-y-2">
                ${(item.pontosDetalhados || []).map((p, pIdx) => {
                    const isRealAddr = (val) => window.ChamadoModel ? window.ChamadoModel.isRealAddress(val) : (val && !String(val).toLowerCase().includes('coord'));

                    const buildNavLinks = (coordVal, enderecoVal) => {
                        let lat = null, lng = null;
                        if (coordVal) {
                            if (typeof coordVal === 'string') {
                                const parts = coordVal.split(',').map(s => s.trim());
                                if (parts.length >= 2) {
                                    const pLat = parseFloat(parts[0]);
                                    const pLng = parseFloat(parts[1]);
                                    if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) { lat = pLat; lng = pLng; }
                                }
                            } else if (typeof coordVal === 'object' && coordVal.lat && coordVal.lng) {
                                const pLat = parseFloat(coordVal.lat);
                                const pLng = parseFloat(coordVal.lng);
                                if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) { lat = pLat; lng = pLng; }
                            }
                        }
                        let gmaps = '#', waze = '#';
                        if (lat !== null && lng !== null) {
                            gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                            waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
                        } else if (isRealAddr(enderecoVal)) {
                            const addr = String(enderecoVal).trim();
                            const queryEnc = encodeURIComponent(addr + (addr.toLowerCase().includes('araraquara') ? '' : ', Araraquara - SP'));
                            gmaps = `https://www.google.com/maps/search/?api=1&query=${queryEnc}`;
                            waze = `https://waze.com/ul?q=${queryEnc}&navigate=yes`;
                        }
                        return { hasNav: (lat !== null || isRealAddr(enderecoVal)), gmaps, waze };
                    };

                    const hasIni = p.hasInicialData || (pIdx === 0 && Boolean(p.plaquetaInicial || item.plaquetaInicial || item.plaqueta));
                    const navIni = hasIni ? buildNavLinks(p.coordenadaInicial, p.enderecoInicial) : { hasNav: false };
                    const navFin = p.hasFinalData ? buildNavLinks(p.coordenadaFinal, p.enderecoFinal) : { hasNav: false };

                    return `
                    <div class="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/60 shadow-2xs space-y-2">
                        <div class="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-1">
                            <div class="flex items-center gap-1.5 font-bold text-secondary text-xs">
                                <span class="material-symbols-outlined text-[15px]">pin_drop</span>
                                <span>Ponto #${p.numero}</span>
                            </div>
                            ${p.hasFinalData ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">Concluído</span>` : `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">Abertura / Pendente</span>`}
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            ${hasIni ? `
                                <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1 text-xs flex flex-col justify-between h-full">
                                    <div class="space-y-1">
                                        <div class="font-bold text-slate-700 text-xs border-b border-slate-200/60 pb-1">📌 Abertura (Inicial)</div>
                                        <div><b class="text-slate-600">Plaqueta:</b> <span class="font-semibold text-slate-800">${(p.plaquetaInicial && p.plaquetaInicial !== 'Não informada') ? p.plaquetaInicial : (pIdx === 0 ? (item.plaquetaInicial || item.plaqueta || 'Não informada') : 'Não informada')}</span></div>
                                        <div><b class="text-slate-600">Coordenada:</b> <span class="font-medium text-slate-800">${(p.coordenadaInicial && p.coordenadaInicial !== 'Não informada') ? p.coordenadaInicial : (pIdx === 0 ? (item.coordenadaInicial || item.coordenada || 'Não informada') : 'Não informada')}</span></div>
                                        <div><b class="text-slate-600">Problema:</b> <span class="font-medium text-slate-800">${(p.problemaInicial && p.problemaInicial !== 'Não informado') ? p.problemaInicial : (pIdx === 0 ? (item.problemaInicial || item.problema || 'Não informado') : 'Não informado')}</span></div>
                                        ${isRealAddr(p.enderecoInicial || (pIdx === 0 ? item.endereco : '')) ? `<div><b class="text-slate-600">Endereço:</b> <span class="font-medium text-slate-800">${p.enderecoInicial || item.endereco}</span></div>` : ''}
                                    </div>
                                    ${navIni.hasNav ? `
                                    <div class="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/60 mt-1.5">
                                        <span class="text-[10.5px] font-semibold text-slate-500 flex items-center gap-0.5">
                                            <span class="material-symbols-outlined text-[13px]">explore</span> Navegar:
                                        </span>
                                        <a href="${navIni.gmaps}" target="_blank" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-blue-100/80 text-blue-700 hover:bg-blue-200 border border-blue-200/80 active:scale-95 transition-all cursor-pointer shadow-2xs">
                                            <span class="material-symbols-outlined text-[12px] text-blue-600">map</span>
                                            <span>Maps</span>
                                            <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                        </a>
                                        <a href="${navIni.waze}" target="_blank" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-cyan-100/80 text-cyan-800 hover:bg-cyan-200 border border-cyan-200/80 active:scale-95 transition-all cursor-pointer shadow-2xs">
                                            <span class="material-symbols-outlined text-[12px] text-cyan-600">navigation</span>
                                            <span>Waze</span>
                                            <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                        </a>
                                    </div>
                                    ` : ''}
                                </div>
                            ` : `
                                <div class="p-2.5 rounded-lg bg-slate-100/60 border border-dashed border-slate-300 text-xs flex flex-col items-center justify-center text-center space-y-1 text-slate-500 italic h-full py-4">
                                    <span class="material-symbols-outlined text-[22px] text-slate-400">playlist_add</span>
                                    <span class="font-semibold text-slate-600 text-xs">Sem Registro de Abertura</span>
                                    <span class="text-[10.5px] text-slate-500">Ponto adicional registrado durante o fechamento em campo.</span>
                                </div>
                            `}
                            ${p.hasFinalData ? `
                                 <div class="p-2.5 rounded-lg bg-emerald-50/40 border border-emerald-200/80 space-y-1 text-xs flex flex-col justify-between h-full">
                                     <div class="space-y-1">
                                         <div class="font-bold text-emerald-800 text-xs border-b border-emerald-200/60 pb-1">✅ Fechamento #${p.fechamento || p.numeroFechamento || 1}</div>
                                         <div><b class="text-slate-600">Plaqueta:</b> <span class="font-semibold text-emerald-900">${(p.plaquetaFinal && p.plaquetaFinal !== 'Não informada') ? p.plaquetaFinal : (pIdx === 0 ? (item.plaquetaFinal || 'Não informada') : 'Não informada')}</span></div>
                                         <div><b class="text-slate-600">Coordenada:</b> <span class="font-medium text-emerald-900">${(p.coordenadaFinal && p.coordenadaFinal !== 'Não informada') ? p.coordenadaFinal : (pIdx === 0 ? (item.coordenadaReparo || 'Não informada') : 'Não informada')}</span></div>
                                         <div><b class="text-slate-600">Problema:</b> <span class="font-medium text-emerald-900">${(p.problemaEncontrado && p.problemaEncontrado !== 'Não informado') ? p.problemaEncontrado : (pIdx === 0 ? (item.problemaEncontrado || 'Não informado') : 'Não informado')}</span></div>
                                         ${isRealAddr(p.enderecoFinal) ? `<div><b class="text-slate-600">Endereço Reparo:</b> <span class="font-medium text-emerald-900">${p.enderecoFinal}</span></div>` : ''}
                                     </div>
                                     ${navFin.hasNav ? `
                                     <div class="flex items-center gap-1.5 pt-1.5 border-t border-emerald-200/60 mt-1.5">
                                         <span class="text-[10.5px] font-semibold text-emerald-700 flex items-center gap-0.5">
                                             <span class="material-symbols-outlined text-[13px]">explore</span> Navegar:
                                         </span>
                                         <a href="${navFin.gmaps}" target="_blank" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300 active:scale-95 transition-all cursor-pointer shadow-2xs">
                                             <span class="material-symbols-outlined text-[12px] text-emerald-700">map</span>
                                             <span>Maps</span>
                                             <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                         </a>
                                         <a href="${navFin.waze}" target="_blank" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-cyan-100 text-cyan-800 hover:bg-cyan-200 border border-cyan-300 active:scale-95 transition-all cursor-pointer shadow-2xs">
                                             <span class="material-symbols-outlined text-[12px] text-cyan-600">navigation</span>
                                             <span>Waze</span>
                                             <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                         </a>
                                     </div>
                                     ` : ''}
                                 </div>
                             ` : `
                                 <div class="p-2.5 rounded-lg bg-amber-50/50 border border-dashed border-amber-300 text-xs flex flex-col items-center justify-center text-center space-y-1 text-amber-700 italic h-full py-4">
                                     <span class="material-symbols-outlined text-[22px] text-amber-500">pending_actions</span>
                                     <span class="font-semibold text-amber-800 text-xs">Aguardando Conclusão</span>
                                     <span class="text-[10.5px] text-amber-600">Ponto pendente de reparo/fechamento em campo.</span>
                                 </div>
                             `}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        ` : ''}

        <!-- Seção: Gestão de Sessões de Trabalho & Equipe (Praça Pública / Manutenção) -->
        ${(isPracaOS || (item.sessoesList && item.sessoesList.length > 0)) ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2">
            <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-blue-700 font-bold">
                    <span class="material-symbols-outlined text-[18px]">groups</span>
                    <span>Gestão de Sessões & Equipe</span>
                </span>
                ${item.tempoTotalFormatado ? `
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                    ⏱️ Tempo Total: ${item.tempoTotalFormatado}
                </span>
                ` : ''}
            </div>
            
            ${(item.sessoesList && item.sessoesList.length > 0) ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                ${item.sessoesList.map(s => {
                    const st = (s.status || '').toUpperCase();
                    const isEmAndamento = st.includes('ANDAMENTO');
                    const badgeBg = isEmAndamento ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300';
                    const iconStr = isEmAndamento ? 'play_arrow' : 'task_alt';
                    const dataInc = s.inicioStr || 'Início registrado';
                    const dataFim = s.fimStr || (isEmAndamento ? 'Em andamento...' : 'Concluída');
                    const durStr = s.duracao_minutos ? (s.duracao_minutos >= 60 ? `${Math.floor(s.duracao_minutos/60)}h ${s.duracao_minutos%60}min (${s.duracao_minutos} min)` : `${s.duracao_minutos} min`) : '';

                    const fotoEnt = s.foto_entrada || s.foto;
                    const fotoSai = s.foto_saida;
                    const fEntIdx = fotoEnt && item.fotosEvidencias ? item.fotosEvidencias.findIndex(f => f.url === fotoEnt) : -1;
                    const fSaiIdx = fotoSai && item.fotosEvidencias ? item.fotosEvidencias.findIndex(f => f.url === fotoSai) : -1;

                    return `
                    <div class="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div class="flex items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                            <span class="font-bold text-[12px] text-slate-800 flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[16px] text-blue-600">${iconStr}</span>
                                Sessão #${s.numero || 1}
                            </span>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeBg}">${s.status || 'REGISTRADA'}</span>
                        </div>
                        
                        <div class="text-[11px] text-slate-600 space-y-1">
                            <div class="flex items-center justify-between">
                                <span><b class="text-slate-500 font-medium">Equipe:</b> <span class="font-semibold text-slate-800">${s.qtd_eletricistas || item.qtdEletricistas || 1} Eletricista(s)</span></span>
                                ${s.tecnico ? `<span class="text-slate-500 text-[10px]"><b>Técnico:</b> ${s.tecnico}</span>` : ''}
                            </div>
                            <div class="bg-slate-50/80 p-1.5 rounded-lg border border-slate-200/60 space-y-0.5 text-[10.5px]">
                                <div><b class="text-slate-500 font-medium">Início:</b> ${dataInc}</div>
                                <div><b class="text-slate-500 font-medium">Fim:</b> ${dataFim}</div>
                            </div>
                            ${durStr ? `<div class="text-blue-700 font-bold text-[11px] pt-0.5">⏱️ Duração: ${durStr}</div>` : ''}
                            ${(s.coordenada_inicio || s.coordenada_fim) ? `
                            <div class="text-[10px] text-slate-500 flex flex-col gap-0.5 pt-1 border-t border-slate-100/80">
                                ${s.coordenada_inicio ? `<div><b class="text-slate-600">📍 GPS Início:</b> ${s.coordenada_inicio}</div>` : ''}
                                ${s.coordenada_fim ? `<div><b class="text-slate-600">📍 GPS Fim:</b> ${s.coordenada_fim}</div>` : ''}
                            </div>
                            ` : ''}
                            ${(s.materiais && s.materiais.length > 0) ? `
                            <div class="pt-1.5 border-t border-slate-100/80 text-[10px]">
                                <b class="text-slate-600 flex items-center gap-1 font-semibold mb-1">
                                    <span class="material-symbols-outlined text-[13px] text-slate-500">inventory_2</span>
                                    Materiais da Sessão:
                                </b>
                                <div class="flex flex-wrap gap-1">
                                    ${(window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(s.materiais) : (Array.isArray(s.materiais) ? s.materiais : [s.materiais])).map(mat => `<span class="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[9.5px] font-medium">${mat}</span>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        ${(fotoEnt || fotoSai || (s.fotos_andamento && s.fotos_andamento.length > 0)) ? `
                        <div class="pt-1.5 border-t border-slate-100 space-y-1.5">
                            ${fotoEnt ? `
                            <div class="flex items-center gap-2 cursor-pointer group p-1 rounded-lg hover:bg-slate-100/80 transition-colors" onclick="${fEntIdx >= 0 ? `window.abrirGaleriaFotosModal('${item.protocolo}', ${fEntIdx})` : `window.open('${fotoEnt}', '_blank')`}">
                                <div class="w-10 h-8 rounded-md overflow-hidden border border-slate-200 bg-slate-900 flex-shrink-0 relative">
                                    <img src="${fotoEnt}" alt="Foto Entrada Sessão #${s.numero}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-[10.5px] font-semibold text-blue-700 group-hover:underline flex items-center gap-0.5">
                                        📷 Foto de Entrada
                                    </span>
                                </div>
                            </div>
                            ` : ''}

                            ${(s.fotos_andamento && Array.isArray(s.fotos_andamento)) ? s.fotos_andamento.map((fAnd, faIdx) => {
                                const fAndIdx = item.fotosEvidencias ? item.fotosEvidencias.findIndex(f => f.url === fAnd) : -1;
                                return `
                                <div class="flex items-center gap-2 cursor-pointer group p-1 rounded-lg hover:bg-slate-100/80 transition-colors" onclick="${fAndIdx >= 0 ? `window.abrirGaleriaFotosModal('${item.protocolo}', ${fAndIdx})` : `window.open('${fAnd}', '_blank')`}">
                                    <div class="w-10 h-8 rounded-md overflow-hidden border border-slate-200 bg-slate-900 flex-shrink-0 relative">
                                        <img src="${fAnd}" alt="Foto Andamento #${faIdx + 1} Sessão #${s.numero}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="text-[10.5px] font-semibold text-blue-700 group-hover:underline flex items-center gap-0.5">
                                            📷 Foto do Andamento #${faIdx + 1}
                                        </span>
                                    </div>
                                </div>
                                `;
                            }).join('') : ''}

                            ${fotoSai ? `
                            <div class="flex items-center gap-2 cursor-pointer group p-1 rounded-lg hover:bg-slate-100/80 transition-colors" onclick="${fSaiIdx >= 0 ? `window.abrirGaleriaFotosModal('${item.protocolo}', ${fSaiIdx})` : `window.open('${fotoSai}', '_blank')`}">
                                <div class="w-10 h-8 rounded-md overflow-hidden border border-slate-200 bg-slate-900 flex-shrink-0 relative">
                                    <img src="${fotoSai}" alt="Foto Encerramento Sessão #${s.numero}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-[10.5px] font-semibold text-blue-700 group-hover:underline flex items-center gap-0.5">
                                        📷 Foto de Saída
                                    </span>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                    </div>
                    `;
                }).join('')}
            </div>
            ` : `
            <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant italic text-[11px]">
                Nenhuma sessão individual registrada para esta praça.
            </div>
            `}
        </div>
        ` : ''}

        <!-- Seção 3: Histórico de Fechamentos (Com Subseções de Materiais & Fotos para Cada Fechamento) -->
        ${(() => {
            const fechList = item.fechamentosList || [];
            if (!fechList || fechList.length === 0) return '';

            return `
            <div class="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3 text-xs">
                <div class="font-bold text-amber-900 text-xs border-b border-amber-200/60 pb-1.5 flex items-center justify-between">
                    <span class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px] text-amber-600">history</span>
                        <span>Histórico de Fechamentos (${fechList.length} registro${fechList.length > 1 ? 's' : ''})</span>
                    </span>
                    <span class="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                        Histórico Auditável
                    </span>
                </div>
                
                <div class="space-y-3 pt-1">
                    ${fechList.map((f, fIdx) => {
                        const dataStr = f.data_fechamento ? new Date(f.data_fechamento).toLocaleString('pt-BR') : (f.dataFechamentoStr || 'Data não informada');
                        const numFech = f.numero || f.numero_fechamento || (fIdx + 1);

                        const matsParsed = window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(f.materiais) : [];
                        const fotosParsed = window.ChamadoModel ? window.ChamadoModel.parseClosurePhotos(f) : [];

                        return `
                        <div class="p-3 rounded-xl bg-white border border-amber-200/90 shadow-2xs space-y-2.5">
                            <div class="flex flex-wrap items-center justify-between gap-1.5 font-bold text-amber-950 border-b border-amber-100 pb-1.5">
                                <span class="flex items-center gap-1.5 text-[12.5px]">
                                    <span class="material-symbols-outlined text-[16px] text-amber-600">task_alt</span>
                                    <span>Fechamento #${numFech}</span>
                                </span>
                                <span class="text-[10.5px] font-medium text-slate-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                                    📅 ${dataStr} • 👤 ${f.operador || 'Técnico Responsável'}
                                </span>
                            </div>

                            ${(f.relatorioTecnico || f.relatorio_tecnico || f.observacoes) ? `
                            <div class="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200/60 italic leading-relaxed">
                                "${f.relatorioTecnico || f.relatorio_tecnico || f.observacoes}"
                            </div>` : ''}

                            <div class="p-2 rounded-lg bg-amber-50/40 border border-amber-200/50 space-y-1 text-xs">
                                <div class="font-bold text-amber-900 text-[11px] flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px] text-amber-700">inventory_2</span>
                                    <span>Materiais Utilizados neste Fechamento (${matsParsed.length}):</span>
                                </div>
                                ${matsParsed.length > 0 ? `
                                    <div class="flex flex-wrap gap-1.5 pt-1">
                                        ${matsParsed.map(mat => `
                                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white text-amber-950 border border-amber-200 shadow-2xs">
                                                <span class="w-1.5 h-1.5 rounded-full bg-amber-600 flex-shrink-0"></span>
                                                <span>${mat}</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div class="text-[11px] text-slate-500 italic pt-0.5">Nenhum material cadastrado para este fechamento.</div>
                                `}
                            </div>

                            <div class="p-2 rounded-lg bg-slate-50 border border-slate-200/60 space-y-1 text-xs">
                                <div class="font-bold text-slate-700 text-[11px] flex items-center justify-between">
                                    <span class="flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[14px] text-slate-600">photo_camera</span>
                                        <span>Fotos & Evidências (${fotosParsed.length}):</span>
                                    </span>
                                </div>
                                ${fotosParsed.length > 0 ? `
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                                        ${fotosParsed.map(fotoObj => {
                                            const fIdx = (item.fotosEvidencias || []).findIndex(f => f.urlOriginal === fotoObj.url || f.url === fotoObj.url);
                                            const clickAction = fIdx >= 0
                                                ? `window.abrirGaleriaFotosModal('${item.protocolo}', ${fIdx})`
                                                : `window.abrirGaleriaFotosModal ? window.abrirGaleriaFotosModal([{url:'${fotoObj.url}', titulo:'${fotoObj.titulo}'}], 0) : window.open('${fotoObj.url}', '_blank')`;
                                            return `
                                            <div class="relative group rounded-lg overflow-hidden border border-slate-200 cursor-pointer shadow-2xs hover:shadow-md transition-all aspect-video bg-slate-900" onclick="${clickAction}">
                                                <img src="${fotoObj.url}" alt="${fotoObj.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                                                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1.5">
                                                    <span class="text-[9.5px] font-semibold text-white truncate drop-shadow">${fotoObj.titulo}</span>
                                                </div>
                                                <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded p-0.5">
                                                    <span class="material-symbols-outlined text-[12px]">open_in_new</span>
                                                </div>
                                            </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="text-[11px] text-slate-500 italic pt-0.5">Nenhuma foto anexada a este fechamento.</div>
                                `}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
            `;
        })()}

        <!-- Seção 5: Linha do Tempo de Auditoria & Logs -->
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2">
            <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-indigo-700 font-bold">
                    <span class="material-symbols-outlined text-[18px]">history</span>
                    <span>Histórico do protocolo</span>
                </span>
            </div>
            <div id="detalheModalLogsList" class="space-y-2">
                <div class="flex items-center gap-2 py-3 text-on-surface-variant text-[11px] italic">
                    <span class="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Buscando histórico de alterações do protocolo...</span>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Abre o modal interativo para alteração da lista de materiais da OS por Administrador
     * Organizado por Fechamento, integrado ao catálogo Supabase (materiais_contrato), 
     * com autocompletar, inclusão dos 5 itens mais frequentes dos últimos 30 dias e trava estrita.
     */
    async abrirModalEdicaoMateriais(protocoloOrId) {
        const item = (this.chamadosList || window.chamadosListCache || []).find(o => 
            String(o.protocolo || '').toUpperCase() === String(protocoloOrId || '').toUpperCase() || 
            String(o.id || '') === String(protocoloOrId)
        );

        if (!item) {
            alert('Ordem de serviço não encontrada para edição de materiais.');
            return;
        }

        // Validação de Perfil Administrativo
        let isAdmin = false;
        try {
            if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
                const r = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
                if (r === 'admin') isAdmin = true;
            }
            if (!isAdmin && window.usuarioLogadoSupabase) {
                const r = String(window.usuarioLogadoSupabase.role || window.usuarioLogadoSupabase.cargo || '').toLowerCase();
                if (r.includes('admin') || r.includes('gestor') || r.includes('supervisor')) isAdmin = true;
            }
            if (!isAdmin && String(localStorage.getItem('user_role') || '').toLowerCase().includes('admin')) {
                isAdmin = true;
            }
        } catch(e) {}

        if (!isAdmin) {
            alert('Acesso restrito: Apenas usuários com perfil de Administrador podem editar a lista de materiais.');
            return;
        }

        // 1. Carrega catálogo oficial de materiais do Supabase (materiais_contrato)
        const catalogList = await (async () => {
            if (window.opcoesMateriaisContrato && window.opcoesMateriaisContrato.length > 0) {
                return window.opcoesMateriaisContrato;
            }
            const cache = localStorage.getItem('os_cached_materiais');
            if (cache) {
                try {
                    const parsed = JSON.parse(cache);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        window.opcoesMateriaisContrato = parsed;
                        return parsed;
                    }
                } catch(e) {}
            }
            try {
                const client = window.supabaseClient || (typeof window.obterSupabaseClient === 'function' ? window.obterSupabaseClient() : null);
                if (client) {
                    const { data } = await client.from('materiais_contrato').select('*');
                    if (data && Array.isArray(data) && data.length > 0) {
                        window.opcoesMateriaisContrato = data.map(row => {
                            if (typeof row === 'string') return row;
                            var marca = (row["Marca"] || row.marca || row.fabricante || "").trim();
                            var desc = (row["Material/Serviço"] || row["Material"] || row.descricao || row.nome || "").trim();
                            var unidade = (row["Unidade de Medida"] || row["Unidade"] || row.unidade || "").trim();
                            var valFinal = (marca && desc && !desc.toLowerCase().startsWith(marca.toLowerCase())) ? `${marca} - ${desc}` : (desc || JSON.stringify(row));
                            if (unidade && !valFinal.includes('(')) valFinal += ` (${unidade})`;
                            return valFinal.trim();
                        }).filter(Boolean).sort();
                        localStorage.setItem('os_cached_materiais', JSON.stringify(window.opcoesMateriaisContrato));
                        return window.opcoesMateriaisContrato;
                    }
                }
            } catch(e) {
                console.warn('⚠️ [AuditoriaController] Erro ao carregar materiais_contrato:', e);
            }
            return null;
        })();

        // Se estiver offline ou sem catálogo do Supabase, bloqueia a edição para evitar inconsistências
        if (!catalogList || !Array.isArray(catalogList) || catalogList.length === 0) {
            alert('⚠️ Conexão indisponível ou catálogo de materiais do Supabase (materiais_contrato) inacessível.\n\nPor razões de segurança e consistência dos dados, a edição de materiais exige conexão com o banco de dados.');
            return;
        }

        // Monta o estado dos Fechamentos (ou Geral se não houver fechamentos)
        const fechamentosList = item.fechamentosList || [];
        let fechamentosState = [];

        if (fechamentosList.length > 0) {
            fechamentosState = fechamentosList.map((f, idx) => {
                const mats = window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(f.materiais) : (Array.isArray(f.materiais) ? f.materiais : [f.materiais]);
                const dataStr = f.data_fechamento ? new Date(f.data_fechamento).toLocaleString('pt-BR') : (f.dataFechamentoStr || '');
                return {
                    id: f.id,
                    numero: f.numero || f.numero_fechamento || (idx + 1),
                    operador: f.operador || 'Técnico Responsável',
                    dataStr: dataStr,
                    materiais: [...mats]
                };
            });
        } else {
            const mats = window.ChamadoModel ? window.ChamadoModel.parseMaterialsList(item.materialUtilizado) : [];
            fechamentosState = [{
                id: null,
                numero: 1,
                operador: item.operador || 'Abertura / Geral',
                dataStr: item.dataConclusaoStr || 'Atendimento Geral',
                materiais: [...mats]
            }];
        }

        // Remove modal existente se houver
        let modalEl = document.getElementById('modalEditarMateriaisAdmin');
        if (modalEl) modalEl.remove();

        // Cria o elemento modal com z-index elevado
        modalEl = document.createElement('div');
        modalEl.id = 'modalEditarMateriaisAdmin';
        modalEl.className = 'fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/75 backdrop-blur-xs transition-opacity animate-fade-in-up';
        modalEl.style.zIndex = '999999';

        // Renderiza o corpo do modal
        const renderModalContent = () => {
            modalEl.innerHTML = `
            <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
                <!-- Header -->
                <div class="px-5 py-4 border-b border-outline-variant/60 bg-slate-50 flex justify-between items-center flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <span class="material-symbols-outlined text-[22px]">inventory_2</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-base text-on-surface">Editar Materiais da OS</h3>
                            <p class="text-xs text-on-surface-variant font-medium">Protocolo: <span class="text-indigo-600 font-bold">#${item.protocolo || item.id}</span></p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('modalEditarMateriaisAdmin').remove()" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <!-- Body (Scrollable) -->
                <div class="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                    ${fechamentosState.map((fState, fIdx) => `
                    <div class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div class="flex items-center gap-2 font-bold text-slate-800 text-xs sm:text-sm">
                                <span class="material-symbols-outlined text-[18px] text-amber-600">task_alt</span>
                                <span>${fechamentosList.length > 0 ? `Fechamento #${fState.numero}` : 'Materiais Utilizados da OS'}</span>
                            </div>
                            <span class="text-[10.5px] font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                                👤 ${fState.operador} ${fState.dataStr ? `• 📅 ${fState.dataStr}` : ''}
                            </span>
                        </div>

                        <!-- Formulário de Adição com Autocompletar (Estilo Finalizar.html) -->
                        <div class="flex flex-col sm:flex-row gap-2.5 items-end pt-1">
                            <div class="flex-1 w-full relative custom-combobox">
                                <label for="inputMat_${fIdx}" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                                    Material do Catálogo Supabase
                                </label>
                                <input type="text" 
                                       id="inputMat_${fIdx}" 
                                       placeholder="Buscar material no catálogo..." 
                                       autocomplete="off"
                                       oninput="window.filtrarMateriaisAdmin(${fIdx})"
                                       onclick="window.mostrarMateriaisAdmin(${fIdx})"
                                       onfocus="window.mostrarMateriaisAdmin(${fIdx})"
                                       class="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent rounded-lg px-3 py-2 text-xs font-medium text-slate-900 transition-all" />
                                
                                <!-- Dropdown Autocompletar -->
                                <div id="dropdownMat_${fIdx}" class="hidden max-h-48 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl absolute z-50 left-0 right-0 top-full mt-1 border-t border-indigo-100 divide-y divide-slate-100"></div>
                            </div>

                            <div class="w-full sm:w-24">
                                <label for="inputQtd_${fIdx}" class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Qtd</label>
                                <input type="number" 
                                       id="inputQtd_${fIdx}" 
                                       min="0.1" 
                                       step="0.1" 
                                       value="1" 
                                       class="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent rounded-lg px-3 py-2 text-xs font-bold text-slate-900 transition-all text-center" />
                            </div>

                            <button type="button" 
                                    onclick="window.adicionarMaterialModalAdmin(${fIdx})" 
                                    class="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">add</span>
                                <span>Adicionar</span>
                            </button>
                        </div>

                        <!-- Tabela de Materiais Adicionados (Estilo Finalizar.html) -->
                        <div class="overflow-x-auto border border-slate-200 rounded-xl mt-2">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 text-slate-600 font-semibold uppercase border-b border-slate-200">
                                    <tr>
                                        <th class="py-2 px-3 w-16 text-center">Qtd</th>
                                        <th class="py-2 px-3">Material / Item</th>
                                        <th class="py-2 px-3 w-16 text-center">Ação</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 bg-white">
                                    ${fState.materiais.length > 0 ? fState.materiais.map((matItem, mIdx) => {
                                        let displayQtd = '1';
                                        let displayNome = '';
                                        if (typeof matItem === 'string') {
                                            displayNome = matItem;
                                            const matchQtd = matItem.match(/\(x?(\d+(\.\d+)?)\)$/i);
                                            if (matchQtd) {
                                                displayQtd = matchQtd[1];
                                                displayNome = matItem.replace(/\(x?\d+(\.\d+)?\)$/i, '').trim();
                                            }
                                        } else if (matItem && typeof matItem === 'object') {
                                            displayNome = String(matItem.nome || matItem.descricao || matItem.material || '').trim();
                                            displayQtd = String(matItem.qtd || matItem.quantidade || 1);
                                        } else if (matItem !== null && matItem !== undefined) {
                                            displayNome = String(matItem).trim();
                                        }

                                        return `
                                        <tr class="hover:bg-slate-50/80 transition-colors">
                                            <td class="py-2 px-3 font-bold text-slate-800 text-center">
                                                <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-bold inline-block">${displayQtd}</span>
                                            </td>
                                            <td class="py-2 px-3 font-medium text-slate-800 text-[11.5px]">${displayNome}</td>
                                            <td class="py-2 px-3 text-center">
                                                <button type="button" 
                                                        onclick="window.removerMaterialModalAdmin(${fIdx}, ${mIdx})" 
                                                        class="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                                                        title="Remover Material">
                                                    <span class="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                        `;
                                    }).join('') : `
                                        <tr>
                                            <td colspan="3" class="py-4 px-4 text-center text-slate-400 font-medium italic text-[11px]">
                                                Nenhum material cadastrado para este fechamento.
                                            </td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    `).join('')}

                </div>

                <!-- Footer -->
                <div class="px-5 py-3.5 border-t border-outline-variant/60 bg-slate-50 flex justify-end items-center gap-3 flex-shrink-0">
                    <button type="button" onclick="document.getElementById('modalEditarMateriaisAdmin').remove()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer">
                        Cancelar
                    </button>
                    <button type="button" id="btnSalvarMateriaisAdmin" onclick="window.salvarMateriaisAdmin('${item.protocolo || item.id}')" class="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all rounded-xl shadow-md cursor-pointer flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px]">save</span>
                        <span>Salvar Materiais</span>
                    </button>
                </div>
            </div>
            `;
        };

        // Handlers globais dinâmicos para a sessão atual do modal
        window.mostrarMateriaisAdmin = (fIdx) => {
            const inp = document.getElementById(`inputMat_${fIdx}`);
            const val = inp ? inp.value.trim() : '';
            window.filtrarMateriaisAdmin(fIdx, val);
        };

        window.filtrarMateriaisAdmin = (fIdx, forcedVal) => {
            const inp = document.getElementById(`inputMat_${fIdx}`);
            const drop = document.getElementById(`dropdownMat_${fIdx}`);
            if (!inp || !drop) return;

            inp.classList.remove('border-red-500', 'bg-red-50', 'text-red-900', 'ring-2', 'ring-red-500');
            inp.classList.add('border-slate-300', 'bg-slate-50');

            const val = (forcedVal !== undefined ? forcedVal : inp.value).trim().toLowerCase();
            const catalog = window.opcoesMateriaisContrato || [];

            const filtered = val 
                ? catalog.filter(m => m.toLowerCase().includes(val))
                : catalog;

            if (filtered.length === 0) {
                drop.innerHTML = `<div class="p-3 text-xs text-rose-600 font-semibold italic text-center">Nenhum material correspondente no catálogo.</div>`;
                drop.style.display = 'block';
                return;
            }

            drop.innerHTML = filtered.slice(0, 60).map(mat => {
                let htmlContent = mat;
                const matchUnidade = mat.match(/\s*\(([^)]+)\)$/);
                let unidadeHTML = "";
                let baseStr = mat;
                if (matchUnidade) {
                    unidadeHTML = ` <b class="font-bold text-blue-600">(${matchUnidade[1]})</b>`;
                    baseStr = mat.replace(/\s*\(([^)]+)\)$/, '');
                }
                const partes = baseStr.split(" - ");
                if (partes.length >= 2) {
                    htmlContent = `<b class="font-bold text-slate-900">${partes[0].trim()}</b> - ${partes.slice(1).join(" - ").trim()}${unidadeHTML}`;
                } else {
                    htmlContent = baseStr + unidadeHTML;
                }

                return `<div class="px-3.5 py-2 text-xs text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer transition-colors" onclick="window.selecionarMaterialDropdownAdmin(${fIdx}, '${mat.replace(/'/g, "\\'")}')">${htmlContent}</div>`;
            }).join('');

            drop.style.display = 'block';
        };

        window.selecionarMaterialDropdownAdmin = (fIdx, matNome) => {
            const inp = document.getElementById(`inputMat_${fIdx}`);
            const drop = document.getElementById(`dropdownMat_${fIdx}`);
            if (inp) {
                inp.value = matNome;
                inp.classList.remove('border-red-500', 'bg-red-50', 'text-red-900', 'ring-2', 'ring-red-500');
                inp.classList.add('border-slate-300', 'bg-slate-50');
            }
            if (drop) drop.style.display = 'none';
        };

        window.selecionarPresetModalAdmin = (fIdx, matNome) => {
            window.selecionarMaterialDropdownAdmin(fIdx, matNome);
        };

        window.adicionarMaterialModalAdmin = (fIdx) => {
            const inpMat = document.getElementById(`inputMat_${fIdx}`);
            const inpQtd = document.getElementById(`inputQtd_${fIdx}`);
            if (!inpMat) return;

            const rawVal = inpMat.value.trim();
            const qtd = inpQtd ? parseFloat(inpQtd.value) || 1 : 1;

            if (!rawVal) {
                inpMat.classList.add('border-red-500', 'bg-red-50', 'text-red-900', 'ring-2', 'ring-red-500');
                inpMat.focus();
                window.mostrarMateriaisAdmin(fIdx);
                return;
            }

            // Trava estrita contra o catálogo do Supabase
            const catalog = window.opcoesMateriaisContrato || [];
            const matchedCatalogItem = catalog.find(c => c.trim().toLowerCase() === rawVal.toLowerCase());

            if (!matchedCatalogItem) {
                inpMat.classList.add('border-red-500', 'bg-red-50', 'text-red-900', 'ring-2', 'ring-red-500');
                inpMat.focus();
                window.mostrarMateriaisAdmin(fIdx);
                return;
            }

            const itemFormatted = (qtd > 1 || qtd < 1) ? `${matchedCatalogItem} (x${qtd})` : matchedCatalogItem;
            fechamentosState[fIdx].materiais.push(itemFormatted);

            renderModalContent();
        };

        window.removerMaterialModalAdmin = (fIdx, mIdx) => {
            if (fechamentosState[fIdx] && fechamentosState[fIdx].materiais) {
                fechamentosState[fIdx].materiais.splice(mIdx, 1);
                renderModalContent();
            }
        };

        // Event listener para fechar dropdowns ao clicar fora
        const fecharDropdownsOnClickOutside = (e) => {
            if (!e.target.closest('.custom-combobox')) {
                fechamentosState.forEach((_, fIdx) => {
                    const drop = document.getElementById(`dropdownMat_${fIdx}`);
                    if (drop) drop.style.display = 'none';
                });
            }
        };
        document.removeEventListener('click', fecharDropdownsOnClickOutside);
        document.addEventListener('click', fecharDropdownsOnClickOutside);

        window.salvarMateriaisAdmin = async (prot) => {
            const btn = document.getElementById('btnSalvarMateriaisAdmin');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span><span>Salvando no banco...</span>`;
            }

            try {
                let todosMateriaisConsolidados = [];

                for (const fState of fechamentosState) {
                    await this.service.updateMaterial(prot, fState.materiais, fState.id, fState.numero);
                    todosMateriaisConsolidados = todosMateriaisConsolidados.concat(fState.materiais);
                }

                // Armazena JSON array para evitar que vírgulas no nome do material quebrem o item
                const matConsolidadoStr = JSON.stringify(todosMateriaisConsolidados);

                // Função auxiliar para atualizar as referências do item nos objetos em memória
                const updateItemRef = (targetObj) => {
                    if (!targetObj) return;
                    targetObj.materialUtilizado = matConsolidadoStr;
                    targetObj.material_utilizado = matConsolidadoStr;
                    if (targetObj.materiais !== undefined) targetObj.materiais = matConsolidadoStr;

                    fechamentosState.forEach((fState, idx) => {
                        if (targetObj.fechamentosList && targetObj.fechamentosList[idx]) {
                            targetObj.fechamentosList[idx].materiais = [...fState.materiais];
                        }
                        if (targetObj.fechamentos_os && targetObj.fechamentos_os[idx]) {
                            targetObj.fechamentos_os[idx].materiais = [...fState.materiais];
                        }
                    });
                };

                updateItemRef(item);

                // Atualiza o item em todas as listas de cache ativas no controlador
                [this.chamadosList, this.pracasChamadosList, this.completedChamadosList, window.chamadosListCache].forEach(arr => {
                    if (Array.isArray(arr)) {
                        arr.filter(o => o && (String(o.protocolo || "").toUpperCase() === String(prot).toUpperCase() || String(o.id || "") === String(prot)))
                           .forEach(o => updateItemRef(o));
                    }
                });

                document.removeEventListener('click', fecharDropdownsOnClickOutside);

                const mEdit = document.getElementById('modalEditarMateriaisAdmin');
                if (mEdit) mEdit.remove();

                // Re-renderiza o conteúdo do modal de detalhes da OS em tempo real
                const container = document.getElementById('detalheModalConteudo');
                if (container) {
                    container.innerHTML = this.buildDetalhesOSModalHtml(item);
                }

                // Recarrega o histórico de logs no modal com um pequeno delay para propagação no banco
                setTimeout(async () => {
                    await this.carregarLogsNoModal(prot);
                }, 200);

                if (typeof this.renderOSTable === 'function') this.renderOSTable();
                if (typeof this.renderPracaTable === 'function') this.renderPracaTable();
                if (typeof this.renderCompletedTable === 'function') this.renderCompletedTable();

                this.exibirModalSucessoHTML(
                    'Materiais Salvos',
                    `Materiais da OS <strong class="text-indigo-600 font-bold">#${prot}</strong> salvos e auditados no Supabase com sucesso!`
                );
            } catch(err) {
                console.error('Erro ao salvar materiais:', err);
                this.exibirModalErroHTML(
                    'Erro ao Salvar',
                    'Ocorreu uma falha ao salvar a lista de materiais no Supabase. Tente novamente.'
                );
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">save</span><span>Salvar Materiais</span>`;
                }
            }
        };

        renderModalContent();
        document.body.appendChild(modalEl);
    }

    /**
     * Exibe modal padrão de confirmação/sucesso em HTML sem utilizar alert nativo do navegador
     */
    exibirModalSucessoHTML(titulo, mensagem) {
        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal({
                title: titulo,
                message: mensagem,
                icon: 'check_circle',
                iconBgClass: 'bg-emerald-100 text-emerald-700',
                confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold',
                confirmText: 'Entendido',
                showJustification: false,
                onConfirm: () => {}
            });
            return;
        }

        let m = document.getElementById('modalSucessoAdminHTML');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'modalSucessoAdminHTML';
        m.className = 'fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs transition-opacity animate-fade-in-up';
        m.style.zIndex = '999999';
        m.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
                <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto flex-shrink-0">
                    <span class="material-symbols-outlined text-[28px]">check_circle</span>
                </div>
                <div class="space-y-1">
                    <h3 class="font-bold text-base text-slate-900">${titulo}</h3>
                    <p class="text-xs font-medium text-slate-600 leading-relaxed">${mensagem}</p>
                </div>
                <div class="pt-2">
                    <button type="button" onclick="document.getElementById('modalSucessoAdminHTML').remove()" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
                        Entendido
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(m);
    }

    exibirModalErroHTML(titulo, mensagem) {
        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal({
                title: titulo,
                message: mensagem,
                icon: 'error',
                iconBgClass: 'bg-rose-100 text-rose-700',
                confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white font-bold',
                confirmText: 'Fechar',
                showJustification: false,
                onConfirm: () => {}
            });
            return;
        }

        let m = document.getElementById('modalErroAdminHTML');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'modalErroAdminHTML';
        m.className = 'fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs transition-opacity animate-fade-in-up';
        m.style.zIndex = '999999';
        m.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
                <div class="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto flex-shrink-0">
                    <span class="material-symbols-outlined text-[28px]">error</span>
                </div>
                <div class="space-y-1">
                    <h3 class="font-bold text-base text-slate-900">${titulo}</h3>
                    <p class="text-xs font-medium text-slate-600 leading-relaxed">${mensagem}</p>
                </div>
                <div class="pt-2">
                    <button type="button" onclick="document.getElementById('modalErroAdminHTML').remove()" class="w-full py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
                        Fechar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(m);
    }
}

// Global helpers for row click details modal & material editing
window.editarMateriaisAdmin = function(id) {
    const path = (window.location.pathname || '').toLowerCase();
    const sidebar = document.querySelector('app-sidebar');
    const activePage = sidebar ? sidebar.getAttribute('active') : '';
    const isAuditoria = path.includes('auditoria') || activePage === 'auditoria' || !!document.getElementById('tabelaChamadosAuditoria');

    if (isAuditoria) {
        if (window.auditoriaController && typeof window.auditoriaController.abrirModalEdicaoMateriais === 'function') {
            return window.auditoriaController.abrirModalEdicaoMateriais(id);
        }
        if (window.painelController && typeof window.painelController.abrirModalEdicaoMateriais === 'function') {
            return window.painelController.abrirModalEdicaoMateriais(id);
        }
    } else {
        if (window.painelController && typeof window.painelController.abrirModalEdicaoMateriais === 'function') {
            return window.painelController.abrirModalEdicaoMateriais(id);
        }
        if (window.auditoriaController && typeof window.auditoriaController.abrirModalEdicaoMateriais === 'function') {
            return window.auditoriaController.abrirModalEdicaoMateriais(id);
        }
    }
    alert('Funcionalidade de edição de materiais indisponível no momento.');
};

window.abrirDetalhesOSModal = function(id) {
    const path = (window.location.pathname || '').toLowerCase();
    const sidebar = document.querySelector('app-sidebar');
    const activePage = sidebar ? sidebar.getAttribute('active') : '';
    const isAuditoria = path.includes('auditoria') || activePage === 'auditoria' || !!document.getElementById('tabelaChamadosAuditoria');

    if (isAuditoria) {
        if (window.auditoriaController && typeof window.auditoriaController.abrirDetalhesOSModal === 'function') {
            return window.auditoriaController.abrirDetalhesOSModal(id);
        }
        if (window.painelController && typeof window.painelController.abrirDetalhesOSModal === 'function') {
            return window.painelController.abrirDetalhesOSModal(id);
        }
    } else {
        if (window.painelController && typeof window.painelController.abrirDetalhesOSModal === 'function') {
            return window.painelController.abrirDetalhesOSModal(id);
        }
        if (window.auditoriaController && typeof window.auditoriaController.abrirDetalhesOSModal === 'function') {
            return window.auditoriaController.abrirDetalhesOSModal(id);
        }
    }

    if (typeof window.abrirModalDetalhesPrincipal === 'function') {
        window.abrirModalDetalhesPrincipal(id);
    } else {
        console.warn('Controller não encontrado para abrir detalhes da OS:', id);
    }
};

// Instantiate controller globally
window.AuditoriaController = AuditoriaController;
})();
document.addEventListener('DOMContentLoaded', () => {
    window.auditoriaController = new AuditoriaController();
    window.auditoriaController.init();
});
