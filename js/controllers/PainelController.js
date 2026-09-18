(function() {
    if (window.PainelController) return;

class PainelController {
    constructor() {
        this.service = new window.ChamadosService();
        this.chamadosList = [];
        this.activeFilters = {
            search: '',
            protocol: '',
            protocolPrefix: '',
            datePredicate: null,
            problem: ['all'],
            status: ['all']
        };
        this.medicaoService = window.MedicaoService ? new window.MedicaoService() : null;
    }

    /**
     * Initializes controller, loads data from Supabase, and binds UI listeners
     */
    async init() {
        console.log('🚀 [PainelController] Inicializando controlador do Painel...');
        this.setupEventListeners();
        await this.loadData();
    }

    /**
     * Shows skeleton loading state for KPI cards and table
     */
    showSkeletons() {
        if (!document.getElementById('os-table')) return;
        const kpiGrid = document.querySelector('.grid.grid-cols-12.gap-card-gap.mb-card-gap');
        if (kpiGrid && kpiGrid.children.length >= 4) {
            const kpiCards = kpiGrid.children;
            const card0 = kpiCards[0].querySelector('.font-headline-lg');
            if (card0) card0.innerHTML = '<div class="h-8 w-20 bg-surface-container-high animate-pulse rounded my-1"></div>';

            const card1 = kpiCards[1].querySelector('.font-headline-lg');
            if (card1) card1.innerHTML = '<div class="h-8 w-16 bg-surface-container-high animate-pulse rounded my-1"></div>';

            const card2 = kpiCards[2].querySelector('.font-headline-lg');
            if (card2) card2.innerHTML = '<div class="h-8 w-20 bg-surface-container-high animate-pulse rounded my-1"></div>';
            const rate2 = kpiCards[2].querySelector('.font-label-sm');
            if (rate2) rate2.innerHTML = '<div class="h-3.5 w-28 bg-surface-container-high animate-pulse rounded inline-block"></div>';

            const card3 = kpiCards[3].querySelector('.font-headline-lg');
            if (card3) card3.innerHTML = '<div class="h-8 w-24 bg-surface-container-high animate-pulse rounded my-1"></div>';
        }

        const tbodyMain = document.querySelector('#os-table tbody');
        const tbodyPendentes = document.querySelector('#pendentes-os-table tbody');
        const noResultsRowMain = document.getElementById('no-audit-results');
        const noResultsRowPendentes = document.getElementById('no-pendentes-results');

        [
            { tbody: tbodyMain, noResults: noResultsRowMain },
            { tbody: tbodyPendentes, noResults: noResultsRowPendentes }
        ].forEach(({ tbody, noResults }) => {
            if (tbody) {
                if (noResults) noResults.classList.add('hidden');
                Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
                    if (tr.id !== 'no-audit-results' && tr.id !== 'no-pendentes-results') tr.remove();
                });
                for (let i = 0; i < 3; i++) {
                    const tr = document.createElement('tr');
                    tr.className = 'skeleton-row border-b border-outline-variant bg-surface-container-lowest align-middle';
                    tr.innerHTML = `
                        <td class="py-3.5 px-5 align-middle"><div class="h-4 w-28 bg-surface-container-high animate-pulse rounded"></div></td>
                        <td class="py-3.5 px-5 align-middle"><div class="h-4 w-12 bg-surface-container-high animate-pulse rounded"></div></td>
                        <td class="py-3.5 px-5 align-middle"><div class="h-4 w-48 bg-surface-container-high animate-pulse rounded"></div></td>
                        <td class="py-3.5 px-5 align-middle"><div class="h-7 w-36 bg-surface-container-high animate-pulse rounded-full"></div></td>
                        <td class="py-3.5 px-5 align-middle"><div class="h-7 w-32 bg-surface-container-high animate-pulse rounded-full"></div></td>
                        <td class="py-3.5 px-5 align-middle text-center">
                            <div class="flex items-center justify-center gap-2">
                                <div class="h-6 w-6 bg-surface-container-high animate-pulse rounded"></div>
                                <div class="h-6 w-6 bg-surface-container-high animate-pulse rounded"></div>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }
            }
        });
    }

    /**
     * Loads Chamados from backend service and renders UI
     */
    async loadData() {
        try {
            this.showSkeletons();
            let list = await this.service.getChamadosList();
            if (typeof window !== 'undefined' && Boolean(window.isManutentorView)) {
                list = list.filter(item => (item.normalizedStatus || item.status) !== 'pendente' && (item.rawStatus || '').toLowerCase().trim() !== 'pendente');
            }
            // Ordenar da data mais antiga para a mais nova (ascendente)
            list.sort((a, b) => {
                const dateA = a.dataAbertura ? new Date(a.dataAbertura).getTime() : 0;
                const dateB = b.dataAbertura ? new Date(b.dataAbertura).getTime() : 0;
                return dateA - dateB;
            });
            this.chamadosList = list;
            this.updateKPIs();
            this.renderTable();
        } catch (err) {
            console.error('❌ [PainelController] Erro ao carregar dados:', err);
        }
    }

    /**
     * Updates KPI statistics cards in Painel.html
     */
    updateKPIs() {
        if (!document.getElementById('os-table')) return;
        const metrics = this.service.calculateMetrics(this.chamadosList);
        
        const kpiGrid = document.querySelector('.grid.grid-cols-12.gap-card-gap.mb-card-gap');
        if (!kpiGrid) return;

        const kpiCards = kpiGrid.children;
        if (kpiCards.length >= 4) {
            // Total OS
            const totalEl = kpiCards[0].querySelector('.font-headline-lg');
            if (totalEl) totalEl.textContent = metrics.totalOS;

            // Em Aberto
            const abertoEl = kpiCards[1].querySelector('.font-headline-lg');
            if (abertoEl) abertoEl.textContent = metrics.emAberto;

            // Concluídas
            const concluidasEl = kpiCards[2].querySelector('.font-headline-lg');
            if (concluidasEl) concluidasEl.textContent = metrics.concluidas;
            const concluidasRateEl = kpiCards[2].querySelector('.font-label-sm');
            if (concluidasRateEl) concluidasRateEl.textContent = `${metrics.completionRate} taxa de conclusão`;

            // Tempo Médio
            const avgEl = kpiCards[3].querySelector('.font-headline-lg');
            if (avgEl) avgEl.innerHTML = `${metrics.avgResolutionDays} <span class="text-body-lg font-body-lg">dias</span>`;
        }
    }

    /**
     * Renders filtered chamados into table tbody
     */
    renderTable() {
        const tbodyMain = document.querySelector('#os-table tbody');
        const tbodyPendentes = document.querySelector('#pendentes-os-table tbody');
        const containerPendentes = document.getElementById('container-pendentes-aprovacao');
        const noResultsRowMain = document.getElementById('no-audit-results');
        const noResultsRowPendentes = document.getElementById('no-pendentes-results');

        if (!tbodyMain && !tbodyPendentes) return;

        const filteredList = this.service.filterChamados(this.chamadosList, this.activeFilters);

        // Separate pending items matching current filters (ignoring the status filter of the main table)
        const pendentesFilters = { ...this.activeFilters, status: ['all'] };
        const pendentesFilteredList = this.service.filterChamados(this.chamadosList, pendentesFilters);
        const pendentesList = pendentesFilteredList.filter(item => item.normalizedStatus === 'pendente');

        // Check if system has any pending approval records
        const hasAnyPendingInSystem = (this.chamadosList || []).some(item => item.normalizedStatus === 'pendente');

        // Dynamically toggle Pendentes section visibility: visible ONLY when there is at least one pending OS
        if (containerPendentes) {
            if (hasAnyPendingInSystem && pendentesList.length > 0) {
                containerPendentes.classList.remove('hidden');
            } else {
                containerPendentes.classList.add('hidden');
            }
        }

        // 1. Render Pendentes Table
        if (tbodyPendentes) {
            Array.from(tbodyPendentes.querySelectorAll('tr')).forEach(tr => {
                if (tr.id !== 'no-pendentes-results') tr.remove();
            });

            if (pendentesList.length === 0) {
                if (noResultsRowPendentes) noResultsRowPendentes.classList.remove('hidden');
            } else {
                if (noResultsRowPendentes) noResultsRowPendentes.classList.add('hidden');
                pendentesList.forEach(item => {
                    const tr = this.createRowElement(item, true);
                    tbodyPendentes.appendChild(tr);
                });
            }
        }

        // 2. Render Main OS Table (Ordens de Serviço Recentes)
        if (tbodyMain) {
            Array.from(tbodyMain.querySelectorAll('tr')).forEach(tr => {
                if (tr.id !== 'no-audit-results') tr.remove();
            });

            if (filteredList.length === 0) {
                if (noResultsRowMain) noResultsRowMain.classList.remove('hidden');
            } else {
                if (noResultsRowMain) noResultsRowMain.classList.add('hidden');
                filteredList.forEach(item => {
                    const tr = this.createRowElement(item);
                    tbodyMain.appendChild(tr);
                });
            }
        }
    }

    /**
     * Creates a HTMLTableRowElement for a ChamadoModel entity
     */
    createRowElement(item, isPendentesTable = false) {
        const tr = document.createElement('tr');
        const isCancelada = item.normalizedStatus === 'cancelada';
        const isRejeitada = item.normalizedStatus === 'rejeitada';
        const isConcluida = item.normalizedStatus === 'concluida';
        const isPendente = item.normalizedStatus === 'pendente';
        const isEmAndamento = item.normalizedStatus === 'em_andamento';
        const isAberto = item.normalizedStatus === 'aberto';

        tr.className = `border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-surface-container-lowest align-middle ${(isCancelada || isRejeitada) ? 'opacity-70' : ''}`;
        const targetId = item.protocolo || item.id || '';
        tr.setAttribute('data-id', targetId);
        tr.setAttribute('onclick', `window.abrirDetalhesOSModal('${targetId}')`);

        // Protocolo
        const tdProtocolo = document.createElement('td');
        tdProtocolo.className = 'py-3 px-5 font-medium whitespace-nowrap truncate align-middle';
        if (item.isDireto) {
            const tecNome = item.operadorFinalizacao || item.operador || 'Não informado';
            tdProtocolo.innerHTML = `
                <div class="flex flex-col gap-0.5 max-w-full overflow-hidden">
                    <span class="font-mono font-bold text-amber-900 truncate" title="${item.protocolo}">${item.protocolo}</span>
                    <span class="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded text-[10px] font-bold max-w-full truncate border border-amber-200">
                        <span class="material-symbols-outlined text-[11px] text-amber-600 shrink-0">electric_bolt</span>
                        <span class="truncate">Emergencial (${tecNome})</span>
                    </span>
                </div>
            `;
        } else {
            tdProtocolo.textContent = item.protocolo;
        }

        // Data Abertura
        const tdData = document.createElement('td');
        tdData.className = 'py-3 px-5 text-on-surface-variant whitespace-nowrap truncate align-middle';
        tdData.textContent = item.formattedDateShort;

        // Endereço / Pontos
        const tdEndereco = document.createElement('td');
        tdEndereco.className = 'py-3 px-5 align-middle';
        const points = item.addressPointsIniciais;
        console.log(`📌 [PainelController] Renderizando OS ${item.protocolo}:`, {
            endereco: item.endereco,
            plaquetaInicial: item.plaquetaInicial,
            coordenadaInicial: item.coordenadaInicial,
            rawPontos: item.rawPontos,
            pointsResultantes: points
        });

        if (points.length > 1) {
            tdEndereco.innerHTML = `
                <div class="flex flex-col gap-1 w-full">
                    <div class="flex items-center gap-2 whitespace-nowrap w-full">
                        <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors flex-1 min-w-0" title="Clique para abrir no mapa Mapbox">
                            <span class="material-symbols-outlined text-[18px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                            <span class="font-medium truncate group-hover/loc:underline" title="${points[0]}">${points[0]}</span>
                        </button>
                        <button class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-label-sm font-semibold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all cursor-pointer active:scale-95 flex-shrink-0" onclick="window.toggleInlinePoints(this, ${points.length - 1}, event)" title="Expandir/Recolher pontos">
                            <span class="btn-text">+${points.length - 1}</span>
                            <span class="material-symbols-outlined text-[14px] btn-icon">expand_more</span>
                        </button>
                    </div>
                    <div class="extra-points hidden flex-col gap-1 font-medium text-on-surface whitespace-nowrap mt-1 w-full">
                        ${points.slice(1).map((p, idx) => `
                            <button onclick="window.abrirMapaPonto('${item.protocolo || item.id}', ${idx + 1}, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
                                <span class="material-symbols-outlined text-[16px] text-secondary/80 group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                                <span class="font-medium truncate group-hover/loc:underline" title="${p}">${p}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            const pointText = points[0] || 'Endereço não informado';
            tdEndereco.innerHTML = `
                <button onclick="window.abrirMapaPonto('${item.protocolo || item.id}', 0, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
                    <span class="material-symbols-outlined text-[18px] text-secondary group-hover/loc:scale-110 transition-transform flex-shrink-0">location_on</span>
                    <span class="font-medium truncate group-hover/loc:underline" title="${pointText}">${pointText}</span>
                </button>
            `;
        }

        // Detectar modo manutentor
        let isManutentorRole = false;
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') isManutentorRole = true;
        }

        const sidebar = document.querySelector('app-sidebar');
        const isSidebarManutentor = sidebar && (
            sidebar.getAttribute('mode') === 'manutentor' ||
            sidebar.getAttribute('active') === 'painel-manutentor'
        );

        const isManutentorView = Boolean(window.isManutentorView) ||
                                 Boolean(isSidebarManutentor) ||
                                 (document.body && document.body.classList.contains('manutentor-view')) ||
                                 decodeURIComponent(window.location.pathname || '').toLowerCase().includes('manutentor') ||
                                 window.location.href.toLowerCase().includes('manutentor') ||
                                 isManutentorRole;

        // Problema Select / Badge
        const tdProblema = document.createElement('td');
        tdProblema.className = 'py-3 px-5 whitespace-nowrap truncate align-middle';
        
        const probVal = item.problemSelectValue;
        
        if (isManutentorView) {
            const problemLabels = {
                'lampada-queimada': 'Lâmpada Queimada',
                'acesa-dia': 'Acesa Dia',
                'lampada-quebrada': 'Lâmpada Quebrada',
                'outro': 'Outro'
            };
            let selectBgColor = 'bg-[#f3f4f6] text-[#374151]';
            if (probVal === 'lampada-queimada') selectBgColor = 'bg-[#fef3c7] text-[#92400e]';
            if (probVal === 'acesa-dia') selectBgColor = 'bg-[#dbeafe] text-[#1e40af]';
            if (probVal === 'lampada-quebrada') selectBgColor = 'bg-[#ffedd5] text-[#9a3412]';

            const problemText = problemLabels[probVal] || item.problemaInicial || 'Outro';

            tdProblema.innerHTML = `
                <span class="px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[160px] max-w-full truncate ${selectBgColor}">
                    ${problemText}
                </span>
            `;
        } else {
            const selectDisabled = isConcluida ? 'disabled cursor-not-allowed pointer-events-none opacity-50' : 'cursor-pointer';
            
            let selectBgColor = 'bg-[#f3f4f6] text-[#374151]';
            if (probVal === 'lampada-queimada') selectBgColor = 'bg-[#fef3c7] text-[#92400e]';
            if (probVal === 'acesa-dia') selectBgColor = 'bg-[#dbeafe] text-[#1e40af]';
            if (probVal === 'lampada-quebrada') selectBgColor = 'bg-[#ffedd5] text-[#9a3412]';

            tdProblema.innerHTML = `
                <div class="relative inline-block w-[160px] max-w-full" onclick="event.stopPropagation()">
                    <select ${isConcluida ? 'disabled' : ''} class="w-full appearance-none [background-image:none] bg-none border-0 px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold outline-none focus:ring-0 text-center pr-6 transition-colors problem-select ${selectBgColor} ${selectDisabled}" onchange="window.painelController.handleProblemChange('${item.protocolo || item.id}', this)">
                        <option value="lampada-queimada" ${probVal === 'lampada-queimada' ? 'selected' : ''}>Lâmpada Queimada</option>
                        <option value="acesa-dia" ${probVal === 'acesa-dia' ? 'selected' : ''}>Acesa Dia</option>
                        <option value="lampada-quebrada" ${probVal === 'lampada-quebrada' ? 'selected' : ''}>Lâmpada Quebrada</option>
                        <option value="outro" ${probVal === 'outro' ? 'selected' : ''}>Outro</option>
                    </select>
                    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[16px] text-current opacity-70">arrow_drop_down</span>
                </div>
            `;
        }

        // Status / Motivo Column
        const tdStatus = document.createElement('td');
        tdStatus.className = 'py-3 px-5 whitespace-nowrap truncate align-middle';

        if (isPendentesTable) {
            const motivoFull = item.motivoAprovacao || 'Sem motivo registrado';
            const hasMotivo = Boolean(item.motivoAprovacao);

            if (hasMotivo) {
                const motivoConteudo = this.formatarMotivoComLinks(item.motivoAprovacao, { isTable: true, stopPropagation: true });
                tdStatus.innerHTML = `
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 max-w-full shadow-2xs" title="${motivoFull}">
                        <span class="material-symbols-outlined text-[15px] text-amber-600 shrink-0">info</span>
                        <div class="truncate flex items-center gap-1">${motivoConteudo}</div>
                    </div>
                `;
            } else {
                tdStatus.innerHTML = `
                    <span class="text-on-surface-variant/60 text-xs font-normal italic">Sem motivo informado</span>
                `;
            }
        } else {
            let badgeClass = 'bg-error-container text-on-error-container'; // Aberto
            if (isEmAndamento) badgeClass = 'bg-amber-100 text-amber-800 border border-amber-300';
            if (item.statusBadgeLabel === 'Iniciado') badgeClass = 'bg-blue-100 text-blue-800 border border-blue-300';
            if (isConcluida) badgeClass = 'bg-[#dcfce7] text-[#166534]';
            if (isCancelada) badgeClass = 'bg-slate-200 text-slate-700';
            if (isRejeitada) badgeClass = 'bg-rose-100 text-rose-800 border border-rose-300';
            if (isPendente) badgeClass = 'bg-surface-container-high text-on-surface';

            tdStatus.innerHTML = `
                <span class="status-badge px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[150px] max-w-full truncate transition-colors ${badgeClass}" data-status="${item.normalizedStatus}">
                    ${item.statusBadgeLabel}
                </span>
            `;
        }

        // Actions Column
        const tdAcoes = document.createElement('td');
        tdAcoes.className = 'py-3 px-5 whitespace-nowrap truncate text-center align-middle';
        tdAcoes.setAttribute('onclick', 'event.stopPropagation()');

        const editButtonHtml = isManutentorView ? '' : `
            <button class="btn-edit text-on-surface-variant hover:text-secondary hover:bg-surface-container-high p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida ? 'hidden' : ''}" onclick="window.painelController.abrirEdicaoOS('${item.protocolo || item.id}', event)" title="Editar Ordem de Serviço">
                <span class="material-symbols-outlined text-[20px]">edit</span>
            </button>
        `;

        const rejectButtonHtml = isManutentorView ? `
            <button class="btn-reject text-error hover:bg-error-container p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isEmAndamento ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.protocolo || item.id}', 'rejeitada', event)" title="Rejeitar Ordem de Serviço (Rejeitada)">
                <span class="material-symbols-outlined text-[20px]">thumb_down</span>
            </button>
        ` : `
            <button class="btn-reject text-error hover:bg-error-container p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isEmAndamento || isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.protocolo || item.id}', 'cancelada', event)" title="Cancelar (Cancelada)">
                <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
        `;

        const approveButtonHtml = isManutentorView ? '' : `
            <button class="btn-approve text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.protocolo || item.id}', 'aberto', event)" title="Aprovar (Em aberto)">
                <span class="material-symbols-outlined text-[20px]">check</span>
            </button>
        `;

        const revertButtonHtml = isManutentorView ? '' : `
            <button class="btn-revert text-secondary hover:bg-secondary/10 p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida || isCancelada || isRejeitada || isEmAndamento ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.protocolo || item.id}', 'aberto', event)" title="Reverter para Em aberto">
                <span class="material-symbols-outlined text-[20px]">undo</span>
            </button>
        `;

        tdAcoes.innerHTML = `
            <div class="flex items-center justify-center gap-1 action-buttons">
                ${approveButtonHtml}
                ${rejectButtonHtml}
                <button class="btn-complete text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isEmAndamento ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.protocolo || item.id}', 'concluida', event)" title="Concluir / Finalizar OS">
                    <span class="material-symbols-outlined text-[20px]">task_alt</span>
                </button>
                ${revertButtonHtml}
                ${editButtonHtml}
            </div>
        `;

        tr.appendChild(tdProtocolo);
        tr.appendChild(tdData);
        tr.appendChild(tdEndereco);
        tr.appendChild(tdProblema);
        tr.appendChild(tdStatus);
        tr.appendChild(tdAcoes);

        return tr;
    }

    /**
     * Formata o motivo de pendência/aprovação com links interativos para abrir OSs duplicadas
     * @param {string} motivo Texto do motivo
     * @param {object} options { isTable: boolean, stopPropagation: boolean }
     * @returns {string} HTML com botões interativos
     */
    formatarMotivoComLinks(motivo, options = {}) {
        if (window.ChamadoModel && typeof window.ChamadoModel.formatarMotivoHtml === 'function') {
            return window.ChamadoModel.formatarMotivoHtml(motivo, options);
        }
        if (!motivo) return '';
        const stopProp = options.stopPropagation ? 'event.stopPropagation(); ' : '';
        const isTable = Boolean(options.isTable);
        const btnClass = isTable
            ? 'inline-flex items-center gap-1 font-mono font-bold text-[11px] text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 border border-blue-300 hover:border-blue-400 px-1.5 py-0.5 rounded shadow-2xs transition-all cursor-pointer select-none mx-0.5 active:scale-95'
            : 'inline-flex items-center gap-1 font-mono font-bold text-xs text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 border border-blue-300 hover:border-blue-400 px-2 py-0.5 rounded shadow-2xs transition-all cursor-pointer align-middle select-none mx-0.5 active:scale-95';

        const escapeHtml = (str) => String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        let safeText = escapeHtml(motivo);
        safeText = safeText.replace(/\(há\s+(\d+)d\s+a\s+(\d+)m\)/gi, (m, d, dist) => {
            const dTxt = d === '1' ? '1 dia' : `${d} dias`;
            const mTxt = dist === '1' ? '1 metro' : `${dist} metros`;
            return `(há ${dTxt}, a ${mTxt})`;
        }).replace(/\((hoje|ontem)\s+a\s+(\d+)m\)/gi, (m, quando, dist) => {
            const mTxt = dist === '1' ? '1 metro' : `${dist} metros`;
            return `(${quando}, a ${mTxt})`;
        });
        const regex = /(?:#([A-Za-z0-9_-]+)|\b(IP[0-9A-Za-z]{6,14}|PC[0-9A-Za-z]{6,14})\b)/g;

        return safeText.replace(regex, (match, p1, p2) => {
            const rawProt = p1 || p2;
            const cleanProt = String(rawProt).replace(/^#/, '').trim();
            const displayProt = '#' + cleanProt;
            const iconSize = isTable ? '12px' : '13px';
            return `<button type="button" onclick="${stopProp}window.abrirDetalhesOSModal('${cleanProt}')" class="${btnClass}" title="Abrir Ordem de Serviço ${displayProt}"><span class="material-symbols-outlined text-[${iconSize}] text-blue-600 pointer-events-none">open_in_new</span><span>${displayProt}</span></button>`;
        });
    }

    /**
     * Binds search inputs, filter triggers, and modal actions
     */
    setupEventListeners() {
        // Intercepta fechamento do modal para limpar histórico de navegação entre OSs
        const origFechar = window.fecharDetalhesOSModal;
        window.fecharDetalhesOSModal = () => {
            this.modalHistory = [];
            this.currentModalProtocolo = null;
            if (typeof origFechar === 'function') origFechar();
        };
        window.voltarModalOS = () => this.voltarModalOS();

        // Main search bar input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.activeFilters.search = e.target.value;
                this.renderTable();
            });
        }

        // Protocol column search input
        const protocolInput = document.getElementById('protocol-search-input');
        if (protocolInput) {
            protocolInput.addEventListener('input', (e) => {
                this.activeFilters.protocol = e.target.value;
                const indicator = document.getElementById('protocol-filter-indicator');
                if (indicator) {
                    if (e.target.value.trim() || this.activeFilters.protocolPrefix) indicator.classList.remove('hidden');
                    else indicator.classList.add('hidden');
                }
                this.renderTable();
            });
        }

        // Checkbox problem filters
        const problemFilterAll = document.getElementById('problem-filter-all');
        const problemCheckboxes = document.querySelectorAll('input[name="problem-filter"].problem-checkbox');
        const problemIndicator = document.getElementById('problem-filter-indicator');

        const updateProblemFilterState = () => {
            const checkedBoxes = document.querySelectorAll('input[name="problem-filter"].problem-checkbox:checked');
            const checkedValues = Array.from(checkedBoxes).map(cb => cb.value);
            const totalCheckboxes = problemCheckboxes.length;

            if (problemFilterAll) {
                problemFilterAll.checked = (checkedValues.length === totalCheckboxes && totalCheckboxes > 0);
            }

            if (checkedValues.length === totalCheckboxes || (checkedValues.length === 0 && problemFilterAll && problemFilterAll.checked)) {
                this.activeFilters.problem = ['all'];
                if (problemIndicator) problemIndicator.classList.add('hidden');
            } else {
                this.activeFilters.problem = checkedValues;
                if (problemIndicator) {
                    problemIndicator.classList.remove('hidden');
                }
            }
            this.renderTable();
        };

        if (problemFilterAll) {
            problemFilterAll.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                problemCheckboxes.forEach(cb => cb.checked = isChecked);
                updateProblemFilterState();
            });
        }

        problemCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                updateProblemFilterState();
            });
        });

        // Checkbox status filters
        const statusFilterAll = document.getElementById('status-filter-all');
        const statusCheckboxes = document.querySelectorAll('input[name="status-filter"].status-checkbox');
        const statusIndicator = document.getElementById('status-filter-indicator');

        const updateStatusFilterState = () => {
            const checkedBoxes = document.querySelectorAll('input[name="status-filter"].status-checkbox:checked');
            const checkedValues = Array.from(checkedBoxes).map(cb => cb.value);
            const totalCheckboxes = statusCheckboxes.length;

            if (statusFilterAll) {
                statusFilterAll.checked = (checkedValues.length === totalCheckboxes && totalCheckboxes > 0);
            }

            if (checkedValues.length === totalCheckboxes || (checkedValues.length === 0 && statusFilterAll && statusFilterAll.checked)) {
                this.activeFilters.status = ['all'];
                if (statusIndicator) statusIndicator.classList.add('hidden');
            } else {
                this.activeFilters.status = checkedValues;
                if (statusIndicator) {
                    statusIndicator.classList.remove('hidden');
                }
            }
            this.renderTable();
        };

        if (statusFilterAll) {
            statusFilterAll.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                statusCheckboxes.forEach(cb => cb.checked = isChecked);
                updateStatusFilterState();
            });
        }

        statusCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                updateStatusFilterState();
            });
        });

        // Initialize status filter state based on DOM checkbox state
        updateStatusFilterState();
    }

    /**
     * Handles status change modal confirmation and triggers service update
     */
    handleStatusAction(id, targetUIStatus, event) {
        if (event) event.stopPropagation();
        const item = this.chamadosList.find(c => String(c.protocolo || "").toUpperCase() === String(id || "").toUpperCase() || String(c.id || "") === String(id));
        const protocol = item ? item.protocolo : id;

        if (targetUIStatus === 'concluida') {
            if (typeof window.abrirModalFinalizarOS === 'function') {
                window.abrirModalFinalizarOS(item || { id: id, protocolo: protocol });
            }
            return;
        }

        const isPendente = item && (item.normalizedStatus === 'pendente' || (item.status || '').toLowerCase().trim() === 'pendente');

        let title = 'Alterar Status';
        let message = `Deseja prosseguir com a alteração?`;
        let icon = 'check';
        let iconBgClass = 'bg-blue-100 text-blue-700';
        let confirmBtnClass = 'bg-secondary text-white';
        let confirmText = 'Confirmar';

        if (targetUIStatus === 'aberto') {
            if (isPendente) {
                title = 'Aprovar OS';
                message = `Deseja aprovar o protocolo <strong class="text-on-surface font-semibold">${protocol}</strong>?<br>Seu status mudará para <strong class="text-error font-semibold">Em aberto</strong>.`;
                icon = 'check';
                iconBgClass = 'bg-emerald-100 text-emerald-700';
                confirmBtnClass = 'bg-emerald-600 hover:bg-emerald-700 text-white';
                confirmText = 'Aprovar';
            } else {
                title = 'Reverter OS';
                message = `Deseja reverter a ordem de serviço <strong class="text-on-surface font-semibold">${protocol}</strong>?<br>Seu status voltará para <strong class="text-error font-semibold">Em aberto</strong>.`;
                icon = 'undo';
                iconBgClass = 'bg-blue-100 text-blue-700';
                confirmBtnClass = 'bg-blue-600 hover:bg-blue-700 text-white';
                confirmText = 'Reverter';
            }
        } else if (targetUIStatus === 'cancelada') {
            title = 'Cancelar Ordem de Serviço';
            message = `Deseja cancelar a Ordem de Serviço do protocolo <strong class="text-on-surface font-semibold">${protocol}</strong>?`;
            icon = 'close';
            iconBgClass = 'bg-rose-100 text-rose-700';
            confirmBtnClass = 'bg-rose-600 hover:bg-rose-700 text-white';
            confirmText = 'Cancelar OS';
        } else if (targetUIStatus === 'rejeitada') {
            title = 'Rejeitar Ordem de Serviço';
            message = `Deseja realmente rejeitar a Ordem de Serviço do protocolo <strong class="text-on-surface font-semibold">${protocol}</strong>?<br>Esta ação alterará o status da OS para <strong class="text-rose-700 font-semibold">Rejeitada</strong>.`;
            icon = 'thumb_down';
            iconBgClass = 'bg-rose-100 text-rose-700';
            confirmBtnClass = 'bg-rose-600 hover:bg-rose-700 text-white';
            confirmText = 'Rejeitar OS';
        }

        window.showConfirmModal({
            title: title,
            message: message,
            icon: icon,
            iconBgClass: iconBgClass,
            confirmBtnClass: confirmBtnClass,
            confirmText: confirmText,
            requireJustification: (targetUIStatus === 'rejeitada' || targetUIStatus === 'cancelada' || targetUIStatus === 'aberto'),
            onConfirm: async (justification) => {
                try {
                    const targetId = (item && item.protocolo) ? item.protocolo : id;
                    await this.service.changeChamadoStatus(targetId, targetUIStatus, justification);
                    await this.loadData();
                } catch (err) {
                    alert('Erro ao atualizar status no Supabase: ' + err.message);
                }
            }
        });
    }

    /**
     * Handles problem select change
     */
    async handleProblemChange(id, selectElement) {
        const newProblem = selectElement.options[selectElement.selectedIndex].text;
        const item = this.chamadosList.find(c => c.id === id);
        
        try {
            await this.service.repository.updateProblem(id, newProblem);
            if (item) item.problemaInicial = newProblem;
            
            // Update select color style
            const val = selectElement.value;
            selectElement.className = selectElement.className.replace(/bg-\[\#[a-f0-9]+\]/g, '').replace(/text-\[\#[a-f0-9]+\]/g, '');
            if (val === 'lampada-queimada') selectElement.classList.add('bg-[#fef3c7]', 'text-[#92400e]');
            else if (val === 'lampada-quebrada') selectElement.classList.add('bg-[#ffedd5]', 'text-[#9a3412]');
            else selectElement.classList.add('bg-[#f3f4f6]', 'text-[#374151]');

        } catch (err) {
            console.error('Falha ao atualizar problema:', err);
        }
    }

    /**
     * Abre a Ordem de Serviço selecionada no modal para edição
     */
    abrirEdicaoOS(id, event) {
        if (event) event.stopPropagation();
        const item = this.chamadosList.find(c => String(c.id) === String(id) || String(c.protocolo) === String(id));
        if (item && typeof window.abrirModalEditarOS === 'function') {
            window.abrirModalEditarOS(item);
        } else {
            console.warn('⚠️ OS não encontrada para edição:', id);
        }
    }

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

            popoverText.innerText = explicacao;
            popover.style.display = 'block';

            const rect = target.getBoundingClientRect();
            const popoverWidth = 260;
            let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
            if (left < 10) left = 10;
            if (left + popoverWidth > window.innerWidth - 10) left = window.innerWidth - popoverWidth - 10;

            let top = rect.top - 12;
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
            popover.style.transform = 'translateY(-100%)';

            requestAnimationFrame(() => {
                popover.style.opacity = '1';
            });
            activeTarget = target;
        };

        const hideTooltip = () => {
            const popover = document.getElementById('audit-global-popover');
            if (popover) {
                popover.style.opacity = '0';
                popover.style.display = 'none';
            }
            activeTarget = null;
        };

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-audit-explicacao]');
            if (target) {
                showTooltip(target);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-audit-explicacao]');
            if (target && target === activeTarget) {
                hideTooltip();
            }
        });
    }

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

        // Como a listagem do grid não traz colunas pesadas (pontos_final, evidencias base64, materiais, etc.)
        // para economizar Egress, sempre enriquecemos a OS com fetchById sob demanda se ela não tiver sido enriquecida ainda:
        if (window.supabaseClient && window.ChamadosRepository) {
            try {
                const repo = new window.ChamadosRepository();
                const needsEnrich = !item || !item._isEnriched || !item.rawPontosFinal || (Array.isArray(item.rawPontosFinal) && item.rawPontosFinal.length === 0);
                if (needsEnrich) {
                    const fullRow = await repo.fetchById(cleanId);
                    if (fullRow) {
                        const ModelClass = window.ChamadoModel;
                        const fullItem = (fullRow instanceof ModelClass) ? fullRow : (ModelClass && typeof ModelClass.fromRow === 'function' ? ModelClass.fromRow(fullRow) : (ModelClass ? new ModelClass(fullRow) : fullRow));
                        fullItem._isEnriched = true;
                        item = fullItem;

                        // Atualiza as referências nas listas em memória mantendo os getters do protótipo
                        if (this.chamadosList && Array.isArray(this.chamadosList)) {
                            const idx = this.chamadosList.findIndex(c => {
                                const p = String(c.protocolo || '').replace(/^#/, '').trim().toUpperCase();
                                const cid = String(c.id || '').replace(/^#/, '').trim().toUpperCase();
                                return p === upperClean || cid === upperClean;
                            });
                            if (idx >= 0) this.chamadosList[idx] = fullItem;
                            else this.chamadosList.push(fullItem);
                        }
                        if (window.chamadosListCache && Array.isArray(window.chamadosListCache)) {
                            const idx = window.chamadosListCache.findIndex(c => {
                                const p = String(c.protocolo || '').replace(/^#/, '').trim().toUpperCase();
                                const cid = String(c.id || '').replace(/^#/, '').trim().toUpperCase();
                                return p === upperClean || cid === upperClean;
                            });
                            if (idx >= 0) window.chamadosListCache[idx] = fullItem;
                            else window.chamadosListCache.push(fullItem);
                        }
                    }
                }
            } catch (errRemoto) {
                console.warn('⚠️ [PainelController] Erro ao buscar detalhes da OS sob demanda via fetchById:', errRemoto);
            }
        }
        
        if (!item && !window.supabaseClient && window.ChamadoModel) {
            item = new window.ChamadoModel({
                id: cleanId,
                protocolo: cleanId,
                status: 'Concluída',
                data_abertura: '2023-08-09T10:00:00Z',
                data_conclusao: '2023-08-09T14:30:00Z',
                municipe_nome: 'Munícipe (Demonstração)',
                operador: 'Sistema',
                prioridade: 'Normal',
                problema_inicial: 'Lâmpada queimada',
                problema_encontrado: 'Lâmpada queimada',
                plaqueta_inicial: 'P-10492',
                plaqueta_final: 'P-10492',
                coordenada_inicial: '-21.980500, -46.791200',
                coordenada_reparo: '-21.980850, -46.791520',
                endereco: 'Av. Principal, 500',
                materiais: '',
                status_auditoria: 'Concluída'
            });
        }
        if (!item) {
            if (window.Toast) {
                window.Toast.show(`Ordem de Serviço #${cleanId} não encontrada.`, 'warning');
            } else {
                alert(`Ordem de Serviço #${cleanId} não encontrada.`);
            }
            return;
        }

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
            } else if (stNorm === 'rejeitada') {
                elStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300';
            } else {
                elStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error-container text-on-error-container';
            }
        }

        const elAuditBadge = document.getElementById('detalheModalAuditBadge');
        if (elAuditBadge) {
            elAuditBadge.classList.add('hidden');
        }

        const container = document.getElementById('detalheModalConteudo');
        if (container) {
            container.innerHTML = this.buildDetalhesOSModalHtml(item);
            this.carregarLogsNoModal(item.protocolo);
        }

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
                } else if (
                    (hasNovos && log.dados_novos && (log.dados_novos.percentual !== undefined || log.dados_novos.regraId !== undefined || log.dados_novos.artigoTR !== undefined)) ||
                    (hasAnteriores && log.dados_anteriores && (log.dados_anteriores.percentual !== undefined || log.dados_anteriores.regraId !== undefined || log.dados_anteriores.artigoTR !== undefined))
                ) {
                    const g = log.dados_novos || log.dados_anteriores || {};
                    const isRemocao = !log.dados_novos && Boolean(log.dados_anteriores);
                    const isAnistia = Boolean(g.anistiado);
                    const perc = Number(g.percentual) || 0;
                    const nomeGlosa = g.nome || g.regra || 'Glosa Administrativa';
                    const artTR = g.artigoTR ? `(${g.artigoTR})` : '';

                    diffHtml = `
                        <div class="mt-2 p-2.5 rounded-xl ${isRemocao ? 'bg-slate-50 border border-slate-200' : (isAnistia ? 'bg-emerald-50/60 border border-emerald-200/80' : 'bg-rose-50/60 border border-rose-200/80')} space-y-1.5 text-xs">
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                                    <span class="material-symbols-outlined text-[15px] ${isRemocao ? 'text-slate-500' : (isAnistia ? 'text-emerald-600' : 'text-rose-600')}">
                                        ${isRemocao ? 'delete' : (isAnistia ? 'verified' : 'gavel')}
                                    </span>
                                    <span>${nomeGlosa}</span>
                                    ${artTR ? `<span class="text-[10px] text-slate-500 font-normal">${artTR}</span>` : ''}
                                </div>
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isRemocao ? 'bg-slate-200 text-slate-700 line-through' : (isAnistia ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 border border-rose-200')}">
                                    ${isAnistia ? `Anistiada (-${perc}%)` : (isRemocao ? `Removida (-${perc}%)` : `-${perc}%`)}
                                </span>
                            </div>
                            ${g.motivo ? `
                                <div class="text-[11px] text-slate-600 bg-white/80 p-1.5 rounded-lg border border-slate-200/60">
                                    <b>Motivo:</b> ${g.motivo}
                                </div>
                            ` : ''}
                            ${g.justificativa_anistia ? `
                                <div class="text-[10.5px] text-emerald-800 bg-emerald-100/50 p-1.5 rounded-lg border border-emerald-200">
                                    <b>Justificativa da Anistia:</b> ${g.justificativa_anistia}
                                </div>
                            ` : ''}
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
     * Constrói o HTML dinâmico das informações detalhadas da OS para o modal no Painel
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

        const historyBannerHtml = (this.modalHistory && this.modalHistory.length > 0) ? `
            <div class="p-2.5 bg-blue-50/95 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 shadow-2xs mb-3">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-blue-600 shrink-0">link</span>
                    <span>Visualizando OS referenciada como duplicata <strong class="font-mono font-bold text-blue-800">#${item.protocolo}</strong></span>
                </div>
                <button type="button" onclick="window.painelController.voltarModalOS()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 hover:bg-blue-100 hover:text-blue-900 border border-blue-300 hover:border-blue-400 active:scale-95 transition-all shadow-2xs cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Voltar para #${this.modalHistory[this.modalHistory.length - 1]}</span>
                </button>
            </div>
        ` : '';

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
                ${(item.telefoneCelular || item.telefoneFixo || item.rawRow?.telefone_celular || item.rawRow?.telefone_fixo) ? `<div><b class="text-on-surface-variant font-medium">Telefone/Contato:</b> <span class="font-medium text-on-surface">${[item.telefoneCelular || item.rawRow?.telefone_celular, item.telefoneFixo || item.rawRow?.telefone_fixo].filter(Boolean).join(' / ')}</span></div>` : ''}
                <div><b class="text-on-surface-variant font-medium">CPF Solicitante:</b> <span class="font-medium text-on-surface">${item.maskedCpfSolicitante || 'Não informado'}</span></div>
                <div><b class="text-on-surface-variant font-medium">Cadastrado por (Abertura):</b> <span class="font-semibold text-blue-700">${opAbertura}</span></div>
                <div><b class="text-on-surface-variant font-medium">Finalizado por (Conclusão):</b> <span class="font-semibold ${item.normalizedStatus === 'concluida' ? 'text-emerald-700' : 'text-on-surface-variant'}">${opFinalizacao}</span></div>
                <div><b class="text-on-surface-variant font-medium">Prioridade:</b> <span class="font-medium text-on-surface">${item.prioridade || 'Normal'}</span></div>
                ${item.motivoAprovacao ? `<div class="mt-1"><b class="text-amber-800 font-medium">Motivo Pendência/Aprovação:</b> <span class="font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-flex items-center flex-wrap gap-1 mt-0.5 shadow-2xs">${this.formatarMotivoComLinks(item.motivoAprovacao, { isTable: false })}</span></div>` : ''}
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

        <!-- Seção Especial: Detalhes da Praça Pública & Problemas Relatados (Exclusivo para Protocolos 'P') -->
        ${isPracaOS ? (() => {
            const pracaNome = item.pracaNome || item.rawRow?.praca_nome || 'Praça Pública / Área de Lazer';
            const enderecoPraca = item.endereco || item.rawRow?.endereco || 'Endereço não informado';
            const coordPraca = item.coordenadaInicial || item.coordenada || item.rawRow?.coordenada || '';
            const coordReparoPraca = item.coordenadaReparo || item.rawRow?.coordenada_reparo || '';
            
            // Tratamento detalhado da lista de problemas relatados
            let problemasArray = [];
            if (item.problemasList && Array.isArray(item.problemasList)) {
                problemasArray = item.problemasList;
            } else if (item.rawRow?.problemas) {
                const rawProb = item.rawRow.problemas;
                if (Array.isArray(rawProb)) problemasArray = rawProb;
                else if (typeof rawProb === 'string' && (rawProb.trim().startsWith('[') || rawProb.trim().startsWith('{'))) {
                    try { problemasArray = JSON.parse(rawProb.trim()); } catch(e) {}
                }
            }

            // Fallback se não for array de objetos: utiliza problemaInicial
            const fallbackProbText = item.problemaInicial || item.problema || (item.rawRow && (item.rawRow.problema_inicial || item.rawRow.problema)) || '';

            // Links de Navegação Maps / Waze
            let lat = null, lng = null;
            const coordAlvo = coordReparoPraca || coordPraca;
            if (coordAlvo) {
                const parts = String(coordAlvo).split(',').map(s => s.trim());
                if (parts.length >= 2) {
                    const pLat = parseFloat(parts[0]);
                    const pLng = parseFloat(parts[1]);
                    if (!isNaN(pLat) && !isNaN(pLng)) { lat = pLat; lng = pLng; }
                }
            }
            let gmaps = '#', waze = '#';
            if (lat !== null && lng !== null) {
                gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
            } else if (enderecoPraca && !enderecoPraca.toLowerCase().includes('não informado')) {
                const enc = encodeURIComponent(enderecoPraca + (enderecoPraca.toLowerCase().includes('araraquara') ? '' : ', Araraquara - SP'));
                gmaps = `https://www.google.com/maps/search/?api=1&query=${enc}`;
                waze = `https://waze.com/ul?q=${enc}&navigate=yes`;
            }

            return `
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2.5">
                <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                    <span class="flex items-center gap-1.5 text-emerald-800 font-bold">
                        <span class="material-symbols-outlined text-[18px] text-emerald-600">park</span>
                        <span>Identificação & Problemas Relatados da Praça</span>
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                        Praça Pública
                    </span>
                </div>

                <div class="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/60 shadow-2xs space-y-2.5">
                    <!-- Nome da Praça & Problemas Principais -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Logradouro / Espaço</span>
                            <span class="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                                <span class="material-symbols-outlined text-[16px] text-emerald-600">location_city</span>
                                ${pracaNome}
                            </span>
                        </div>
                    </div>

                    <!-- Bloco de Problemas Relatados -->
                    <div class="space-y-1.5">
                        <span class="text-[10.5px] font-bold text-slate-700 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[15px] text-amber-600">report_problem</span>
                            Problemas Relatados na Abertura:
                        </span>
                        
                        <div class="flex flex-wrap gap-1.5 pt-0.5">
                            ${(Array.isArray(problemasArray) && problemasArray.length > 0) ? problemasArray.map(p => {
                                const probNome = (typeof p === 'object' && p !== null) ? (p.problema || p.descricao || p.tipo || p.nome || 'Problema não especificado') : String(p);
                                const probQtd = (typeof p === 'object' && p !== null) ? (p.quantidade || p.qtd) : null;
                                return `
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-950 border border-amber-200 shadow-2xs">
                                    <span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                                    <span>${probNome}</span>
                                    ${probQtd ? `<span class="bg-amber-200/80 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">Qtd: ${probQtd}</span>` : ''}
                                </span>
                                `;
                            }).join('') : `
                                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-950 border border-amber-200 shadow-2xs">
                                    <span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                                    <span>${fallbackProbText || 'Nenhum problema detalhado'}</span>
                                </span>
                            `}
                        </div>
                    </div>

                    <!-- Localização & Coordenadas -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                        <div class="space-y-1">
                            <div><b class="text-slate-600">Endereço:</b> <span class="font-medium text-slate-800">${enderecoPraca}</span></div>
                            ${coordReparoPraca ? `<div><b class="text-slate-600">Coordenada Reparo:</b> <span class="font-mono text-emerald-800 text-[11px]">${coordReparoPraca}</span></div>` : ''}
                        </div>

                        ${(gmaps !== '#' || waze !== '#') ? `
                        <div class="flex flex-col justify-end items-start md:items-end gap-1 pt-1 md:pt-0">
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Navegação GPS:</span>
                            <div class="flex items-center gap-1.5">
                                <a href="${gmaps}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                    <span class="material-symbols-outlined text-[13px] text-blue-600">map</span>
                                    <span>Google Maps</span>
                                    <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                </a>
                                <a href="${waze}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-50 text-cyan-800 hover:bg-cyan-100 border border-cyan-200 active:scale-95 transition-all shadow-2xs cursor-pointer">
                                    <span class="material-symbols-outlined text-[13px] text-cyan-600">navigation</span>
                                    <span>Waze</span>
                                    <span class="material-symbols-outlined text-[9px] opacity-70">open_in_new</span>
                                </a>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            `;
        })() : ''}

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
                            ${s.descricao_servico ? `
                            <div class="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-950 space-y-0.5">
                                <b class="text-emerald-800 flex items-center gap-1 font-bold text-[10px]">
                                    <span class="material-symbols-outlined text-[13px] text-emerald-700">description</span>
                                    Descrição do Serviço:
                                </b>
                                <p class="whitespace-pre-line text-[10.5px] leading-tight font-medium text-slate-800">${s.descricao_servico}</p>
                            </div>
                            ` : ''}
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



        <!-- Seção 3: Histórico de Fechamentos (Exclusivo para Protocolos Viários 'I') -->
        ${(() => {
            if (isPracaOS) return '';
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

        <!-- Seção Especial: Galeria Completa de Evidências Fotográficas (Todas as fotos da OS) -->
        ${(() => {
            const fotosGeral = item.fotosEvidencias || [];
            if (!fotosGeral || fotosGeral.length === 0) return '';

            return `
            <div class="p-3.5 bg-surface-container-low border border-outline-variant/50 rounded-xl space-y-2.5 text-xs">
                <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                    <span class="flex items-center gap-1.5 text-slate-800 font-bold">
                        <span class="material-symbols-outlined text-[18px] text-blue-600">collections</span>
                        <span>Galeria de Evidências Fotográficas (${fotosGeral.length})</span>
                    </span>
                    <button type="button" onclick="window.abrirGaleriaFotosModal('${item.protocolo}', 0)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-all active:scale-95 cursor-pointer">
                        <span class="material-symbols-outlined text-[13px]">fullscreen</span>
                        <span>Ver em Tela Cheia</span>
                    </button>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
                    ${fotosGeral.map((fotoObj, fIdx) => `
                        <div class="relative group rounded-lg overflow-hidden border border-slate-200 cursor-pointer shadow-2xs hover:shadow-md transition-all aspect-video bg-slate-900" onclick="window.abrirGaleriaFotosModal('${item.protocolo}', ${fIdx})">
                            <img src="${fotoObj.thumbnailUrl || fotoObj.url}" alt="${fotoObj.titulo || 'Evidência'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1.5">
                                <span class="text-[9.5px] font-semibold text-white truncate drop-shadow">${fotoObj.titulo || 'Evidência'}</span>
                            </div>
                            <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded p-0.5">
                                <span class="material-symbols-outlined text-[12px]">open_in_new</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        })()}

        <!-- Seção 4: Glosas & Penalidades Contratuais (Automáticas do TR e Administrativas) -->
        ${(() => {
            // Avalia infrações automáticas via MedicaoService se disponível
            let infracoesTR = [];
            const medService = (window.medicaoController && window.medicaoController.medicaoService) || this.medicaoService || (window.MedicaoService ? new window.MedicaoService() : null);
            if (medService && typeof medService.avaliarInfracoesOS === 'function') {
                try {
                    const avaliadas = medService.avaliarInfracoesOS(item) || [];
                    // Filtra apenas as automáticas (atraso_execucao, sem_plaqueta, etc.)
                    infracoesTR = avaliadas.filter(inf => !inf.isManualAdmin && inf.regraId !== 'personalizada');
                } catch (errInf) {
                    console.warn('⚠️ [PainelController] Falha ao avaliar regras do TR:', errInf);
                }
            }

            const glosasManuais = item.glosas || [];
            const totalGlosasGeral = infracoesTR.length + glosasManuais.length;

            return `
            <div class="p-3.5 bg-rose-50/40 border border-rose-200/80 rounded-xl space-y-3 text-xs">
                <div class="font-bold text-rose-950 text-xs border-b border-rose-200/60 pb-1.5 flex items-center justify-between">
                    <span class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px] text-rose-600">gavel</span>
                        <span>Glosas & Penalidades Contratuais (${totalGlosasGeral})</span>
                    </span>
                    ${!isManutentorUser ? `
                    <button type="button" onclick="window.painelController.abrirModalAplicarGlosa('${item.protocolo || item.id}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-all active:scale-95 cursor-pointer">
                        <span class="material-symbols-outlined text-[13px]">add</span>
                        <span>Aplicar Glosa</span>
                    </button>
                    ` : ''}
                </div>

                <div id="containerListaGlosasOS" class="space-y-2">
                    ${totalGlosasGeral === 0 ? `
                        <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant italic text-[11px] flex items-center justify-between">
                            <span>Nenhuma glosa ou penalidade aplicável a este protocolo.</span>
                            <span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">verified</span> 100% Conforme
                            </span>
                        </div>
                    ` : ''}

                    <!-- 1. Glosas Automáticas Calculadas do Termo de Referência (TR) -->
                    ${infracoesTR.map((inf) => {
                        const isAnistiada = Boolean(inf.anistiado);
                        const perc = Number(inf.percentualGlosa) || 0;
                        const badgePerc = isAnistiada 
                            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 line-through">-${perc}% (Anistiada)</span>`
                            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">-${perc}% TR</span>`;

                        return `
                        <div class="p-2.5 rounded-xl bg-surface-container-lowest border ${isAnistiada ? 'border-slate-200 opacity-75' : 'border-amber-200 shadow-2xs'} space-y-1.5 text-xs">
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-slate-800 text-[11.5px]">${inf.nome || 'Regra TR'}</span>
                                    <span class="text-[9.5px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide bg-blue-100 text-blue-800 border border-blue-200">Automática TR</span>
                                    ${inf.artigoTR ? `<span class="text-[10px] text-slate-500 font-medium">(${inf.artigoTR})</span>` : ''}
                                </div>
                                <div>${badgePerc}</div>
                            </div>

                            <div class="text-[11px] text-slate-600 leading-relaxed bg-slate-50/60 p-2 rounded-lg border border-slate-100">
                                <div><b>Detalhamento:</b> ${inf.detalhe || 'Infração identificada pelas regras do contrato.'}</div>
                                ${isAnistiada && inf.justificativa ? `<div class="text-emerald-800 mt-1"><b>Justificativa da Anistia:</b> ${inf.justificativa}</div>` : ''}
                            </div>

                            <div class="flex items-center justify-between pt-1 text-[10px] text-slate-500 border-t border-slate-100">
                                <span>⚙️ <b>Avaliado automaticamente pelo sistema com base no TR</b></span>
                                ${!isManutentorUser ? `
                                <div class="flex items-center gap-1.5">
                                    ${!isAnistiada ? `
                                        <button type="button" onclick="window.painelController.alternarAnistiaGlosaAutomatica('${item.protocolo || item.id}', '${inf.regraId}', true, ${perc})" class="px-2 py-0.5 rounded font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-300 transition-colors" title="Relevar/Anistiar glosa automática no cálculo de medição">
                                            Anistiar
                                        </button>
                                    ` : `
                                        <button type="button" onclick="window.painelController.alternarAnistiaGlosaAutomatica('${item.protocolo || item.id}', '${inf.regraId}', false, ${perc})" class="px-2 py-0.5 rounded font-semibold text-amber-700 hover:bg-amber-50 border border-amber-300 transition-colors" title="Reativar desconto da glosa automática">
                                            Reativar Glosa
                                        </button>
                                    `}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}

                    <!-- 2. Glosas Administrativas / Manuais -->
                    ${glosasManuais.map((g, gIdx) => {
                        const isAnistiada = Boolean(g.anistiado);
                        const perc = Number(g.percentual) || 0;
                        const badgePerc = isAnistiada 
                            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 line-through">-${perc}% (Anistiada)</span>`
                            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">-${perc}% Glosa</span>`;

                        const dtStr = g.data_aplicacao ? new Date(g.data_aplicacao).toLocaleString('pt-BR') : '';

                        return `
                        <div class="p-2.5 rounded-xl bg-surface-container-lowest border ${isAnistiada ? 'border-slate-200 opacity-75' : 'border-rose-200 shadow-2xs'} space-y-1.5 text-xs">
                            <div class="flex items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-slate-800 text-[11.5px]">${g.nome || g.regra || 'Glosa Administrativa'}</span>
                                    <span class="text-[9.5px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide bg-purple-100 text-purple-800 border border-purple-200">Manual</span>
                                    ${g.artigoTR ? `<span class="text-[10px] text-slate-500 font-medium">(${g.artigoTR})</span>` : ''}
                                </div>
                                <div>${badgePerc}</div>
                            </div>

                            <div class="text-[11px] text-slate-600 leading-relaxed bg-slate-50/60 p-2 rounded-lg border border-slate-100">
                                <div><b>Motivo:</b> ${g.motivo || 'Motivo não informado.'}</div>
                                ${isAnistiada && g.justificativa_anistia ? `<div class="text-emerald-800 mt-1"><b>Justificativa da Anistia:</b> ${g.justificativa_anistia}</div>` : ''}
                            </div>

                            <div class="flex items-center justify-between pt-1 text-[10px] text-slate-500 border-t border-slate-100">
                                <span>👤 <b>Aplicado por:</b> ${g.aplicado_por || 'Administrador'} ${dtStr ? `• ${dtStr}` : ''}</span>
                                ${!isManutentorUser ? `
                                <div class="flex items-center gap-1.5">
                                    ${!isAnistiada ? `
                                        <button type="button" onclick="window.painelController.alternarAnistiaGlosa('${item.protocolo || item.id}', ${gIdx}, true)" class="px-2 py-0.5 rounded font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-300 transition-colors" title="Relevar/Anistiar glosa no cálculo de medição">
                                            Anistiar
                                        </button>
                                    ` : `
                                        <button type="button" onclick="window.painelController.alternarAnistiaGlosa('${item.protocolo || item.id}', ${gIdx}, false)" class="px-2 py-0.5 rounded font-semibold text-amber-700 hover:bg-amber-50 border border-amber-300 transition-colors" title="Reativar desconto da glosa">
                                            Reativar Glosa
                                        </button>
                                    `}
                                    <button type="button" onclick="window.painelController.removerGlosaOS('${item.protocolo || item.id}', ${gIdx})" class="px-1.5 py-0.5 rounded font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors" title="Excluir esta glosa">
                                        <span class="material-symbols-outlined text-[13px] align-middle">delete</span>
                                    </button>
                                </div>
                                ` : ''}
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
     * Abre o modal interativo para alteração da lista de materiais da OS por Administrador no Painel
     * Organizado por Fechamento, integrado ao catálogo Supabase (materiais_contrato), 
     * com autocompletar e atualização em tempo real dos cards e tabelas.
     */
    async abrirModalEdicaoMateriais(protocoloOrId) {
        if (window.auditoriaController && typeof window.auditoriaController.abrirModalEdicaoMateriais === 'function' && (!this.chamadosList || this.chamadosList.length === 0)) {
            return await window.auditoriaController.abrirModalEdicaoMateriais(protocoloOrId);
        }
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
                console.warn('⚠️ [PainelController] Erro ao carregar materiais_contrato:', e);
            }
            return null;
        })();

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

                        <!-- Formulário de Adição com Autocompletar -->
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

                        <!-- Tabela de Materiais Adicionados -->
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

                // Atualiza o item em todas as listas de cache ativas
                [this.chamadosList, window.chamadosListCache, window.dadosOSsAbertasCache].forEach(arr => {
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

                if (typeof this.renderTable === 'function') this.renderTable();
                if (typeof this.renderOSTable === 'function') this.renderOSTable();

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
     * Abre o modal ou diálogo para aplicação de glosa contratual no protocolo selecionado
     */
    async abrirModalAplicarGlosa(protocoloOrId) {
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') {
                this.exibirModalErroHTML('Acesso Restrito', 'Apenas administradores possuem permissão para aplicar ou gerenciar glosas contratuais.');
                return;
            }
        }
        const item = (this.chamadosList || window.chamadosListCache || []).find(o => 
            String(o.protocolo || '').toUpperCase() === String(protocoloOrId || '').toUpperCase() || 
            String(o.id || '') === String(protocoloOrId)
        );
        if (!item) {
            this.exibirModalErroHTML('Não Encontrada', 'Ordem de serviço não encontrada para aplicação de glosa.');
            return;
        }

        // Se existir o modal no DOM, exibe-o; caso contrário cria dinamicamente
        let modal = document.getElementById('modalAplicarGlosaAdmin');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalAplicarGlosaAdmin';
            modal.className = 'fixed inset-0 z-[70000] hidden flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-on-surface">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface-container-low">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-rose-600 text-[22px]">gavel</span>
                            <h3 class="font-bold text-sm text-slate-800" id="modalGlosaTitulo">Aplicar Glosa Contratual</h3>
                        </div>
                        <button type="button" onclick="document.getElementById('modalAplicarGlosaAdmin').classList.add('hidden')" class="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                            <span class="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    <form id="formAplicarGlosaAdmin" class="p-5 space-y-4 text-xs" onsubmit="event.preventDefault(); window.painelController.confirmarAplicacaoGlosa();">
                        <input type="hidden" id="glosa_form_protocolo" value="" />
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Regra / Infração Contratual:</label>
                            <select id="glosa_form_regra" class="w-full text-xs border border-outline-variant rounded-lg p-2.5 bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-secondary outline-none" onchange="window.painelController.onSelectRegraGlosa(this.value)">
                                <option value="sem_plaqueta" data-art="Item 7.6.3" data-perc="20">Ausência / Ilegibilidade de Plaqueta (-20%) - Item 7.6.3</option>
                                <option value="foto_inadequada" data-art="Item 8.3.1.1" data-perc="20">Foto sem Derredores / Detalhes Incompletos (-20%) - Item 8.3.1.1</option>
                                <option value="foto_ausente_incompleta" data-art="Item 8.3.1.3" data-perc="100">Falta de Registro Fotográfico Antes/Depois (-100%) - Item 8.3.1.3</option>
                                <option value="falta_checkin_checkout" data-art="Item 8.4.3" data-perc="15">Descumprimento Check-in/Check-out no App (-15%) - Item 8.4.3</option>
                                <option value="atraso_execucao" data-art="Item 7.1.4" data-perc="10">Atraso na Execução (10% por dia útil) - Item 7.1.4</option>
                                <option value="personalizada" data-art="Administrativo" data-perc="0">Outra Glosa / Penalidade Personalizada</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">Artigo / Referência TR:</label>
                                <input type="text" id="glosa_form_artigo" value="Item 7.6.3" class="w-full text-xs border border-outline-variant rounded-lg p-2 bg-surface-container-lowest" required />
                            </div>
                            <div>
                                <label class="font-bold text-slate-700 block mb-1">% Glosa (Desconto):</label>
                                <div class="flex items-center gap-1">
                                    <input type="number" step="0.5" min="1" max="100" id="glosa_form_perc" value="20" class="w-full text-xs font-bold border border-outline-variant rounded-lg p-2 bg-surface-container-lowest" required />
                                    <span class="font-bold text-slate-500">%</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label class="font-bold text-slate-700 block mb-1">Motivo / Descrição da Não Conformidade:</label>
                            <textarea id="glosa_form_motivo" rows="3" class="w-full text-xs border border-outline-variant rounded-lg p-2 bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-secondary outline-none" placeholder="Informe detalhadamente o motivo da penalidade ou evidência encontrada..." required></textarea>
                        </div>
                        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onclick="document.getElementById('modalAplicarGlosaAdmin').classList.add('hidden')" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" id="btnConfirmarGlosaAdmin" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-2xs transition-colors flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[16px]">gavel</span>
                                <span>Salvar e Aplicar Glosa</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const inpProt = document.getElementById('glosa_form_protocolo');
        const titModal = document.getElementById('modalGlosaTitulo');
        if (inpProt) inpProt.value = item.protocolo || item.id;
        if (titModal) titModal.innerText = `Aplicar Glosa no Protocolo #${item.protocolo || item.id}`;

        // Reset fields
        const selRegra = document.getElementById('glosa_form_regra');
        if (selRegra) {
            selRegra.selectedIndex = 0;
            this.onSelectRegraGlosa(selRegra.value);
        }
        const txtMotivo = document.getElementById('glosa_form_motivo');
        if (txtMotivo) txtMotivo.value = '';

        modal.classList.remove('hidden');
    }

    onSelectRegraGlosa(val) {
        const sel = document.getElementById('glosa_form_regra');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const inpArt = document.getElementById('glosa_form_artigo');
        const inpPerc = document.getElementById('glosa_form_perc');

        if (opt && inpArt && inpPerc) {
            inpArt.value = opt.getAttribute('data-art') || '';
            inpPerc.value = opt.getAttribute('data-perc') || '10';
        }
    }

    async confirmarAplicacaoGlosa() {
        const prot = document.getElementById('glosa_form_protocolo')?.value;
        const selRegra = document.getElementById('glosa_form_regra');
        const optRegra = selRegra ? selRegra.options[selRegra.selectedIndex] : null;
        const art = document.getElementById('glosa_form_artigo')?.value || '';
        const perc = parseFloat(document.getElementById('glosa_form_perc')?.value) || 0;
        const motivo = document.getElementById('glosa_form_motivo')?.value?.trim() || '';

        if (!prot || perc <= 0 || !motivo) {
            this.exibirModalErroHTML('Campos Obrigatórios', 'Por favor, preencha todos os campos obrigatórios da glosa corretamente.');
            return;
        }

        const btn = document.getElementById('btnConfirmarGlosaAdmin');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Salvando...';
        }

        try {
            const list = (this.chamadosList || window.chamadosListCache || []);
            const item = list.find(o => String(o.protocolo || '').toUpperCase() === String(prot).toUpperCase() || String(o.id || '') === String(prot));
            const glosasAtuais = (item && Array.isArray(item.glosas)) ? [...item.glosas] : [];

            // Obter usuário da sessão
            let aplicador = 'Administrador';
            if (window.LogsRepository) {
                const logsRepo = typeof window.LogsRepository === 'function' ? new window.LogsRepository() : window.LogsRepository;
                const info = await logsRepo.getCurrentUserInfo();
                if (info && (info.nome || info.email)) aplicador = info.nome || info.email;
            }

            const novaGlosa = {
                id: (selRegra?.value || 'glosa') + '_' + Date.now(),
                regraId: selRegra?.value || 'personalizada',
                nome: optRegra ? optRegra.text.split(' - ')[0] : 'Glosa Administrativa',
                artigoTR: art,
                percentual: perc,
                motivo: motivo,
                anistiado: false,
                justificativa_anistia: '',
                aplicado_por: aplicador,
                data_aplicacao: new Date().toISOString(),
                origem: 'ADMIN'
            };

            glosasAtuais.push(novaGlosa);

            // Persistir no Supabase
            await this.salvarGlosasNoBanco(prot, glosasAtuais);

            // Atualizar modelo em memória
            if (item) item.glosas = glosasAtuais;

            // Registrar Log de Auditoria
            if (window.LogsRepository) {
                const logsRepo = typeof window.LogsRepository === 'function' ? new window.LogsRepository() : window.LogsRepository;
                const logFn = logsRepo.registrarLog || logsRepo.inserirLog;
                if (typeof logFn === 'function') {
                    await logFn.call(logsRepo, {
                        protocolo: prot,
                        tipoAcao: 'AUDITORIA',
                        tipo_acao: 'AUDITORIA',
                        descricao: `Glosa Contratual aplicada (${novaGlosa.nome} -${perc}%): ${motivo}`,
                        dadosNovos: novaGlosa,
                        dados_novos: novaGlosa,
                        origemTela: 'Painel'
                    });
                }
            }

            document.getElementById('modalAplicarGlosaAdmin')?.classList.add('hidden');

            // Atualiza o modal de detalhes aberto
            await this.abrirDetalhesOSModal(prot);

            this.exibirModalSucessoHTML(
                'Glosa Aplicada com Sucesso',
                `A glosa de <strong class="text-rose-700 font-bold">-${perc}%</strong> foi aplicada e registrada com sucesso ao protocolo <strong class="text-slate-900 font-bold">#${prot}</strong>.`
            );
        } catch (err) {
            console.error('❌ Erro ao salvar glosa:', err);
            this.exibirModalErroHTML(
                'Erro ao Salvar Glosa',
                `Ocorreu um erro ao salvar a glosa no banco de dados: ${err.message || err}`
            );
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">gavel</span> <span>Salvar e Aplicar Glosa</span>';
            }
        }
    }

    async alternarAnistiaGlosa(prot, glosaIndex, anistiar = true) {
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') {
                this.exibirModalErroHTML('Acesso Restrito', 'Apenas administradores possuem permissão para anistiar ou reativar glosas.');
                return;
            }
        }
        const list = (this.chamadosList || window.chamadosListCache || []);
        const item = list.find(o => String(o.protocolo || '').toUpperCase() === String(prot).toUpperCase() || String(o.id || '') === String(prot));
        if (!item || !item.glosas || !item.glosas[glosaIndex]) return;

        const glosa = item.glosas[glosaIndex];

        const executarAlteracao = async (justificativa = '') => {
            const glosas = [...item.glosas];
            glosas[glosaIndex].anistiado = anistiar;
            glosas[glosaIndex].justificativa_anistia = justificativa;
            glosas[glosaIndex].data_anistia = new Date().toISOString();

            try {
                await this.salvarGlosasNoBanco(prot, glosas);
                item.glosas = glosas;

                if (window.LogsRepository) {
                    const logsRepo = typeof window.LogsRepository === 'function' ? new window.LogsRepository() : window.LogsRepository;
                    const logFn = logsRepo.registrarLog || logsRepo.inserirLog;
                    if (typeof logFn === 'function') {
                        await logFn.call(logsRepo, {
                            protocolo: prot,
                            tipoAcao: 'AUDITORIA',
                            tipo_acao: 'AUDITORIA',
                            descricao: anistiar ? `Glosa anistiada pelo fiscal: ${justificativa || 'Sem justificativa'}` : `Glosa reativada pelo fiscal`,
                            dadosNovos: glosas[glosaIndex],
                            dados_novos: glosas[glosaIndex],
                            origemTela: 'Painel'
                        });
                    }
                }

                await this.abrirDetalhesOSModal(prot);

                // Notifica a tela de Medição para recalcular imediatamente
                window.dispatchEvent(new CustomEvent('glosa-anistia-atualizada', { detail: { protocolo: prot } }));
                if (window.medicaoController && typeof window.medicaoController.processarECalcular === 'function') {
                    if (window.medicaoController.medicaoService) {
                        window.medicaoController.medicaoService.overrides = window.medicaoController.medicaoService.carregarOverrides();
                    }
                    window.medicaoController.processarECalcular();
                    if (typeof window.medicaoController.renderMedicaoMensal === 'function') {
                        window.medicaoController.renderMedicaoMensal();
                    }
                }

                this.exibirModalSucessoHTML(
                    anistiar ? 'Glosa Anistiada' : 'Glosa Reativada',
                    anistiar 
                        ? `A glosa <strong>${glosa.nome || 'selecionada'}</strong> foi relevada/anistiada com sucesso para o protocolo <strong>#${prot}</strong>.`
                        : `A glosa <strong>${glosa.nome || 'selecionada'}</strong> foi reativada para o protocolo <strong>#${prot}</strong>.`
                );
            } catch (err) {
                this.exibirModalErroHTML('Erro na Operação', 'Erro ao atualizar status da glosa: ' + (err.message || err));
            }
        };

        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal({
                title: anistiar ? 'Anistiar / Relevar Glosa' : 'Reativar Glosa',
                message: anistiar 
                    ? `Deseja anistiar a glosa <strong class="text-slate-900">${glosa.nome || 'selecionada'} (-${glosa.percentual || 0}%)</strong> do protocolo <strong>#${prot}</strong>?`
                    : `Deseja reativar o desconto de <strong class="text-rose-700">-${glosa.percentual || 0}%</strong> desta glosa?`,
                icon: anistiar ? 'verified' : 'gavel',
                iconBgClass: anistiar ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                confirmBtnClass: anistiar ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold' : 'bg-amber-600 hover:bg-amber-700 text-white font-bold',
                confirmText: anistiar ? 'Anistiar Glosa' : 'Reativar Glosa',
                showJustification: anistiar,
                requireJustification: false,
                onConfirm: (just) => executarAlteracao(just)
            });
        } else {
            executarAlteracao('');
        }
    }

    async alternarAnistiaGlosaAutomatica(prot, regraId, anistiar = true, perc = 0) {
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') {
                this.exibirModalErroHTML('Acesso Restrito', 'Apenas administradores possuem permissão para anistiar ou reativar glosas.');
                return;
            }
        }
        const medService = (window.medicaoController && window.medicaoController.medicaoService) || this.medicaoService || (window.MedicaoService ? new window.MedicaoService() : null);
        if (!medService) {
            this.exibirModalErroHTML('Serviço Indisponível', 'MedicaoService não está carregado.');
            return;
        }

        const nomeRegra = regraId === 'atraso_execucao' ? 'Atraso na Conclusão da OS' : (regraId === 'sem_plaqueta' ? 'Ausência/Avaria de Plaqueta' : regraId);

        const executarAlteracaoAutomatica = async (justificativa = '') => {
            try {
                // 1. Salva override no MedicaoService (localStorage e memória)
                medService.salvarOverrideOS(prot, regraId, !anistiar, justificativa);

                // 2. Se a OS tiver glosa persistida em ordens_servico no Supabase com o mesmo id, sincroniza também
                const list = (this.chamadosList || window.chamadosListCache || []);
                const item = list.find(o => String(o.protocolo || '').toUpperCase() === String(prot).toUpperCase() || String(o.id || '') === String(prot));
                if (item && Array.isArray(item.glosas) && item.glosas.length > 0) {
                    const gIdx = item.glosas.findIndex(g => g.id === regraId || g.regraId === regraId);
                    if (gIdx >= 0) {
                        item.glosas[gIdx].anistiado = anistiar;
                        item.glosas[gIdx].justificativa_anistia = justificativa;
                        item.glosas[gIdx].data_anistia = new Date().toISOString();
                        await this.salvarGlosasNoBanco(prot, item.glosas);
                    }
                }

                // 3. Registra log de auditoria
                if (window.LogsRepository) {
                    const logsRepo = typeof window.LogsRepository === 'function' ? new window.LogsRepository() : window.LogsRepository;
                    const logFn = logsRepo.registrarLog || logsRepo.inserirLog;
                    if (typeof logFn === 'function') {
                        await logFn.call(logsRepo, {
                            protocolo: prot,
                            tipoAcao: 'AUDITORIA',
                            tipo_acao: 'AUDITORIA',
                            descricao: anistiar 
                                ? `Glosa Automática TR (${nomeRegra}) anistiada pelo fiscal: ${justificativa || 'Sem justificativa'}` 
                                : `Glosa Automática TR (${nomeRegra}) reativada pelo fiscal`,
                            dadosNovos: { regraId, perc, anistiado: anistiar, justificativa },
                            dados_novos: { regraId, perc, anistiado: anistiar, justificativa },
                            origemTela: 'Painel'
                        });
                    }
                }

                // 4. Re-renderiza o modal de detalhes
                await this.abrirDetalhesOSModal(prot);

                // Notifica a tela de Medição para recalcular imediatamente
                window.dispatchEvent(new CustomEvent('glosa-anistia-atualizada', { detail: { protocolo: prot, regraId, anistiar } }));
                if (window.medicaoController && typeof window.medicaoController.processarECalcular === 'function') {
                    if (window.medicaoController.medicaoService) {
                        window.medicaoController.medicaoService.overrides = window.medicaoController.medicaoService.carregarOverrides();
                    }
                    window.medicaoController.processarECalcular();
                    if (typeof window.medicaoController.renderMedicaoMensal === 'function') {
                        window.medicaoController.renderMedicaoMensal();
                    }
                }

                this.exibirModalSucessoHTML(
                    anistiar ? 'Glosa TR Anistiada' : 'Glosa TR Reativada',
                    anistiar 
                        ? `A glosa automática do TR (<strong>${nomeRegra}</strong> -${perc}%) foi relevada/anistiada com sucesso para o protocolo <strong>#${prot}</strong>.`
                        : `A glosa automática do TR (<strong>${nomeRegra}</strong> -${perc}%) foi reativada com sucesso para o protocolo <strong>#${prot}</strong>.`
                );
            } catch (err) {
                this.exibirModalErroHTML('Erro na Operação', 'Erro ao atualizar status da regra do TR: ' + (err.message || err));
            }
        };

        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal({
                title: anistiar ? 'Anistiar Glosa Automática do TR' : 'Reativar Glosa do TR',
                message: anistiar 
                    ? `Deseja anistiar a infração do TR <strong class="text-slate-900">${nomeRegra} (-${perc}%)</strong> para o protocolo <strong>#${prot}</strong>?`
                    : `Deseja reativar a penalidade de <strong class="text-amber-700">-${perc}%</strong> desta infração do TR?`,
                icon: anistiar ? 'verified' : 'gavel',
                iconBgClass: anistiar ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                confirmBtnClass: anistiar ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold' : 'bg-amber-600 hover:bg-amber-700 text-white font-bold',
                confirmText: anistiar ? 'Anistiar Glosa TR' : 'Reativar Glosa TR',
                showJustification: anistiar,
                requireJustification: false,
                onConfirm: (just) => executarAlteracaoAutomatica(just)
            });
        } else {
            executarAlteracaoAutomatica('');
        }
    }

    async removerGlosaOS(prot, glosaIndex) {
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') {
                this.exibirModalErroHTML('Acesso Restrito', 'Apenas administradores possuem permissão para excluir glosas.');
                return;
            }
        }
        const list = (this.chamadosList || window.chamadosListCache || []);
        const item = list.find(o => String(o.protocolo || '').toUpperCase() === String(prot).toUpperCase() || String(o.id || '') === String(prot));
        if (!item || !item.glosas || !item.glosas[glosaIndex]) return;

        const removida = item.glosas[glosaIndex];

        const executarRemocao = async () => {
            const glosas = item.glosas.filter((_, idx) => idx !== glosaIndex);

            try {
                await this.salvarGlosasNoBanco(prot, glosas);
                item.glosas = glosas;

                if (window.LogsRepository) {
                    const logsRepo = typeof window.LogsRepository === 'function' ? new window.LogsRepository() : window.LogsRepository;
                    const logFn = logsRepo.registrarLog || logsRepo.inserirLog;
                    if (typeof logFn === 'function') {
                        await logFn.call(logsRepo, {
                            protocolo: prot,
                            tipoAcao: 'AUDITORIA',
                            tipo_acao: 'AUDITORIA',
                            descricao: `Glosa removida (${removida.nome || removida.regra}): ${removida.motivo || ''}`,
                            dadosAnteriores: removida,
                            dados_anteriores: removida,
                            origemTela: 'Painel'
                        });
                    }
                }

                await this.abrirDetalhesOSModal(prot);

                // Notifica a tela de Medição para recalcular imediatamente
                window.dispatchEvent(new CustomEvent('glosa-anistia-atualizada', { detail: { protocolo: prot } }));
                if (window.medicaoController && typeof window.medicaoController.processarECalcular === 'function') {
                    if (window.medicaoController.medicaoService) {
                        window.medicaoController.medicaoService.overrides = window.medicaoController.medicaoService.carregarOverrides();
                    }
                    window.medicaoController.processarECalcular();
                    if (typeof window.medicaoController.renderMedicaoMensal === 'function') {
                        window.medicaoController.renderMedicaoMensal();
                    }
                }

                this.exibirModalSucessoHTML(
                    'Glosa Removida',
                    `A glosa <strong>${removida.nome || 'selecionada'}</strong> foi excluída do protocolo <strong>#${prot}</strong>.`
                );
            } catch (err) {
                this.exibirModalErroHTML('Erro ao Excluir', 'Erro ao excluir glosa: ' + (err.message || err));
            }
        };

        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal({
                title: 'Excluir Glosa',
                message: `Deseja realmente remover permanentemente a glosa <strong class="text-rose-700">${removida.nome || 'selecionada'} (-${removida.percentual || 0}%)</strong> do protocolo <strong>#${prot}</strong>?`,
                icon: 'delete',
                iconBgClass: 'bg-rose-100 text-rose-700',
                confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white font-bold',
                confirmText: 'Excluir Glosa',
                showJustification: false,
                onConfirm: () => executarRemocao()
            });
        } else {
            executarRemocao();
        }
    }

    async salvarGlosasNoBanco(prot, glosasList) {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase client indisponível, alteração apenas local');
            return;
        }

        const client = window.supabaseClient;
        const cleanProt = String(prot || '').replace(/^#/, '').trim();

        const isNumericId = /^\d+$/.test(cleanProt);
        const filterClause = isNumericId
            ? `protocolo.eq.${cleanProt},protocolo.ilike.${cleanProt},id.eq.${cleanProt}`
            : `protocolo.eq.${cleanProt},protocolo.ilike.${cleanProt}`;

        // 1. Tenta atualizar em ordens_servico por protocolo ou ID
        let res = await client
            .from('ordens_servico')
            .update({ glosas: glosasList })
            .or(filterClause)
            .select();

        let updated = res.data && res.data.length > 0;

        // 2. Se não atualizou nada ou deu erro de tabela, tenta em ordens_servico_pracas
        if (!updated) {
            let resPracas = await client
                .from('ordens_servico_pracas')
                .update({ glosas: glosasList })
                .or(filterClause)
                .select();
            if (resPracas.data && resPracas.data.length > 0) {
                updated = true;
            } else if (resPracas.error && !res.error) {
                // mantém erro anterior se houver
            }
        }

        // 3. Se ainda não atualizou, tenta em chamados legado
        if (!updated) {
            let resLeg = await client
                .from('chamados')
                .update({ glosas: glosasList })
                .or(filterClause)
                .select();
            if (resLeg.data && resLeg.data.length > 0) {
                updated = true;
            }
        }

        // 4. Limpa e atualiza cache em sessionStorage para garantir consistência
        try {
            if (window.ChamadosRepository) {
                const repo = typeof window.ChamadosRepository === 'function' ? new window.ChamadosRepository() : window.ChamadosRepository;
                if (typeof repo.clearCache === 'function') repo.clearCache();
            } else {
                sessionStorage.removeItem('chamados_repo_cache_v1');
            }
        } catch (eCache) {
            console.warn('⚠️ Erro ao invalidar cache repo:', eCache);
        }

        // Atualiza no cache de sessionStorage se ainda existir
        try {
            const cachedRaw = sessionStorage.getItem('chamados_repo_cache_v1');
            if (cachedRaw) {
                const parsed = JSON.parse(cachedRaw);
                if (parsed && Array.isArray(parsed.data)) {
                    const rowMatch = parsed.data.find(r => 
                        String(r.protocolo || '').toUpperCase() === cleanProt.toUpperCase() ||
                        String(r.id || '') === cleanProt
                    );
                    if (rowMatch) {
                        rowMatch.glosas = glosasList;
                        sessionStorage.setItem('chamados_repo_cache_v1', JSON.stringify(parsed));
                    }
                }
            }
        } catch(eUpCache) {}

        if (res.error && !updated) {
            console.error('❌ Erro no update do Supabase:', res.error);
            throw new Error(res.error.message || 'Erro ao persistir glosas no banco.');
        }
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
                showCancelBtn: false,
                onConfirm: () => {}
            });
            return;
        }

        let m = document.getElementById('modalSucessoPainelHTML');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'modalSucessoPainelHTML';
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
                    <button type="button" onclick="document.getElementById('modalSucessoPainelHTML').remove()" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
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
                showCancelBtn: false,
                onConfirm: () => {}
            });
            return;
        }

        let m = document.getElementById('modalErroPainelHTML');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'modalErroPainelHTML';
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
                    <button type="button" onclick="document.getElementById('modalErroPainelHTML').remove()" class="w-full py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer">
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
        console.warn('Controller não encontrado para a OS:', id);
    }
};

