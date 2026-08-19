class AppSidebar extends HTMLElement {
    async connectedCallback() {
        this.render();

        // Ouve evento de autenticação pronta para re-renderizar o menu com base no perfil do usuário
        this._authListener = () => this.render();
        window.addEventListener('auth-ready', this._authListener);

        if (window.AuthGuard) {
            try {
                await window.AuthGuard.requireAuth();
                this.render();
            } catch (e) {
                console.warn('⚠️ [Sidebar] Erro ao obter dados do usuário via AuthGuard:', e);
            }
        }
    }

    disconnectedCallback() {
        if (this._authListener) {
            window.removeEventListener('auth-ready', this._authListener);
        }
    }

    render() {
        // 1. Verificar estado vindo pela URL (?sidebar=collapsed ou ?sidebar=expanded)
        const urlParams = new URLSearchParams(window.location.search);
        const urlSidebarState = urlParams.get('sidebar');

        let isCollapsed = true;

        if (urlSidebarState === 'collapsed') {
            isCollapsed = true;
        } else if (urlSidebarState === 'expanded') {
            isCollapsed = false;
        } else {
            // 2. Fallback para localStorage/sessionStorage (para servidores HTTP)
            try {
                const savedState = localStorage.getItem('sidebar-collapsed') || sessionStorage.getItem('sidebar-collapsed');
                if (savedState !== null) {
                    isCollapsed = savedState === 'true';
                } else {
                    isCollapsed = document.body.classList.contains('sidebar-collapsed');
                }
            } catch (e) {
                isCollapsed = document.body.classList.contains('sidebar-collapsed');
            }
        }

        // Aplicar estado no body
        if (isCollapsed) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }

        // Salvar estado atual
        try {
            localStorage.setItem('sidebar-collapsed', isCollapsed);
            sessionStorage.setItem('sidebar-collapsed', isCollapsed);
        } catch (e) {}

        const activePage = this.getAttribute('active') || 'painel';
        const attrMode = this.getAttribute('mode') || '';
        const stateQuery = isCollapsed ? '?sidebar=collapsed' : '?sidebar=expanded';

        // Detectar se deve exibir a visão alternativa do Manutentor
        const currentPath = decodeURIComponent(window.location.pathname || '').toLowerCase();
        const isManutentorPath = currentPath.includes('manutentor') || activePage.includes('manutentor') || attrMode === 'manutentor';
        
        let isCampoUser = false;
        let isManutentorUser = false;
        if (window.AuthGuard && window.AuthGuard._cachedAuthData) {
            const role = window.AuthGuard.getUserRole(window.AuthGuard._cachedAuthData.user, window.AuthGuard._cachedAuthData.profile);
            isCampoUser = ['campo', 'executor', 'tecnico', 'operador', 'operacional'].includes(role);
            isManutentorUser = role === 'manutentor';
        }

        const isRestrictedMode = isManutentorPath || isCampoUser || isManutentorUser || document.body.classList.contains('manutentor-view');

        const menuItems = isRestrictedMode ? [
            { id: 'painel-manutentor', label: 'Acompanhamento', icon: 'dashboard', href: 'Painel-Manutentor.html' },
            { id: 'mapa', label: 'Mapa de OS', icon: 'map', href: 'Mapa.html' },
            { id: 'sair', label: 'Sair', icon: 'logout', href: 'javascript:if(window.AuthGuard)window.AuthGuard.logout();else window.location.href="Login.html";', mtAuto: true }
        ] : [
            { id: 'painel', label: 'Acompanhamento', icon: 'dashboard', href: 'Painel.html' },
            { id: 'auditoria', label: 'Auditoria', icon: 'fact_check', href: 'Auditoria.html' },
            { id: 'mapa', label: 'Mapa de OS', icon: 'map', href: 'Mapa.html' },
            { id: 'relatorios', label: 'Relatórios', icon: 'bar_chart', href: '#' },
            { id: 'configuracoes', label: 'Configurações', icon: 'settings', href: '#', mtAuto: true },
            { id: 'sair', label: 'Sair', icon: 'logout', href: 'javascript:if(window.AuthGuard)window.AuthGuard.logout();else window.location.href="Login.html";' }
        ];

        const topButtonHtml = isRestrictedMode ? `
    <button id="btn-finalizar-os" onclick="window.abrirModalFinalizarOS()" class="mx-container-padding sidebar-px mb-8 bg-emerald-600 text-white font-label-md text-label-md py-2 px-4 rounded-lg hover:bg-emerald-700 transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 overflow-hidden whitespace-nowrap shadow-sm hover:shadow-md cursor-pointer" title="Finalizar Ordem de Serviço">
        <span class="material-symbols-outlined flex-shrink-0" style='font-variation-settings: "FILL" 1;'>task_alt</span>
        <span class="sidebar-text transition-opacity duration-300">Finalizar Ordem de Serviço</span>
    </button>` : `
    <button id="btn-nova-os" onclick="window.abrirModalNovaOS()" class="mx-container-padding sidebar-px mb-8 bg-secondary text-on-secondary font-label-md text-label-md py-2 px-4 rounded-lg hover:bg-secondary-container hover:text-on-secondary-container transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 overflow-hidden whitespace-nowrap shadow-sm hover:shadow-md cursor-pointer">
        <span class="material-symbols-outlined flex-shrink-0" style='font-variation-settings: "FILL" 1;'>add</span>
        <span class="sidebar-text transition-opacity duration-300">Nova Ordem de Serviço</span>
    </button>`;

        const navLinksHtml = menuItems.map(item => {
            const isActive = item.id === activePage || (activePage === 'painel' && item.id === 'painel-manutentor') || (activePage === 'painel-manutentor' && item.id === 'painel-manutentor');
            const activeClasses = 'text-secondary font-bold border-r-4 border-secondary bg-surface-container-high';
            const inactiveClasses = 'text-on-surface-variant hover:bg-surface-container-low';
            const extraClasses = item.mtAuto ? 'mt-auto' : '';
            
            // Anexar o parâmetro de estado do menu aos links que navegam para arquivos HTML
            const linkHref = (item.href && item.href !== '#') ? `${item.href}${stateQuery}` : '#';

            return `
        <li class="${extraClasses}">
            <a href="${linkHref}" class="flex items-center gap-3 px-container-padding sidebar-px py-3 ${isActive ? activeClasses : inactiveClasses} transition-colors duration-200 font-body-md text-body-md overflow-hidden whitespace-nowrap active:scale-95">
                <span class="material-symbols-outlined flex-shrink-0">${item.icon}</span>
                <span class="sidebar-text transition-opacity duration-300">${item.label}</span>
            </a>
        </li>`;
        }).join('');

        this.innerHTML = `
<nav class="bg-surface-container-lowest/80 backdrop-blur-sm dark:bg-surface-container-lowest/80 w-[260px] h-screen fixed left-0 top-0 border-r border-outline-variant dark:border-outline flex flex-col pt-6 pb-6 z-20 transition-all duration-300" id="sidebar">
    <div class="px-container-padding sidebar-px mb-6 flex justify-between items-center h-10">
        <h1 class="font-headline-sm text-headline-sm font-bold text-primary dark:text-primary-fixed sidebar-text whitespace-nowrap overflow-hidden transition-opacity duration-300">Araraquara</h1>
        <button class="text-on-surface-variant hover:bg-surface-container-low p-1.5 rounded-full transition-all flex-shrink-0 active:scale-90 cursor-pointer" onclick="window.toggleSidebar()" title="Alternar Menu">
            <span class="material-symbols-outlined text-[24px]">menu</span>
        </button>
    </div>
    
    ${topButtonHtml}
    
    <ul class="flex-1 flex flex-col gap-1">
        ${navLinksHtml}
    </ul>
</nav>`;
    }
}

