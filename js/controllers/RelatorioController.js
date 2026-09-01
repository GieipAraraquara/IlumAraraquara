(function() {
    if (window.RelatorioController && window.relatorioController) return;

class RelatorioController {
    constructor() {
        this.chamadosList = [];
        this.filteredList = [];
        this.charts = {};
        this.activeTab = 'geral'; // 'geral' ou 'medicao'
        this.activeFilters = {
            search: '',
            dateType: 'all',
            dateField: 'abertura', // 'abertura', 'conclusao', 'ambas'
            rangeStart: '',
            rangeEnd: '',
            status: 'all',
            problem: 'all',
            type: 'all',
            polygon: null
        };
        this.areaMapInstance = null;
        this.areaMapMarkers = [];
        this.areaPolygonPoints = [];
        this.isDrawingArea = false;
        
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        this.medicaoFilters = {
            selectedMonth: currentMonthStr, // Formato 'YYYY-MM'
            status: 'concluida' // 'concluida', 'all'
        };
    }

    async init() {
        console.log('📊 [RelatorioController] Inicializando controlador com Widget de Calendário + Máscara DD/MM/YYYY...');
        
        if (window.ChamadosService) {
            this.service = new window.ChamadosService();
        } else {
            console.warn('⚠️ [RelatorioController] ChamadosService ainda não carregado. Tentando novamente...');
            setTimeout(() => this.init(), 300);
            return;
        }

        window.addEventListener('auth-ready', () => this.checkManutentorAccess());

        this.populateMedicaoMonthSelect();
        this.setupEventListeners();
        this.checkManutentorAccess();
        await this.loadData();
    }

    checkManutentorAccess() {
        let isManutentor = false;
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            if (role === 'manutentor') isManutentor = true;
        }

        const sidebar = document.querySelector('app-sidebar');
        if (sidebar) {
            const mode = (sidebar.getAttribute('mode') || '').toLowerCase();
            const active = (sidebar.getAttribute('active') || '').toLowerCase();
            if (mode === 'manutentor' || active.includes('manutentor')) isManutentor = true;
        }

        const r1 = (localStorage.getItem('user_role') || '').toLowerCase();
        const r2 = (localStorage.getItem('supabase_user_role') || '').toLowerCase();
        if (r1.includes('manutentor') || r2.includes('manutentor')) isManutentor = true;

        if (document.body && document.body.classList.contains('manutentor-view')) isManutentor = true;
        if (window.isManutentorView || window.location.href.toLowerCase().includes('manutentor')) isManutentor = true;

        this.isManutentorUser = isManutentor;

        if (isManutentor) {
            const btnGeral = document.getElementById('btn-tab-geral');
            if (btnGeral) {
                btnGeral.style.setProperty('display', 'none', 'important');
                btnGeral.classList.add('hidden');
            }
            this.switchTab('medicao');
        }
    }

    populateMedicaoMonthSelect() {
        const select = document.getElementById('medicao-month-select');
        if (!select) return;

        const nomesMeses = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];

        const now = new Date();
        const currentY = now.getFullYear();
        const currentM = now.getMonth() + 1; // 1..12

        if (!this.medicaoFilters.selectedMonth) {
            this.medicaoFilters.selectedMonth = `${currentY}-${String(currentM).padStart(2, '0')}`;
        }

        select.innerHTML = '';

        // Gerar opções de 12 meses no futuro até 24 meses no passado
        const baseDate = new Date(currentY, currentM - 1, 1);

        for (let i = 12; i >= -24; i--) {
            const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const valStr = `${y}-${String(m).padStart(2, '0')}`;

            const labelText = `${nomesMeses[m - 1]} / ${y}`;

            const optionEl = document.createElement('option');
            optionEl.value = valStr;
            optionEl.textContent = labelText;
            if (valStr === this.medicaoFilters.selectedMonth) {
                optionEl.selected = true;
            }
            select.appendChild(optionEl);
        }
    }

    alterarMesMedicao(delta) {
        if (!this.medicaoFilters.selectedMonth || !this.medicaoFilters.selectedMonth.includes('-')) {
            const now = new Date();
            this.medicaoFilters.selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const [y, m] = this.medicaoFilters.selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const nextY = d.getFullYear();
        const nextM = d.getMonth() + 1;

        this.medicaoFilters.selectedMonth = `${nextY}-${String(nextM).padStart(2, '0')}`;

        const select = document.getElementById('medicao-month-select');
        if (select) select.value = this.medicaoFilters.selectedMonth;

        this.renderMedicaoMensal();
    }

    applyDateMask(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, ''); // Remove todos os não dígitos
            if (v.length > 8) v = v.substring(0, 8);
            
            if (v.length >= 5) {
                v = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
            } else if (v.length >= 3) {
                v = `${v.substring(0, 2)}/${v.substring(2)}`;
            }
            
            e.target.value = v;
        });
    }

    setupDatePickerWidget(textInputId, pickerInputId, btnId) {
        const textInput = document.getElementById(textInputId);
        const pickerInput = document.getElementById(pickerInputId);
        const btn = document.getElementById(btnId);

        if (!textInput || !pickerInput) return;

        const openPicker = () => {
            if (textInput.disabled) return;
            
            // Sincroniza a data do campo texto para o datepicker antes de abrir
            if (textInput.value && textInput.value.length === 10 && textInput.value.includes('/')) {
                const [d, m, y] = textInput.value.split('/');
                if (d && m && y) {
                    pickerInput.value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
            }

            try {
                if (typeof pickerInput.showPicker === 'function') {
                    pickerInput.showPicker();
                } else {
                    pickerInput.click();
                }
            } catch (err) {
                console.warn('⚠️ [RelatorioController] Falha ao abrir showPicker:', err);
            }
        };

        if (btn) btn.addEventListener('click', openPicker);

        // Ao mudar a data no widget do calendário nativo, converte para dd/mm/aaaa
        pickerInput.addEventListener('change', (e) => {
            const val = e.target.value; // 'YYYY-MM-DD'
            if (val && val.includes('-')) {
                const [y, m, d] = val.split('-');
                textInput.value = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    parseDateBR(val, isEnd = false) {
        if (!val || typeof val !== 'string') return null;
        let y, m, d;
        if (val.includes('/')) {
            const parts = val.split('/');
            if (parts.length === 3) {
                d = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                y = parseInt(parts[2], 10);
            }
        } else if (val.includes('-')) {
            const parts = val.split('-');
            if (parts.length === 3) {
                y = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                d = parseInt(parts[2], 10);
            }
        }
        if (y && !isNaN(m) && d && y > 1900 && m >= 0 && m < 12 && d >= 1 && d <= 31) {
            return isEnd ? new Date(y, m, d, 23, 59, 59) : new Date(y, m, d, 0, 0, 0);
        }
        return null;
    }

    checkDateInPeriod(dateVal, dateType, rangeStart, rangeEnd) {
        if (!dateVal) return false;
        const date = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
        if (isNaN(date.getTime())) return false;
        const now = new Date();

        if (dateType === 'hoje') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (date < today) return false;
        } else if (dateType === 'ontem') {
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (date < yesterday || date >= today) return false;
        } else if (dateType === '7dias') {
            const limit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (date < limit) return false;
        } else if (dateType === '15dias') {
            const limit = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
            if (date < limit) return false;
        } else if (dateType === '30dias') {
            const limit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (date < limit) return false;
        } else if (dateType === 'mes_atual') {
            if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return false;
        } else if (dateType === 'mes_anterior') {
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            if (date.getMonth() !== prevMonth.getMonth() || date.getFullYear() !== prevMonth.getFullYear()) return false;
        } else if (dateType === 'ano_atual') {
            if (date.getFullYear() !== now.getFullYear()) return false;
        }

        if (dateType === 'custom' || rangeStart || rangeEnd) {
            if (rangeStart && rangeStart.length === 10) {
                const start = this.parseDateBR(rangeStart, false);
                if (start && date < start) return false;
            }
            if (rangeEnd && rangeEnd.length === 10) {
                const end = this.parseDateBR(rangeEnd, true);
                if (end && date > end) return false;
            }
        }

        return true;
    }

    async loadData() {
        try {
            console.log('🔄 [RelatorioController] Buscando chamados do serviço...');
            await this.carregarMateriaisContrato();
            let list = await this.service.getChamadosList();
            
            if (!Array.isArray(list)) list = [];

            // Ordenar da data mais recente para a mais antiga
            list.sort((a, b) => {
                const dateA = a.dataAbertura ? new Date(a.dataAbertura).getTime() : 0;
                const dateB = b.dataAbertura ? new Date(b.dataAbertura).getTime() : 0;
                return dateB - dateA;
            });

            this.chamadosList = list;
            console.log(`✅ [RelatorioController] ${list.length} chamados carregados com sucesso.`);
            
            this.applyFilters();
            this.renderMedicaoMensal();
        } catch (err) {
            console.error('❌ [RelatorioController] Erro ao carregar dados:', err);
        }
    }

    switchTab(tabName) {
        if (this.isManutentorUser && tabName === 'geral') {
            tabName = 'medicao';
        }
        this.activeTab = tabName;
        const tabGeral = document.getElementById('view-tab-geral');
        const tabMedicao = document.getElementById('view-tab-medicao');
        const btnTabGeral = document.getElementById('btn-tab-geral');
        const btnTabMedicao = document.getElementById('btn-tab-medicao');

        if (tabName === 'geral') {
            if (tabGeral) tabGeral.classList.remove('hidden');
            if (tabMedicao) tabMedicao.classList.add('hidden');
            if (btnTabGeral) {
                btnTabGeral.className = "py-2.5 px-4 border-b-2 border-secondary font-bold text-secondary text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all";
            }
            if (btnTabMedicao) {
                btnTabMedicao.className = "py-2.5 px-4 border-b-2 border-transparent font-medium text-on-surface-variant hover:text-on-surface text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all";
            }
            this.renderCharts();
        } else if (tabName === 'medicao') {
            if (tabGeral) tabGeral.classList.add('hidden');
            if (tabMedicao) tabMedicao.classList.remove('hidden');
            if (btnTabGeral) {
                btnTabGeral.className = "py-2.5 px-4 border-b-2 border-transparent font-medium text-on-surface-variant hover:text-on-surface text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all";
                if (this.isManutentorUser) {
                    btnTabGeral.style.setProperty('display', 'none', 'important');
                    btnTabGeral.classList.add('hidden');
                }
            }
            if (btnTabMedicao) {
                btnTabMedicao.className = "py-2.5 px-4 border-b-2 border-secondary font-bold text-secondary text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all";
            }
            this.populateMedicaoMonthSelect();
            this.renderMedicaoMensal();
        }
    }

    applyFilters() {
        const { search, dateType, dateField, rangeStart, rangeEnd, status, problem, type, polygon } = this.activeFilters;
        const hasPolygonFilter = Array.isArray(polygon) && polygon.length >= 3;

        this.filteredList = this.chamadosList.filter(item => {
            // Termo de busca (Header Input + Dashboard Search)
            if (search) {
                const term = search.toLowerCase().trim();
                const fmt = window.ChamadoModel ? window.ChamadoModel.formatLocationText : (v => String(v || ''));
                const matchProtocol = fmt(item.protocolo).toLowerCase().includes(term);
                const matchPlaqueta = fmt(item.plaquetaInicial).toLowerCase().includes(term);
                const matchAddress = fmt(item.endereco).toLowerCase().includes(term);
                const matchMunicipe = fmt(item.municipeNome).toLowerCase().includes(term);
                const matchOperador = fmt(item.operador).toLowerCase().includes(term);
                if (!matchProtocol && !matchPlaqueta && !matchAddress && !matchMunicipe && !matchOperador) return false;
            }

            // 1. Type filter (Praça vs Viária)
            if (type === 'praca') {
                const prot = String(item.protocolo || '').toUpperCase();
                if (!prot.startsWith('P') && !item.isPraca) return false;
            } else if (type === 'viaria') {
                const prot = String(item.protocolo || '').toUpperCase();
                if (!prot.startsWith('I') && item.isPraca) return false;
            }

            // 2. Status filter
            if (status !== 'all') {
                if (item.normalizedStatus !== status) return false;
            }

            // 3. Problem filter
            if (problem !== 'all') {
                if (item.problemSelectValue !== problem) return false;
            }

            // 4. Filtro por Data e Período Customizado
            if (dateField === 'conclusao') {
                const dateConc = item.dataConclusao || item.dataAbertura;
                if (!this.checkDateInPeriod(dateConc, dateType, rangeStart, rangeEnd)) return false;
            } else if (dateField === 'ambas') {
                const inAbertura = this.checkDateInPeriod(item.dataAbertura, dateType, rangeStart, rangeEnd);
                const inConclusao = item.dataConclusao ? this.checkDateInPeriod(item.dataConclusao, dateType, rangeStart, rangeEnd) : false;
                if (!inAbertura && !inConclusao) return false;
            } else {
                // Default: 'abertura'
                if (!this.checkDateInPeriod(item.dataAbertura, dateType, rangeStart, rangeEnd)) return false;
            }

            // 5. Filtro Geográfico por Área (Point-in-Polygon)
            if (hasPolygonFilter) {
                if (!this.checkOSInPolygon(item, polygon)) return false;
            }

            return true;
        });

        this.updateIndicatorText();
        this.updateKPIs();
        this.renderCharts();
        this.updateSpatialFilterUI();
    }

    checkOSInPolygon(item, polygon) {
        if (!polygon || polygon.length < 3) return true;

        const pointsToCheck = [];

        if (item.coordenadasReparoList && Array.isArray(item.coordenadasReparoList)) {
            item.coordenadasReparoList.forEach(c => {
                const lng = parseFloat(c.lng);
                const lat = parseFloat(c.lat);
                if (!isNaN(lng) && !isNaN(lat)) pointsToCheck.push([lng, lat]);
            });
        }
        if (item.coordenadasInicialList && Array.isArray(item.coordenadasInicialList)) {
            item.coordenadasInicialList.forEach(c => {
                const lng = parseFloat(c.lng);
                const lat = parseFloat(c.lat);
                if (!isNaN(lng) && !isNaN(lat)) pointsToCheck.push([lng, lat]);
            });
        }

        const addStrCoord = (strCoord) => {
            if (!strCoord) return;
            const parsed = window.ChamadoModel ? window.ChamadoModel.parseLatLng(strCoord) : null;
            if (parsed && !isNaN(parsed.lat) && !isNaN(parsed.lng)) {
                pointsToCheck.push([parsed.lng, parsed.lat]);
            }
        };

        if (pointsToCheck.length === 0) {
            addStrCoord(item.coordenadaReparo);
            addStrCoord(item.coordenadaInicial);
        }

        if (pointsToCheck.length === 0 && item.pontosDetalhados && Array.isArray(item.pontosDetalhados)) {
            item.pontosDetalhados.forEach(p => {
                if (p.coordenadaFinal) addStrCoord(p.coordenadaFinal);
                if (p.coordenadaInicial) addStrCoord(p.coordenadaInicial);
            });
        }

        if (pointsToCheck.length === 0 && item.rawRow) {
            addStrCoord(item.rawRow.coordenada_reparo || item.rawRow.coordenada_inicial || item.rawRow.coordenada);
        }

        if (pointsToCheck.length === 0) return false;

        const pip = window.isPointInPolygon || (typeof isPointInPolygon === 'function' ? isPointInPolygon : null);
        if (!pip) return true;

        return pointsToCheck.some(pt => pip(pt, polygon));
    }

    updateIndicatorText() {
        const indText = document.getElementById('indicator-text');
        if (!indText) return;

        const count = this.filteredList.length;
        const total = this.chamadosList.length;

        const hasPolygon = Array.isArray(this.activeFilters.polygon) && this.activeFilters.polygon.length >= 3;

        if (count === total && this.activeFilters.dateType === 'all' && !this.activeFilters.rangeStart && !this.activeFilters.rangeEnd && this.activeFilters.status === 'all' && this.activeFilters.type === 'all' && !this.activeFilters.search && !hasPolygon) {
            indText.textContent = `Exibindo Todo o Histórico (${total} OSs)`;
        } else {
            indText.textContent = `Filtrado: ${count} de ${total} OSs encontradas${hasPolygon ? ' (Filtro por Área Ativo)' : ''}`;
        }
    }

    updateKPIs() {
        const total = this.filteredList.length;
        let emAbertoCount = 0;
        let concluidaCount = 0;
        let pendenteCount = 0;
        let totalResolutionTimeMs = 0;
        let resolvedCountWithDates = 0;

        this.filteredList.forEach(item => {
            const st = item.normalizedStatus;
            if (st === 'aberto' || st === 'em_andamento') emAbertoCount++;
            else if (st === 'pendente') pendenteCount++;
            else if (st === 'concluida') {
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

        const rate = total > 0 ? Math.round((concluidaCount / total) * 100) : 0;
        let avgDays = total > 0 ? '2.1' : '0.0';
        if (resolvedCountWithDates > 0) {
            avgDays = (totalResolutionTimeMs / (1000 * 60 * 60 * 24 * resolvedCountWithDates)).toFixed(1);
        }

        const elTotal = document.getElementById('kpi-total-os');
        const elAbertas = document.getElementById('kpi-abertas');
        const elConcluidas = document.getElementById('kpi-concluidas');
        const elRate = document.getElementById('kpi-rate');
        const elAvg = document.getElementById('kpi-avg-time');
        const elBadgeCount = document.getElementById('count-filtered-badge');

        if (elTotal) elTotal.textContent = total.toLocaleString('pt-BR');
        if (elAbertas) elAbertas.textContent = (emAbertoCount + pendenteCount).toLocaleString('pt-BR');
        if (elConcluidas) elConcluidas.textContent = concluidaCount.toLocaleString('pt-BR');
        if (elRate) elRate.textContent = `${rate}%`;
        if (elAvg) elAvg.innerHTML = `${avgDays} <span class="text-body-lg font-body-lg">dias</span>`;
        if (elBadgeCount) elBadgeCount.textContent = `${total} registro(s) filtrados`;
    }

    renderCharts() {
        if (typeof Chart === 'undefined') return;

        // 1. Chart Status OS (Doughnut)
        const ctxStatus = document.getElementById('chart-status');
        if (ctxStatus) {
            const statusCounts = {
                'Em Aberto': 0,
                'Em Andamento': 0,
                'Concluída': 0,
                'Pendente': 0,
                'Cancelada': 0,
                'Rejeitada': 0
            };

            this.filteredList.forEach(item => {
                const label = item.statusBadgeLabel || 'Outro';
                if (statusCounts[label] !== undefined) statusCounts[label]++;
                else if (item.normalizedStatus === 'aberto') statusCounts['Em Aberto']++;
                else if (item.normalizedStatus === 'em_andamento') statusCounts['Em Andamento']++;
                else if (item.normalizedStatus === 'concluida') statusCounts['Concluída']++;
                else if (item.normalizedStatus === 'pendente') statusCounts['Pendente']++;
                else if (item.normalizedStatus === 'cancelada') statusCounts['Cancelada']++;
                else if (item.normalizedStatus === 'rejeitada') statusCounts['Rejeitada']++;
            });

            if (this.charts.statusChart) this.charts.statusChart.destroy();
            this.charts.statusChart = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        data: Object.values(statusCounts),
                        backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#64748b', '#94a3b8', '#e11d48'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } } }
                    },
                    cutout: '65%'
                }
            });
        }

        // 2. Chart Problemas OS (Bar)
        const ctxProblem = document.getElementById('chart-problemas');
        if (ctxProblem) {
            const problemCounts = {
                'Lâmpada Queimada': 0,
                'Acesa Dia': 0,
                'Lâmpada Quebrada': 0,
                'Outro': 0
            };

            this.filteredList.forEach(item => {
                const val = item.problemSelectValue;
                if (val === 'lampada-queimada') problemCounts['Lâmpada Queimada']++;
                else if (val === 'acesa-dia') problemCounts['Acesa Dia']++;
                else if (val === 'lampada-quebrada') problemCounts['Lâmpada Quebrada']++;
                else problemCounts['Outro']++;
            });

            if (this.charts.problemChart) this.charts.problemChart.destroy();
            this.charts.problemChart = new Chart(ctxProblem, {
                type: 'bar',
                data: {
                    labels: Object.keys(problemCounts),
                    datasets: [{
                        label: 'Quantidade de Chamados',
                        data: Object.values(problemCounts),
                        backgroundColor: ['#f59e0b', '#3b82f6', '#ea580c', '#64748b'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // 3. Chart Evolução Temporal (Line)
        const ctxTimeline = document.getElementById('chart-timeline');
        if (ctxTimeline) {
            const dateMap = {};

            const getFormatInfo = (d) => {
                if (!d) return null;
                const dateObj = (d instanceof Date) ? d : new Date(d);
                if (isNaN(dateObj.getTime())) return null;
                const y = dateObj.getFullYear();
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                return {
                    isoKey: `${y}-${m}-${day}`,
                    label: `${day}/${m}`
                };
            };

            this.filteredList.forEach(item => {
                // Contabilizar Abertura na data de abertura da OS
                if (item.dataAbertura) {
                    const infoAbertura = getFormatInfo(item.dataAbertura);
                    if (infoAbertura) {
                        if (!dateMap[infoAbertura.isoKey]) {
                            dateMap[infoAbertura.isoKey] = { label: infoAbertura.label, abertas: 0, concluidas: 0 };
                        }
                        dateMap[infoAbertura.isoKey].abertas++;
                    }
                }

                // Contabilizar Conclusão na data de conclusão real (dataConclusao)
                if (item.normalizedStatus === 'concluida') {
                    const dateConc = item.dataConclusao || item.dataAbertura;
                    if (dateConc) {
                        const infoConclusao = getFormatInfo(dateConc);
                        if (infoConclusao) {
                            if (!dateMap[infoConclusao.isoKey]) {
                                dateMap[infoConclusao.isoKey] = { label: infoConclusao.label, abertas: 0, concluidas: 0 };
                            }
                            dateMap[infoConclusao.isoKey].concluidas++;
                        }
                    }
                }
            });

            // Ordenação estritamente cronológica por chave ISO YYYY-MM-DD
            const sortedIsoKeys = Object.keys(dateMap).sort();
            const recentKeys = sortedIsoKeys.slice(-10);

            const sortedLabels = recentKeys.map(k => dateMap[k].label);
            const abertasData = recentKeys.map(k => dateMap[k].abertas);
            const concluidasData = recentKeys.map(k => dateMap[k].concluidas);

            if (this.charts.timelineChart) this.charts.timelineChart.destroy();
            this.charts.timelineChart = new Chart(ctxTimeline, {
                type: 'line',
                data: {
                    labels: sortedLabels.length > 0 ? sortedLabels : ['Sem Dados'],
                    datasets: [
                        {
                            label: 'Abertas / Registradas',
                            data: abertasData.length > 0 ? abertasData : [0],
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 3
                        },
                        {
                            label: 'Concluídas / Atendidas',
                            data: concluidasData.length > 0 ? concluidasData : [0],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } } } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }

        // 4. Chart Praça vs Viária (Pie)
        const ctxTipo = document.getElementById('chart-tipo-iluminacao');
        if (ctxTipo) {
            let pracaCount = 0;
            let viariaCount = 0;

            this.filteredList.forEach(item => {
                const prot = String(item.protocolo || '').toUpperCase();
                if (prot.startsWith('P') || item.isPraca) pracaCount++;
                else viariaCount++;
            });

            if (this.charts.tipoChart) this.charts.tipoChart.destroy();
            this.charts.tipoChart = new Chart(ctxTipo, {
                type: 'pie',
                data: {
                    labels: ['Iluminação de Praças (P)', 'Iluminação Viária (I)'],
                    datasets: [{
                        data: [pracaCount, viariaCount],
                        backgroundColor: ['#059669', '#0284c7'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } } } }
                }
            });
        }
    }

    // =========================================================================
    // CÁLCULO E RENDERIZAÇÃO DA MEDIÇÃO MENSAL DINÂMICA
    // =========================================================================

    // =========================================================================
    // CÁLCULO E RENDERIZAÇÃO DA MEDIÇÃO MENSAL DINÂMICA
    // =========================================================================

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

        // Início: dia 21 do mês anterior (ex: 21/07 se mês for 08/Agosto)
        const startDate = new Date(targetY, targetM - 2, 21, 0, 0, 0, 0);

        // Fim: dia 20 do mês selecionado (ex: 20/08 se mês for 08/Agosto)
        const endDate = new Date(targetY, targetM - 1, 20, 23, 59, 59, 999);

        const formatBR = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        return {
            startDate,
            endDate,
            periodLabelBR: `${formatBR(startDate)} a ${formatBR(endDate)}`
        };
    }

    async carregarMateriaisContrato() {
        if (this.materiaisContratoCache && this.materiaisContratoCache.length > 0) return this.materiaisContratoCache;
        try {
            const client = window.supabaseClient || (typeof obterSupabaseClient === 'function' ? obterSupabaseClient() : null);
            if (client) {
                const { data, error } = await client.from('materiais_contrato').select('*');
                if (!error && Array.isArray(data) && data.length > 0) {
                    this.materiaisContratoCache = data;
                    try { localStorage.setItem('os_cached_materiais_raw', JSON.stringify(data)); } catch(e){}
                    console.log(`✅ [RelatorioController] ${data.length} materiais do contrato carregados do Supabase.`);
                    return data;
                }
            }
        } catch (e) {
            console.warn('⚠️ [RelatorioController] Falha ao carregar materiais_contrato:', e);
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

    resolveMarcaEMaterial(rawNome, defaultUnidade = 'UN') {
        if (!rawNome) return { marca: 'PRÓPRIO', desc: '', unidade: defaultUnidade };

        if (typeof rawNome === 'object') {
            const extracted = (rawNome.nome || rawNome.descricao || rawNome.material || rawNome.material_nome || '');
            rawNome = extracted ? String(extracted) : JSON.stringify(rawNome);
        } else {
            rawNome = String(rawNome);
        }

        let nomeClean = rawNome.replace(/\(x\d+\)/i, '').trim();
        if (!nomeClean) return { marca: 'PRÓPRIO', desc: rawNome, unidade: defaultUnidade };

        // Remover aspas externas e sufixos de unidade como (UN), (M), (H) etc.
        nomeClean = nomeClean.replace(/^["'\s]+|["'\s]+$/g, '').trim();
        nomeClean = nomeClean.replace(/\s*\((UN|M|H|KG|PC|PÇ|CJ|JG)\)$/i, '').trim();

        // Se for mão de obra de sessão de praça
        if (nomeClean.toUpperCase().includes('ELETRICISTA')) {
            return {
                marca: 'MÃO DE OBRA',
                desc: nomeClean,
                unidade: 'H'
            };
        }

        const cleanUpper = nomeClean.toUpperCase();

        // 1. Tentar casar no cache da tabela materiais_contrato
        if (this.materiaisContratoCache && this.materiaisContratoCache.length > 0) {
            for (const row of this.materiaisContratoCache) {
                const dbMarca = (row.Marca || row.marca || row.Fabricante || row.fabricante || '').trim();
                const dbDesc = (row['Material/Serviço'] || row.Material || row.Serviço || row.descricao || row.nome || row.material || row.item || row['material_servico'] || row['material/servico'] || '').trim();
                const dbUnid = (row['Unidade de Medida'] || row.Unidade || row.unidade || row.und || row['unidade_de_medida'] || '').trim();

                if (dbDesc) {
                    const dbDescUpper = dbDesc.toUpperCase();
                    if (cleanUpper === dbDescUpper || cleanUpper.includes(dbDescUpper) || dbDescUpper.includes(cleanUpper)) {
                        return {
                            marca: dbMarca || 'PRÓPRIO',
                            desc: dbDesc,
                            unidade: dbUnid || defaultUnidade
                        };
                    }
                }
            }
        }

        // 2. Fallback: se o nome estiver formatado como "MARCA - DESCRICAO"
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
                    unidade: defaultUnidade
                };
            }
        }

        return {
            marca: 'PRÓPRIO',
            desc: nomeClean,
            unidade: defaultUnidade
        };
    }

    calcularMedicaoMensal() {
        const { selectedMonth, status } = this.medicaoFilters;
        const { startDate, endDate, periodLabelBR } = this.getMedicaoPeriodDates(selectedMonth);

        // 1. Filtrar lista de chamados conforme o período de medição (dia 21 do mês anterior ao dia 20 do mês atual) e status
        const listToMeasure = this.chamadosList.filter(item => {
            if (status === 'concluida' && item.normalizedStatus !== 'concluida') {
                return false;
            }

            const refDate = item.dataConclusao || item.dataAbertura;
            if (!refDate) return false;

            const t = refDate.getTime();
            return t >= startDate.getTime() && t <= endDate.getTime();
        });

        // 2. Agregação dos Materiais e Horas de Eletricista (materiais_contrato)
        const materiaisMap = {};
        const countOSsComMaterial = new Set();
        let totalHorasEletricista = 0;

        const registrarMaterial = (rawNome, qtd, protocolo, defaultUnidade = 'UN', categoria = 'Material Aplicado') => {
            if (!rawNome) return;

            const { marca, desc, unidade } = this.resolveMarcaEMaterial(rawNome, defaultUnidade);
            const finalUnidade = defaultUnidade !== 'UN' ? defaultUnidade : unidade;
            const key = `${marca.toUpperCase()}||${desc.toUpperCase()}`;

            if (!materiaisMap[key]) {
                materiaisMap[key] = {
                    marca: marca,
                    descricao: desc,
                    unidade: finalUnidade,
                    quantidadeTotal: 0,
                    qtdOSsSet: new Set(),
                    protocolosSet: new Set(),
                    categoria: categoria
                };
            }

            materiaisMap[key].quantidadeTotal += Number(qtd) || 1;
            materiaisMap[key].qtdOSsSet.add(protocolo);
            materiaisMap[key].protocolosSet.add(protocolo);
            countOSsComMaterial.add(protocolo);
        };

        listToMeasure.forEach(item => {
            const prot = item.protocolo || 'OS-SEM-PROT';

            // A) MATERIAIS FÍSICOS UTILIZADOS NA OS (VIÁRIA E PRAÇA CONSOLIDADOS DE TODOS OS FECHAMENTOS)
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

            // B) SESSÕES DE PRAÇA PÚBLICA -> HORA DE ELETRICISTA (materiais_contrato)
            const sessoes = item.sessoesList || [];
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

        const arrayMateriais = Object.values(materiaisMap).sort((a, b) => b.quantidadeTotal - a.quantidadeTotal);

        return {
            items: arrayMateriais,
            totalOSsMedidas: countOSsComMaterial.size,
            totalHorasEletricista: totalHorasEletricista.toFixed(2),
            totalItensDiferentes: arrayMateriais.length,
            periodLabelBR: periodLabelBR
        };
    }

    renderMedicaoMensal() {
        const tbody = document.getElementById('medicao-tbody');
        const emptyState = document.getElementById('medicao-empty-state');
        if (!tbody) return;

        const medicaoData = this.calcularMedicaoMensal();

        // Atualizar Badge visual do período ativo de medição
        const badgePeriodo = document.getElementById('medicao-periodo-badge');
        if (badgePeriodo && medicaoData.periodLabelBR) {
            badgePeriodo.textContent = `Período: ${medicaoData.periodLabelBR}`;
        }

        // Atualiza KPIs da aba de medição
        const elTotalItens = document.getElementById('kpi-medicao-itens');
        const elTotalHoras = document.getElementById('kpi-medicao-horas');
        const elTotalOSs = document.getElementById('kpi-medicao-oss');
        const elTiposItens = document.getElementById('kpi-medicao-tipos');

        if (elTotalItens) {
            const somaQtds = medicaoData.items.reduce((acc, i) => acc + i.quantidadeTotal, 0);
            elTotalItens.textContent = somaQtds.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        }
        if (elTotalHoras) elTotalHoras.innerHTML = `${medicaoData.totalHorasEletricista} <span class="text-body-lg font-body-lg">H</span>`;
        if (elTotalOSs) elTotalOSs.textContent = medicaoData.totalOSsMedidas.toLocaleString('pt-BR');
        if (elTiposItens) elTiposItens.textContent = medicaoData.totalItensDiferentes.toLocaleString('pt-BR');

        tbody.innerHTML = '';

        if (medicaoData.items.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        medicaoData.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-outline-variant/60 hover:bg-surface-container-low transition-colors align-middle';

            const isHoras = item.unidade === 'H' || (item.descricao && item.descricao.toUpperCase().includes('ELETRICISTA'));
            const qtdFmt = isHoras ? item.quantidadeTotal.toFixed(2) : item.quantidadeTotal.toLocaleString('pt-BR');

            let badgeCategory = 'bg-blue-100 text-blue-800 border border-blue-200';
            if (isHoras) badgeCategory = 'bg-purple-100 text-purple-900 border border-purple-300 font-bold';

            const protList = Array.from(item.protocolosSet).slice(0, 3).join(', ') + (item.protocolosSet.size > 3 ? ` ... (+${item.protocolosSet.size - 3})` : '');

            tr.innerHTML = `
                <td class="py-3 px-4 font-mono font-bold text-xs text-on-surface whitespace-nowrap">${this.escapeCSVCell(item.marca)}</td>
                <td class="py-3 px-4 font-bold text-on-surface text-xs max-w-[280px]">
                    <div class="flex items-center gap-1.5">
                        ${isHoras ? '<span class="material-symbols-outlined text-purple-600 text-[18px]">engineering</span>' : '<span class="material-symbols-outlined text-secondary text-[18px]">inventory_2</span>'}
                        <span>${item.descricao}</span>
                    </div>
                </td>
                <td class="py-3 px-4 text-center font-bold text-xs uppercase whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded ${isHoras ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}">
                        ${item.unidade}
                    </span>
                </td>
                <td class="py-3 px-4 text-right font-mono font-bold text-sm ${isHoras ? 'text-purple-700' : 'text-secondary'} whitespace-nowrap">
                    ${qtdFmt}
                </td>
                <td class="py-3 px-4 text-center font-bold text-xs whitespace-nowrap">${item.qtdOSsSet.size} OS(s)</td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold inline-block ${badgeCategory}">
                        ${item.categoria}
                    </span>
                </td>
                <td class="py-3 px-4 text-xs font-mono text-on-surface-variant truncate max-w-[180px]" title="${Array.from(item.protocolosSet).join(', ')}">
                    ${protList}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    exportarMedicaoMensalCSV() {
        const medicaoData = this.calcularMedicaoMensal();
        if (!medicaoData.items || medicaoData.items.length === 0) {
            alert('Nenhum dado de medição disponível para o mês selecionado.');
            return;
        }

        const headers = [
            'Marca',
            'Descrição do Item de Contrato / Material',
            'Unidade',
            'Quantidade Medida no Mês',
            'Qtd. OSs Onde Foi Aplicado',
            'Origem / Tipo de Item',
            'Protocolos de Ordens de Serviço'
        ];

        let csvLines = [headers.join(';')];

        medicaoData.items.forEach(item => {
            const isHoras = item.unidade === 'H' || (item.descricao && item.descricao.toUpperCase().includes('ELETRICISTA'));
            const qtdFmt = isHoras ? item.quantidadeTotal.toFixed(2) : item.quantidadeTotal;

            const row = [
                this.escapeCSVCell(item.marca),
                this.escapeCSVCell(item.descricao),
                this.escapeCSVCell(item.unidade),
                this.escapeCSVCell(qtdFmt),
                this.escapeCSVCell(item.qtdOSsSet.size),
                this.escapeCSVCell(item.categoria),
                this.escapeCSVCell(Array.from(item.protocolosSet).join(' | '))
            ];
            csvLines.push(row.join(';'));
        });

        const periodLabel = this.medicaoFilters.selectedMonth || 'Mes_Atual';
        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Medicao_Mensal_Materiais_E_Sessoes_${periodLabel}_${dateStr}.csv`, csvLines.join('\n'));
    }

    setupEventListeners() {
        // 1. Busca na Barra Superior do Cabeçalho (#relatorio-search-input)
        const searchInput = document.getElementById('relatorio-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.activeFilters.search = e.target.value;
                this.applyFilters();
            });
        }

        // 2. Sincronização dos Controles Globais do Dashboard (dash-filter-*)
        const dashType = document.getElementById('dash-filter-type');
        const dashStatus = document.getElementById('dash-filter-status');
        const dashPeriod = document.getElementById('dash-filter-period');
        const dashDateField = document.getElementById('dash-filter-date-field');
        const dashStart = document.getElementById('dash-filter-start');
        const dashEnd = document.getElementById('dash-filter-end');
        const btnDashStart = document.getElementById('btn-picker-dash-start');
        const btnDashEnd = document.getElementById('btn-picker-dash-end');
        const boxDashStart = document.getElementById('box-dash-filter-start');
        const boxDashEnd = document.getElementById('box-dash-filter-end');
        const btnResetDash = document.getElementById('btn-reset-dash-filters');

        // Sincronizadores com os seletores inferiores da exportação CSV
        const relatorioTypeSelect = document.getElementById('relatorio-type-select');
        const relatorioStatusSelect = document.getElementById('relatorio-status-select');
        const relatorioDateSelect = document.getElementById('relatorio-date-select');
        const relatorioStart = document.getElementById('relatorio-range-start');
        const relatorioEnd = document.getElementById('relatorio-range-end');
        const btnRelatorioStart = document.getElementById('btn-picker-relatorio-start');
        const btnRelatorioEnd = document.getElementById('btn-picker-relatorio-end');
        const relatorioDateFieldSelect = document.getElementById('relatorio-date-field-select');
        const relatorioProblemSelect = document.getElementById('relatorio-problem-select');

        // Aplicar máscara dd/mm/aaaa em todos os campos de texto de data
        this.applyDateMask(dashStart);
        this.applyDateMask(dashEnd);
        this.applyDateMask(relatorioStart);
        this.applyDateMask(relatorioEnd);

        // Configurar o widget de calendário interativo para cada campo
        this.setupDatePickerWidget('dash-filter-start', 'picker-dash-filter-start', 'btn-picker-dash-start');
        this.setupDatePickerWidget('dash-filter-end', 'picker-dash-filter-end', 'btn-picker-dash-end');
        this.setupDatePickerWidget('relatorio-range-start', 'picker-relatorio-range-start', 'btn-picker-relatorio-start');
        this.setupDatePickerWidget('relatorio-range-end', 'picker-relatorio-range-end', 'btn-picker-relatorio-end');

        const updateCustomDatesVisibility = (periodVal) => {
            const isCustom = periodVal === 'custom';
            
            [boxDashStart, boxDashEnd].forEach(box => {
                if (box) {
                    if (isCustom) {
                        box.classList.remove('opacity-40', 'pointer-events-none');
                        box.classList.add('opacity-100', 'pointer-events-auto');
                    } else {
                        box.classList.remove('opacity-100', 'pointer-events-auto');
                        box.classList.add('opacity-40', 'pointer-events-none');
                    }
                }
            });

            [dashStart, dashEnd, btnDashStart, btnDashEnd].forEach(inp => {
                if (inp) {
                    inp.disabled = !isCustom;
                }
            });

            if (!isCustom) {
                if (dashStart) dashStart.value = '';
                if (dashEnd) dashEnd.value = '';
                if (relatorioStart) relatorioStart.value = '';
                if (relatorioEnd) relatorioEnd.value = '';
                this.activeFilters.rangeStart = '';
                this.activeFilters.rangeEnd = '';
            }
        };

        const syncAndApply = () => {
            if (dashType) this.activeFilters.type = dashType.value;
            if (dashStatus) this.activeFilters.status = dashStatus.value;
            if (dashPeriod) {
                this.activeFilters.dateType = dashPeriod.value;
                updateCustomDatesVisibility(dashPeriod.value);
            }
            if (dashDateField) this.activeFilters.dateField = dashDateField.value;
            if (dashStart) this.activeFilters.rangeStart = dashStart.value;
            if (dashEnd) this.activeFilters.rangeEnd = dashEnd.value;

            // Refletir nos campos da exportação CSV
            if (relatorioTypeSelect && dashType) relatorioTypeSelect.value = dashType.value;
            if (relatorioStatusSelect && dashStatus) relatorioStatusSelect.value = dashStatus.value;
            if (relatorioDateSelect && dashPeriod) relatorioDateSelect.value = dashPeriod.value;
            if (relatorioStart && dashStart) relatorioStart.value = dashStart.value;
            if (relatorioEnd && dashEnd) relatorioEnd.value = dashEnd.value;

            this.applyFilters();
        };

        if (dashType) dashType.addEventListener('change', syncAndApply);
        if (dashStatus) dashStatus.addEventListener('change', syncAndApply);
        if (dashPeriod) dashPeriod.addEventListener('change', syncAndApply);
        if (dashDateField) dashDateField.addEventListener('change', syncAndApply);
        if (dashStart) dashStart.addEventListener('input', syncAndApply);
        if (dashEnd) dashEnd.addEventListener('input', syncAndApply);

        // Ouvintes nos seletores inferiores para manter o painel superior sincronizado
        if (relatorioTypeSelect) {
            relatorioTypeSelect.addEventListener('change', (e) => {
                if (dashType) dashType.value = e.target.value;
                this.activeFilters.type = e.target.value;
                this.applyFilters();
            });
        }
        if (relatorioStatusSelect) {
            relatorioStatusSelect.addEventListener('change', (e) => {
                if (dashStatus) dashStatus.value = e.target.value;
                this.activeFilters.status = e.target.value;
                this.applyFilters();
            });
        }
        if (relatorioDateSelect) {
            relatorioDateSelect.addEventListener('change', (e) => {
                if (dashPeriod) dashPeriod.value = e.target.value;
                this.activeFilters.dateType = e.target.value;
                updateCustomDatesVisibility(e.target.value);
                this.applyFilters();
            });
        }
        if (relatorioDateFieldSelect) {
            relatorioDateFieldSelect.addEventListener('change', (e) => {
                if (dashDateField) dashDateField.value = e.target.value;
                this.activeFilters.dateField = e.target.value;
                this.applyFilters();
            });
        }
        if (relatorioStart) {
            relatorioStart.addEventListener('input', (e) => {
                if (dashStart) dashStart.value = e.target.value;
                this.activeFilters.rangeStart = e.target.value;
                this.applyFilters();
            });
        }
        if (relatorioEnd) {
            relatorioEnd.addEventListener('input', (e) => {
                if (dashEnd) dashEnd.value = e.target.value;
                this.activeFilters.rangeEnd = e.target.value;
                this.applyFilters();
            });
        }
        if (relatorioProblemSelect) {
            relatorioProblemSelect.addEventListener('change', (e) => {
                this.activeFilters.problem = e.target.value;
                this.applyFilters();
            });
        }

        // Reset All Filters Button
        if (btnResetDash) {
            btnResetDash.addEventListener('click', () => {
                this.activeFilters = {
                    search: '',
                    dateType: 'all',
                    dateField: 'abertura',
                    rangeStart: '',
                    rangeEnd: '',
                    status: 'all',
                    problem: 'all',
                    type: 'all',
                    polygon: null
                };

                if (searchInput) searchInput.value = '';
                if (dashType) dashType.value = 'all';
                if (dashStatus) dashStatus.value = 'all';
                if (dashPeriod) dashPeriod.value = 'all';
                if (dashDateField) dashDateField.value = 'abertura';
                if (dashStart) dashStart.value = '';
                if (dashEnd) dashEnd.value = '';

                if (relatorioTypeSelect) relatorioTypeSelect.value = 'all';
                if (relatorioStatusSelect) relatorioStatusSelect.value = 'all';
                if (relatorioDateSelect) relatorioDateSelect.value = 'all';
                if (relatorioDateFieldSelect) relatorioDateFieldSelect.value = 'abertura';
                if (relatorioStart) relatorioStart.value = '';
                if (relatorioEnd) relatorioEnd.value = '';
                if (relatorioProblemSelect) relatorioProblemSelect.value = 'all';

                updateCustomDatesVisibility('all');
                this.limparDesenhoArea();
                this.applyFilters();
                this.updateSpatialFilterUI();
            });
        }

        // Inicializar a visibilidade inicial dos campos de data
        if (dashPeriod) updateCustomDatesVisibility(dashPeriod.value);

        // =========================================================================
        // CONTROLE UNIFICADO DO MÊS DA MEDIÇÃO MENSAL (SELECT DROPDOWN + STEP BUTTONS)
        // =========================================================================
        const monthSelect = document.getElementById('medicao-month-select');
        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => {
                this.medicaoFilters.selectedMonth = e.target.value;
                this.renderMedicaoMensal();
            });
        }

        const medicaoStatusSelect = document.getElementById('medicao-status-select');
        if (medicaoStatusSelect) {
            medicaoStatusSelect.addEventListener('change', (e) => {
                this.medicaoFilters.status = e.target.value;
                this.renderMedicaoMensal();
            });
        }

        // Select All / Deselect All columns handler
        const selectAllCols = document.getElementById('btn-select-all-cols');
        const deselectAllCols = document.getElementById('btn-deselect-all-cols');
        if (selectAllCols) {
            selectAllCols.addEventListener('click', () => {
                document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = true);
            });
        }
        if (deselectAllCols) {
            deselectAllCols.addEventListener('click', () => {
                document.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = false);
            });
        }
    }

    // =========================================================================
    // MODAL E FILTRO DE ÁREA GEOGRÁFICA (POINT-IN-POLYGON)
    // =========================================================================

    abrirModalFiltroArea() {
        const modal = document.getElementById('modal-filtro-area');
        if (!modal) return;
        modal.classList.remove('hidden');

        this.setupBairroAutocomplete();

        setTimeout(() => {
            this.initAreaMap();
        }, 100);
    }

    fecharModalFiltroArea() {
        const modal = document.getElementById('modal-filtro-area');
        if (modal) modal.classList.add('hidden');
        this.desativarModoDesenhoArea();
    }

    initAreaMap() {
        const container = document.getElementById('map-filtro-area-canvas');
        if (!container) return;

        if (this.areaMapInstance) {
            this.areaMapInstance.resize();
            return;
        }

        if (typeof mapboxgl === 'undefined') {
            console.warn('⚠️ [RelatorioController] Mapbox GL JS não carregado.');
            return;
        }

        const token = 'pk.eyJ1IjoiaW9jb3N0YSIsImEiOiJjbXJ5dnE0cGgwZXM4MnpwbWEzOHY0NGMxIn0.2zn9iSNiZe4Vd8yuwYYp-A';
        mapboxgl.accessToken = token;

        this.areaMapInstance = new mapboxgl.Map({
            container: 'map-filtro-area-canvas',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-48.176, -21.789],
            zoom: 12.5
        });

        this.areaMapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        this.areaMapInstance.on('load', () => {
            this.renderOSPointsOnAreaMap();

            if (this.activeFilters.polygon && this.activeFilters.polygon.length >= 3) {
                this.areaPolygonPoints = [...this.activeFilters.polygon];
                this.renderExistingPolygonOnAreaMap();
            }
        });
    }

    renderOSPointsOnAreaMap() {
        if (!this.areaMapInstance) return;

        const features = [];
        this.chamadosList.forEach(item => {
            const parsed = window.ChamadoModel ? window.ChamadoModel.parseLatLng(item.coordenadaReparo || item.coordenadaInicial) : null;
            if (parsed && !isNaN(parsed.lat) && !isNaN(parsed.lng)) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [parsed.lng, parsed.lat] },
                    properties: {
                        protocolo: item.protocolo,
                        status: item.normalizedStatus
                    }
                });
            }
        });

        if (features.length === 0) return;

        const geojson = { type: 'FeatureCollection', features };

        if (this.areaMapInstance.getSource('os-points-source')) {
            this.areaMapInstance.getSource('os-points-source').setData(geojson);
        } else {
            this.areaMapInstance.addSource('os-points-source', { type: 'geojson', data: geojson });
            this.areaMapInstance.addLayer({
                id: 'os-points-circle',
                type: 'circle',
                source: 'os-points-source',
                paint: {
                    'circle-radius': 4.5,
                    'circle-color': [
                        'match',
                        ['get', 'status'],
                        'concluida', '#10b981',
                        'aberto', '#ef4444',
                        'em_andamento', '#f59e0b',
                        '#3b82f6'
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.8
                }
            });
        }
    }

    toggleModoDesenhoArea() {
        if (this.isDrawingArea) {
            this.desativarModoDesenhoArea();
        } else {
            this.ativarModoDesenhoArea();
        }
    }

    ativarModoDesenhoArea() {
        this.isDrawingArea = true;
        this.areaPolygonPoints = [];
        this.limparMarkersDesenhoArea();

        const txtBtn = document.getElementById('txt-btn-area-desenhar');
        if (txtBtn) txtBtn.textContent = 'Clique no Mapa (Duplo Clique p/ Fechar)';

        if (this.areaMapInstance) {
            this.areaMapInstance.getCanvas().style.cursor = 'crosshair';
            this._onClickAreaMap = (e) => this.handleCliqueDesenhoArea(e);
            this._onDblClickAreaMap = (e) => this.handleDblClickFinalizarArea(e);

            this.areaMapInstance.on('click', this._onClickAreaMap);
            this.areaMapInstance.on('dblclick', this._onDblClickAreaMap);
        }
    }

    desativarModoDesenhoArea() {
        this.isDrawingArea = false;
        const txtBtn = document.getElementById('txt-btn-area-desenhar');
        if (txtBtn) txtBtn.textContent = 'Redesenhar Área no Mapa';

        if (this.areaMapInstance) {
            this.areaMapInstance.getCanvas().style.cursor = '';
            if (this._onClickAreaMap) this.areaMapInstance.off('click', this._onClickAreaMap);
            if (this._onDblClickAreaMap) this.areaMapInstance.off('dblclick', this._onDblClickAreaMap);
        }
    }

    handleCliqueDesenhoArea(e) {
        if (!this.isDrawingArea) return;
        const pt = [e.lngLat.lng, e.lngLat.lat];
        this.areaPolygonPoints.push(pt);

        const elV = document.createElement('div');
        elV.className = "w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-md";
        const m = new mapboxgl.Marker({ element: elV }).setLngLat(pt).addTo(this.areaMapInstance);
        if (!this.areaMapMarkers) this.areaMapMarkers = [];
        this.areaMapMarkers.push(m);

        this.atualizarCamadaPoligonoArea();
    }

    handleDblClickFinalizarArea(e) {
        if (!this.isDrawingArea) return;
        if (e) e.preventDefault();

        if (this.areaPolygonPoints.length >= 3) {
            const first = this.areaPolygonPoints[0];
            const last = this.areaPolygonPoints[this.areaPolygonPoints.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                this.areaPolygonPoints.push([...first]);
            }
            this.atualizarCamadaPoligonoArea();

            const infoContainer = document.getElementById('info-status-poligono-container');
            const infoStatus = document.getElementById('info-status-poligono');
            const txtStatus = document.getElementById('txt-status-poligono');
            if (infoContainer) infoContainer.classList.remove('hidden');
            if (infoStatus && txtStatus) {
                infoStatus.classList.remove('hidden');
                txtStatus.textContent = `✓ Polígono manual demarcado (${this.areaPolygonPoints.length - 1} vértices)`;
            }
        }
        this.desativarModoDesenhoArea();
    }

    atualizarCamadaPoligonoArea() {
        if (!this.areaMapInstance) return;
        const pts = this.areaPolygonPoints;
        if (pts.length === 0) return;

        const coords = pts.length > 2 ? [pts] : [[...pts, pts[0]]];
        const geojson = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: coords }
        };

        if (this.areaMapInstance.getSource('area-filtro-source')) {
            this.areaMapInstance.getSource('area-filtro-source').setData(geojson);
        } else {
            this.areaMapInstance.addSource('area-filtro-source', { type: 'geojson', data: geojson });
            this.areaMapInstance.addLayer({
                id: 'area-filtro-fill',
                type: 'fill',
                source: 'area-filtro-source',
                paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.22 }
            });
            this.areaMapInstance.addLayer({
                id: 'area-filtro-outline',
                type: 'line',
                source: 'area-filtro-source',
                paint: { 'line-color': '#d97706', 'line-width': 2.8, 'line-dasharray': [2, 1] }
            });
        }
    }

    renderExistingPolygonOnAreaMap() {
        if (!this.areaMapInstance || !this.areaPolygonPoints || this.areaPolygonPoints.length < 3) return;

        this.limparMarkersDesenhoArea();
        if (!this.areaMapMarkers) this.areaMapMarkers = [];

        this.areaPolygonPoints.forEach(pt => {
            const elV = document.createElement('div');
            elV.className = "w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-md";
            const m = new mapboxgl.Marker({ element: elV }).setLngLat(pt).addTo(this.areaMapInstance);
            this.areaMapMarkers.push(m);
        });

        this.atualizarCamadaPoligonoArea();

        const infoContainer = document.getElementById('info-status-poligono-container');
        const infoStatus = document.getElementById('info-status-poligono');
        const txtStatus = document.getElementById('txt-status-poligono');
        if (infoContainer) infoContainer.classList.remove('hidden');
        if (infoStatus && txtStatus) {
            infoStatus.classList.remove('hidden');
            txtStatus.textContent = `✓ Polígono ativo (${this.areaPolygonPoints.length - 1} vértices)`;
        }
    }

    async buscarBairroEContorno() {
        const input = document.getElementById('input-busca-bairro');
        const btn = document.getElementById('btn-buscar-bairro');
        if (!input || !input.value.trim()) {
            alert('Por favor, digite o nome do bairro a ser localizado.');
            return;
        }

        const bairro = input.value.trim();
        const origBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span><span>Buscando...</span>`;
        }

        try {
            // 1. Tentar busca via OpenStreetMap Nominatim API com formato GeoJSON de polígono (Passo 1: Bairro + Araraquara - SP, Brasil)
            let queryUrl = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(bairro + ', Araraquara - SP, Brasil')}`;
            let response = await fetch(queryUrl, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
            let results = await response.json();

            // Passo 2: Se sem resultados, tentar "Bairro, Araraquara" mais flexível
            if (!Array.isArray(results) || results.length === 0) {
                queryUrl = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(bairro + ', Araraquara')}`;
                response = await fetch(queryUrl, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
                results = await response.json();
            }

            let polyPoints = null;
            let placeNameFound = '';

            if (Array.isArray(results) && results.length > 0) {
                const matchPoly = results.find(r => r.geojson && (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon'));

                if (matchPoly) {
                    placeNameFound = matchPoly.name || matchPoly.display_name.split(',')[0];
                    if (matchPoly.geojson.type === 'Polygon') {
                        polyPoints = matchPoly.geojson.coordinates[0];
                    } else if (matchPoly.geojson.type === 'MultiPolygon') {
                        const polyList = matchPoly.geojson.coordinates;
                        let largest = polyList[0][0];
                        polyList.forEach(p => {
                            if (p[0].length > largest.length) largest = p[0];
                        });
                        polyPoints = largest;
                    }
                } else {
                    const firstMatch = results[0];
                    placeNameFound = firstMatch.name || firstMatch.display_name.split(',')[0];
                    if (firstMatch.boundingbox && firstMatch.boundingbox.length === 4) {
                        const [latMin, latMax, lonMin, lonMax] = firstMatch.boundingbox.map(Number);
                        polyPoints = [
                            [lonMin, latMin],
                            [lonMax, latMin],
                            [lonMax, latMax],
                            [lonMin, latMax],
                            [lonMin, latMin]
                        ];
                    }
                }
            }

            // 2. Se Nominatim não retornou polígono, tentar fallback via Mapbox Geocoding API
            if (!polyPoints && typeof mapboxgl !== 'undefined' && mapboxgl.accessToken) {
                const mapboxGeocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(bairro + ', Araraquara SP')}.json?proximity=-48.176,-21.789&types=neighborhood,locality,place,district,sublocality&access_token=${mapboxgl.accessToken}`;
                const mbResp = await fetch(mapboxGeocodingUrl);
                const mbData = await mbResp.json();

                if (mbData && mbData.features && mbData.features.length > 0) {
                    const feat = mbData.features[0];
                    placeNameFound = feat.text || bairro;
                    if (feat.bbox && feat.bbox.length === 4) {
                        const [minLng, minLat, maxLng, maxLat] = feat.bbox;
                        polyPoints = [
                            [minLng, minLat],
                            [maxLng, minLat],
                            [maxLng, maxLat],
                            [minLng, maxLat],
                            [minLng, minLat]
                        ];
                    } else if (feat.center && feat.center.length === 2) {
                        const cLng = feat.center[0];
                        const cLat = feat.center[1];
                        const delta = 0.008;
                        polyPoints = [
                            [cLng - delta, cLat - delta],
                            [cLng + delta, cLat - delta],
                            [cLng + delta, cLat + delta],
                            [cLng - delta, cLat + delta],
                            [cLng - delta, cLat - delta]
                        ];
                    }
                }
            }

            if (!polyPoints || polyPoints.length < 3) {
                alert(`Não foi possível localizar o contorno exato do bairro "${bairro}". Verifique o nome ou desenhe a área manualmente no mapa.`);
                return;
            }

            // Normalização segura de pares de coordenadas [lng, lat]
            this.areaPolygonPoints = polyPoints.map(pt => {
                if (Array.isArray(pt)) {
                    return [parseFloat(pt[0]), parseFloat(pt[1])];
                } else if (typeof pt === 'string') {
                    const parts = pt.trim().split(/\s+/);
                    return [parseFloat(parts[0]), parseFloat(parts[1])];
                }
                return null;
            }).filter(pt => pt && !isNaN(pt[0]) && !isNaN(pt[1]));

            if (this.areaPolygonPoints.length < 3) {
                alert(`Formato de coordenadas inválido para o bairro "${bairro}". Desenhe a área manualmente no mapa.`);
                return;
            }

            this.renderExistingPolygonOnAreaMap();

            if (this.areaMapInstance) {
                const bounds = new mapboxgl.LngLatBounds();
                this.areaPolygonPoints.forEach(pt => bounds.extend(pt));
                this.areaMapInstance.fitBounds(bounds, { padding: 40, maxZoom: 16 });
            }

            const infoContainer = document.getElementById('info-status-poligono-container');
            const infoStatus = document.getElementById('info-status-poligono');
            const txtStatus = document.getElementById('txt-status-poligono');
            const txtBairro = document.getElementById('txt-bairro-nome-identificado');

            if (infoContainer) infoContainer.classList.remove('hidden');
            if (infoStatus) infoStatus.classList.remove('hidden');
            if (txtStatus) txtStatus.textContent = `✓ Contorno do bairro demarcado (${this.areaPolygonPoints.length - 1} vértices)`;
            if (txtBairro) txtBairro.textContent = `Bairro: ${placeNameFound || bairro}`;

        } catch (err) {
            console.error('❌ [RelatorioController] Erro ao buscar contorno do bairro:', err);
            alert('Ocorreu um erro ao conectar com o serviço de mapas para localizar o bairro.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origBtnHtml;
            }
        }
    }

    setupBairroAutocomplete() {
        const input = document.getElementById('input-busca-bairro');
        const list = document.getElementById('suggestions-bairro-list');
        if (!input || !list || this._hasBairroAutocompleteSetup) return;

        this._hasBairroAutocompleteSetup = true;

        // Lista mestre expandida de bairros de Araraquara
        const baseAraraquaraBairros = [
            "Centro", "Vila Santana", "Vila Xavier", "Selmi Dei", "Carmo", "Jardim Fonte Luminosa",
            "Yolanda Ópice", "Jardim Universal", "Jardim Martinez", "Vale do Sol", "Santa Angelina",
            "Vila Suconasa", "São Geraldo", "Jardim Dom Pedro I", "Jardim Maria Luiza", "Jardim Paulistano",
            "Quitandinha", "Jardim Alvorada", "Santana", "Vila Ferroviária", "Jardim Marivan",
            "Jardim das Estações", "Jardim Paraíso", "Jardim Santa Lucrécia", "Distrito Industrial",
            "Jardim Imperador", "Jardim Brasil", "Jardim América", "Parque Pinheiros", "Jardim Adalberto Roxo",
            "Jardim Melhado", "Jardim Roseiras", "Jardim Tamoio", "Jardim Serra Azul", "Jardim das Hortênsias",
            "Jardim Indaiá", "Parque São Paulo", "Jardim Acapulco", "Vila Harmonia", "Jardim Botânico",
            "Chácara Flora", "Parque Gramado", "Jardim Residencial D'Domenico", "Bueno de Andrada",
            "Jardim Del Rey", "Jardim Água Branca", "Jardim Igaçaba", "Residencial dos Oitis", "Valle Verde", "Parque Residencial Damha"
        ];

        let debounceTimer = null;
        let selectedIndex = -1;

        const getMatchingSuggestions = async (query) => {
            const cleanQ = query.toLowerCase().trim();
            if (!cleanQ) return [];

            const matchesLocal = new Set();

            // 1. Filtrar lista estática mestre
            baseAraraquaraBairros.forEach(b => {
                if (b.toLowerCase().includes(cleanQ)) matchesLocal.add(b);
            });

            // 2. Extrair bairros dos chamados da tela
            if (this.chamadosList && this.chamadosList.length > 0) {
                this.chamadosList.forEach(item => {
                    const addr = String(item.endereco || item.pracaNome || '');
                    if (addr && addr.toLowerCase().includes(cleanQ)) {
                        const parts = addr.split('-').map(p => p.trim());
                        parts.forEach(p => {
                            if (p.toLowerCase().includes(cleanQ) && p.length < 35 && !p.toLowerCase().includes('rua') && !p.toLowerCase().includes('av')) {
                                matchesLocal.add(p);
                            }
                        });
                    }
                });
            }

            const results = Array.from(matchesLocal).slice(0, 6).map(name => ({
                title: name,
                subtitle: 'Bairro / Região - Araraquara - SP',
                source: 'local'
            }));

            // 3. Consultar OpenStreetMap Nominatim em tempo real para 100% de cobertura (ex: Vila Santana)
            if (cleanQ.length >= 2) {
                try {
                    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQ + ', Araraquara')}&addressdetails=1&limit=5`;
                    const resNom = await fetch(nomUrl, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
                    const dataNom = await resNom.json();

                    if (Array.isArray(dataNom)) {
                        dataNom.forEach(item => {
                            const name = item.name || (item.display_name ? item.display_name.split(',')[0] : null);
                            if (name && !results.some(r => r.title.toLowerCase() === name.toLowerCase())) {
                                results.push({
                                    title: name,
                                    subtitle: item.display_name || 'Bairro / Região - Araraquara',
                                    source: 'nominatim'
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.warn('⚠️ [RelatorioController] Falha ao consultar sugestões no Nominatim:', e);
                }
            }

            // 4. Complementar via Mapbox Geocoding Autocomplete API
            if (typeof mapboxgl !== 'undefined' && mapboxgl.accessToken && cleanQ.length >= 2 && results.length < 6) {
                try {
                    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQ)}.json?country=br&proximity=-48.176,-21.789&types=neighborhood,locality,district,sublocality,place&limit=4&access_token=${mapboxgl.accessToken}`;
                    const res = await fetch(url);
                    const data = await res.json();

                    if (data && data.features) {
                        data.features.forEach(feat => {
                            const name = feat.text;
                            if (name && !results.some(r => r.title.toLowerCase() === name.toLowerCase())) {
                                results.push({
                                    title: name,
                                    subtitle: feat.place_name || 'Região Geográfica',
                                    source: 'mapbox'
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.warn('⚠️ [RelatorioController] Falha na busca remota Mapbox:', e);
                }
            }

            return results.slice(0, 8);
        };

        const renderList = (items) => {
            list.innerHTML = '';
            selectedIndex = -1;

            if (items.length === 0) {
                list.classList.add('hidden');
                return;
            }

            items.forEach((item, idx) => {
                const el = document.createElement('div');
                el.className = `px-3.5 py-2 hover:bg-secondary/10 cursor-pointer flex items-center justify-between transition-colors suggestion-item text-xs`;
                el.dataset.index = idx;
                el.dataset.title = item.title;

                el.innerHTML = `
                    <div class="flex items-center gap-2 overflow-hidden">
                        <span class="material-symbols-outlined text-[16px] text-secondary">location_on</span>
                        <div class="truncate">
                            <span class="font-bold text-on-surface text-xs">${item.title}</span>
                            <span class="text-[10px] text-on-surface-variant block truncate">${item.subtitle}</span>
                        </div>
                    </div>
                    <span class="text-[10px] font-semibold text-secondary/80 bg-secondary/10 px-1.5 py-0.5 rounded">Bairro</span>
                `;

                el.addEventListener('click', () => {
                    input.value = item.title;
                    list.classList.add('hidden');
                    this.buscarBairroEContorno();
                });

                list.appendChild(el);
            });

            list.classList.remove('hidden');
        };

        const updateActiveItem = (items) => {
            items.forEach((it, i) => {
                if (i === selectedIndex) {
                    it.classList.add('bg-secondary/20');
                    input.value = it.dataset.title;
                } else {
                    it.classList.remove('bg-secondary/20');
                }
            });
        };

        input.addEventListener('input', (e) => {
            const q = e.target.value;
            clearTimeout(debounceTimer);
            if (!q.trim()) {
                list.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                const suggestions = await getMatchingSuggestions(q);
                renderList(suggestions);
            }, 120);
        });

        input.addEventListener('keydown', (e) => {
            const items = list.querySelectorAll('.suggestion-item');

            if (e.key === 'Enter') {
                if (!list.classList.contains('hidden') && selectedIndex >= 0 && items[selectedIndex]) {
                    e.preventDefault();
                    items[selectedIndex].click();
                } else {
                    list.classList.add('hidden');
                    this.buscarBairroEContorno();
                }
                return;
            }

            if (list.classList.contains('hidden') || items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                updateActiveItem(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                updateActiveItem(items);
            } else if (e.key === 'Escape') {
                list.classList.add('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.add('hidden');
            }
        });
    }

    limparBuscaBairro() {
        const input = document.getElementById('input-busca-bairro');
        if (input) input.value = '';
        const list = document.getElementById('suggestions-bairro-list');
        if (list) list.classList.add('hidden');
        const txtBairro = document.getElementById('txt-bairro-nome-identificado');
        if (txtBairro) txtBairro.textContent = '';
    }

    limparDesenhoArea() {
        this.areaPolygonPoints = [];
        this.limparBuscaBairro();
        this.limparMarkersDesenhoArea();
        this.desativarModoDesenhoArea();
    }

    limparMarkersDesenhoArea() {
        if (this.areaMapMarkers) {
            this.areaMapMarkers.forEach(m => m.remove());
        }
        this.areaMapMarkers = [];
        if (this.areaMapInstance) {
            if (this.areaMapInstance.getLayer('area-filtro-fill')) this.areaMapInstance.removeLayer('area-filtro-fill');
            if (this.areaMapInstance.getLayer('area-filtro-outline')) this.areaMapInstance.removeLayer('area-filtro-outline');
            if (this.areaMapInstance.getSource('area-filtro-source')) this.areaMapInstance.removeSource('area-filtro-source');
        }
        const infoContainer = document.getElementById('info-status-poligono-container');
        const infoStatus = document.getElementById('info-status-poligono');
        if (infoContainer) infoContainer.classList.add('hidden');
        if (infoStatus) infoStatus.classList.add('hidden');
    }

    confirmarFiltroArea() {
        if (!this.areaPolygonPoints || this.areaPolygonPoints.length < 3) {
            alert('Por favor, desenhe uma área no mapa com pelo menos 3 pontos antes de aplicar o filtro.');
            return;
        }

        this.activeFilters.polygon = [...this.areaPolygonPoints];
        this.fecharModalFiltroArea();
        this.applyFilters();
        this.updateSpatialFilterUI();
    }

    removerFiltroArea() {
        this.activeFilters.polygon = null;
        this.areaPolygonPoints = [];
        this.limparMarkersDesenhoArea();
        this.applyFilters();
        this.updateSpatialFilterUI();
    }

    updateSpatialFilterUI() {
        const badge = document.getElementById('spatial-filter-badge');
        const badgeText = document.getElementById('spatial-filter-badge-text');
        const btnOpen = document.getElementById('btn-open-spatial-filter');

        const hasPolygon = Array.isArray(this.activeFilters.polygon) && this.activeFilters.polygon.length >= 3;

        if (badge) {
            if (hasPolygon) {
                badge.classList.remove('hidden');
                badge.classList.add('flex');
                if (badgeText) badgeText.textContent = `Área Delimitada (${this.filteredList.length} OSs)`;
            } else {
                badge.classList.remove('flex');
                badge.classList.add('hidden');
            }
        }

        if (btnOpen) {
            if (hasPolygon) {
                btnOpen.classList.remove('bg-secondary/10', 'text-secondary', 'border-secondary/40');
                btnOpen.classList.add('bg-amber-500', 'text-white', 'border-amber-600');
                const spanTxt = btnOpen.querySelector('span:last-child');
                if (spanTxt) spanTxt.textContent = 'Editar Área no Mapa';
            } else {
                btnOpen.classList.remove('bg-amber-500', 'text-white', 'border-amber-600');
                btnOpen.classList.add('bg-secondary/10', 'text-secondary', 'border-secondary/40');
                const spanTxt = btnOpen.querySelector('span:last-child');
                if (spanTxt) spanTxt.textContent = 'Filtrar por Área';
            }
        }
    }

    // =========================================================================
    // EXPORTAÇÃO CSV DE ALTA QUALIDADE (COM UTF-8 BOM PARA EXCEL)
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

    exportarTodosCSV() {
        const dataset = this.chamadosList;
        if (!dataset || dataset.length === 0) {
            alert('Nenhum registro encontrado para exportar.');
            return;
        }

        const headers = [
            'Tipo OS', 'Protocolo', 'Nome da Praça', 'Data Abertura', 'Data Conclusão', 'Status', 'Prioridade',
            'Problema Inicial', 'Problema Encontrado', 'Plaqueta Inicial', 'Plaqueta Final',
            'Endereço / Local', 'Operador Abertura', 'Operador Finalização', 'Munícipe',
            'Coordenada Inicial', 'Coordenada Reparo', 'Qtd. Eletricistas (Praça)', 'Tempo Total Min (Praça)', 'Histórico de Sessões (Praça)',
            'Pontos Iniciais (Detalhados)', 'Pontos Finais (Detalhados)', 'Materiais Utilizados'
        ];

        let csvLines = [headers.join(';')];

        dataset.forEach(item => {
            const row = [
                this.escapeCSVCell(item.isPraca ? 'Praça Pública' : 'Viária'),
                this.escapeCSVCell(item.protocolo),
                this.escapeCSVCell(item.pracaNome || ''),
                this.escapeCSVCell(item.formattedDateShort || (item.dataAbertura ? item.dataAbertura.toLocaleDateString('pt-BR') : '')),
                this.escapeCSVCell(item.dataConclusao ? item.dataConclusao.toLocaleDateString('pt-BR') : ''),
                this.escapeCSVCell(item.statusBadgeLabel || item.status),
                this.escapeCSVCell(item.prioridade || 'Normal'),
                this.escapeCSVCell(item.formattedProblemaInicial || item.problemaInicial || ''),
                this.escapeCSVCell(item.formattedProblemaEncontrado || item.problemaEncontrado || ''),
                this.escapeCSVCell(item.formattedPlaquetaInicial || item.plaquetaInicial || ''),
                this.escapeCSVCell(item.formattedPlaquetaFinal || item.plaquetaFinal || ''),
                this.escapeCSVCell(item.isPraca && item.pracaNome ? `Praça: ${item.pracaNome} - ${item.endereco}` : (item.endereco || (item.addressPoints ? item.addressPoints.join(' | ') : ''))),
                this.escapeCSVCell(item.displayOperadorAbertura || item.operador || ''),
                this.escapeCSVCell(item.displayOperadorFinalizacao || ''),
                this.escapeCSVCell(item.municipeNome || ''),
                this.escapeCSVCell(item.formattedCoordenadaInicial || item.coordenadaInicial || ''),
                this.escapeCSVCell(item.formattedCoordenadaReparo || item.coordenadaReparo || ''),
                this.escapeCSVCell(item.isPraca ? item.qtdEletricistas : ''),
                this.escapeCSVCell(item.isPraca && item.tempoTotalMinutos !== null ? item.tempoTotalMinutos : ''),
                this.escapeCSVCell(item.isPraca ? (item.sessoesFormatted || '') : ''),
                this.escapeCSVCell(item.pontosIniciaisFormatted || ''),
                this.escapeCSVCell(item.pontosFinaisFormatted || ''),
                this.escapeCSVCell(item.materiais || '')
            ];
            csvLines.push(row.join(';'));
        });

        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Relatorio_OS_Completo_${dateStr}.csv`, csvLines.join('\n'));
    }

    exportarAbertasPendentesCSV() {
        const dataset = this.chamadosList.filter(item => item.normalizedStatus === 'aberto' || item.normalizedStatus === 'em_andamento' || item.normalizedStatus === 'pendente');
        if (dataset.length === 0) {
            alert('Nenhum chamado em aberto ou pendente para exportar.');
            return;
        }

        const headers = ['Tipo OS', 'Protocolo', 'Nome da Praça', 'Data Abertura', 'Status', 'Prioridade', 'Problema Inicial', 'Plaqueta Inicial', 'Endereço / Local', 'Operador', 'Munícipe', 'Coordenada Inicial', 'Pontos Iniciais (Detalhados)'];
        let csvLines = [headers.join(';')];

        dataset.forEach(item => {
            const row = [
                this.escapeCSVCell(item.isPraca ? 'Praça Pública' : 'Viária'),
                this.escapeCSVCell(item.protocolo),
                this.escapeCSVCell(item.pracaNome || ''),
                this.escapeCSVCell(item.formattedDateShort || ''),
                this.escapeCSVCell(item.statusBadgeLabel || item.status),
                this.escapeCSVCell(item.prioridade || 'Normal'),
                this.escapeCSVCell(item.formattedProblemaInicial || item.problemaInicial || ''),
                this.escapeCSVCell(item.formattedPlaquetaInicial || item.plaquetaInicial || ''),
                this.escapeCSVCell(item.isPraca && item.pracaNome ? `Praça: ${item.pracaNome} - ${item.endereco}` : (item.endereco || '')),
                this.escapeCSVCell(item.displayOperadorAbertura || item.operador || ''),
                this.escapeCSVCell(item.municipeNome || ''),
                this.escapeCSVCell(item.formattedCoordenadaInicial || item.coordenadaInicial || ''),
                this.escapeCSVCell(item.pontosIniciaisFormatted || '')
            ];
            csvLines.push(row.join(';'));
        });

        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Relatorio_OS_Pendentes_E_Abertas_${dateStr}.csv`, csvLines.join('\n'));
    }

    exportarConcluidasCSV() {
        const dataset = this.chamadosList.filter(item => item.normalizedStatus === 'concluida');
        if (dataset.length === 0) {
            alert('Nenhuma OS concluída para exportar.');
            return;
        }

        const headers = [
            'Tipo OS', 'Protocolo', 'Nome da Praça', 'Data Abertura', 'Data Conclusão',
            'Problema Inicial', 'Problema Encontrado', 'Plaqueta Inicial', 'Plaqueta Final', 'Endereço / Local',
            'Operador Abertura', 'Técnico Conclusão', 'Coordenada Reparo', 'Qtd. Eletricistas (Praça)',
            'Tempo Total Min (Praça)', 'Histórico de Sessões (Praça)', 'Pontos Finais (Detalhados)', 'Materiais Utilizados'
        ];
        let csvLines = [headers.join(';')];

        dataset.forEach(item => {
            const row = [
                this.escapeCSVCell(item.isPraca ? 'Praça Pública' : 'Viária'),
                this.escapeCSVCell(item.protocolo),
                this.escapeCSVCell(item.pracaNome || ''),
                this.escapeCSVCell(item.formattedDateShort || ''),
                this.escapeCSVCell(item.dataConclusao ? item.dataConclusao.toLocaleDateString('pt-BR') : ''),
                this.escapeCSVCell(item.formattedProblemaInicial || item.problemaInicial || ''),
                this.escapeCSVCell(item.formattedProblemaEncontrado || item.problemaEncontrado || ''),
                this.escapeCSVCell(item.formattedPlaquetaInicial || item.plaquetaInicial || ''),
                this.escapeCSVCell(item.formattedPlaquetaFinal || item.plaquetaFinal || ''),
                this.escapeCSVCell(item.isPraca && item.pracaNome ? `Praça: ${item.pracaNome} - ${item.endereco}` : (item.endereco || '')),
                this.escapeCSVCell(item.displayOperadorAbertura || item.operador || ''),
                this.escapeCSVCell(item.displayOperadorFinalizacao || 'Não informado'),
                this.escapeCSVCell(item.formattedCoordenadaReparo || item.coordenadaReparo || ''),
                this.escapeCSVCell(item.isPraca ? item.qtdEletricistas : ''),
                this.escapeCSVCell(item.isPraca && item.tempoTotalMinutos !== null ? item.tempoTotalMinutos : ''),
                this.escapeCSVCell(item.isPraca ? (item.sessoesFormatted || '') : ''),
                this.escapeCSVCell(item.pontosFinaisFormatted || ''),
                this.escapeCSVCell(item.materiais || '')
            ];
            csvLines.push(row.join(';'));
        });

        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Relatorio_OS_Concluidas_${dateStr}.csv`, csvLines.join('\n'));
    }

    exportarResumoExecucaoCSV() {
        const metrics = this.service.calculateMetrics(this.filteredList);
        
        let csvLines = [
            'Métrica;Valor',
            `Total de Ordens de Serviço;${metrics.totalOS}`,
            `Em Aberto / Em Andamento;${metrics.emAberto}`,
            `Concluídas;${metrics.concluidas}`,
            `Taxa de Conclusão;${metrics.completionRate}`,
            `Tempo Médio de Resolução (Dias);${metrics.avgResolutionDays}`,
            '',
            'Distribuição por Status;Quantidade',
        ];

        const statusCounts = {};
        this.filteredList.forEach(item => {
            const label = item.statusBadgeLabel || item.status || 'Outro';
            statusCounts[label] = (statusCounts[label] || 0) + 1;
        });

        Object.entries(statusCounts).forEach(([st, count]) => {
            csvLines.push(`${this.escapeCSVCell(st)};${count}`);
        });

        csvLines.push('');
        csvLines.push('Distribuição por Tipo de Problema;Quantidade');

        const problemCounts = {};
        this.filteredList.forEach(item => {
            const prob = item.formattedProblemaInicial || item.problemaInicial || 'Outro';
            problemCounts[prob] = (problemCounts[prob] || 0) + 1;
        });

        Object.entries(problemCounts).forEach(([pr, count]) => {
            csvLines.push(`${this.escapeCSVCell(pr)};${count}`);
        });

        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Resumo_Execucao_OS_${dateStr}.csv`, csvLines.join('\n'));
    }

    exportarFiltradoPersonalizadoCSV() {
        if (!this.filteredList || this.filteredList.length === 0) {
            alert('Nenhum registro corresponde aos filtros selecionados para exportação.');
            return;
        }

        const colDefinitions = [
            { id: 'col-tipo-os', label: 'Tipo OS', getKey: i => i.isPraca ? 'Praça Pública' : 'Viária' },
            { id: 'col-protocolo', label: 'Protocolo', getKey: i => i.protocolo },
            { id: 'col-praca-nome', label: 'Nome da Praça', getKey: i => i.pracaNome || '' },
            { id: 'col-data-abertura', label: 'Data Abertura', getKey: i => i.formattedDateShort || (i.dataAbertura ? i.dataAbertura.toLocaleDateString('pt-BR') : '') },
            { id: 'col-data-conclusao', label: 'Data Conclusão', getKey: i => i.dataConclusao ? i.dataConclusao.toLocaleDateString('pt-BR') : '' },
            { id: 'col-status', label: 'Status', getKey: i => i.statusBadgeLabel || i.status },
            { id: 'col-prioridade', label: 'Prioridade', getKey: i => i.prioridade || 'Normal' },
            { id: 'col-problema-inicial', label: 'Problema Inicial', getKey: i => i.formattedProblemaInicial || i.problemaInicial || '' },
            { id: 'col-problema-encontrado', label: 'Problema Encontrado', getKey: i => i.formattedProblemaEncontrado || i.problemaEncontrado || '' },
            { id: 'col-plaqueta', label: 'Plaqueta Inicial', getKey: i => i.formattedPlaquetaInicial || i.plaquetaInicial || '' },
            { id: 'col-plaqueta-final', label: 'Plaqueta Final', getKey: i => i.formattedPlaquetaFinal || i.plaquetaFinal || '' },
            { id: 'col-endereco', label: 'Endereço / Local', getKey: i => i.isPraca && i.pracaNome ? `Praça: ${i.pracaNome} - ${i.endereco}` : (i.endereco || (i.addressPoints ? i.addressPoints.join(' | ') : '')) },
            { id: 'col-operador', label: 'Operador Abertura', getKey: i => i.displayOperadorAbertura || i.operador || '' },
            { id: 'col-operador-finalizacao', label: 'Operador Finalização', getKey: i => i.displayOperadorFinalizacao || '' },
            { id: 'col-municipe', label: 'Munícipe', getKey: i => i.municipeNome || '' },
            { id: 'col-coordenadas', label: 'Coordenada Inicial', getKey: i => i.formattedCoordenadaInicial || i.coordenadaInicial || '' },
            { id: 'col-coordenada-reparo', label: 'Coordenada Reparo', getKey: i => i.formattedCoordenadaReparo || i.coordenadaReparo || '' },
            { id: 'col-eletricistas', label: 'Qtd. Eletricistas (Praça)', getKey: i => i.isPraca ? i.qtdEletricistas : '' },
            { id: 'col-tempo-total', label: 'Tempo Total Minutos (Praça)', getKey: i => i.isPraca && i.tempoTotalMinutos !== null ? i.tempoTotalMinutos : '' },
            { id: 'col-sessoes', label: 'Histórico de Sessões (Praça)', getKey: i => i.isPraca ? (i.sessoesFormatted || '') : '' },
            { id: 'col-pontos-iniciais', label: 'Pontos Iniciais (JSON)', getKey: i => i.pontosIniciaisFormatted || '' },
            { id: 'col-pontos-finais', label: 'Pontos Finais (JSON)', getKey: i => i.pontosFinaisFormatted || '' },
            { id: 'col-materiais', label: 'Materiais Utilizados', getKey: i => i.materiais || '' }
        ];

        const selectedCols = colDefinitions.filter(col => {
            const el = document.getElementById(col.id);
            return el ? el.checked : true;
        });

        if (selectedCols.length === 0) {
            alert('Por favor, selecione pelo menos uma coluna para exportar.');
            return;
        }

        const headers = selectedCols.map(c => c.label);
        let csvLines = [headers.join(';')];

        this.filteredList.forEach(item => {
            const row = selectedCols.map(c => this.escapeCSVCell(c.getKey(item)));
            csvLines.push(row.join(';'));
        });

        const dateStr = new Date().toISOString().split('T')[0];
        this.downloadCSV(`Relatorio_OS_Filtrado_Personalizado_${dateStr}.csv`, csvLines.join('\n'));
    }
}

window.RelatorioController = RelatorioController;

function initController() {
    if (!window.relatorioController) {
        window.relatorioController = new RelatorioController();
        window.relatorioController.init();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initController);
} else {
    initController();
}

})();
