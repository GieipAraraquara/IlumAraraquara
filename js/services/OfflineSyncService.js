/**
 * OfflineSyncService.js
 * Gerenciador de Armazenamento Offline (IndexedDB / LocalStorage) e Motor de Sincronização Automática
 */
class OfflineSyncService {
  constructor() {
    this.dbName = 'SistemaOS_PWA_DB';
    this.dbVersion = 1;
    this.db = null;
    this.isSyncing = false;
    this.onQueueChangeCallbacks = [];

    console.log('🚀 [OfflineSyncService] Inicializando serviço de sincronização offline...');

    this.initDB();
    this.initAutoSync();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.notifyQueueChange());
    } else {
      setTimeout(() => this.notifyQueueChange(), 100);
    }
  }

  // Inicializa o banco de dados IndexedDB
  async initDB() {
    if (this.db) return this.db;

    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('📦 [IndexedDB] Criando ou atualizando schema do banco offline...');
        
        if (!db.objectStoreNames.contains('pending_queue')) {
          const queueStore = db.createObjectStore('pending_queue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('protocolo', 'protocolo', { unique: false });
          queueStore.createIndex('tipo', 'tipo', { unique: false });
        }

        if (!db.objectStoreNames.contains('os_cache')) {
          db.createObjectStore('os_cache', { keyPath: 'protocolo' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('📦 [IndexedDB] Banco de dados offline pronto e conectado!');
        this.notifyQueueChange();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.warn('⚠️ [IndexedDB] Erro ao abrir IndexedDB, usando fallback LocalStorage:', event.target.error);
        this.notifyQueueChange();
        resolve(null);
      };
    });
  }

  // -------------------------------------------------------------------------
  // CACHE DE ORDENS DE SERVIÇO (PARA CONSULTA OFFLINE)
  // -------------------------------------------------------------------------
  async cacheOSRecord(protocolo, data) {
    if (!protocolo || !data) return;
    const cleanProt = String(protocolo).trim().toUpperCase();

    try {
      if (this.db) {
        const tx = this.db.transaction('os_cache', 'readwrite');
        const store = tx.objectStore('os_cache');
        store.put({ protocolo: cleanProt, data: data, cachedAt: new Date().toISOString() });
      }
    } catch(e) {
      console.warn('⚠️ Fallback localStorage para cache da OS:', e);
    }

    try {
      localStorage.setItem('os_cache_' + cleanProt, JSON.stringify(data));
    } catch(e) {}
  }

  async getCachedOSRecord(protocolo) {
    if (!protocolo) return null;
    const cleanProt = String(protocolo).trim().toUpperCase();

    if (this.db) {
      try {
        const result = await new Promise((resolve) => {
          const tx = this.db.transaction('os_cache', 'readonly');
          const store = tx.objectStore('os_cache');
          const req = store.get(cleanProt);
          req.onsuccess = () => resolve(req.result ? req.result.data : null);
          req.onerror = () => resolve(null);
        });
        if (result) return result;
      } catch(e) {}
    }

    try {
      const stored = localStorage.getItem('os_cache_' + cleanProt);
      if (stored) return JSON.parse(stored);
    } catch(e) {}

    return null;
  }

  // -------------------------------------------------------------------------
  // FILA DE ENVIOS PENDENTES (SALVAMENTO OFFLINE)
  // -------------------------------------------------------------------------
  async savePendingSubmission(tipo, protocolo, payload) {
    const item = {
      tipo: tipo, // 'viaria' | 'praca'
      protocolo: String(protocolo).trim().toUpperCase(),
      payload: payload,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    console.group(`📱 [OfflineSync] Nova OS salva offline: ${item.protocolo}`);
    console.log('Tipo:', item.tipo);
    console.log('Protocolo:', item.protocolo);
    console.log('Payload:', item.payload);
    console.groupEnd();

    let savedInDB = false;
    if (this.db) {
      try {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction('pending_queue', 'readwrite');
          const store = tx.objectStore('pending_queue');
          const req = store.add(item);
          req.onsuccess = () => resolve();
          req.onerror = (e) => reject(e.target.error);
        });
        savedInDB = true;
        console.log('✅ [OfflineSync] Item adicionado com sucesso à tabela pending_queue do IndexedDB.');
      } catch(e) {
        console.warn('⚠️ Erro ao salvar no IndexedDB queue, recorrendo ao LocalStorage:', e);
      }
    }

    if (!savedInDB) {
      try {
        let queue = JSON.parse(localStorage.getItem('os_pending_queue') || '[]');
        item.id = Date.now();
        queue.push(item);
        localStorage.setItem('os_pending_queue', JSON.stringify(queue));
        console.log('✅ [OfflineSync] Item adicionado com sucesso ao LocalStorage.');
      } catch(e) {
        console.error('❌ Falha crítica ao salvar pendência no LocalStorage:', e);
      }
    }

    this.notifyQueueChange();
    return item;
  }

  async getPendingSubmissions() {
    let items = [];

    if (this.db) {
      try {
        items = await new Promise((resolve) => {
          const tx = this.db.transaction('pending_queue', 'readonly');
          const store = tx.objectStore('pending_queue');
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      } catch(e) {}
    }

    if (!items || items.length === 0) {
      try {
        items = JSON.parse(localStorage.getItem('os_pending_queue') || '[]');
      } catch(e) { items = []; }
    }

    return items;
  }

  async removePendingSubmission(id) {
    console.log(`🗑️ [OfflineSync] Removendo item sincronizado ID ${id} da fila offline...`);
    if (this.db && id) {
      try {
        const tx = this.db.transaction('pending_queue', 'readwrite');
        const store = tx.objectStore('pending_queue');
        store.delete(id);
      } catch(e) {}
    }

    try {
      let queue = JSON.parse(localStorage.getItem('os_pending_queue') || '[]');
      queue = queue.filter(item => item.id !== id);
      localStorage.setItem('os_pending_queue', JSON.stringify(queue));
    } catch(e) {}

    this.notifyQueueChange();
  }

  // -------------------------------------------------------------------------
  // MOTOR DE SINCRONIZAÇÃO AUTOMÁTICA
  // -------------------------------------------------------------------------
  initAutoSync() {
    window.addEventListener('online', () => {
      console.log('🌐 [OfflineSync EVENT] Conexão com a internet RESTAURADA! Disparando syncQueue()...');
      this.notifyQueueChange();
      this.syncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📡 [OfflineSync EVENT] Dispositivo desconectado (OFFLINE).');
      this.notifyQueueChange();
    });

    // Verificação periódica a cada 15 segundos
    setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        console.log('⏱️ [OfflineSync Periodic Check] Conexão ativa, verificando se há itens pendentes...');
        this.syncQueue();
      } else if (!navigator.onLine) {
        this.notifyQueueChange();
      }
    }, 15000);
  }

  async syncQueue() {
    console.log(`🔍 [OfflineSync] Running syncQueue()... Navigator.onLine=${navigator.onLine}, isSyncing=${this.isSyncing}`);

    if (!navigator.onLine) {
      console.log('📡 [OfflineSync] Sincronização ignorada: dispositivo está offline.');
      return;
    }
    if (this.isSyncing) {
      console.log('⏳ [OfflineSync] Sincronização ignorada: já existe uma sincronização em andamento.');
      return;
    }

    const items = await this.getPendingSubmissions();
    console.log(`📋 [OfflineSync] Total de itens pendentes na fila: ${items ? items.length : 0}`);

    if (!items || items.length === 0) {
      this.notifyQueueChange();
      return;
    }

    this.isSyncing = true;
    console.group(`🔄 [AutoSync ENGINE] Iniciando sincronização de ${items.length} item(ns) pendente(s)`);
    this.updateSyncUIState(true, `Sincronizando ${items.length} OS(s) com o servidor...`);

    let syncSucessos = 0;

    for (const item of items) {
      console.group(`📌 Processando Item ID: ${item.id} | Protocolo: ${item.protocolo} | Tipo: ${item.tipo}`);
      try {
        const result = await this.processSingleQueueItem(item);
        if (result.success) {
          await this.removePendingSubmission(item.id);
          syncSucessos++;
          console.log(`✅ [AutoSync SUCCESS] Protocolo ${item.protocolo} enviado e removido da fila com sucesso!`);
        } else {
          console.error(`❌ [AutoSync ERROR] Falha ao enviar protocolo ${item.protocolo}:`, result.error);
        }
      } catch(err) {
        console.error(`💥 [AutoSync EXCEPTION] Erro inesperado ao sincronizar protocolo ${item.protocolo}:`, err);
      }
      console.groupEnd();
    }

    console.groupEnd();
    this.isSyncing = false;
    this.notifyQueueChange();

    if (syncSucessos > 0) {
      this.exibirNotificacaoToast(`⚡ Sincronização Concluída: ${syncSucessos} Ordem(ns) de Serviço enviada(s) com sucesso ao servidor!`);
    }

    this.updateSyncUIState(false);
  }

  async processSingleQueueItem(item) {
    // Garante que pega a instância correta do Supabase Client
    const supabaseClient = window.supabaseClient || (window.obterSupabaseClient ? window.obterSupabaseClient() : null);
    const cloudinary = window.cloudinaryService || window.CloudinaryService;

    console.log('⚡ [ProcessItem] Objeto SupabaseClient disponível?', !!supabaseClient);
    console.log('☁️ [ProcessItem] Objeto CloudinaryService disponível?', !!cloudinary);

    if (!supabaseClient) {
      console.error('❌ [ProcessItem Error] Supabase client não encontrado na window.supabaseClient ou obterSupabaseClient()');
      return { success: false, error: 'Supabase client indisponível' };
    }

    const payload = JSON.parse(JSON.stringify(item.payload)); // Cópia segura

    if (item.tipo === 'viaria') {
      console.log(`💡 [ProcessItem Viária] Preparando fotos e dados para o protocolo ${item.protocolo}...`);

      if (Array.isArray(payload.pontos)) {
        for (let i = 0; i < payload.pontos.length; i++) {
          const pt = payload.pontos[i];
          if (pt.evidencias) {
            for (const estagio in pt.evidencias) {
              const fotoRaw = pt.evidencias[estagio];
              if (fotoRaw && (fotoRaw.startsWith('data:image/') || fotoRaw.startsWith('blob:'))) {
                if (cloudinary) {
                  console.log(`☁️ [ProcessItem Cloudinary] Subindo imagem Base64 do Ponto #${i+1} (${estagio}) para protocolo ${item.protocolo}...`);
                  try {
                    const nomeFoto = cloudinary.gerarNomePadraoFoto(item.protocolo, pt.plaqueta || `PONTO_${i+1}`, estagio);
                    const cdnUrl = await cloudinary.uploadImage(fotoRaw, 'viaria_fotos', nomeFoto);
                    pt.evidencias[estagio] = cdnUrl;
                    console.log(`✅ [ProcessItem Cloudinary] URL gerada: ${cdnUrl}`);
                  } catch(e) {
                    console.warn(`⚠️ Erro ao subir foto do Ponto ${i+1} (${estagio}) para o Cloudinary:`, e);
                  }
                }
              }
            }
          }
        }
      }

      console.log(`🚀 [ProcessItem Supabase] Enviando update para ordens_servico...`, payload);
      let updateRes = await supabaseClient.from('ordens_servico').update(payload).eq('protocolo', item.protocolo);
      console.log('📊 [ProcessItem Supabase Response]:', updateRes);

      if (updateRes.error) {
        console.warn('⚠️ Falha no update em ordens_servico, tentando tabela fallback chamados...', updateRes.error);
        let fallbackRes = await supabaseClient.from('chamados').update(payload).eq('protocolo', item.protocolo);
        console.log('📊 [ProcessItem Chamados Fallback Response]:', fallbackRes);
        if (fallbackRes.error) return { success: false, error: fallbackRes.error.message };
      }

      return { success: true };

    } else if (item.tipo === 'praca') {
      console.log(`🌳 [ProcessItem Praça] Enviando atualização de Praça para protocolo ${item.protocolo}...`);

      if (payload.foto_entrada && (payload.foto_entrada.startsWith('data:image/') || payload.foto_entrada.startsWith('blob:'))) {
        if (cloudinary) {
          try {
            console.log(`☁️ [ProcessItem Cloudinary] Subindo Foto de Entrada da Praça ${item.protocolo}...`);
            const nomeFotoPraca = cloudinary.gerarNomePadraoFoto(item.protocolo, 'PRACA', 'FOTO_ENTRADA');
            const cdnUrl = await cloudinary.uploadImage(payload.foto_entrada, 'praca_fotos', nomeFotoPraca);
            payload.foto_entrada = cdnUrl;
            if (payload.evidencias) payload.evidencias['Foto de Entrada'] = cdnUrl;
            console.log(`✅ [ProcessItem Cloudinary Praça] URL: ${cdnUrl}`);
          } catch(e) {
            console.warn('⚠️ Erro Cloudinary Praça:', e);
          }
        }
      }

      let updateRes = await supabaseClient.from('ordens_servico_pracas').update(payload).eq('protocolo', item.protocolo);
      console.log('📊 [ProcessItem Supabase Praça Response]:', updateRes);

      if (updateRes.error) return { success: false, error: updateRes.error.message };

      return { success: true };

    } else if (item.tipo === 'abertura_viaria') {
      console.log(`➕ [ProcessItem Abertura Viária] Cadastrando novo chamado ${item.protocolo} no Supabase...`);
      let insertRes = await supabaseClient.from('ordens_servico').insert([payload]);
      console.log('📊 [ProcessItem Abertura Viária Response]:', insertRes);
      if (insertRes.error) {
        console.warn('⚠️ Falha ao inserir em ordens_servico, tentando tabela chamados...', insertRes.error);
        let fallbackRes = await supabaseClient.from('chamados').insert([payload]);
        if (fallbackRes.error) return { success: false, error: fallbackRes.error.message };
      }
      return { success: true };

    } else if (item.tipo === 'abertura_praca') {
      console.log(`➕ [ProcessItem Abertura Praça] Cadastrando novo chamado de praça ${item.protocolo} no Supabase...`);
      let insertRes = await supabaseClient.from('ordens_servico_pracas').insert([payload]);
      console.log('📊 [ProcessItem Abertura Praça Response]:', insertRes);
      if (insertRes.error) return { success: false, error: insertRes.error.message };
      return { success: true };
    }

    return { success: false, error: 'Tipo de OS desconhecido' };
  }

  // -------------------------------------------------------------------------
  // UI & NOTIFICAÇÕES
  // -------------------------------------------------------------------------
  onQueueChange(callback) {
    if (typeof callback === 'function') {
      this.onQueueChangeCallbacks.push(callback);
    }
  }

  async notifyQueueChange() {
    const items = await this.getPendingSubmissions();
    const count = items.length;
    const isOnline = navigator.onLine;

    console.log(`📢 [OfflineSync notifyQueueChange] isOnline=${isOnline} | PendingCount=${count}`);

    this.onQueueChangeCallbacks.forEach(cb => {
      try { cb({ count, items, isOnline }); } catch(e) {}
    });

    this.renderStatusBadge(isOnline, count);
  }

  renderStatusBadge(isOnline, count) {
    if (!document.body) return;

    let badgeContainer = document.getElementById('offlineSyncBadgeContainer');
    if (!badgeContainer) {
      badgeContainer = document.createElement('div');
      badgeContainer.id = 'offlineSyncBadgeContainer';
      badgeContainer.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 transition-all duration-300';
      document.body.appendChild(badgeContainer);
    }

    let html = '';
    if (!isOnline) {
      html = `<div class="bg-amber-600 text-white font-bold text-xs px-4 py-2.5 rounded-full shadow-2xl border border-amber-400 flex items-center gap-2.5 animate-pulse">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-200"></span>
                <span>📡 Modo Offline ${count > 0 ? `(${count} OS salva/s)` : ''}</span>
              </div>`;
    } else if (count > 0) {
      html = `<button type="button" onclick="window.offlineSyncService.syncQueue()" class="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-full shadow-2xl border border-blue-400 flex items-center gap-2.5 transition-all cursor-pointer">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping"></span>
                <span>🔄 Sincronizar ${count} OS pendente/s</span>
              </button>`;
    } else {
      const isFinalizarStandalone = window.location.pathname.toLowerCase().includes('finalizar.html') && (window.self === window.top);
      if (isFinalizarStandalone) {
        html = `<div class="bg-emerald-700/90 backdrop-blur-md text-white font-medium text-xs px-3.5 py-1.5 rounded-full shadow-md flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-emerald-300"></span>
                  <span>Online & Sincronizado</span>
                </div>`;
      } else {
        html = '';
      }
    }

    badgeContainer.innerHTML = html;
  }

  updateSyncUIState(isSyncing, message) {
    if (!document.body) return;

    let loaderEl = document.getElementById('globalSyncToast');
    if (isSyncing) {
      if (!loaderEl) {
        loaderEl = document.createElement('div');
        loaderEl.id = 'globalSyncToast';
        loaderEl.className = 'fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce';
        document.body.appendChild(loaderEl);
      }
      loaderEl.innerHTML = `<span class="material-symbols-outlined animate-spin text-blue-400">sync</span>
                            <span class="text-xs font-bold">${message || 'Sincronizando...'}</span>`;
    } else if (loaderEl) {
      loaderEl.remove();
    }
  }

  exibirNotificacaoToast(mensagem) {
    if (!document.body) return;

    const toast = document.createElement('div');
    toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-2 animate-fade-in';
    toast.innerHTML = `<span class="text-base">✅</span> <span>${mensagem}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
  }
}

// Instância global do serviço
window.offlineSyncService = new OfflineSyncService();