// Função global para alternar e salvar o estado do menu
window.toggleSidebar = function() {
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    
    try {
        localStorage.setItem('sidebar-collapsed', isCollapsed);
        sessionStorage.setItem('sidebar-collapsed', isCollapsed);
    } catch (e) {}

    // Atualizar os Hrefs dos links em tempo real ao alternar o menu
    const stateQuery = isCollapsed ? '?sidebar=collapsed' : '?sidebar=expanded';
    document.querySelectorAll('#sidebar a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && href !== '#') {
            const cleanHref = href.split('?')[0];
            a.setAttribute('href', `${cleanHref}${stateQuery}`);
        }
    });
};

// =========================================================================
// GESTÃO GLOBAL DO MODAL DE NOVA / EDIÇÃO / FINALIZAÇÃO DE OS
// =========================================================================
function garantirModalNovaOSNoDOM() {
    if (document.getElementById('modal-abertura-os')) return;

    const modalContainer = document.createElement('div');
    modalContainer.id = 'modal-abertura-os';
    modalContainer.className = 'fixed inset-0 z-50 hidden flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300';
    modalContainer.innerHTML = `
        <div id="modal-abertura-os-box" class="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl shadow-2xl max-w-3xl w-full h-[92vh] max-h-[850px] overflow-hidden flex flex-col text-on-surface transform transition-all duration-300 scale-95 opacity-0">
            <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low/50 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-[22px]">add_task</span>
                    </div>
                    <div>
                        <h3 class="font-headline-sm text-headline-sm font-bold text-on-surface">Nova Ordem de Serviço</h3>
                        <p class="font-label-sm text-label-sm text-on-surface-variant">Abertura e registro de novo chamado</p>
                    </div>
                </div>
                <button onclick="window.closeNovaOSModal()" class="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-1.5 rounded-full transition-colors cursor-pointer flex items-center justify-center" title="Fechar Modal">
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>
            <div class="flex-1 min-h-0 w-full h-full bg-slate-50 relative overflow-y-auto">
                <iframe id="iframe-abertura-os" src="Abrir.html" class="w-full h-full border-0"></iframe>
            </div>
        </div>
    `;
    document.body.appendChild(modalContainer);
}

