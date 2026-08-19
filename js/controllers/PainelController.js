/**
 * Presentation Layer - Painel Controller
 * Binds UI DOM elements in Painel.html to domain services, renders dynamic data, and handles user interactions.
 */

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

        const tbody = document.querySelector('#os-table tbody');
        const noResultsRow = document.getElementById('no-audit-results');
        if (tbody) {
            if (noResultsRow) noResultsRow.classList.add('hidden');

            Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
                if (tr.id !== 'no-audit-results') tr.remove();
            });

            for (let i = 0; i < 5; i++) {
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
        const tbody = document.querySelector('#os-table tbody');
        const noResultsRow = document.getElementById('no-audit-results');
        if (!tbody) return;

        const filteredList = this.service.filterChamados(this.chamadosList, this.activeFilters);

        // Remove old dynamic rows (preserving #no-audit-results)
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            if (tr.id !== 'no-audit-results') {
                tr.remove();
            }
        });

        if (filteredList.length === 0) {
            if (noResultsRow) noResultsRow.classList.remove('hidden');
            return;
        }

        if (noResultsRow) noResultsRow.classList.add('hidden');

        // Create table rows for each item
        filteredList.forEach(item => {
            const tr = this.createRowElement(item);
            tbody.appendChild(tr);
        });
    }

    /**
     * Creates a HTMLTableRowElement for a ChamadoModel entity
     */
    createRowElement(item) {
        const tr = document.createElement('tr');
        const isCancelada = item.normalizedStatus === 'cancelada';
        const isConcluida = item.normalizedStatus === 'concluida';
        const isPendente = item.normalizedStatus === 'pendente';
        const isEmAndamento = item.normalizedStatus === 'em_andamento';
        const isAberto = item.normalizedStatus === 'aberto';

        tr.className = `border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-surface-container-lowest align-middle ${isCancelada ? 'opacity-70' : ''}`;
        tr.setAttribute('data-id', item.id);
        tr.setAttribute('onclick', `window.abrirDetalhesOSModal('${item.id}')`);

        // Protocolo
        const tdProtocolo = document.createElement('td');
        tdProtocolo.className = 'py-3 px-5 font-medium whitespace-nowrap truncate align-middle';
        tdProtocolo.textContent = item.protocolo;

        // Data Abertura
        const tdData = document.createElement('td');
        tdData.className = 'py-3 px-5 text-on-surface-variant whitespace-nowrap truncate align-middle';
        tdData.textContent = item.formattedDateShort;

        // Endereço / Pontos
        const tdEndereco = document.createElement('td');
        tdEndereco.className = 'py-3 px-5 align-middle';
        const points = item.addressPoints;
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
                            <button onclick="window.abrirMapaPonto('${item.id}', ${idx + 1}, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
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
                <button onclick="window.abrirMapaPonto('${item.id}', 0, event)" class="inline-flex items-center gap-1.5 text-on-surface hover:text-secondary group/loc text-left cursor-pointer transition-colors w-full min-w-0" title="Clique para abrir no mapa Mapbox">
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
                <span class="px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[160px] ${selectBgColor}">
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
                <div class="relative inline-block w-[160px]" onclick="event.stopPropagation()">
                    <select ${isConcluida ? 'disabled' : ''} class="w-full appearance-none border-0 px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold outline-none focus:ring-0 text-center pr-6 transition-colors problem-select ${selectBgColor} ${selectDisabled}" onchange="window.painelController.handleProblemChange('${item.id}', this)">
                        <option value="lampada-queimada" ${probVal === 'lampada-queimada' ? 'selected' : ''}>Lâmpada Queimada</option>
                        <option value="acesa-dia" ${probVal === 'acesa-dia' ? 'selected' : ''}>Acesa Dia</option>
                        <option value="lampada-quebrada" ${probVal === 'lampada-quebrada' ? 'selected' : ''}>Lâmpada Quebrada</option>
                        <option value="outro" ${probVal === 'outro' ? 'selected' : ''}>Outro</option>
                    </select>
                    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[16px] text-current opacity-70">arrow_drop_down</span>
                </div>
            `;
        }

        // Status Badge
        const tdStatus = document.createElement('td');
        tdStatus.className = 'py-3 px-5 whitespace-nowrap truncate align-middle';

        let badgeClass = 'bg-error-container text-on-error-container'; // Aberto
        if (isEmAndamento) badgeClass = 'bg-amber-100 text-amber-800 border border-amber-300';
        if (item.statusBadgeLabel === 'Iniciado') badgeClass = 'bg-blue-100 text-blue-800 border border-blue-300';
        if (isConcluida) badgeClass = 'bg-[#dcfce7] text-[#166534]';
        if (isCancelada) badgeClass = 'bg-slate-200 text-slate-700';
        if (isPendente) badgeClass = 'bg-surface-container-high text-on-surface';

        tdStatus.innerHTML = `
            <span class="status-badge px-3 py-1.5 rounded-full text-label-sm font-label-sm font-semibold inline-block text-center w-[150px] transition-colors ${badgeClass}" data-status="${item.normalizedStatus}">
                ${item.statusBadgeLabel}
            </span>
        `;

        // Actions Column
        const tdAcoes = document.createElement('td');
        tdAcoes.className = 'py-3 px-5 whitespace-nowrap truncate text-center align-middle';
        tdAcoes.setAttribute('onclick', 'event.stopPropagation()');

        const editButtonHtml = isManutentorView ? '' : `
            <button class="btn-edit text-on-surface-variant hover:text-secondary hover:bg-surface-container-high p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida ? 'hidden' : ''}" onclick="window.painelController.abrirEdicaoOS('${item.id}', event)" title="Editar Ordem de Serviço">
                <span class="material-symbols-outlined text-[20px]">edit</span>
            </button>
        `;

        const rejectButtonHtml = isManutentorView ? '' : `
            <button class="btn-reject text-error hover:bg-error-container p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isEmAndamento || isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'cancelada', event)" title="Cancelar (Cancelada)">
                <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
        `;

        const approveButtonHtml = isManutentorView ? '' : `
            <button class="btn-approve text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'aberto', event)" title="Aprovar (Em aberto)">
                <span class="material-symbols-outlined text-[20px]">check</span>
            </button>
        `;

        const revertButtonHtml = isManutentorView ? '' : `
            <button class="btn-revert text-secondary hover:bg-secondary/10 p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida || isCancelada || isEmAndamento ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'aberto', event)" title="Reverter para Em aberto">
                <span class="material-symbols-outlined text-[20px]">undo</span>
            </button>
        `;

        tdAcoes.innerHTML = `
            <div class="flex items-center justify-center gap-1 action-buttons">
                ${approveButtonHtml}
                ${rejectButtonHtml}
                <button class="btn-complete text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isEmAndamento ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'concluida', event)" title="Concluir / Finalizar OS">
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
     * Binds search inputs, filter triggers, and modal actions
     */
    setupEventListeners() {
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
        const item = this.chamadosList.find(c => String(c.id) === String(id));
        const protocol = item ? item.protocolo : 'esta OS';

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
        }

        window.showConfirmModal({
            title: title,
            message: message,
            icon: icon,
            iconBgClass: iconBgClass,
            confirmBtnClass: confirmBtnClass,
            confirmText: confirmText,
            onConfirm: async (justification) => {
                try {
                    const targetId = (item && item.id) ? item.id : id;
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
    abrirDetalhesOSModal(id) {
        const list = this.chamadosList || window.chamadosListCache || [];
        let item = list.find(c => String(c.id) === String(id) || String(c.protocolo).toUpperCase() === String(id).toUpperCase());
        
        if (!item && window.ChamadoModel) {
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
                problema_encontrado: 'Lâmpada queimada',
                plaqueta_inicial: 'P-10492',
                plaqueta_final: 'P-10492',
                coordenada_inicial: '-21.980500, -46.791200',
                coordenada_reparo: '-21.980850, -46.791520',
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
            elAuditBadge.classList.add('hidden');
        }

        const container = document.getElementById('detalheModalConteudo');
        if (container) {
            container.innerHTML = this.buildDetalhesOSModalHtml(item);
        }

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
     * Constrói o HTML dinâmico das informações detalhadas da OS para o modal no Painel
     */
    buildDetalhesOSModalHtml(item) {
        const coordIni = window.ChamadoModel.formatCoordPair(item.coordenadaInicial);
        const coordFin = window.ChamadoModel.formatCoordPair(item.coordenadaReparo);
        const linkMaps = (coordFin.lat !== '--') ? `https://www.google.com/maps/search/?api=1&query=${coordFin.lat},${coordFin.lng}` : (coordIni.lat !== '--' ? `https://www.google.com/maps/search/?api=1&query=${coordIni.lat},${coordIni.lng}` : '#');

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
                ${!isGovBrOp ? `<div><b class="text-on-surface-variant font-medium">Usuário que Abriu / Operador:</b> <span class="font-semibold text-blue-700">${item.operador}</span></div>` : ''}
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

        <!-- Seção: Gestão de Sessões de Trabalho & Equipe (Praça Pública / Manutenção) -->
        ${(item.sessoesList && item.sessoesList.length > 0) ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-2">
            <div class="font-bold text-secondary text-xs border-b border-outline-variant/30 pb-1 flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-blue-700">
                    <span class="material-symbols-outlined text-[18px]">groups</span>
                    <span>Gestão de Sessões & Equipe</span>
                </span>
                ${item.tempoTotalFormatado ? `
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                    ⏱️ Tempo Total: ${item.tempoTotalFormatado}
                </span>
                ` : ''}
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                ${item.sessoesList.map(s => {
                    const st = (s.status || '').toUpperCase();
                    const isEmAndamento = st.includes('ANDAMENTO');
                    const badgeBg = isEmAndamento ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300';
                    const iconStr = isEmAndamento ? 'play_arrow' : 'task_alt';
                    const dataInc = s.inicioStr || 'Início registrado';
                    const dataFim = s.fimStr || (isEmAndamento ? 'Em andamento...' : 'Concluída');
                    const durStr = s.duracao_minutos ? (s.duracao_minutos >= 60 ? `${Math.floor(s.duracao_minutos/60)}h ${s.duracao_minutos%60}min (${s.duracao_minutos} min)` : `${s.duracao_minutos} min`) : '';

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
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        ` : (item.tempoTotalFormatado ? `
        <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs flex items-center justify-between">
            <span class="font-bold text-secondary flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px] text-blue-600">timer</span>
                <span>Tempo Total de Trabalho:</span>
            </span>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                ${item.tempoTotalFormatado}
            </span>
        </div>
        ` : '')}

        <!-- Seção 3: Observações & Histórico -->
        ${(() => {
            const obsIni = (item.observacaoInicial || item.descricao || (item.raw && (item.raw.observacao_inicial || item.raw.observacao || item.raw.observacoes || item.raw.descricao)) || '').trim();
            const obsFin = (item.observacaoFinal || (item.raw && (item.raw.observacao_final || item.raw.justificativa)) || '').trim();

            if (!obsIni && !obsFin) {
                return `
                <div class="p-3 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs flex items-center gap-2 text-on-surface-variant italic">
                    <span class="material-symbols-outlined text-[18px] text-outline">notes</span>
                    <span>Nenhuma observação ou texto de histórico registrado.</span>
                </div>`;
            }

            let bodyObs = '';
            if (obsIni && obsFin && obsIni !== obsFin) {
                bodyObs = `<div><b class="text-secondary font-semibold">📌 Abertura / Solicitante:</b> ${obsIni.replace(/\n/g, '<br/>')}</div><div class="mt-2 pt-2 border-t border-outline-variant/30"><b class="text-secondary font-semibold">📝 Conclusão / Histórico:</b> ${obsFin.replace(/\n/g, '<br/>')}</div>`;
            } else {
                bodyObs = `<div>${(obsFin || obsIni).replace(/\n/g, '<br/>')}</div>`;
            }

            return `
            <div class="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl text-xs space-y-1.5">
                <strong class="text-secondary font-bold flex items-center gap-1.5 mb-1">
                    <span class="material-symbols-outlined text-[16px]">notes</span>
                    <span>Observações & Histórico</span>
                </strong>
                <div class="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/40 font-mono text-[11px] text-on-surface max-h-32 overflow-y-auto leading-relaxed">
                    ${bodyObs}
                </div>
            </div>`;
        })()}
        `;
    }
}

// Global helpers for row click details modal
window.abrirDetalhesOSModal = function(id) {
    if (window.painelController && typeof window.painelController.abrirDetalhesOSModal === 'function') {
        window.painelController.abrirDetalhesOSModal(id);
    } else if (window.auditoriaController && typeof window.auditoriaController.abrirDetalhesOSModal === 'function') {
        window.auditoriaController.abrirDetalhesOSModal(id);
    } else {
        console.warn('Controller não encontrado para a OS:', id);
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

        window.painelController = new PainelController();
        window.painelController.init();
    }
});

window.PainelController = PainelController;
