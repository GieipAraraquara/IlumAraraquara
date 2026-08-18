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
        const isAberto = item.normalizedStatus === 'aberto';

        tr.className = `border-b border-outline-variant hover:bg-surface-container-low transition-all duration-200 cursor-pointer group hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-surface-container-lowest align-middle ${isCancelada ? 'opacity-70' : ''}`;
        tr.setAttribute('data-id', item.id);

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
                <div class="relative inline-block w-[160px]">
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

        const editButtonHtml = isManutentorView ? '' : `
            <button class="btn-edit text-on-surface-variant hover:text-secondary hover:bg-surface-container-high p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida ? 'hidden' : ''}" onclick="window.painelController.abrirEdicaoOS('${item.id}', event)" title="Editar Ordem de Serviço">
                <span class="material-symbols-outlined text-[20px]">edit</span>
            </button>
        `;

        const rejectButtonHtml = isManutentorView ? '' : `
            <button class="btn-reject text-error hover:bg-error-container p-1 rounded transition-all duration-200 active:scale-90 ${isAberto || isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'cancelada', event)" title="Cancelar (Cancelada)">
                <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
        `;

        const approveButtonHtml = isManutentorView ? '' : `
            <button class="btn-approve text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isPendente ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'aberto', event)" title="Aprovar (Em aberto)">
                <span class="material-symbols-outlined text-[20px]">check</span>
            </button>
        `;

        const revertButtonHtml = isManutentorView ? '' : `
            <button class="btn-revert text-secondary hover:bg-secondary/10 p-1 rounded transition-all duration-200 active:scale-90 ${isConcluida || isCancelada ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'aberto', event)" title="Reverter para Em aberto">
                <span class="material-symbols-outlined text-[20px]">undo</span>
            </button>
        `;

        tdAcoes.innerHTML = `
            <div class="flex items-center justify-center gap-1 action-buttons">
                ${approveButtonHtml}
                ${rejectButtonHtml}
                <button class="btn-complete text-[#059669] hover:bg-[#dcfce7] p-1 rounded transition-all duration-200 active:scale-90 ${isAberto ? '' : 'hidden'}" onclick="window.painelController.handleStatusAction('${item.id}', 'concluida', event)" title="Concluir / Finalizar OS">
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
                    if (e.target.value.trim()) indicator.classList.remove('hidden');
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
}

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