function garantirModalFinalizarOSNoDOM() {
    if (document.getElementById('modal-finalizar-os')) return;

    const modalContainer = document.createElement('div');
    modalContainer.id = 'modal-finalizar-os';
    modalContainer.className = 'fixed inset-0 z-50 hidden flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300';
    modalContainer.innerHTML = `
        <div id="modal-finalizar-os-box" class="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl shadow-2xl max-w-4xl w-full h-[92vh] max-h-[880px] overflow-hidden flex flex-col text-on-surface transform transition-all duration-300 scale-95 opacity-0">
            <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low/50 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-[22px]">task_alt</span>
                    </div>
                    <div>
                        <h3 class="font-headline-sm text-headline-sm font-bold text-on-surface">Finalizar Ordem de Serviço</h3>
                        <p class="font-label-sm text-label-sm text-on-surface-variant">Preenchimento de formulário de conclusão, fotos e materiais</p>
                    </div>
                </div>
                <button onclick="window.closeFinalizarOSModal()" class="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-1.5 rounded-full transition-colors cursor-pointer flex items-center justify-center" title="Fechar Modal">
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>
            <div class="flex-1 min-h-0 w-full h-full bg-slate-50 relative overflow-y-auto">
                <iframe id="iframe-finalizar-os" src="about:blank" class="w-full h-full border-0"></iframe>
            </div>
        </div>
    `;
    document.body.appendChild(modalContainer);
}

