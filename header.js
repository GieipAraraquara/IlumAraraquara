class AppHeader extends HTMLElement {
    async connectedCallback() {
        const placeholder = this.getAttribute('placeholder') || 'Buscar OS por Protocolo, Plaqueta ou Endereço...';
        const searchId = this.getAttribute('search-id') || 'search-input';
        const oninputAttr = this.getAttribute('oninput') ? `oninput="${this.getAttribute('oninput')}"` : '';

        this.innerHTML = `
<header class="bg-surface/80 backdrop-blur-md dark:bg-surface-container/80 docked full-width top-0 h-16 border-b border-outline-variant dark:border-outline flex justify-between items-center px-container-padding ml-[260px] w-[calc(100%-260px)] z-10 fixed transition-all duration-300" id="top-header">
    <div class="flex-1 flex items-center">
        <div class="relative w-96 focus-within:ring-2 focus-within:ring-secondary rounded-lg transition-shadow duration-200">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input class="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition-colors duration-200" id="${searchId}" placeholder="${placeholder}" type="text" ${oninputAttr}/>
        </div>
    </div>
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
        alert('⚠️ Serviço de Notificações em carregamento. Por favor, tente novamente em instantes.');
        return;
    }

    const res = await window.PushNotificationService.subscribeUser();
    if (res.success) {
        alert(`🔔 Notificações Ativadas com Sucesso!\n\nEste dispositivo está registrado para receber notificações da categoria: ${(res.role || 'admin').toUpperCase()}`);
    } else if (res.reason === 'permission_denied') {
        alert('⚠️ A permissão para enviar notificações foi negada/bloqueada no seu navegador.\n\nPara receber notificações do sistema, clique no ícone de cadeado/configurações na barra de endereço do navegador e ative a permissão de "Notificações".');
    } else if (res.reason === 'unsupported') {
        alert('⚠️ Seu navegador ou dispositivo não possui suporte a Notificações Web Push.');
    } else {
        alert('⚠️ Não foi possível registrar este dispositivo para notificações.');
    }
};

