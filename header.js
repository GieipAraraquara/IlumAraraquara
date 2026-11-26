class AppHeader extends HTMLElement {
    async connectedCallback() {
        const placeholder = this.getAttribute('placeholder') || 'Buscar OS por Protocolo, Plaqueta ou Endereço...';
        const searchId = this.getAttribute('search-id') || 'search-input';
        const oninputAttr = this.getAttribute('oninput') ? `oninput="${this.getAttribute('oninput')}"` : '';
        const debounceMs = parseInt(this.getAttribute('debounce') || '350', 10);
        const searchContext = this.getAttribute('search-context') || 'painel';
        const isSmartSearch = this.getAttribute('smart-search') === 'true' && typeof window.SmartSearchBar === 'function' && typeof window.SmartSearchEngine === 'object';

        const searchBarHtml = isSmartSearch ? `
    <div class="flex-1 flex items-center min-w-0 max-w-2xl mr-4">
        <div class="relative w-full flex items-center gap-1.5" id="smart-search-wrapper">
            <div class="flex-1 min-w-0 flex items-center flex-wrap gap-1.5 px-2.5 py-1.5 bg-surface-container-lowest border border-outline-variant rounded-xl focus-within:ring-2 focus-within:ring-secondary focus-within:border-secondary transition-all duration-200 shadow-xs" id="smart-search-box">
                <button type="button" id="smart-mode-btn" class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer shrink-0 select-none bg-slate-100 text-slate-700 border-slate-200" title="Modo de busca inteligente (clique para trocar)">
                    <span class="material-symbols-outlined text-[14px]" id="smart-mode-icon">auto_awesome</span>
                    <span id="smart-mode-label">Auto</span>
                    <span class="material-symbols-outlined text-[13px] opacity-60">expand_more</span>
                </button>
                <div id="smart-chips-container" class="hidden flex items-center flex-wrap gap-1"></div>
                <input class="flex-1 min-w-[140px] py-0.5 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus:border-0 font-body-md text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/70" id="${searchId}" placeholder="${placeholder}" type="text" autocomplete="off" ${oninputAttr}/>
                <span id="smart-kbd-hint" class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-on-surface-variant/70 bg-surface-container-low border border-outline-variant/60 rounded shrink-0 select-none">Ctrl+K</span>
                <button type="button" id="smart-clear-btn" class="hidden p-0.5 rounded-full text-on-surface-variant hover:text-error hover:bg-error-container/50 transition-colors cursor-pointer shrink-0 flex items-center justify-center" title="Limpar busca">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>
            <button type="button" id="smart-help-btn" class="w-9 h-9 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-secondary hover:border-secondary/50 hover:bg-secondary/5 transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95 shadow-xs" title="Como usar a Busca Inteligente (atalhos e exemplos)">
                <span class="material-symbols-outlined text-[19px]">help</span>
            </button>

            <!-- Popover de Sugestões e Troca de Modo -->
            <div id="smart-search-popover" class="hidden absolute left-0 right-10 top-full mt-2 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-50 p-3 animate-fade-in-up"></div>

            <!-- Popover de Ajuda (?) -->
            <div id="smart-help-popover" class="hidden absolute left-0 right-0 top-full mt-2 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-50 p-4 animate-fade-in-up"></div>
        </div>
    </div>` : `
    <div class="flex-1 flex items-center">
        <div class="relative w-96 focus-within:ring-2 focus-within:ring-secondary rounded-lg transition-shadow duration-200">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input class="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition-colors duration-200" id="${searchId}" placeholder="${placeholder}" type="text" ${oninputAttr}/>
        </div>
    </div>`;

        this.innerHTML = `
<header class="bg-surface dark:bg-surface-container docked full-width top-0 h-16 border-b border-outline-variant dark:border-outline flex justify-between items-center px-container-padding ml-[260px] w-[calc(100%-260px)] z-10 fixed transition-all duration-300" id="top-header">
    ${searchBarHtml}
    <div class="flex items-center gap-4">
        <button onclick="window.solicitarNotificacoesPush(event)" class="text-on-surface-variant hover:bg-surface-container-highest transition-all duration-200 p-2 rounded-full flex items-center justify-center active:scale-90 hover:text-secondary cursor-pointer relative" title="Ativar/Gerenciar Notificações Push">
            <span class="material-symbols-outlined">notifications</span>
            <span id="push-status-dot" class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white hidden" title="Notificações Pendentes"></span>
        </button>
        <button class="text-on-surface-variant hover:bg-surface-container-highest transition-all duration-200 p-2 rounded-full flex items-center justify-center active:scale-90 hover:text-secondary cursor-pointer" title="Ajuda">
            <span class="material-symbols-outlined">help</span>
        </button>
        
        <!-- Menu do Usuário com Dropdown e Logout -->
        <div class="relative inline-block text-left" id="user-menu-container">
            <button onclick="window.toggleUserDropdown(event)" class="text-on-surface-variant hover:bg-surface-container-highest transition-all duration-200 p-2 rounded-full flex items-center justify-center active:scale-90 hover:text-secondary cursor-pointer" id="user-profile-button" title="Perfil do Usuário">
                <span class="material-symbols-outlined text-[26px]">account_circle</span>
            </button>

            <!-- Dropdown Menu -->
            <div class="absolute right-0 mt-2 w-64 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-50 p-2 animate-fade-in-up hidden" id="user-profile-dropdown">
                <div class="px-3 py-2 border-b border-outline-variant mb-1">
                    <p class="font-semibold text-xs text-on-surface truncate" id="dropdown-user-name">Carregando...</p>
                    <p class="text-[11px] text-on-surface-variant truncate" id="dropdown-user-email">...</p>
                    <span class="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/10 text-secondary uppercase tracking-wider" id="dropdown-user-role">ADMIN</span>
                </div>
                
                <button onclick="if(window.AuthGuard)window.AuthGuard.logout();else window.location.href='Login.html';" class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-error hover:bg-error-container/60 rounded-lg transition-colors cursor-pointer text-left">
                    <span class="material-symbols-outlined text-[18px]">logout</span>
                    <span>Sair do Sistema</span>
                </button>
            </div>
        </div>
    </div>
</header>`;

        if (isSmartSearch) {
            window.smartSearchBar = new window.SmartSearchBar({ inputId: searchId, context: searchContext });
        } else {
            const inputEl = this.querySelector(`#${searchId}`);
            if (inputEl && debounceMs > 0) {
                let debounceTimer = null;
                inputEl.addEventListener('input', (e) => {
                    if (e._isDebounced) return;
                    e.stopImmediatePropagation();
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        const debouncedEvent = new Event('input', { bubbles: true });
                        debouncedEvent._isDebounced = true;
                        inputEl.dispatchEvent(debouncedEvent);
                    }, debounceMs);
                }, true);
            }
        }

        await this.initUserProfile();
    }

    async initUserProfile() {
        if (window.AuthGuard && typeof window.AuthGuard.requireAuth === 'function') {
            try {
                const authData = await window.AuthGuard.requireAuth();
                if (authData && (authData.profile || authData.user)) {
                    const profile = authData.profile || {};
                    const user = authData.user || {};

                    const nameEl = this.querySelector('#dropdown-user-name');
                    const emailEl = this.querySelector('#dropdown-user-email');
                    const roleEl = this.querySelector('#dropdown-user-role');

                    if (nameEl) nameEl.textContent = profile.nome || user.email?.split('@')[0] || 'Administrador';
                    if (emailEl) emailEl.textContent = profile.email || user.email || '';
                    if (roleEl) roleEl.textContent = (profile.role || 'admin').toUpperCase();
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar perfil do usuário no header:', e);
            }
        }
    }
}

// Global helper to toggle user profile dropdown menu
window.toggleUserDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('user-profile-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

// Close user dropdown when clicking anywhere outside
if (!window._userDropdownClickListenerBound) {
    window._userDropdownClickListenerBound = true;
    document.addEventListener('click', (e) => {
        const container = document.getElementById('user-menu-container');
        const dropdown = document.getElementById('user-profile-dropdown');
        if (dropdown && container && !container.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

customElements.define('app-header', AppHeader);

// Global helper para solicitar/gerenciar notificações Web Push
window.solicitarNotificacoesPush = async function(event) {
    if (event) event.stopPropagation();
    if (!window.PushNotificationService) {
        return;
    }

    const res = await window.PushNotificationService.subscribeUser();
    if (res.success) {
        alert(`🔔 Notificações Ativadas com Sucesso!\n\nEste dispositivo está registrado para receber notificações da categoria: ${(res.role || 'admin').toUpperCase()}`);
    }
    // Caso o usuário recuse ou cancele, o processo é encerrado silenciosamente sem exibir alertas incômodos.
};