window.aprovarOSAdmin = function(osId) {
    const list = (window.chamadosListCache || window.dadosOSsAbertasCache || (window.painelController ? window.painelController.chamadosList : []) || (window.auditoriaController ? window.auditoriaController.chamadosList : []) || []);
    const item = list.find(c => String(c.protocolo || "").toUpperCase() === String(osId || "").toUpperCase() || String(c.id || "") === String(osId));
    const protocol = item ? item.protocolo : osId;

    const doApprove = async () => {
        try {
            const repo = new window.ChamadosRepository();
            await repo.updateStatus(protocol || osId, 'Aberta');
            if (typeof window.fecharDetalhesOSModal === 'function') window.fecharDetalhesOSModal();
            
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                await window.painelController.loadData();
            }
            if (window.auditoriaController && typeof window.auditoriaController.loadData === 'function') {
                await window.auditoriaController.loadData();
            }
            if (typeof window.carregarMapaOSsAbertas === 'function') {
                await window.carregarMapaOSsAbertas(true);
            }
            if (typeof window.carregarDadosMapaOSs === 'function') {
                await window.carregarDadosMapaOSs();
            }
        } catch(err) {
            alert('Erro ao aprovar a Ordem de Serviço: ' + (err.message || err));
        }
    };

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal({
            title: 'Aprovar OS',
            message: `Deseja aprovar a Ordem de Serviço <strong class="text-on-surface font-bold">#${protocol}</strong>?<br>Seu status mudará para <strong class="text-emerald-700 font-bold">Em aberto</strong>.`,
            icon: 'check',
            iconBgClass: 'bg-emerald-100 text-emerald-700',
            confirmBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
            confirmText: 'Aprovar',
            onConfirm: doApprove
        });
    } else {
        if (confirm(`Deseja aprovar a OS #${protocol}?`)) {
            doApprove();
        }
    }
};