window.abrirModalNovaOS = function() {
    garantirModalNovaOSNoDOM();
    const modal = document.getElementById('modal-abertura-os');
    const modalBox = document.getElementById('modal-abertura-os-box');
    const iframe = document.getElementById('iframe-abertura-os');
    if (!modal || !modalBox) return;

    try { sessionStorage.removeItem('os_para_edicao'); } catch(e) {}

    if (iframe) {
        if (iframe.contentWindow && typeof iframe.contentWindow.carregarModoEdicaoOuReset === 'function') {
            iframe.contentWindow.carregarModoEdicaoOuReset();
        } else if (!iframe.src || iframe.src === 'about:blank' || !iframe.src.includes('Abrir.html')) {
            iframe.src = 'Abrir.html';
        }
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBox.classList.remove('scale-95', 'opacity-0');
        modalBox.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.abrirModalEditarOS = function(osRecord) {
    garantirModalNovaOSNoDOM();
    const modal = document.getElementById('modal-abertura-os');
    const modalBox = document.getElementById('modal-abertura-os-box');
    const iframe = document.getElementById('iframe-abertura-os');
    if (!modal || !modalBox || !iframe || !osRecord) return;

    try {
        sessionStorage.setItem('os_para_edicao', JSON.stringify(osRecord));
    } catch(e) {
        console.warn('⚠️ Erro ao gravar os_para_edicao no sessionStorage:', e);
    }

    if (iframe.contentWindow && typeof iframe.contentWindow.carregarModoEdicaoOuReset === 'function') {
        iframe.contentWindow.carregarModoEdicaoOuReset();
    } else {
        iframe.src = 'Abrir.html';
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBox.classList.remove('scale-95', 'opacity-0');
        modalBox.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeNovaOSModal = function() {
    const modal = document.getElementById('modal-abertura-os');
    const modalBox = document.getElementById('modal-abertura-os-box');
    if (!modal || !modalBox) return;

    modalBox.classList.remove('scale-100', 'opacity-100');
    modalBox.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        try { sessionStorage.removeItem('os_para_edicao'); } catch(e) {}
    }, 200);
};

window.abrirModalFinalizarOS = function(osRecord) {
    garantirModalFinalizarOSNoDOM();
    const modal = document.getElementById('modal-finalizar-os');
    const modalBox = document.getElementById('modal-finalizar-os-box');
    const iframe = document.getElementById('iframe-finalizar-os');
    if (!modal || !modalBox || !iframe) return;

    const record = (typeof osRecord === 'object' && osRecord !== null) ? osRecord : { protocolo: osRecord };

    try {
        sessionStorage.setItem('os_para_finalizar', JSON.stringify(record));
    } catch(e) {
        console.warn('⚠️ Erro ao gravar os_para_finalizar no sessionStorage:', e);
    }

    const prot = record.protocolo || '';
    const targetSrc = `Finalizar.html?protocolo=${encodeURIComponent(prot)}&t=${Date.now()}`;

    if (iframe.contentWindow && typeof iframe.contentWindow.carregarOSParaFinalizar === 'function') {
        iframe.contentWindow.carregarOSParaFinalizar(record);
    } else {
        iframe.src = targetSrc;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBox.classList.remove('scale-95', 'opacity-0');
        modalBox.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeFinalizarOSModal = function() {
    const modal = document.getElementById('modal-finalizar-os');
    const modalBox = document.getElementById('modal-finalizar-os-box');
    if (!modal || !modalBox) return;

    modalBox.classList.remove('scale-100', 'opacity-100');
    modalBox.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        try { sessionStorage.removeItem('os_para_finalizar'); } catch(e) {}
    }, 200);
};

// Escuta mensagens globais dos iframes (Abrir.html e Finalizar.html)
window.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.action === 'FECHAR_MODAL_ABERTURA') {
            if (typeof window.closeNovaOSModal === 'function') window.closeNovaOSModal();
        } else if (event.data.action === 'FECHAR_MODAL_FINALIZAR') {
            if (typeof window.closeFinalizarOSModal === 'function') window.closeFinalizarOSModal();
        } else if (event.data.action === 'OS_CRIADA_SUCESSO') {
            if (typeof window.closeNovaOSModal === 'function') window.closeNovaOSModal();
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                window.painelController.loadData();
            } else if (typeof window.carregarChamados === 'function') {
                window.carregarChamados();
            } else if (typeof window.applyCombinedFilters === 'function') {
                window.applyCombinedFilters();
            } else if (typeof window.carregarDadosAuditoria === 'function') {
                window.carregarDadosAuditoria();
            }
        } else if (event.data.action === 'OS_CONCLUIDA_SUCESSO') {
            if (typeof window.closeFinalizarOSModal === 'function') window.closeFinalizarOSModal();
            if (window.painelController && typeof window.painelController.loadData === 'function') {
                window.painelController.loadData();
            } else if (typeof window.carregarChamados === 'function') {
                window.carregarChamados();
            } else if (typeof window.applyCombinedFilters === 'function') {
                window.applyCombinedFilters();
            } else if (typeof window.carregarDadosAuditoria === 'function') {
                window.carregarDadosAuditoria();
            }
        }
    }
});

