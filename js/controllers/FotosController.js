class FotosController {
    constructor() {
        this.repository = new window.ChamadosRepository();
        this.chamadosList = [];
        this.photosList = [];
        this.filteredPhotos = [];
        
        // Active Filter State
        this.activeFilters = {
            search: '',
            dateType: 'todos',
            dateStart: null,
            dateEnd: null,
            tipoFoto: 'todos',
            tipoOs: 'todos',
        };

        this.lightboxIndex = -1;
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
    }

    async loadData() {
        this.renderSkeletonGrid();
        
        try {
            const rawChamados = await this.repository.fetchAllChamados();
            this.chamadosList = rawChamados || [];
            this.extractAllPhotos();
            this.applyFilters();
        } catch (err) {
            console.error('❌ [FotosController] Erro ao carregar chamados:', err);
            this.renderErrorState(err.message);
        }
    }

    renderSkeletonGrid() {
        const container = document.getElementById('fotos-grid-container');
        const emptyState = document.getElementById('fotos-empty-state');
        if (emptyState) emptyState.classList.add('hidden');
        if (!container) return;

        container.innerHTML = Array.from({ length: 8 }).map(() => `
            <div class="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl overflow-hidden shadow-xs animate-pulse flex flex-col h-72">
                <div class="w-full h-48 bg-surface-container-high"></div>
                <div class="p-3.5 space-y-2 flex-1">
                    <div class="h-4 w-2/3 bg-surface-container-high rounded"></div>
                    <div class="h-3 w-full bg-surface-container-high rounded"></div>
                </div>
            </div>
        `).join('');
    }

    renderErrorState(errMsg) {
        const container = document.getElementById('fotos-grid-container');
        if (!container) return;
        container.innerHTML = `
            <div class="col-span-full py-12 text-center">
                <span class="material-symbols-outlined text-[48px] text-error mb-2">warning</span>
                <h3 class="font-headline-sm font-bold text-on-surface">Erro ao carregar banco de imagens</h3>
                <p class="text-body-md text-on-surface-variant mt-1">${errMsg || 'Ocorreu um erro de comunicação com o Supabase.'}</p>
                <button onclick="window.fotosController.loadData()" class="mt-4 px-4 py-2 bg-secondary text-white rounded-xl font-semibold text-xs hover:bg-secondary-container transition-all">
                    Tentar Novamente
                </button>
            </div>
        `;
    }

    extractAllPhotos() {
        const photos = [];
        let countId = 0;

        (this.chamadosList || []).forEach(chamado => {
            if (!chamado) return;
            const evidencias = chamado.fotosEvidencias || [];
            evidencias.forEach(ev => {
                countId++;
                const cat = this.categorizePhotoType(ev.titulo, ev.estagio, ev.origem);
                
                photos.push({
                    id: `photo_${countId}_${chamado.id}`,
                    url: ev.url,
                    thumbnailUrl: ev.thumbnailUrl || ev.url,
                    urlOriginal: ev.urlOriginal || ev.url,
                    titulo: ev.titulo || 'Fotografia de Evidência',
                    origem: ev.origem || 'OS',
                    estagio: ev.estagio || '',
                    categoria: cat,
                    categoriaLabel: this.getCategoriaLabel(cat),
                    categoriaBadgeClass: this.getCategoriaBadgeClass(cat),
                    
                    chamado: chamado,
                    protocolo: chamado.protocolo || chamado.id || '---',
                    tipoOs: chamado.isPraca ? 'Praça Pública' : 'Viária',
                    isPraca: chamado.isPraca,
                    data: chamado.dataAbertura || chamado.dataConclusao || new Date(),
                    dataStr: chamado.formattedDateShort || (chamado.dataAbertura ? chamado.dataAbertura.toLocaleDateString('pt-BR') : '--'),
                    dataHoraFull: chamado.dataAbertura ? chamado.dataAbertura.toLocaleString('pt-BR') : '--',
                    endereco: chamado.enderecoDisplay || chamado.endereco || 'Local não informado',
                    plaqueta: chamado.plaquetaInicial || chamado.plaquetaFinal || 'N/A',
                    tecnico: chamado.operadorFinalizacao || chamado.operador || 'Técnico Responsável',
                    status: chamado.statusBadgeLabel,
                    normalizedStatus: chamado.normalizedStatus
                });
            });
        });

        // Ordena da mais recente para a mais antiga
        photos.sort((a, b) => {
            const tA = a.data ? new Date(a.data).getTime() : 0;
            const tB = b.data ? new Date(b.data).getTime() : 0;
            return tB - tA;
        });

        this.photosList = photos;
        this.updateKPIs();
    }

    categorizePhotoType(titulo = '', estagio = '', origem = '') {
        const text = `${titulo} ${estagio} ${origem}`.toLowerCase();
        if (text.includes('problema') || text.includes('defeito') || text.includes('antes')) return 'problema';
        if (text.includes('reparo') || text.includes('efetuado') || text.includes('depois') || text.includes('conclus') || text.includes('encerramento')) return 'reparo';
        if (text.includes('plaqueta') || text.includes('poste') || text.includes('placa')) return 'plaqueta';
        if (text.includes('entrada')) return 'entrada';
        if (text.includes('andamento') || text.includes('progresso')) return 'andamento';
        return 'outros';
    }

    getCategoriaLabel(cat) {
        const labels = {
            'problema': 'Problema Encontrado',
            'reparo': 'Reparo Efetuado',
            'plaqueta': 'Plaqueta do Poste',
            'entrada': 'Foto de Entrada',
            'andamento': 'Foto do Andamento',
            'outros': 'Evidência Geral'
        };
        return labels[cat] || 'Evidência';
    }

    getCategoriaBadgeClass(cat) {
        const classes = {
            'problema': 'bg-amber-600 text-white border-amber-500 shadow-md font-bold',
            'reparo': 'bg-emerald-600 text-white border-emerald-500 shadow-md font-bold',
            'plaqueta': 'bg-blue-600 text-white border-blue-500 shadow-md font-bold',
            'entrada': 'bg-purple-600 text-white border-purple-500 shadow-md font-bold',
            'andamento': 'bg-teal-600 text-white border-teal-500 shadow-md font-bold',
            'outros': 'bg-slate-800 text-white border-slate-700 shadow-md font-bold'
        };
        return classes[cat] || 'bg-slate-800 text-white border-slate-700 shadow-md font-bold';
    }

    updateKPIs() {
        const totalPhotosEl = document.getElementById('kpi-total-fotos');
        const totalViariaEl = document.getElementById('kpi-fotos-viaria');
        const totalPracaEl = document.getElementById('kpi-fotos-praca');
        const totalHojeEl = document.getElementById('kpi-fotos-hoje') || document.getElementById('kpi-oss-com-foto');

        const total = this.photosList.length;
        const viaria = this.photosList.filter(p => !p.isPraca).length;
        const praca = this.photosList.filter(p => p.isPraca).length;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const fotosHoje = this.photosList.filter(p => {
            if (!p.data) return false;
            try {
                const dtIso = new Date(p.data).toISOString().split('T')[0];
                return dtIso === todayStr;
            } catch (e) {
                return false;
            }
        }).length;

        if (totalPhotosEl) totalPhotosEl.textContent = total.toLocaleString('pt-BR');
        if (totalViariaEl) totalViariaEl.textContent = viaria.toLocaleString('pt-BR');
        if (totalPracaEl) totalPracaEl.textContent = praca.toLocaleString('pt-BR');
        if (totalHojeEl) totalHojeEl.textContent = fotosHoje.toLocaleString('pt-BR');
    }

    applyFilters() {
        let result = [...this.photosList];

        // 1. Busca textual (Protocolo, Plaqueta, Endereço, Técnico, Título)
        if (this.activeFilters.search && this.activeFilters.search.trim()) {
            const q = this.activeFilters.search.trim().toLowerCase();
            result = result.filter(p => 
                (p.protocolo && p.protocolo.toLowerCase().includes(q)) ||
                (p.plaqueta && p.plaqueta.toLowerCase().includes(q)) ||
                (p.endereco && p.endereco.toLowerCase().includes(q)) ||
                (p.tecnico && p.tecnico.toLowerCase().includes(q)) ||
                (p.titulo && p.titulo.toLowerCase().includes(q))
            );
        }

        // 2. Tipo de Foto anexada (Finalizar.html / Auditoria)
        if (this.activeFilters.tipoFoto && this.activeFilters.tipoFoto !== 'todos') {
            result = result.filter(p => p.categoria === this.activeFilters.tipoFoto);
        }

        // 3. Tipo de OS (Viária vs Praça)
        if (this.activeFilters.tipoOs && this.activeFilters.tipoOs !== 'todos') {
            if (this.activeFilters.tipoOs === 'viaria') {
                result = result.filter(p => !p.isPraca);
            } else if (this.activeFilters.tipoOs === 'praca') {
                result = result.filter(p => p.isPraca);
            }
        }

        // 4. Período
        if (this.activeFilters.dateType && this.activeFilters.dateType !== 'todos') {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            if (this.activeFilters.dateType === 'hoje') {
                result = result.filter(p => p.data && new Date(p.data).toISOString().split('T')[0] === todayStr);
            } else if (this.activeFilters.dateType === '7dias') {
                const past = new Date();
                past.setDate(past.getDate() - 7);
                result = result.filter(p => p.data && new Date(p.data) >= past);
            } else if (this.activeFilters.dateType === '30dias') {
                const past = new Date();
                past.setDate(past.getDate() - 30);
                result = result.filter(p => p.data && new Date(p.data) >= past);
            } else if (this.activeFilters.dateType === 'personalizado') {
                if (this.activeFilters.dateStart) {
                    const dtStart = new Date(this.activeFilters.dateStart + 'T00:00:00');
                    result = result.filter(p => p.data && new Date(p.data) >= dtStart);
                }
                if (this.activeFilters.dateEnd) {
                    const dtEnd = new Date(this.activeFilters.dateEnd + 'T23:59:59');
                    result = result.filter(p => p.data && new Date(p.data) <= dtEnd);
                }
            }
        }

        this.filteredPhotos = result;
        this.renderPhotoGrid();
    }

    setQuickDateFilter(type) {
        this.activeFilters.dateType = type;
        const select = document.getElementById('filter-periodo');
        if (select) select.value = type;

        const customRangeBox = document.getElementById('custom-date-range-box');
        if (customRangeBox) {
            if (type === 'personalizado') customRangeBox.classList.remove('hidden');
            else customRangeBox.classList.add('hidden');
        }

        // Highlight active quick buttons
        document.querySelectorAll('.quick-period-btn').forEach(btn => {
            if (btn.getAttribute('data-period') === type) {
                btn.className = 'quick-period-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-white shadow-xs cursor-pointer transition-all';
            } else {
                btn.className = 'quick-period-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest cursor-pointer transition-all';
            }
        });

        this.applyFilters();
    }

    setCategoryFilter(cat) {
        this.activeFilters.tipoFoto = cat;
        const select = document.getElementById('filter-tipo-foto');
        if (select) select.value = cat;

        // Highlight category chips
        document.querySelectorAll('.cat-chip-btn').forEach(btn => {
            if (btn.getAttribute('data-cat') === cat) {
                btn.className = 'cat-chip-btn px-3 py-1.5 rounded-full text-xs font-bold bg-secondary text-white shadow-xs cursor-pointer transition-all flex items-center gap-1.5';
            } else {
                btn.className = 'cat-chip-btn px-3 py-1.5 rounded-full text-xs font-medium bg-surface-container-lowest border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-low cursor-pointer transition-all flex items-center gap-1.5';
            }
        });

        this.applyFilters();
    }

    clearFilters() {
        this.activeFilters = {
            search: '',
            dateType: 'todos',
            dateStart: null,
            dateEnd: null,
            tipoFoto: 'todos',
            tipoOs: 'todos',
        };

        const pageSearch = document.getElementById('fotos-search-input');
        const headerSearch = document.getElementById('search-input');
        const filterFoto = document.getElementById('filter-tipo-foto');
        const filterOs = document.getElementById('filter-tipo-os');
        const filterPeriodo = document.getElementById('filter-periodo');
        const dtStart = document.getElementById('fotos-range-start');
        const dtEnd = document.getElementById('fotos-range-end');
        const customBox = document.getElementById('custom-date-range-box');

        if (pageSearch) pageSearch.value = '';
        if (headerSearch) headerSearch.value = '';
        if (filterFoto) filterFoto.value = 'todos';
        if (filterOs) filterOs.value = 'todos';
        if (filterPeriodo) filterPeriodo.value = 'todos';
        if (dtStart) dtStart.value = '';
        if (dtEnd) dtEnd.value = '';
        if (customBox) customBox.classList.add('hidden');

        this.setQuickDateFilter('todos');
        this.setCategoryFilter('todos');
    }

    renderPhotoGrid() {
        const container = document.getElementById('fotos-grid-container');
        const countBadge = document.getElementById('fotos-count-badge');
        const emptyState = document.getElementById('fotos-empty-state');

        if (countBadge) {
            countBadge.textContent = `${this.filteredPhotos.length} foto${this.filteredPhotos.length === 1 ? '' : 's'} encontrada${this.filteredPhotos.length === 1 ? '' : 's'}`;
        }

        if (!container) return;

        if (this.filteredPhotos.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        container.innerHTML = this.filteredPhotos.map((photo, index) => {
            return `
            <div class="group relative bg-surface-container-lowest border border-outline-variant/60 rounded-2xl overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer" onclick="window.fotosController.openLightbox(${index})">
                <!-- Visualizador de Imagem -->
                <div class="relative w-full h-48 sm:h-56 bg-slate-950/10 overflow-hidden">
                    <img src="${photo.thumbnailUrl}" 
                         alt="${photo.titulo}" 
                         loading="lazy"
                         onerror="this.src='https://placehold.co/600x400/1e293b/ffffff?text=Imagem+Indispon%C3%ADvel';" 
                         class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    
                    <!-- Hover Action Overlay -->
                    <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 backdrop-blur-[2px]">
                        <span class="w-10 h-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-[20px]">zoom_in</span>
                        </span>
                        <button type="button" 
                                onclick="event.stopPropagation(); window.abrirDetalhesOSModal('${photo.protocolo}')" 
                                class="w-10 h-10 rounded-full bg-secondary text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" 
                                title="Ver Detalhes da OS">
                            <span class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>

                    <!-- Badge do Tipo de Foto -->
                    <div class="absolute top-2.5 left-2.5 z-10">
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-md ${photo.categoriaBadgeClass}">
                            <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                            <span>${photo.categoriaLabel}</span>
                        </span>
                    </div>

                    <!-- Badge do Tipo de OS -->
                    <div class="absolute top-2.5 right-2.5 z-10">
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-900 text-white shadow-md border border-white/20">
                            <span>${photo.isPraca ? '🌳 Praça' : '💡 Viária'}</span>
                        </span>
                    </div>
                </div>

                <!-- Card Info -->
                <div class="p-3.5 flex flex-col justify-between flex-1 gap-2 bg-surface-container-lowest">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="font-mono text-xs font-bold text-secondary truncate" title="${photo.protocolo}">${photo.protocolo}</span>
                            <span class="text-[11px] text-on-surface-variant font-medium flex items-center gap-1 shrink-0">
                                <span class="material-symbols-outlined text-[13px]">calendar_today</span>
                                ${photo.dataStr}
                            </span>
                        </div>
                        <h4 class="text-xs font-semibold text-on-surface line-clamp-1" title="${photo.titulo}">${photo.titulo}</h4>
                    </div>

                    <div class="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[11px] text-on-surface-variant gap-2">
                        <div class="flex items-center gap-1 truncate" title="${photo.endereco}">
                            <span class="material-symbols-outlined text-[14px] text-secondary shrink-0">location_on</span>
                            <span class="truncate font-medium">${photo.endereco}</span>
                        </div>
                        ${photo.plaqueta && photo.plaqueta !== 'N/A' ? `
                            <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/60 shrink-0" title="Plaqueta">
                                ${photo.plaqueta}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    openLightbox(index) {
        if (index < 0 || index >= this.filteredPhotos.length) return;
        this.lightboxIndex = index;
        const photo = this.filteredPhotos[index];

        const modal = document.getElementById('modal-foto-lightbox');
        const imgEl = document.getElementById('lightbox-img');
        const titleEl = document.getElementById('lightbox-title');
        const protEl = document.getElementById('lightbox-protocolo');
        const catBadgeEl = document.getElementById('lightbox-cat-badge');
        const dataEl = document.getElementById('lightbox-data');
        const osTypeEl = document.getElementById('lightbox-os-type');
        const addressEl = document.getElementById('lightbox-address');
        const plaquetaEl = document.getElementById('lightbox-plaqueta');
        const tecnicoEl = document.getElementById('lightbox-tecnico');
        const counterEl = document.getElementById('lightbox-counter');
        const linkDirectEl = document.getElementById('lightbox-link-direct');
        const btnVerOs = document.getElementById('lightbox-btn-ver-os');

        if (!modal || !imgEl) return;

        imgEl.src = photo.urlOriginal || photo.url;
        if (titleEl) titleEl.textContent = photo.titulo;
        if (protEl) protEl.textContent = `Protocolo #${photo.protocolo}`;
        if (catBadgeEl) {
            catBadgeEl.textContent = photo.categoriaLabel;
            catBadgeEl.className = `inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${photo.categoriaBadgeClass}`;
        }
        if (dataEl) dataEl.textContent = photo.dataHoraFull;
        if (osTypeEl) osTypeEl.textContent = photo.isPraca ? '🌳 Praça Pública' : '💡 Iluminação Viária';
        if (addressEl) addressEl.textContent = photo.endereco;
        if (plaquetaEl) plaquetaEl.textContent = photo.plaqueta || 'Não informada';
        if (tecnicoEl) tecnicoEl.textContent = photo.tecnico || 'Técnico Responsável';
        if (counterEl) counterEl.textContent = `${index + 1} de ${this.filteredPhotos.length}`;
        if (linkDirectEl) linkDirectEl.href = photo.urlOriginal || photo.url;
        if (btnVerOs) {
            btnVerOs.setAttribute('onclick', `window.fotosController.closeLightbox(); window.abrirDetalhesOSModal('${photo.protocolo}')`);
        }

        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }

    closeLightbox() {
        const modal = document.getElementById('modal-foto-lightbox');
        if (modal) modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }

    nextLightboxPhoto() {
        if (this.lightboxIndex < this.filteredPhotos.length - 1) {
            this.openLightbox(this.lightboxIndex + 1);
        }
    }

    prevLightboxPhoto() {
        if (this.lightboxIndex > 0) {
            this.openLightbox(this.lightboxIndex - 1);
        }
    }

    copyPhotoLink() {
        if (this.lightboxIndex < 0 || this.lightboxIndex >= this.filteredPhotos.length) return;
        const photo = this.filteredPhotos[this.lightboxIndex];
        const url = photo.urlOriginal || photo.url;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert('Link da foto copiado para a área de transferência!');
            }).catch(() => {
                prompt('Copie o link da imagem abaixo:', url);
            });
        } else {
            prompt('Copie o link da imagem abaixo:', url);
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.activeFilters.search = e.target.value;
                this.applyFilters();
            });
        }

        const pageSearchInput = document.getElementById('fotos-search-input');
        if (pageSearchInput) {
            pageSearchInput.addEventListener('input', (e) => {
                this.activeFilters.search = e.target.value;
                this.applyFilters();
            });
        }

        const filterTipoFoto = document.getElementById('filter-tipo-foto');
        if (filterTipoFoto) {
            filterTipoFoto.addEventListener('change', (e) => {
                this.activeFilters.tipoFoto = e.target.value;
                this.setCategoryFilter(e.target.value);
            });
        }

        const filterTipoOs = document.getElementById('filter-tipo-os');
        if (filterTipoOs) {
            filterTipoOs.addEventListener('change', (e) => {
                this.activeFilters.tipoOs = e.target.value;
                this.applyFilters();
            });
        }

        const filterPeriodo = document.getElementById('filter-periodo');
        if (filterPeriodo) {
            filterPeriodo.addEventListener('change', (e) => {
                const val = e.target.value;
                this.setQuickDateFilter(val);
            });
        }

        const dtStartInput = document.getElementById('fotos-range-start');
        const dtEndInput = document.getElementById('fotos-range-end');
        if (dtStartInput) {
            dtStartInput.addEventListener('change', (e) => {
                this.activeFilters.dateStart = e.target.value;
                this.applyFilters();
            });
        }
        if (dtEndInput) {
            dtEndInput.addEventListener('change', (e) => {
                this.activeFilters.dateEnd = e.target.value;
                this.applyFilters();
            });
        }

        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('modal-foto-lightbox');
            if (modal && !modal.classList.contains('hidden')) {
                if (e.key === 'Escape') this.closeLightbox();
                if (e.key === 'ArrowRight') this.nextLightboxPhoto();
                if (e.key === 'ArrowLeft') this.prevLightboxPhoto();
            }
        });
    }
}

// Global initialization logic
window.FotosController = FotosController;

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.toLowerCase().includes('fotos')) {
        // Garantir que PainelController esteja pronto para abrir os modais de detalhes da OS
        if (typeof window.PainelController === 'function' && !window.painelController) {
            window.painelController = new window.PainelController();
            window.painelController.init();
        }
        window.fotosController = new window.FotosController();
        window.fotosController.init();
    }
});
