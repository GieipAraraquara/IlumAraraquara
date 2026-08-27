/**
 * PushNotificationService.js
 * Gerencia a inscrição de Web Push Notifications e vincula o token de notificação
 * ao perfil/categoria (role) do usuário no banco de dados Supabase.
 */

const VAPID_PUBLIC_KEY = 'BOfsKSI8otVOAeC-wDB09n9E6pZkX6O17N860mE_p-l-VAb4mbEDXWiHisL9ji9RgI-ltltMRhQGl4h21862HHw';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.PushNotificationService = {
    /**
     * Verifica se o navegador suporta Service Worker, Push API e Notificações
     */
    isSupported() {
        return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    },

    /**
     * Retorna o status atual de permissão ('granted', 'denied', 'default')
     */
    getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    },

    /**
     * Solicita permissão, assina o Web Push no navegador e envia o token pro Supabase
     * vinculado à categoria (role) do usuário logado (ex: 'admin')
     */
    async subscribeUser() {
        if (!this.isSupported()) {
            console.warn('⚠️ [PushNotification] Notificações Push não são suportadas neste navegador.');
            return { success: false, reason: 'unsupported' };
        }

        try {
            // 1. Solicita Permissão do Usuário
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('⚠️ [PushNotification] Permissão de notificação negada pelo usuário.');
                return { success: false, reason: 'permission_denied' };
            }

            // 2. Aguarda o Service Worker estar pronto
            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                throw new Error('Service Worker não encontrado ou inativo.');
            }

            // 3. Verifica se já existe uma assinatura ou cria uma nova
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedKey
                });
                console.log('✅ [PushNotification] Nova assinatura Push criada com sucesso!');
            } else {
                console.log('ℹ️ [PushNotification] Assinatura Push já existente reutilizada.');
            }

            // 4. Obtém os dados do usuário e categoria (role) logado
            let userEmail = 'admin@sistema.local';
            let userId = null;
            let role = 'admin';

            if (window.AuthGuard) {
                if (!window.AuthGuard._cachedAuthData && typeof window.AuthGuard.requireAuth === 'function') {
                    try { await window.AuthGuard.requireAuth(); } catch(e) {}
                }
                if (window.AuthGuard._cachedAuthData) {
                    const authData = window.AuthGuard._cachedAuthData;
                    userEmail = authData.user?.email || authData.profile?.email || userEmail;
                    userId = authData.user?.id || null;
                    role = window.AuthGuard.getUserRole(authData.user, authData.profile) || 'admin';
                }
            }
            
            if ((!role || role === 'operador') && window.supabaseClient) {
                try {
                    const { data: { session } } = await window.supabaseClient.auth.getSession();
                    if (session && session.user) {
                        userEmail = session.user.email || userEmail;
                        userId = session.user.id;
                        const { data: prof } = await window.supabaseClient.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
                        if (prof) {
                            const candidateRole = prof.role || prof.cargo || prof.categoria || prof.tipo;
                            if (candidateRole && candidateRole.toLowerCase().includes('admin')) {
                                role = 'admin';
                            }
                        }
                    }
                } catch(e) {}
            }

            // Extract p256dh e auth keys
            const rawKey = subscription.getKey ? subscription.getKey('p256dh') : null;
            const rawAuth = subscription.getKey ? subscription.getKey('auth') : null;

            const p256dh = rawKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(rawKey))) : '';
            const auth = rawAuth ? btoa(String.fromCharCode.apply(null, new Uint8Array(rawAuth))) : '';

            const subscriptionData = {
                endpoint: subscription.endpoint,
                p256dh: p256dh,
                auth: auth,
                user_id: userId,
                user_email: userEmail,
                role: role,
                updated_at: new Date().toISOString()
            };

            // 5. Grava/Atualiza no banco Supabase (tabela push_subscriptions)
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('push_subscriptions')
                    .upsert(subscriptionData, { onConflict: 'endpoint' });

                if (error) {
                    console.error('❌ [PushNotification] Erro ao salvar assinatura no Supabase:', error);
                } else {
                    console.log('🚀 [PushNotification] Assinatura salva/atualizada com sucesso no Supabase para a categoria:', role);
                }
            }

            // 6. Backup local no servidor Node local para acelerar os testes
            try {
                await fetch('/api/register-push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscriptionData)
                });
            } catch (e) {}

            // Armazena localmente para referência rápida
            localStorage.setItem('push_subscribed', 'true');
            localStorage.setItem('push_role', role);

            return { success: true, subscription: subscriptionData, role: role };

        } catch (err) {
            console.error('❌ [PushNotification] Falha ao inscrever notificações push:', err);
            return { success: false, error: err };
        }
    },

    /**
     * Resolve a role/categoria do usuário autenticado no sistema
     */
    async getUserRole() {
        let role = null;
        if (window.AuthGuard) {
            if (!window.AuthGuard._cachedAuthData && typeof window.AuthGuard.requireAuth === 'function') {
                try { await window.AuthGuard.requireAuth(); } catch(e) {}
            }
            if (window.AuthGuard._cachedAuthData) {
                const authData = window.AuthGuard._cachedAuthData;
                role = window.AuthGuard.getUserRole(authData.user, authData.profile);
            }
        }
        
        if (!role && window.supabaseClient) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.user) {
                    const { data: prof } = await window.supabaseClient.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
                    if (prof) {
                        role = prof.role || prof.cargo || prof.categoria || prof.tipo;
                    }
                }
            } catch(e) {}
        }

        const normalizedRole = (role || 'operador').toLowerCase();
        if (normalizedRole.includes('admin') || normalizedRole === 'gestor') {
            return 'admin';
        }
        return normalizedRole;
    },

    /**
     * Utilitário para adicionar o botão de notificação no painel do administrador
     */
    async initAdminNotificationButton(containerId = 'pushNotificationAdminBox') {
        const status = this.getPermissionStatus();
        console.log('🔔 [PushNotification] Status da permissão:', status);
        
        // Se a permissão já foi concedida, faz auto-subscribe silencioso em segundo plano para manter atualizada a role
        if (status === 'granted') {
            await this.subscribeUser();
        }
    }
};

// Auto-inicialização em qualquer página HTML do sistema (Apenas para Administradores)
if (typeof window !== 'undefined') {
    const autoCheck = async () => {
        if (!window.PushNotificationService) return;

        // Verifica se o usuário logado pertence à categoria admin
        const role = await window.PushNotificationService.getUserRole();
        if (role !== 'admin') {
            console.log('ℹ️ [PushNotification] Usuário com role "' + role + '". Auto-prompt de notificação reservado para admins.');
            return;
        }

        const status = window.PushNotificationService.getPermissionStatus();
        
        // Se a permissão for 'granted' ou 'default' (ainda não solicitada), solicita/renova automaticamente apenas para administradores
        if (status === 'granted' || status === 'default') {
            await window.PushNotificationService.subscribeUser();
        }
    };

    window.addEventListener('auth-ready', () => {
        autoCheck();
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(autoCheck, 1200);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(autoCheck, 1200);
        });
    }
}

