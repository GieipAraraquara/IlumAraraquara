/**
 * Modal e fluxo de correção de Plaqueta / Coordenada de OS concluída (somente Admin).
 * Subdivide por Fechamento (fechamentos_os) e seus respectivos Pontos.
 * Atualiza `fechamentos_os` (ou `ordens_servico` como fallback), limpa caches,
 * remove descarte anterior (opcional) e notifica o `Controle-Plaquetas.html`.
 */
(function () {
    if (window.abrirModalCorrigirPlaquetaOS) return;

    function getSupabaseClient() {
        if (typeof window.obterSupabaseClient === 'function') return window.obterSupabaseClient();
        if (window.supabaseClient) return window.supabaseClient;
        if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
        return null;
    }

    function parsePontos(val) {
        if (Array.isArray(val)) return JSON.parse(JSON.stringify(val));
        if (typeof val === 'string' && val.trim()) {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) {}
        }
        return null;
    }

    function escapeAttr(val) {
        return String(val || '').replace(/"/g, '&quot;');
    }

    function ensureModalElement() {
        let modal = document.getElementById('modal-corrigir-plaqueta-os');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modal-corrigir-plaqueta-os';
        modal.className = 'fixed inset-0 z-[99999] hidden items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div class="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <span class="material-symbols-outlined text-amber-600 text-[22px]">edit_location_alt</span>
                        <div>
                            <h3 class="text-sm font-bold text-slate-900">Corrigir Plaquetas e Coordenadas</h3>
                            <p id="corr-plaq-subtitulo" class="text-xs text-slate-600 font-medium">OS #---</p>
                        </div>
                    </div>
                    <button type="button" id="corr-plaq-btn-fechar" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-100/70 transition-colors cursor-pointer">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form id="corr-plaq-form" class="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
                    <div id="corr-plaq-loading" class="py-8 text-center text-slate-500 text-xs font-medium hidden">
                        <span class="material-symbols-outlined animate-spin text-amber-600 text-[24px] mb-1">sync</span>
                        <p>Carregando fechamentos e pontos da OS...</p>
                    </div>

                    <div id="corr-plaq-fields" class="space-y-4">
                        <div id="corr-fechamentos-list" class="space-y-3"></div>

                        <label class="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                            <input type="checkbox" id="corr-reabrir-descarte" checked class="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500">
                            <span class="text-xs text-slate-700 leading-snug">
                                <strong>Atualizar pendência no Controle de Plaquetas:</strong> se esta OS já foi descartada antes, remove o descarte para que o novo comparativo apareça na fila.
                            </span>
                        </label>
                    </div>

                    <div id="corr-plaq-erro" class="hidden p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"></div>

                    <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" id="corr-plaq-btn-cancelar" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">Cancelar</button>
                        <button type="submit" id="corr-plaq-btn-salvar" class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer">
                            <span class="material-symbols-outlined text-[16px]">save</span>
                            <span>Salvar Correção</span>
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        const fechar = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };
        modal.querySelector('#corr-plaq-btn-fechar').addEventListener('click', fechar);
        modal.querySelector('#corr-plaq-btn-cancelar').addEventListener('click', fechar);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) fechar();
        });

        return modal;
    }

    function notificarControlePlaquetas(protocolo) {
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('sistema_os_plaquetas');
                bc.postMessage({ action: 'PLAQUETAS_FILA_REFRESH', protocolo });
                bc.close();
            }
        } catch (e) {}

        try {
            localStorage.setItem('plaquetas_fila_refresh_ts', String(Date.now()));
        } catch (e) {}

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'PLAQUETAS_FILA_REFRESH', protocolo }, '*');
            }
        } catch (e) {}
    }

    window.abrirModalCorrigirPlaquetaOS = async function (protocoloOrItem, onSuccessCallback) {
        const client = getSupabaseClient();
        if (!client) {
            alert('Cliente Supabase não inicializado.');
            return;
        }

        const rawId = (typeof protocoloOrItem === 'object' && protocoloOrItem !== null)
            ? (protocoloOrItem.protocolo || protocoloOrItem.id)
            : protocoloOrItem;
        const protClean = String(rawId || '').replace(/^#/, '').trim();
        if (!protClean) return;

        const modal = ensureModalElement();
        const subtitulo = modal.querySelector('#corr-plaq-subtitulo');
        const loadingEl = modal.querySelector('#corr-plaq-loading');
        const fieldsEl = modal.querySelector('#corr-plaq-fields');
        const erroEl = modal.querySelector('#corr-plaq-erro');
        const fechListEl = modal.querySelector('#corr-fechamentos-list');
        const checkReabrir = modal.querySelector('#corr-reabrir-descarte');
        const btnSalvar = modal.querySelector('#corr-plaq-btn-salvar');
        const form = modal.querySelector('#corr-plaq-form');

        subtitulo.textContent = `OS #${protClean}`;
        erroEl.classList.add('hidden');
        erroEl.textContent = '';
        loadingEl.classList.remove('hidden');
        fieldsEl.classList.add('hidden');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        let osData = null;
        let fechamentos = [];
        try {
            const [resView, resFech] = await Promise.all([
                client
                    .from('vw_todas_ordens_servico')
                    .select('id, protocolo, plaqueta_final, coordenada_reparo, pontos_final')
                    .eq('protocolo', protClean)
                    .maybeSingle(),
                client
                    .from('fechamentos_os')
                    .select('*')
                    .eq('protocolo', protClean)
                    .order('numero_fechamento', { ascending: true })
            ]);

            if (resView.error) throw resView.error;
            osData = resView.data;
            if (!resFech.error && Array.isArray(resFech.data)) {
                fechamentos = resFech.data.filter(f => !f.desconsiderado);
            }
        } catch (err) {
            loadingEl.classList.add('hidden');
            erroEl.textContent = 'Erro ao buscar dados da OS: ' + (err.message || err);
            erroEl.classList.remove('hidden');
            return;
        }

        if (!osData && fechamentos.length === 0) {
            loadingEl.classList.add('hidden');
            erroEl.textContent = `OS #${protClean} não encontrada.`;
            erroEl.classList.remove('hidden');
            return;
        }

        loadingEl.classList.add('hidden');
        fieldsEl.classList.remove('hidden');
        fechListEl.innerHTML = '';

        // Monta estrutura editável: cada fechamento com seus pontos (ou fallback da view)
        const osPontos = parsePontos(osData?.pontos_final);
        const editModels = [];
        if (fechamentos.length > 0) {
            fechamentos.forEach((fech, fIdx) => {
                let pts = parsePontos(fech.fotos || fech.pontos_final || fech.pontos);
                if ((!pts || pts.length === 0) && osPontos && osPontos.length > 0) {
                    const numF = fech.numero_fechamento ?? (fIdx + 1);
                    const filtrados = osPontos.filter(p => p.fechamento == null || String(p.fechamento) === String(numF));
                    if (filtrados.length > 0) pts = filtrados;
                }
                const pontosEdit = (pts && pts.length > 0)
                    ? pts
                    : [{
                        plaqueta: fech.plaqueta_final || fech.plaqueta || osData?.plaqueta_final || '',
                        coordenada: fech.coordenada_reparo || fech.coordenada || osData?.coordenada_reparo || ''
                    }];
                editModels.push({
                    type: 'fechamento',
                    fechData: fech,
                    label: `Fechamento #${fech.numero_fechamento || (fIdx + 1)}`,
                    operador: fech.operador_finalizacao || fech.operador || '',
                    pontos: pontosEdit,
                    hasPontosArray: Boolean(pts && pts.length > 0)
                });
            });
        } else {
            const pts = osPontos;
            const pontosEdit = (pts && pts.length > 0)
                ? pts
                : [{
                    plaqueta: osData.plaqueta_final || '',
                    coordenada: osData.coordenada_reparo || ''
                }];
            editModels.push({
                type: 'os',
                osData,
                label: 'Registro da OS',
                operador: '',
                pontos: pontosEdit,
                hasPontosArray: Boolean(pts && pts.length > 0)
            });
        }

        editModels.forEach((model, mIdx) => {
            // Snapshot dos valores anteriores para log de histórico
            const dadosAnt = {};
            model.pontos.forEach((pt, pIdx) => {
                const plaqVal = pt.plaqueta || pt.plaqueta_final || pt.identificacao || pt.id_plaqueta || '';
                const coordVal = pt.coordenada || pt.coordenada_reparo || pt.coord ||
                    (pt.lat != null && pt.lng != null ? `${pt.lat}, ${pt.lng}` :
                    (pt.latitude != null && pt.longitude != null ? `${pt.latitude}, ${pt.longitude}` : ''));
                dadosAnt[`Ponto ${pIdx + 1} - Plaqueta`] = plaqVal || '-';
                dadosAnt[`Ponto ${pIdx + 1} - Coordenada`] = coordVal || '-';
            });
            model.dadosAnteriores = dadosAnt;

            const card = document.createElement('div');
            card.className = 'rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden';

            const opBadge = model.operador
                ? `<span class="text-[11px] text-slate-500 font-medium">Técnico: ${escapeAttr(model.operador)}</span>`
                : '';

            let pontosHtml = '';
            model.pontos.forEach((pt, pIdx) => {
                const plaqVal = pt.plaqueta || pt.plaqueta_final || pt.identificacao || pt.id_plaqueta || '';
                const coordVal = pt.coordenada || pt.coordenada_reparo || pt.coord ||
                    (pt.lat != null && pt.lng != null ? `${pt.lat}, ${pt.lng}` :
                    (pt.latitude != null && pt.longitude != null ? `${pt.latitude}, ${pt.longitude}` : ''));
                pontosHtml += `
                    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <div class="sm:col-span-2">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900">
                                Ponto ${pIdx + 1}
                            </span>
                        </div>
                        <div class="sm:col-span-4">
                            <label class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Plaqueta</label>
                            <input type="text" data-m-idx="${mIdx}" data-p-idx="${pIdx}" data-field="plaqueta" value="${escapeAttr(plaqVal)}" class="w-full px-2.5 py-1.5 text-xs font-semibold uppercase rounded-lg border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none" placeholder="Ex: 12345">
                        </div>
                        <div class="sm:col-span-6">
                            <label class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Coordenada (Lat, Lng)</label>
                            <input type="text" data-m-idx="${mIdx}" data-p-idx="${pIdx}" data-field="coordenada" value="${escapeAttr(coordVal)}" class="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none" placeholder="-23.5505, -46.6333">
                        </div>
                    </div>
                `;
            });

            card.innerHTML = `
                <div class="px-3.5 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-800">${model.label}</span>
                    ${opBadge}
                </div>
                <div class="p-3 space-y-2">${pontosHtml}</div>
            `;
            fechListEl.appendChild(card);
        });

        form.onsubmit = async (e) => {
            e.preventDefault();
            erroEl.classList.add('hidden');
            btnSalvar.disabled = true;
            const origHtml = btnSalvar.innerHTML;
            btnSalvar.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">sync</span><span>Salvando...</span>';

            try {
                // Lê valores dos inputs de volta para editModels
                const inputs = fechListEl.querySelectorAll('input[data-m-idx]');
                inputs.forEach((inp) => {
                    const mIdx = parseInt(inp.getAttribute('data-m-idx'), 10);
                    const pIdx = parseInt(inp.getAttribute('data-p-idx'), 10);
                    const field = inp.getAttribute('data-field');
                    const pt = editModels[mIdx]?.pontos?.[pIdx];
                    if (!pt) return;
                    if (field === 'plaqueta') {
                        const val = inp.value.trim().toUpperCase();
                        pt.plaqueta = val;
                        if ('plaqueta_final' in pt) pt.plaqueta_final = val;
                        if ('identificacao' in pt) pt.identificacao = val;
                    } else if (field === 'coordenada') {
                        const val = inp.value.trim();
                        pt.coordenada = val;
                        if ('coordenada_reparo' in pt) pt.coordenada_reparo = val;
                    }
                });

                for (const model of editModels) {
                    const firstPt = model.pontos[0] || {};
                    const firstPlaq = (firstPt.plaqueta || '').trim().toUpperCase() || null;
                    const firstCoord = (firstPt.coordenada || '').trim() || null;

                    if (model.type === 'fechamento') {
                        const fech = model.fechData;
                        const fechPayload = {};
                        if ('plaqueta_final' in fech) fechPayload.plaqueta_final = firstPlaq;
                        if ('plaqueta' in fech) fechPayload.plaqueta = firstPlaq;
                        if ('coordenada_reparo' in fech) fechPayload.coordenada_reparo = firstCoord;
                        if ('coordenada' in fech) fechPayload.coordenada = firstCoord;
                        if (model.hasPontosArray) {
                            if ('fotos' in fech) fechPayload.fotos = model.pontos;
                            if ('pontos_final' in fech) fechPayload.pontos_final = model.pontos;
                            if ('pontos' in fech) fechPayload.pontos = model.pontos;
                        }
                        if ('ponto_referencia' in fech && firstPlaq) {
                            fechPayload.ponto_referencia = `Plaqueta ${firstPlaq}`;
                        }
                        if (Object.keys(fechPayload).length > 0) {
                            const { data: fechUpdated, error: fechErr } = await client
                                .from('fechamentos_os')
                                .update(fechPayload)
                                .eq('id', fech.id)
                                .select('id');
                            if (fechErr) throw fechErr;
                            if (!fechUpdated || fechUpdated.length === 0) {
                                throw new Error(`Nenhum registro atualizado em fechamentos_os (id=${fech.id}). Verifique permissões/RLS.`);
                            }
                        }
                    } else if (model.type === 'os' && model.osData?.id) {
                        const osPayload = {
                            plaqueta_final: firstPlaq,
                            coordenada_reparo: firstCoord
                        };
                        if (model.hasPontosArray) {
                            osPayload.pontos_final = model.pontos;
                        }
                        const { data: osUpdated, error: osErr } = await client
                            .from('ordens_servico')
                            .update(osPayload)
                            .eq('id', model.osData.id)
                            .select('id');
                        if (osErr) throw osErr;
                        if (!osUpdated || osUpdated.length === 0) {
                            throw new Error(`Nenhum registro atualizado em ordens_servico (id=${model.osData.id}). Verifique permissões/RLS.`);
                        }
                    }

                    // Registra log da alteração na tabela logs_protocolos
                    try {
                        const usuarioEmail = (window.currentUserEmail || window.userEmail || localStorage.getItem('userEmail') || 'Admin').trim();
                        const usuarioNome = (window.currentUserName || localStorage.getItem('userName') || usuarioEmail).trim();
                        const dadosLimpos = {};
                        model.pontos.forEach((p, i) => {
                            dadosLimpos[`Ponto ${i + 1} - Plaqueta`] = p.plaqueta || '-';
                            dadosLimpos[`Ponto ${i + 1} - Coordenada`] = p.coordenada || '-';
                        });
                        await client.from('logs_protocolos').insert([{
                            protocolo: protClean,
                            tabela_origem: model.type === 'fechamento' ? 'fechamentos_os' : 'ordens_servico',
                            tipo_acao: 'CORRECAO_PLAQUETA_COORDENADA',
                            descricao: `Correção administrativa (${model.label}) na OS #${protClean}: ${model.pontos.map((p, i) => `P${i + 1}: ${p.plaqueta || '-'} (${p.coordenada || '-'})`).join(' | ')}`,
                            dados_anteriores: model.dadosAnteriores || null,
                            dados_novos: dadosLimpos,
                            usuario_email: usuarioEmail,
                            usuario_nome: usuarioNome,
                            origem_tela: 'corrigirPlaquetaOS'
                        }]);
                    } catch (eLog) {
                        console.warn('⚠️ [corrigirPlaquetaOS] Não foi possível gravar log em logs_protocolos:', eLog);
                    }
                }

                // Sincroniza também na tabela principal ordens_servico.pontos_final (mantendo a mesma estrutura, sem duplicar)
                try {
                    const { data: osRow } = await client
                        .from('ordens_servico')
                        .select('id, pontos_final')
                        .eq('protocolo', protClean)
                        .maybeSingle();

                    if (osRow && osRow.id && Array.isArray(osRow.pontos_final)) {
                        const novosPontosOS = editModels.flatMap(m => m.pontos || []);
                        if (novosPontosOS.length > 0) {
                            await client
                                .from('ordens_servico')
                                .update({ pontos_final: novosPontosOS })
                                .eq('id', osRow.id);
                        }
                    }
                } catch (eOsSync) {
                    console.warn('⚠️ [corrigirPlaquetaOS] Erro ao sincronizar ordens_servico:', eOsSync);
                }

                if (checkReabrir.checked) {
                    await client
                        .from('historico_localizacao_plaquetas')
                        .delete()
                        .eq('numero_os', protClean)
                        .eq('origem', 'DESCARTE_OS');
                }

                try {
                    sessionStorage.removeItem('chamados_repo_cache_v1');
                    sessionStorage.removeItem('chamados_repo_cache_v2');
                    sessionStorage.removeItem('auditoria_repo_cache_v1');
                    localStorage.removeItem('os_cached_chamados');
                } catch (eCache) {}

                notificarControlePlaquetas(protClean);

                modal.classList.add('hidden');
                modal.classList.remove('flex');

                if (typeof onSuccessCallback === 'function') {
                    onSuccessCallback(editModels);
                }
            } catch (err) {
                erroEl.textContent = 'Erro ao salvar correção: ' + (err.message || err);
                erroEl.classList.remove('hidden');
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = origHtml;
            }
        };
    };
})();