customElements.define('app-sidebar', AppSidebar);

// =========================================================================
// SISTEMA DE NAVEGAÇÃO SPA (SEM RECARREGAMENTO COMPLETO DE PÁGINA)
// =========================================================================

function loadScriptIfNeeded(src) {
    if (!src) return Promise.resolve();
    const cleanSrc = src.replace(/^\.\//, '').split('?')[0];
    const existingScript = Array.from(document.querySelectorAll('script')).find(s => {
        const sSrc = s.getAttribute('src');
        if (!sSrc) return false;
        const cleanSSrc = sSrc.replace(/^\.\//, '').split('?')[0];
        return cleanSSrc === cleanSrc || cleanSSrc.endsWith(cleanSrc);
    });

    if (existingScript) {
        if (existingScript.getAttribute('src') === src) {
            return Promise.resolve();
        } else {
            existingScript.remove();
        }
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
    });
}

function updateSidebarActiveState(targetUrl) {
    const sidebar = document.querySelector('app-sidebar');
    if (!sidebar) return;

    const lower = targetUrl.split('?')[0].toLowerCase();
    let activeId = 'painel';
    if (lower.includes('manutentor')) activeId = 'painel-manutentor';
    else if (lower.includes('auditoria')) activeId = 'auditoria';
    else if (lower.includes('mapa')) activeId = 'mapa';
    else if (lower.includes('relatorios')) activeId = 'relatorios';
    else if (lower.includes('configuracoes')) activeId = 'configuracoes';

    sidebar.setAttribute('active', activeId);

    const links = sidebar.querySelectorAll('#sidebar a[href]');
    const activeClasses = ['text-secondary', 'font-bold', 'border-r-4', 'border-secondary', 'bg-surface-container-high'];
    const inactiveClasses = ['text-on-surface-variant', 'hover:bg-surface-container-low'];

    links.forEach(a => {
        const href = a.getAttribute('href') || '';
        const linkClean = href.split('?')[0].toLowerCase();
        const isThisActive = linkClean === lower || (activeId === 'painel' && linkClean.includes('painel'));

        if (isThisActive) {
            inactiveClasses.forEach(c => a.classList.remove(c));
            activeClasses.forEach(c => a.classList.add(c));
        } else {
            activeClasses.forEach(c => a.classList.remove(c));
            inactiveClasses.forEach(c => a.classList.add(c));
        }
    });
}

function syncStylesFromDoc(doc) {
    if (!doc || !doc.head) return;
    const styles = doc.head.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach(style => {
        if (style.tagName.toLowerCase() === 'style') {
            const content = style.textContent;
            if (content && content.trim()) {
                const exists = Array.from(document.head.querySelectorAll('style')).some(s => s.textContent === content);
                if (!exists) {
                    const newStyle = document.createElement('style');
                    newStyle.textContent = content;
                    document.head.appendChild(newStyle);
                }
            }
        } else if (style.tagName.toLowerCase() === 'link') {
            const href = style.getAttribute('href');
            if (href) {
                const exists = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') === href);
                if (!exists) {
                    const newLink = document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.href = href;
                    document.head.appendChild(newLink);
                }
            }
        }
    });
}

function reinitPageControllers(targetUrl) {
    const page = targetUrl.split('?')[0].toLowerCase();

    if (page.includes('painel')) {
        const Controller = window.PainelController || (typeof PainelController !== 'undefined' ? PainelController : null);
        if (Controller) {
            window.painelController = new Controller();
            window.painelController.init();
        } else {
            console.warn('⚠️ [SPA] PainelController não disponível para inicialização.');
        }
    } else if (page.includes('auditoria')) {
        const Controller = window.AuditoriaController || (typeof AuditoriaController !== 'undefined' ? AuditoriaController : null);
        if (Controller) {
            window.auditoriaController = new Controller();
            window.auditoriaController.init();
        } else {
            console.warn('⚠️ [SPA] AuditoriaController não disponível para inicialização.');
        }
    } else if (page.includes('mapa')) {
        window.mapOSsInstance = null;
        if (typeof window.carregarMapaOSsAbertas === 'function') {
            window.carregarMapaOSsAbertas();
        }
    }
}

window.navigateSPA = async function(targetUrl, pushState = true) {
    if (window.AuthGuard) {
        const authData = await window.AuthGuard.requireAuth(targetUrl);
        if (!authData) return;
    }

    const cleanTargetUrl = targetUrl.split('?')[0];
    const currentCleanUrl = window.location.pathname.split('/').pop() || 'Painel.html';

    // Evita refetch se já estiver na mesma página com exatamente a mesma querystring
    if (cleanTargetUrl === currentCleanUrl && targetUrl === (window.location.pathname.split('/').pop() + window.location.search)) {
        return;
    }

    try {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.opacity = '0.4';
            mainContent.style.transition = 'opacity 0.15s ease';
        }

        const fetchUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_ts=' + Date.now();
        const res = await fetch(fetchUrl, { cache: 'no-cache' });
        if (!res.ok) {
            window.location.href = targetUrl;
            return;
        }

        const htmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        if (doc.title) {
            document.title = doc.title;
        }

        // Sincroniza estilos (<style> e <link rel="stylesheet">) do documento alvo no document.head
        syncStylesFromDoc(doc);

        // Carrega scripts do head do novo documento que ainda não foram carregados
        const scripts = Array.from(doc.querySelectorAll('script[src]'));
        for (const s of scripts) {
            const src = s.getAttribute('src');
            if (src && !src.includes('tailwindcss') && !src.includes('three') && !src.includes('sidebar.js') && !src.includes('header.js') && !src.includes('mapbox-gl.js')) {
                await loadScriptIfNeeded(src);
            }
        }

        // Atualizar Header se existir
        const newAppHeader = doc.querySelector('app-header');
        const currentAppHeader = document.querySelector('app-header');
        if (newAppHeader && currentAppHeader) {
            currentAppHeader.outerHTML = newAppHeader.outerHTML;
        } else {
            const newHeader = doc.getElementById('top-header');
            const currentHeader = document.getElementById('top-header');
            if (newHeader && currentHeader) {
                currentHeader.innerHTML = newHeader.innerHTML;
                currentHeader.className = newHeader.className;
            }
        }

        // Sincronizar classes do Body preservando o estado colapsado do menu
        if (doc.body && doc.body.className) {
            const isCollapsed = document.body.classList.contains('sidebar-collapsed');
            document.body.className = doc.body.className;
            if (isCollapsed) {
                document.body.classList.add('sidebar-collapsed');
            } else {
                document.body.classList.remove('sidebar-collapsed');
            }
        }

        // Atualizar Main Content
        const newMain = doc.getElementById('main-content');
        if (newMain && mainContent) {
            mainContent.innerHTML = newMain.innerHTML;
            mainContent.className = newMain.className;
            mainContent.scrollTop = 0;
            mainContent.style.opacity = '1';
        }

        // Sincronizar Modais de Nível Superior (Filhos diretos do body) para document.body
        if (doc.body) {
            const oldModals = Array.from(document.body.children).filter(el => {
                if (['MAIN', 'SCRIPT', 'APP-HEADER', 'APP-SIDEBAR', 'CANVAS'].includes(el.tagName)) return false;
                const id = el.id || '';
                if (id === 'audit-global-popover') return false;
                const className = (typeof el.className === 'string') ? el.className : '';
                return id.includes('modal') || id.includes('confirm') || className.includes('fixed');
            });
            oldModals.forEach(m => m.remove());

            const newModals = Array.from(doc.body.children).filter(el => {
                if (['MAIN', 'SCRIPT', 'APP-HEADER', 'APP-SIDEBAR', 'CANVAS'].includes(el.tagName)) return false;
                const id = el.id || '';
                if (id === 'audit-global-popover') return false;
                const className = (typeof el.className === 'string') ? el.className : '';
                return id.includes('modal') || id.includes('confirm') || className.includes('fixed');
            });
            newModals.forEach(modal => {
                document.body.appendChild(modal.cloneNode(true));
            });
        }

        // Limpar mapa antigo se estiver navegando para fora da página de mapa
        if (window.mapOSsInstance && typeof window.mapOSsInstance.remove === 'function') {
            try { window.mapOSsInstance.remove(); } catch(e) {}
            window.mapOSsInstance = null;
        }

        // Atualizar histórico de navegação do navegador
        if (pushState) {
            window.history.pushState({ url: targetUrl }, '', targetUrl);
        }

        // Atualizar flag de visão manutentor
        window.isManutentorView = targetUrl.toLowerCase().includes('manutentor');

        // Atualizar sidebar
        updateSidebarActiveState(targetUrl);

        // Recriar scripts inline no body do documento alvo (ex: inicialização do mapa em Mapa.html)
        const bodyInlineScripts = Array.from(doc.body.querySelectorAll('script')).filter(s => {
            const isSrc = s.hasAttribute('src');
            const text = s.textContent || '';
            const isThreeCanvas = text.includes('bg-canvas') || text.includes('THREE.WebGLRenderer');
            return !isSrc && !isThreeCanvas;
        });

        bodyInlineScripts.forEach(script => {
            try {
                const newScript = document.createElement('script');
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
            } catch(e) {
                console.warn('⚠️ Erro ao executar script inline durante transição SPA:', e);
            }
        });

        // Reiniciar controller correspondente
        reinitPageControllers(targetUrl);

    } catch (err) {
        console.warn('⚠️ Falha no carregamento SPA:', err);
        window.location.href = targetUrl;
    }
};

// Intercepta cliques nos links da sidebar e navegação interna da aplicação
document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    // Se for link para páginas HTML internas do app (Painel.html, Auditoria.html, Mapa.html, Painel-Manutentor.html)
    if (href.endsWith('.html') || href.includes('.html?')) {
        const cleanHref = href.split('?')[0].toLowerCase();
        if (cleanHref.includes('painel') || cleanHref.includes('auditoria') || cleanHref.includes('mapa') || cleanHref.includes('manutentor')) {
            e.preventDefault();
            window.navigateSPA(href, true);
        }
    }
});

// Suporte para botões voltar / avançar do navegador
if (!window._spaPopstateBound) {
    window._spaPopstateBound = true;
    window.addEventListener('popstate', () => {
        const page = window.location.pathname.split('/').pop() || 'Painel.html';
        window.navigateSPA(page + window.location.search, false);
    });
}

