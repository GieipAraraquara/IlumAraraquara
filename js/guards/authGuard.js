/**
 * Auth Guard & Session Manager Layer
 * Protege páginas administrativas e gerencia dados do usuário logado.
 */

window.AuthGuard = {
    /**
     * Retorna o nome normalizado da página atual (ex: 'painel', 'auditoria', 'mapa', 'login', 'abrir')
     */
    getCurrentPageName(targetUrl = null) {
        const path = targetUrl || window.location.pathname || '';
        const cleanPath = path.split('?')[0].split('#')[0];
        let rawFile = cleanPath.split('/').pop() || '';
        try {
            rawFile = decodeURIComponent(rawFile);
        } catch (e) {}
        
        let filename = rawFile.toLowerCase().trim();
        if (!filename) return 'index';
        return filename.replace(/\.html$/, '');
    },

    /**
     * Extrai e normaliza a categoria (role) do usuário a partir das várias fontes possíveis (profiles, user_metadata, app_metadata)
     * @param {Object} user Objeto session.user
     * @param {Object} profile Objeto retornado da tabela profiles
     * @returns {string} Categoria normalizada ('operador', 'manutentor', 'ouvidoria', 'admin', 'cidadao')
     */
    getUserRole(user, profile) {
        const email = (user?.email || profile?.email || '').toLowerCase().trim();

        // 1. Fonte da Verdade Principal: Dados vindos diretamente da tabela 'profiles' no banco de dados
        const profileRoleCandidates = [
            profile?.role,
            profile?.cargo,
            profile?.categoria,
            profile?.tipo,
            profile?.perfil,
            profile?.funcao
        ].filter(Boolean).map(s => String(s).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

        let finalRole = '';

        if (profileRoleCandidates.length > 0) {
            if (profileRoleCandidates.some(c => c.includes('admin') || c.includes('gestor') || c.includes('gerente') || c.includes('supervisor'))) {
                finalRole = 'admin';
            } else if (profileRoleCandidates.some(c => c.includes('ouvidor') || c.includes('ouvidoria'))) {
                finalRole = 'ouvidoria';
            } else if (profileRoleCandidates.some(c => c.includes('manutencao') || c.includes('manutentor'))) {
                finalRole = 'manutentor';
            } else if (profileRoleCandidates.some(c => c.includes('cidadao') || c.includes('citizen') || c.includes('govbr'))) {
                finalRole = 'cidadao';
            } else if (profileRoleCandidates.some(c => c.includes('campo') || c.includes('tecnico') || c.includes('executor') || c.includes('operador') || c.includes('operacional'))) {
                finalRole = 'operador';
            }
        }

        // 2. Fallback: Se a tabela 'profiles' não retornou um papel decisivo, verifica os metadados do usuário no Supabase Auth
        if (!finalRole) {
            const metadataCandidates = [
                user?.user_metadata?.role,
                user?.user_metadata?.cargo,
                user?.user_metadata?.categoria,
                user?.user_metadata?.tipo,
                user?.app_metadata?.role,
                user?.app_metadata?.claims?.role
            ].filter(Boolean).map(s => String(s).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

            if (metadataCandidates.some(c => c.includes('admin') || c.includes('gestor') || c.includes('gerente') || c.includes('supervisor'))) {
                finalRole = 'admin';
            } else if (metadataCandidates.some(c => c.includes('ouvidor') || c.includes('ouvidoria'))) {
                finalRole = 'ouvidoria';
            } else if (metadataCandidates.some(c => c.includes('manutencao') || c.includes('manutentor'))) {
                finalRole = 'manutentor';
            } else if (metadataCandidates.some(c => c.includes('cidadao') || c.includes('citizen') || c.includes('govbr'))) {
                finalRole = 'cidadao';
            } else if (metadataCandidates.some(c => c.includes('campo') || c.includes('tecnico') || c.includes('executor') || c.includes('operador') || c.includes('operacional'))) {
                finalRole = 'operador';
            }
        }

        // 3. Fallback final pelo e-mail se nada for conclusivo
        if (!finalRole && email) {
            if (email.includes('admin') || email.includes('gestor') || email.includes('gerente') || email.includes('supervisor')) {
                finalRole = 'admin';
            } else if (email.includes('ouvidoria') || email.includes('ouvidor')) {
                finalRole = 'ouvidoria';
            } else if (email.includes('manutentor') || email.includes('manutencao')) {
                finalRole = 'manutentor';
            } else if (email.includes('campo') || email.includes('tecnico') || email.includes('executor') || email.includes('operador') || email.includes('operacional')) {
                finalRole = 'operador';
            }
        }

        // Padrão de segurança: se nada for identificado, assume 'operador' (sem acesso a dashboards administrativos)
        if (!finalRole) {
            finalRole = 'operador';
        }

        console.log('🔍 [AuthGuard DEBUG] getUserRole resolvido:', {
            email: email,
            finalRole: finalRole,
            profileObj: profile,
            userMetadata: user?.user_metadata
        });

        return finalRole;
    },

    /**
     * Retorna a URL de redirecionamento apropriada com base na categoria / role do usuário
     * @param {Object} authData Objeto com dados do usuário e perfil ({ user, profile })
     * @returns {string} Nome do arquivo de destino ('Painel.html', 'Finalizar.html', 'Painel-Manutentor.html', 'Abrir.html')
     */
    getRedirectUrlForUser(authData) {
        if (!authData) return 'Login.html';
        
        const role = this.getUserRole(authData.user, authData.profile);
        const isMobile = (typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) || (typeof window !== 'undefined' && window.innerWidth < 768);

        let destination = 'Painel.html';

        if (role === 'ouvidoria' || authData.profile?.isGovBr || role === 'cidadao') {
            destination = 'Abrir.html';
        } else if (role === 'operador' || role === 'campo' || ['campo', 'executor', 'tecnico', 'operador', 'operacional'].includes(role)) {
            destination = 'Finalizar.html';
        } else if (role === 'manutentor') {
            destination = 'Painel-Manutentor.html';
        } else if (role === 'admin') {
            destination = isMobile ? 'Abrir.html' : 'Painel.html';
        }

        console.log(`🧭 [AuthGuard DEBUG] getRedirectUrlForUser: role='${role}', isMobile=${isMobile} -> destination='${destination}'`);
        return destination;
    },

    /**
     * Verifica a sessão ativa do usuário no Supabase ou via gov.br (Homologação).
     * Redireciona para Login.html caso não haja sessão válida ou redireciona
     * usuários para suas respectivas páginas conforme sua categoria (role).
     * @param {string} [targetUrl] URL alvo opcional para validação durante navegação SPA
     * @returns {Promise<{user: Object, profile: Object}>}
     */
    async requireAuth(targetUrl = null) {
        let authData = null;

        // 1. Verifica se há sessão ativa no Supabase Auth em primeiro lugar
        if (window.supabaseClient) {
            const { data: { session }, error } = await window.supabaseClient.auth.getSession();

            if (session && !error) {
                let profile = null;
                try {
                    // Busca por ID
                    let { data, error: profileErr } = await window.supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .maybeSingle();

                    console.log('🔍 [AuthGuard DEBUG] Busca profile por ID:', { id: session.user.id, data, profileErr });

                    // Fallback: se não encontrar por ID, busca por e-mail
                    if ((profileErr || !data) && session.user.email) {
                        const { data: dataEmail, error: emailErr } = await window.supabaseClient
                            .from('profiles')
                            .select('*')
                            .eq('email', session.user.email)
                            .maybeSingle();
                        console.log('🔍 [AuthGuard DEBUG] Busca profile por Email:', { email: session.user.email, dataEmail, emailErr });
                        if (dataEmail) data = dataEmail;
                    }

                    if (data) {
                        profile = data;
                    }
                } catch (e) {
                    console.warn('⚠️ [AuthGuard DEBUG] Não foi possível carregar o perfil:', e);
                }

                this.initAuthStateListener();

                const provider = session.user.app_metadata?.provider || 
                                 (session.user.identities && session.user.identities[0] && session.user.identities[0].provider) || 
                                 'email';
                
                const isGovBrUser = provider === 'govbr' || 
                                    Boolean(session.user.user_metadata?.iss && session.user.user_metadata.iss.includes('gov.br')) || 
                                    Boolean(session.user.user_metadata?.cpf);

                const computedRole = this.getUserRole(session.user, profile);

                authData = {
                    user: session.user,
                    profile: profile || {
                        nome: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Servidor',
                        role: isGovBrUser ? 'cidadao' : computedRole,
                        email: session.user.email,
                        provider: provider,
                        isGovBr: isGovBrUser
                    }
                };
            }
        }

        // 2. Fallback: Se não houver sessão Supabase, verifica se há sessão ativa via gov.br (sessionStorage ou localStorage)
        if (!authData) {
            const isGovBrAuth = sessionStorage.getItem('govbr_user_authenticated') === 'true' || 
                                localStorage.getItem('govbr_user_authenticated') === 'true';

            if (isGovBrAuth) {
                const govbrDataStr = sessionStorage.getItem('govbr_user_data') || localStorage.getItem('govbr_user_data') || '{}';
                let govbrData = {};
                try { govbrData = JSON.parse(govbrDataStr); } catch (e) {}

                authData = {
                    user: { id: 'govbr-user-id', email: govbrData.email || 'cidadao@gov.br' },
                    profile: {
                        nome: govbrData.nome || 'Cidadão (gov.br)',
                        role: 'cidadao',
                        email: govbrData.email || 'cidadao@gov.br',
                        provider: 'govbr',
                        isGovBr: true
                    }
                };
            }
        }

        this._cachedAuthData = authData;
        try { window.dispatchEvent(new CustomEvent('auth-ready', { detail: authData })); } catch(e) {}

        const currentPageName = this.getCurrentPageName(targetUrl);
        const adminPageNames = ['painel', 'auditoria', 'mapa', 'relatorios', 'configuracoes', 'admin'];
        const campoPageNames = ['finalizar', 'finalizaros', 'painel - manutentor', 'painel-manutentor'];
        const aberturaPageNames = ['abrir', 'popup abertura', 'popup_abertura', 'popupabertura'];
        const protectedPageNames = [...adminPageNames, ...campoPageNames, ...aberturaPageNames];

        const isProtectedPage = protectedPageNames.includes(currentPageName);

        // Sem sessão ativa tentando acessar página protegida
        if (!authData && isProtectedPage) {
            console.warn('⚠️ [AuthGuard DEBUG] Sessão inválida ou expirada. Redirecionando para Login.html...');
            window.location.replace('Login.html');
            return null;
        }

        if (!authData) return null;

        const userRole = this.getUserRole(authData.user, authData.profile);
        const isGovBrAuth = sessionStorage.getItem('govbr_user_authenticated') === 'true' || 
                            localStorage.getItem('govbr_user_authenticated') === 'true';
        const isCidadao = isGovBrAuth || userRole === 'cidadao' || authData.profile?.provider === 'govbr' || authData.profile?.isGovBr === true;
        const isOuvidoria = userRole === 'ouvidoria';
        const isOperador = userRole === 'operador' || userRole === 'campo' || ['campo', 'executor', 'tecnico', 'operador', 'operacional'].includes(userRole);
        const isManutentor = userRole === 'manutentor';

        console.log(`🛡️ [AuthGuard DEBUG] Página: '${currentPageName}' | Email: '${authData.user?.email}' | Role: '${userRole}'`);

        // Check se o usuário possui cadastro pendente de liberação manual pelo administrador
        const isPending = authData.profile ? 
            (authData.profile.role === 'pendente' || authData.profile.status === 'pendente' || authData.profile.ativo === false) :
            (userRole === 'pendente' || authData.user?.user_metadata?.status === 'pendente');

        if (isPending && isProtectedPage) {
            console.warn('⛔ [AuthGuard] Acesso negado: Conta pendente de liberação manual pelo administrador.');
            await this.logout();
            return null;
        }

        // 3. Validação para Cidadão (Gov.br) ou Ouvidoria: Acesso permitido EXCLUSIVAMENTE a Abrir.html
        if ((isCidadao || isOuvidoria) && isProtectedPage && !aberturaPageNames.includes(currentPageName)) {
            console.warn(`⛔ [AuthGuard] Acesso negado: Perfil ${isOuvidoria ? 'Ouvidoria' : 'Cidadão'} só possui acesso à Abertura de OS. Redirecionando para Abrir.html.`);
            try { if (document.documentElement) document.documentElement.style.display = 'none'; } catch(e) {}
            window.location.href = 'Abrir.html';
            return null;
        }

        // 4. Validação para Operador: Acesso permitido EXCLUSIVAMENTE a Finalizar.html
        const finalizarPageNames = ['finalizar', 'finalizaros'];
        if (isOperador && isProtectedPage && !finalizarPageNames.includes(currentPageName)) {
            console.warn('⛔ [AuthGuard] Acesso negado: Usuários da categoria Operador só possuem acesso a Finalizar OS. Redirecionando para Finalizar.html.');
            try { if (document.documentElement) document.documentElement.style.display = 'none'; } catch(e) {}
            window.location.href = 'Finalizar.html';
            return null;
        }

        // 5. Validação para Agentes de Manutenção (Manutentor): Acesso a Painel-Manutentor.html, Mapa.html, Finalizar.html e Relatorio.html
        const manutentorAllowedPages = ['painel-manutentor', 'painel - manutentor', 'mapa', 'finalizar', 'finalizaros', 'relatorio', 'relatorios'];
        if (isManutentor && isProtectedPage && !manutentorAllowedPages.includes(currentPageName)) {
            console.warn('⛔ [AuthGuard] Acesso negado: Agentes de Manutenção possuem acesso apenas a Painel Manutentor, Mapa e Finalizar OS. Redirecionando para Painel-Manutentor.html.');
            try { if (document.documentElement) document.documentElement.style.display = 'none'; } catch(e) {}
            window.location.href = 'Painel-Manutentor.html';
            return null;
        }

        // 6. Tratamento de Conectividade Offline por Página e Perfil
        if (!navigator.onLine) {
            if (isCidadao && aberturaPageNames.includes(currentPageName)) {
                console.warn('📡 [AuthGuard] Abertura de chamados para cidadãos (gov.br) exige internet.');
                this.renderOfflineOverlay(
                    '📡 Acesso Offline Indisponível para Cidadãos',
                    'O Portal do Cidadão (gov.br) necessita de conexão com a internet para verificar a autenticação e registrar novos chamados.',
                    [{ label: '🔄 Tentar Reconectar', action: () => window.location.reload() }]
                );
                return authData;
            }

            const offlineRestrictedPanels = ['painel', 'painel - manutentor', 'painel-manutentor', 'auditoria', 'mapa'];
            if (offlineRestrictedPanels.includes(currentPageName)) {
                console.warn(`📡 [AuthGuard] Painel '${currentPageName}' indisponível offline.`);
                const actionButtons = [
                    { label: '🔄 Tentar Reconectar', action: () => window.location.reload() },
                    { label: '➕ Ir para Abertura de OS (Modo Offline)', action: () => window.location.href = 'Abrir.html' }
                ];

                this.renderOfflineOverlay(
                    '📡 Painel Indisponível em Modo Offline',
                    'Os painéis de monitoramento e gestão requerem conexão ativa com a internet para consultar registros e gráficos em tempo real.',
                    actionButtons
                );
                return authData;
            }
        }

        return authData;
    },

    /**
     * Escuta eventos do Supabase Auth (Logout, Token Expirado, etc.)
     */
    initAuthStateListener() {
        if (this._listenerInitialized) return;
        this._listenerInitialized = true;

        if (window.supabaseClient) {
            window.supabaseClient.auth.onAuthStateChange((event, session) => {
                const isGovBrAuth = sessionStorage.getItem('govbr_user_authenticated') === 'true' || localStorage.getItem('govbr_user_authenticated') === 'true';
                if (event === 'SIGNED_OUT' && !isGovBrAuth) {
                    console.log('⚡ [AuthGuard] Usuário deslogado. Redirecionando para login...');
                    window.location.replace('Login.html');
                }
            });
        }
    },

    /**
     * Desloga o usuário e limpa as sessões (Supabase e gov.br)
     */
    async logout() {
        sessionStorage.removeItem('govbr_user_authenticated');
        sessionStorage.removeItem('govbr_user_data');
        sessionStorage.removeItem('govbr_oauth_state');
        sessionStorage.removeItem('govbr_oauth_nonce');
        
        localStorage.removeItem('govbr_user_authenticated');
        localStorage.removeItem('govbr_user_data');

        if (window.supabaseClient) {
            try {
                await window.supabaseClient.auth.signOut();
            } catch (e) {
                console.warn('Erro ao efetuar signOut no Supabase:', e);
            }
        }
        window.location.replace('Login.html');
    },

    /**
     * Renderiza overlay amigável quando o usuário acessa um painel online em modo offline
     */
    renderOfflineOverlay(title, subtitle, buttons = []) {
        const createOverlay = () => {
            let existing = document.getElementById('authGuardOfflineOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'authGuardOfflineOverlay';
            overlay.className = 'fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 text-white font-sans animate-fade-in';
            
            let buttonsHtml = buttons.map((b, idx) => `
                <button id="btnOfflineOverlay_${idx}" type="button" class="w-full sm:w-auto px-5 py-3 rounded-2xl font-bold text-xs bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer border border-blue-500/40">
                    ${b.label}
                </button>
            `).join('');

            overlay.innerHTML = `
                <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
                    <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto text-3xl">
                        📡
                    </div>
                    <div class="space-y-2">
                        <h3 class="text-lg font-bold text-slate-100">${title}</h3>
                        <p class="text-xs text-slate-400 leading-relaxed">${subtitle}</p>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
                        ${buttonsHtml}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            buttons.forEach((b, idx) => {
                const btnEl = document.getElementById(`btnOfflineOverlay_${idx}`);
                if (btnEl && typeof b.action === 'function') {
                    btnEl.addEventListener('click', b.action);
                }
            });

            window.addEventListener('online', () => {
                const el = document.getElementById('authGuardOfflineOverlay');
                if (el) el.remove();
            }, { once: true });
        };

        if (!document.body) {
            document.addEventListener('DOMContentLoaded', createOverlay);
        } else {
            createOverlay();
        }
    }
};

// Executa verificação síncrona / imediata ao carregar o script e no DOMContentLoaded
(function autoProtectRoute() {
    const runGuard = () => {
        const pageName = window.AuthGuard.getCurrentPageName();
        const protectedPages = ['painel', 'auditoria', 'mapa', 'relatorios', 'configuracoes', 'admin', 'finalizar', 'finalizaros', 'painel - manutentor', 'painel-manutentor', 'abrir', 'popup abertura', 'popup_abertura', 'popupabertura'];
        if (protectedPages.includes(pageName)) {
            window.AuthGuard.requireAuth();
        }
    };

    // Auto-execução imediata ao parsear o script
    runGuard();

    // Auto-execução no DOMContentLoaded para garantir a verificação após carregamento dos scripts complementares
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', runGuard);
    }
})();