window.reabrirOSAdmin = function(osId) {
    const list = (window.chamadosListCache || window.dadosOSsAbertasCache || (window.painelController ? window.painelController.chamadosList : []) || (window.auditoriaController ? window.auditoriaController.chamadosList : []) || []);
    const item = list.find(c => String(c.protocolo || "").toUpperCase() === String(osId || "").toUpperCase() || String(c.id || "") === String(osId));
    const protocol = item ? item.protocolo : osId;
    const isCancelada = item && item.normalizedStatus === 'cancelada';
    const isConcluida = item && item.normalizedStatus === 'concluida';
    const isRejeitada = item && item.normalizedStatus === 'rejeitada';

    let actionTitle = 'Reabrir Ordem de Serviço';
    if (isCancelada) actionTitle = 'Reabrir OS Cancelada';
    else if (isConcluida) actionTitle = 'Reabrir OS Concluída';
    else if (isRejeitada) actionTitle = 'Reabrir OS Rejeitada';

    const doReopen = async (justification) => {
        try {
            if (item) {
                item.status = 'Aberta';
                item.rawStatus = 'Aberta';
                item.normalizedStatus = 'aberto';
                if (item._originalModel) {
                    item._originalModel.rawStatus = 'Aberta';
                    item._originalModel.normalizedStatus = 'aberto';
                }
            }
            const repo = new window.ChamadosRepository();
            await repo.updateStatus(protocol || osId, 'Aberta', justification);
            if (typeof window.fecharDetalhesOSModal === 'function') window.fecharDetalhesOSModal();
            
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                await window.painelController.loadData();
            }
            if (window.auditoriaController && typeof window.auditoriaController.loadData === 'function') {
                await window.auditoriaController.loadData();
            }
            if (typeof window.carregarMapaOSsAbertas === 'function') {
                await window.carregarMapaOSsAbertas(true);
            }
            if (typeof window.carregarDadosMapaOSs === 'function') {
                await window.carregarDadosMapaOSs();
            }
        } catch(err) {
            alert('Erro ao reabrir a Ordem de Serviço: ' + (err.message || err));
        }
    };

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal({
            title: actionTitle,
            message: `Deseja realmente reabrir a Ordem de Serviço <strong class="text-on-surface font-bold">#${protocol}</strong>?<br>Seu status voltará para <strong class="text-emerald-700 font-bold">Em aberto</strong>.`,
            icon: 'undo',
            iconBgClass: 'bg-blue-100 text-blue-700',
            confirmBtnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
            confirmText: 'Reabrir OS',
            onConfirm: doReopen
        });
    } else {
        if (confirm(`Deseja reabrir a OS #${protocol}?`)) {
            doReopen();
        }
    }
};

window.alterarPrioridadeOS = function(osId, targetPriority = 'Urgente') {
    const list = (window.chamadosListCache || window.dadosOSsAbertasCache || (window.painelController ? window.painelController.chamadosList : []) || (window.auditoriaController ? window.auditoriaController.chamadosList : []) || []);
    const item = list.find(c => String(c.protocolo || "").toUpperCase() === String(osId || "").toUpperCase() || String(c.id || "") === String(osId));
    const protocol = item ? item.protocolo : osId;
    const isTargetUrgente = (targetPriority === 'Urgente');

    const doPrioritize = async () => {
        try {
            // 1. Atualização otimista na memória para reflexão instantânea na UI
            if (item) {
                item.prioridade = targetPriority;
                if (item._originalModel) item._originalModel.prioridade = targetPriority;
            }
            if (window.dadosOSsAbertasCache) {
                const rawObj = window.dadosOSsAbertasCache.find(o => String(o.protocolo || "").toUpperCase() === String(protocol).toUpperCase() || String(o.id || "") === String(osId));
                if (rawObj) {
                    rawObj.prioridade = targetPriority;
                    if (rawObj._originalModel) rawObj._originalModel.prioridade = targetPriority;
                }
            }
            if (window.chamadosListCache) {
                const modelObj = window.chamadosListCache.find(o => String(o.protocolo || "").toUpperCase() === String(protocol).toUpperCase() || String(o.id || "") === String(osId));
                if (modelObj) {
                    modelObj.prioridade = targetPriority;
                }
            }

            // 2. Re-renderização instantânea dos marcadores no mapa (se na página de Mapa)
            if (typeof window.renderizarMapaOSs === 'function' && typeof window.obterListaFiltradaPorStatus === 'function' && window.dadosOSsAbertasCache) {
                const statusFiltro = window.filtroStatusAtual || 'todas';
                const filtradas = window.obterListaFiltradaPorStatus(window.dadosOSsAbertasCache, statusFiltro);
                window.renderizarMapaOSs(filtradas);
            }

            if (typeof window.fecharDetalhesOSModal === 'function') window.fecharDetalhesOSModal();
            
            const repo = new window.ChamadosRepository();
            await repo.updatePriority(protocol || osId, targetPriority);
            
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                await window.painelController.loadData();
            }
            if (window.auditoriaController && typeof window.auditoriaController.loadData === 'function') {
                await window.auditoriaController.loadData();
            }
            if (typeof window.carregarMapaOSsAbertas === 'function') {
                await window.carregarMapaOSsAbertas(true);
            }
            if (typeof window.carregarDadosMapaOSs === 'function') {
                await window.carregarDadosMapaOSs();
            }
        } catch(err) {
            alert('Erro ao atualizar prioridade: ' + (err.message || err));
        }
    };

    const title = isTargetUrgente ? 'Priorizar para Urgente' : 'Retornar para Normal';
    const message = isTargetUrgente
        ? `Deseja alterar a prioridade da Ordem de Serviço <strong class="text-on-surface font-bold">#${protocol}</strong> para <strong class="text-amber-600 font-bold">URGENTE</strong>?`
        : `Deseja retornar a prioridade da Ordem de Serviço <strong class="text-on-surface font-bold">#${protocol}</strong> para <strong class="text-emerald-700 font-bold">NORMAL</strong>?`;
    const icon = isTargetUrgente ? 'warning' : 'restart_alt';
    const iconBgClass = isTargetUrgente ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
    const confirmBtnClass = isTargetUrgente ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white';
    const confirmText = isTargetUrgente ? 'Definir como Urgente' : 'Retornar para Normal';

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal({
            title,
            message,
            icon,
            iconBgClass,
            confirmBtnClass,
            confirmText,
            onConfirm: doPrioritize,
            showJustification: false
        });
    } else {
        if (confirm(`Deseja alterar a prioridade da OS #${protocol} para ${targetPriority.toUpperCase()}?`)) {
            doPrioritize();
        }
    }
};

window.priorizarOSUrgente = function(osId) {
    window.alterarPrioridadeOS(osId, 'Urgente');
};

window.rejeitarOSManutentor = function(osId) {
    const list = (window.chamadosListCache || window.dadosOSsAbertasCache || (window.painelController ? window.painelController.chamadosList : []) || (window.auditoriaController ? window.auditoriaController.chamadosList : []) || []);
    const item = list.find(c => String(c.protocolo || "").toUpperCase() === String(osId || "").toUpperCase() || String(c.id || "") === String(osId));
    const protocol = item ? item.protocolo : osId;

    const doReject = async (justification) => {
        try {
            const repo = new window.ChamadosRepository();
            await repo.updateStatus(protocol || osId, 'Rejeitada', justification);
            if (typeof window.fecharDetalhesOSModal === 'function') window.fecharDetalhesOSModal();
            
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                await window.painelController.loadData();
            }
            if (window.auditoriaController && typeof window.auditoriaController.loadData === 'function') {
                await window.auditoriaController.loadData();
            }
            if (typeof window.carregarMapaOSsAbertas === 'function') {
                await window.carregarMapaOSsAbertas(true);
            }
            if (typeof window.carregarDadosMapaOSs === 'function') {
                await window.carregarDadosMapaOSs();
            }
        } catch(err) {
            alert('Erro ao rejeitar a Ordem de Serviço: ' + (err.message || err));
        }
    };

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal({
            title: 'Rejeitar Ordem de Serviço',
            message: `Deseja realmente rejeitar a Ordem de Serviço do protocolo <strong class="text-on-surface font-bold">#${protocol}</strong>?<br>Esta ação alterará o status da OS para <strong class="text-rose-700 font-bold">Rejeitada</strong>.`,
            icon: 'thumb_down',
            iconBgClass: 'bg-rose-100 text-rose-700',
            confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
            confirmText: 'Rejeitar OS',
            requireJustification: true,
            onConfirm: doReject
        });
    } else {
        let just = null;
        while (just === null || just.trim() === '') {
            just = prompt(`Justificativa obrigatória para rejeitar a OS #${protocol}:`);
            if (just === null) return; // User cancelled prompt
        }
        doReject(just.trim());
    }
};

window.cancelarOSAdmin = function(osId) {
    const list = (window.chamadosListCache || window.dadosOSsAbertasCache || (window.painelController ? window.painelController.chamadosList : []) || (window.auditoriaController ? window.auditoriaController.chamadosList : []) || []);
    const item = list.find(c => String(c.protocolo || "").toUpperCase() === String(osId || "").toUpperCase() || String(c.id || "") === String(osId));
    const protocol = item ? item.protocolo : osId;

    const doCancel = async (justification) => {
        try {
            const repo = new window.ChamadosRepository();
            await repo.updateStatus(protocol || osId, 'Cancelada', justification);
            if (typeof window.fecharDetalhesOSModal === 'function') window.fecharDetalhesOSModal();
            
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                await window.painelController.loadData();
            }
            if (window.auditoriaController && typeof window.auditoriaController.loadData === 'function') {
                await window.auditoriaController.loadData();
            }
            if (typeof window.carregarMapaOSsAbertas === 'function') {
                await window.carregarMapaOSsAbertas(true);
            }
            if (typeof window.carregarDadosMapaOSs === 'function') {
                await window.carregarDadosMapaOSs();
            }
        } catch(err) {
            alert('Erro ao cancelar a Ordem de Serviço: ' + (err.message || err));
        }
    };

    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal({
            title: 'Cancelar Ordem de Serviço',
            message: `Deseja realmente cancelar a Ordem de Serviço <strong class="text-on-surface font-bold">#${protocol}</strong>?<br>Esta ação alterará o status da OS para <strong class="text-rose-700 font-bold">Cancelada</strong>.`,
            icon: 'block',
            iconBgClass: 'bg-rose-100 text-rose-700',
            confirmBtnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
            confirmText: 'Cancelar OS',
            requireJustification: true,
            onConfirm: doCancel
        });
    } else {
        let just = null;
        while (just === null || just.trim() === '') {
            just = prompt(`Justificativa obrigatória para cancelar a OS #${protocol}:`);
            if (just === null) return; // User cancelled prompt
        }
        doCancel(just.trim());
    }
};

// Helper global para expandir/recolher pontos extras na tabela
window.toggleInlinePoints = function(btn, extraCount, event) {
    if (event) event.stopPropagation();
    const container = btn.closest('td');
    if (!container) return;
    const extraPoints = container.querySelector('.extra-points');
    const btnText = btn.querySelector('.btn-text');
    const btnIcon = btn.querySelector('.btn-icon');

    if (extraPoints) {
        const isHidden = extraPoints.classList.contains('hidden');
        if (isHidden) {
            extraPoints.classList.remove('hidden');
            extraPoints.classList.add('flex');
            if (btnText) btnText.textContent = 'Recolher';
            if (btnIcon) btnIcon.textContent = 'expand_less';
        } else {
            extraPoints.classList.add('hidden');
            extraPoints.classList.remove('flex');
            if (btnText) btnText.textContent = `+${extraCount}`;
            if (btnIcon) btnIcon.textContent = 'expand_more';
        }
    }
};

// Global helper to toggle user profile dropdown menu
window.toggleUserDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('user-profile-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

// Close user dropdown when clicking anywhere outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('user-menu-container');
    const dropdown = document.getElementById('user-profile-dropdown');
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// Instantiate global controller when window loads with Auth Guard protection
document.addEventListener('DOMContentLoaded', async () => {
    if (window.AuthGuard) {
        const authData = await window.AuthGuard.requireAuth();
        if (!authData) return; // Redireciona e aborta a execução se não autenticado ou sem permissão

        const currentPage = window.AuthGuard.getCurrentPageName();
        const role = window.AuthGuard.getUserRole(authData.user, authData.profile);

        let isAllowed = false;
        if (currentPage === 'painel') {
            isAllowed = (role === 'admin');
        } else if (currentPage === 'painel - manutentor' || currentPage === 'painel-manutentor') {
            isAllowed = (role === 'manutentor' || role === 'admin');
        } else {
            isAllowed = true;
        }

        if (!isAllowed) {
            const redirectUrl = window.AuthGuard.getRedirectUrlForUser(authData);
            const redirectPageName = window.AuthGuard.getCurrentPageName(redirectUrl);
            if (redirectPageName !== currentPage) {
                try { if (document.documentElement) document.documentElement.style.display = 'none'; } catch(e) {}
                window.location.href = redirectUrl;
                return;
            }
        }

        // Bind user profile info to header dropdown
        if (authData.profile || authData.user) {
            const profile = authData.profile || {};
            const user = authData.user || {};
            
            const nameEl = document.getElementById('dropdown-user-name');
            const emailEl = document.getElementById('dropdown-user-email');
            const roleEl = document.getElementById('dropdown-user-role');

            if (nameEl) nameEl.textContent = profile.nome || user.email?.split('@')[0] || 'Administrador';
            if (emailEl) emailEl.textContent = profile.email || user.email || '';
            if (roleEl) roleEl.textContent = (role || 'admin').toUpperCase();
        }

        if (currentPage === 'painel' || currentPage === 'painel - manutentor' || currentPage === 'painel-manutentor') {
            window.painelController = new PainelController();
            window.painelController.init();
        }
    }
});

window.PainelController = PainelController;
})();
