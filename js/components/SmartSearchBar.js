(function() {
    if (window.SmartSearchBar) return;

    const HISTORY_STORAGE_KEY = 'smart_search_history_v1';
    const MAX_HISTORY_ITEMS = 5;

    class SmartSearchBar {
        constructor(options = {}) {
            this.inputId = options.inputId || 'search-input';
            this.context = options.context || 'painel';
            this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
            this.getItems = typeof options.getItems === 'function' ? options.getItems : (() => (
                window.painelController
                    ? window.painelController.chamadosList
                    : (window.auditoriaController ? window.auditoriaController.chamadosList : [])
            ));
            this.isManutentor = typeof options.isManutentor === 'function' ? options.isManutentor : (() => (
                Boolean(window.isManutentorView) ||
                Boolean(window.auditoriaController && typeof window.auditoriaController.isManutentorUser === 'function' && window.auditoriaController.isManutentorUser())
            ));

            this.state = {
                activeMode: 'auto',
                liveText: '',
                chips: [],
                includeAllStatuses: true
            };

            this.activeSuggestionIndex = -1;
            this.currentSuggestions = [];
            this.debounceTimer = null;
            this.historySaveTimer = null;
            this.isPopoverOpen = false;
            this.isHelpOpen = false;

            this.bindDOM();
        }

        get engine() {
            return window.SmartSearchEngine;
        }

        getHistory() {
            try {
                const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }

        saveHistoryEntry(text, mode = 'auto') {
            const clean = String(text || '').trim();
            if (!clean || clean.length < 2) return;
            try {
                const current = this.getHistory().filter(
                    h => !(h.text.toLowerCase() === clean.toLowerCase() && h.mode === mode)
                );
                current.unshift({ text: clean, mode, ts: Date.now() });
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(current.slice(0, MAX_HISTORY_ITEMS)));
            } catch (e) {}
        }

        clearHistory() {
            try {
                localStorage.removeItem(HISTORY_STORAGE_KEY);
            } catch (e) {}
            this.renderPopover();
        }

        bindDOM() {
            this.wrapper = document.getElementById('smart-search-wrapper');
            this.box = document.getElementById('smart-search-box');
            this.input = document.getElementById(this.inputId);
            this.modeBtn = document.getElementById('smart-mode-btn');
            this.modeIcon = document.getElementById('smart-mode-icon');
            this.modeLabel = document.getElementById('smart-mode-label');
            this.chipsContainer = document.getElementById('smart-chips-container');
            this.clearBtn = document.getElementById('smart-clear-btn');
            this.kbdHint = document.getElementById('smart-kbd-hint');
            this.helpBtn = document.getElementById('smart-help-btn');
            this.popover = document.getElementById('smart-search-popover');
            this.helpPopover = document.getElementById('smart-help-popover');

            if (!this.input || !this.wrapper || !this.engine) return;

            this.attachEvents();
            this.renderUI();
        }

        attachEvents() {
            this.modeBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeHelp();
                if (this.isPopoverOpen) {
                    this.renderPopover();
                } else {
                    this.openPopover();
                }
                this.input.focus();
            });

            this.input.addEventListener('focus', () => {
                this.closeHelp();
                this.openPopover();
            });

            this.input.addEventListener('input', (e) => {
                const raw = e.target.value || '';
                const triggerRes = this.engine.consumePrefixTrigger(raw);

                if (triggerRes.triggered && triggerRes.mode) {
                    this.state.activeMode = triggerRes.mode;
                    this.state.liveText = triggerRes.rest;
                    this.input.value = triggerRes.rest;
                } else {
                    this.state.liveText = raw;
                }

                this.activeSuggestionIndex = -1;
                this.renderUI();
                this.openPopover();
                this.emitChangeDebounced(160);

                clearTimeout(this.historySaveTimer);
                if (this.state.liveText.trim().length >= 3) {
                    const txtSnap = this.state.liveText.trim();
                    const modeSnap = this.state.activeMode;
                    this.historySaveTimer = setTimeout(() => {
                        this.saveHistoryEntry(txtSnap, modeSnap);
                    }, 1500);
                }
            });

            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    if (this.currentSuggestions.length > 0) {
                        e.preventDefault();
                        this.openPopover();
                        this.activeSuggestionIndex = (this.activeSuggestionIndex + 1) % this.currentSuggestions.length;
                        this.renderPopover();
                    }
                    return;
                }

                if (e.key === 'ArrowUp') {
                    if (this.currentSuggestions.length > 0) {
                        e.preventDefault();
                        this.openPopover();
                        this.activeSuggestionIndex = (this.activeSuggestionIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
                        this.renderPopover();
                    }
                    return;
                }

                if (e.key === 'Tab' && this.state.activeMode === 'auto' && this.state.liveText.trim()) {
                    const intent = this.engine.detectQueryIntent(this.state.liveText, 'auto');
                    if (intent.detectedMode && intent.detectedMode !== 'auto') {
                        e.preventDefault();
                        this.state.activeMode = intent.detectedMode;
                        this.renderUI();
                        this.renderPopover();
                    }
                    return;
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.activeSuggestionIndex >= 0 && this.currentSuggestions[this.activeSuggestionIndex]) {
                        this.applySuggestion(this.currentSuggestions[this.activeSuggestionIndex]);
                        return;
                    }
                    if (this.state.liveText.trim()) {
                        this.saveHistoryEntry(this.state.liveText.trim(), this.state.activeMode);
                        this.commitLiveTextAsChip();
                    } else {
                        this.closePopover();
                    }
                    return;
                }

                if (e.key === 'Backspace' && !this.input.value) {
                    if (this.state.chips.length > 0) {
                        e.preventDefault();
                        this.state.chips.pop();
                        this.renderUI();
                        this.renderPopover();
                        this.emitChangeImmediate();
                    } else if (this.state.activeMode !== 'auto') {
                        e.preventDefault();
                        this.state.activeMode = 'auto';
                        this.renderUI();
                        this.renderPopover();
                        this.emitChangeImmediate();
                    }
                    return;
                }

                if (e.key === 'Escape') {
                    this.closePopover();
                    this.closeHelp();
                    this.input.blur();
                }
            });

            this.clearBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clear();
                this.input.focus();
            });

            this.helpBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closePopover();
                this.toggleHelp();
            });

            if (!window._smartSearchGlobalShortcutBound) {
                window._smartSearchGlobalShortcutBound = true;
                document.addEventListener('keydown', (e) => {
                    const activeEl = document.activeElement;
                    const isTypingElsewhere = activeEl && (
                        activeEl.tagName === 'INPUT' ||
                        activeEl.tagName === 'TEXTAREA' ||
                        activeEl.tagName === 'SELECT' ||
                        activeEl.isContentEditable
                    );

                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                        e.preventDefault();
                        const inst = window.smartSearchBar;
                        if (inst && inst.input) {
                            inst.input.focus();
                            inst.input.select();
                        }
                        return;
                    }

                    if (e.key === '/' && !isTypingElsewhere) {
                        e.preventDefault();
                        const inst = window.smartSearchBar;
                        if (inst && inst.input) {
                            inst.input.focus();
                        }
                    }
                });
            }

            document.addEventListener('click', (e) => {
                if (this.wrapper && !this.wrapper.contains(e.target)) {
                    this.closePopover();
                    this.closeHelp();
                }
            });
        }

        setMode(modeId) {
            if (!this.engine.MODES[modeId]) return;
            this.state.activeMode = modeId;
            this.activeSuggestionIndex = -1;
            this.renderUI();
            this.renderPopover();
            this.emitChangeImmediate();
            this.input?.focus();
        }

        addChip(mode, value, label) {
            const valStr = String(value || '').trim();
            if (!valStr) return;
            const normVal = this.engine.cleanStr(valStr);
            const exists = this.state.chips.some(c => c.mode === mode && this.engine.cleanStr(c.value) === normVal);
            if (!exists) {
                this.state.chips.push({
                    id: `${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    mode,
                    value: valStr,
                    label: label || valStr
                });
            }
            this.emitChangeImmediate();
        }

        removeChip(chipId) {
            this.state.chips = this.state.chips.filter(c => c.id !== chipId);
            this.renderUI();
            this.renderPopover();
            this.emitChangeImmediate();
            this.input?.focus();
        }

        commitLiveTextAsChip() {
            const raw = this.state.liveText.trim();
            if (!raw) return;

            const intent = this.engine.detectQueryIntent(raw, this.state.activeMode);
            let targetMode = this.state.activeMode !== 'auto' ? this.state.activeMode : intent.detectedMode;
            if (!targetMode || targetMode === 'auto') targetMode = 'auto';

            // Keep composite status+date phrases (e.g. "concluidas hoje") in auto mode so composite matcher runs!
            if (this.state.activeMode === 'auto') {
                const comp = this.engine.extractCompositeClauses(raw);
                if (comp.statusCodes.length > 0 && comp.dateSpecs.length > 0) {
                    targetMode = 'auto';
                }
            }

            let displayLabel = raw;
            if (targetMode === 'data' && intent.parsedDate) {
                displayLabel = intent.parsedDate.label;
            } else if (targetMode === 'status' && intent.matchedStatusCodes?.length === 1) {
                const found = this.engine.STATUS_CATALOG.find(s => s.code === intent.matchedStatusCodes[0]);
                if (found) displayLabel = found.label;
            } else if (targetMode === 'problema' && intent.matchedProblemCodes?.length === 1) {
                const found = this.engine.PROBLEM_CATALOG.find(p => p.code === intent.matchedProblemCodes[0]);
                if (found) displayLabel = found.label;
            }

            this.state.liveText = '';
            this.input.value = '';
            this.state.activeMode = 'auto';
            this.activeSuggestionIndex = -1;

            this.addChip(targetMode, raw, displayLabel);
            this.renderUI();
            this.renderPopover();
        }

        applySuggestion(sug) {
            if (!sug) return;
            this.saveHistoryEntry(sug.value, sug.mode);
            this.state.liveText = '';
            this.input.value = '';
            this.state.activeMode = 'auto';
            this.activeSuggestionIndex = -1;
            this.addChip(sug.mode, sug.value, sug.label);
            this.renderUI();
            this.renderPopover();
            this.input.focus();
        }

        applyExample(text, mode = 'auto') {
            this.saveHistoryEntry(text, mode);
            this.state.activeMode = mode;
            this.state.liveText = text;
            if (this.input) this.input.value = text;
            this.closeHelp();
            this.renderUI();
            this.openPopover();
            this.emitChangeImmediate();
            this.input?.focus();
        }

        applyPreset(text, label) {
            this.saveHistoryEntry(text, 'auto');
            this.state.liveText = '';
            if (this.input) this.input.value = '';
            this.state.activeMode = 'auto';
            this.addChip('auto', text, label || text);
            this.renderUI();
            this.renderPopover();
            this.input?.focus();
        }

        activatePrefixMode(modeId) {
            this.closeHelp();
            this.setMode(modeId);
            this.openPopover();
        }

        toggleIncludeAllStatuses() {
            this.state.includeAllStatuses = !this.state.includeAllStatuses;
            this.renderUI();
            this.emitChangeImmediate();
        }

        clear(keepFocus = false) {
            this.state.activeMode = 'auto';
            this.state.liveText = '';
            this.state.chips = [];
            this.state.includeAllStatuses = true;
            this.activeSuggestionIndex = -1;
            if (this.input) this.input.value = '';
            this.renderUI();
            this.renderPopover();
            this.emitChangeImmediate();
            if (!keepFocus) this.closePopover();
        }

        getState() {
            return {
                activeMode: this.state.activeMode,
                liveText: this.state.liveText,
                chips: [...this.state.chips],
                includeAllStatuses: this.state.includeAllStatuses
            };
        }

        emitChangeDebounced(ms = 160) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.emitChangeImmediate();
            }, ms);
        }

        emitChangeImmediate() {
            clearTimeout(this.debounceTimer);
            const snapshot = this.getState();
            if (this.onChange) {
                this.onChange(snapshot);
            } else if (window.painelController && typeof window.painelController.setSmartSearchState === 'function') {
                window.painelController.setSmartSearchState(snapshot);
            } else if (window.auditoriaController && typeof window.auditoriaController.setSmartSearchState === 'function') {
                window.auditoriaController.setSmartSearchState(snapshot);
            }
        }

        openPopover() {
            if (!this.popover) return;
            this.isPopoverOpen = true;
            this.popover.classList.remove('hidden');
            this.renderPopover();
        }

        closePopover() {
            if (!this.popover) return;
            this.isPopoverOpen = false;
            this.popover.classList.add('hidden');
        }

        toggleHelp() {
            if (!this.helpPopover) return;
            if (this.isHelpOpen) {
                this.closeHelp();
            } else {
                this.isHelpOpen = true;
                this.helpPopover.classList.remove('hidden');
                this.renderHelpPopover();
            }
        }

        closeHelp() {
            if (!this.helpPopover) return;
            this.isHelpOpen = false;
            this.helpPopover.classList.add('hidden');
        }

        renderUI() {
            if (!this.engine || !this.input) return;

            const intent = this.engine.detectQueryIntent(this.state.liveText, this.state.activeMode);
            const activeModeMeta = this.engine.MODES[this.state.activeMode] || this.engine.MODES.auto;

            if (this.modeBtn && this.modeIcon && this.modeLabel) {
                this.modeIcon.textContent = intent.icon || activeModeMeta.icon;
                this.modeLabel.textContent = intent.badgeLabel || activeModeMeta.shortLabel;
                this.modeBtn.className = `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer shrink-0 select-none ${intent.pillClass}`;
                this.modeBtn.title = `${intent.reason} (clique para trocar o modo de busca)`;
            }

            if (this.state.chips.length > 0) {
                this.input.placeholder = 'Adicionar mais filtros ou texto...';
            } else {
                this.input.placeholder = activeModeMeta.placeholder;
            }

            if (this.chipsContainer) {
                if (this.state.chips.length === 0) {
                    this.chipsContainer.innerHTML = '';
                    this.chipsContainer.classList.add('hidden');
                } else {
                    this.chipsContainer.classList.remove('hidden');
                    this.chipsContainer.innerHTML = this.state.chips.map(chip => {
                        const meta = this.engine.MODES[chip.mode] || this.engine.MODES.auto;
                        const escapedLabel = this.engine.escapeHtml(chip.label);
                        const prefixLabel = chip.mode === 'auto' ? 'Filtro' : meta.shortLabel;
                        return `
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 max-w-[180px] ${meta.chipClass}" title="${prefixLabel}: ${escapedLabel}">
                                <span class="material-symbols-outlined text-[13px] shrink-0">${meta.icon}</span>
                                <span class="opacity-75 font-medium shrink-0">${prefixLabel}:</span>
                                <span class="truncate font-bold">${escapedLabel}</span>
                                <button type="button" data-remove-chip="${chip.id}" class="ml-0.5 hover:bg-black/10 rounded p-0.2 flex items-center justify-center cursor-pointer" title="Remover filtro">
                                    <span class="material-symbols-outlined text-[13px]">close</span>
                                </button>
                            </span>
                        `;
                    }).join('');

                    this.chipsContainer.querySelectorAll('[data-remove-chip]').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.removeChip(btn.getAttribute('data-remove-chip'));
                        });
                    });
                }
            }

            const hasAnything = Boolean(this.state.liveText.trim() || this.state.chips.length > 0 || this.state.activeMode !== 'auto');
            if (this.clearBtn) {
                this.clearBtn.classList.toggle('hidden', !hasAnything);
            }
            if (this.kbdHint) {
                this.kbdHint.classList.toggle('hidden', hasAnything);
            }
        }

        renderPopover() {
            if (!this.popover || !this.isPopoverOpen || !this.engine) return;

            const items = this.getItems() || [];
            const isManutentor = this.isManutentor();
            const intent = this.engine.detectQueryIntent(this.state.liveText, this.state.activeMode);
            const suggestions = this.engine.buildSuggestions(items, this.state.liveText, this.state.activeMode, this.state.chips, isManutentor);
            this.currentSuggestions = suggestions;

            const modesOrder = this.context === 'auditoria'
                ? ['auto', 'protocolo', 'endereco', 'problema', 'data', 'material', 'tecnico', 'plaqueta', 'status']
                : ['auto', 'protocolo', 'endereco', 'problema', 'data', 'status', 'tecnico', 'plaqueta'];
            const modePillsHtml = modesOrder.map(mId => {
                const m = this.engine.MODES[mId];
                const isActive = this.state.activeMode === mId;
                const activeCls = isActive
                    ? 'bg-secondary text-white border-secondary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:bg-surface-container-high hover:text-on-surface';
                return `
                    <button type="button" data-pick-mode="${mId}" class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${activeCls}" title="${m.prefix ? 'Atalho: ' + m.prefix : 'Detecção automática'}">
                        <span class="material-symbols-outlined text-[14px]">${m.icon}</span>
                        <span>${m.shortLabel}</span>
                        ${m.prefix ? `<span class="opacity-70 font-mono text-[10px]">${m.prefix}</span>` : ''}
                    </button>
                `;
            }).join('');

            const ambiguityHtml = intent.isAmbiguousProtocolOrPlaqueta ? `
                <button type="button" id="smart-switch-plaqueta-btn" class="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-100 text-violet-800 hover:bg-violet-200 text-[11px] font-semibold cursor-pointer transition-colors">
                    <span class="material-symbols-outlined text-[13px]">swap_horiz</span>
                    <span>Buscar só em Plaqueta</span>
                </button>
            ` : '';

            // Presets + Recent History when query is empty
            let presetsAndHistoryHtml = '';
            if (!this.state.liveText.trim()) {
                const presets = this.context === 'auditoria' ? [
                    { text: 'concluidas hoje', label: 'Concluídas hoje', icon: 'task_alt', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' },
                    { text: 'reincidencia', label: 'Reincidência 30d', icon: 'history', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100' },
                    { text: 'distancia', label: 'Distância > 100m', icon: 'straighten', cls: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100' },
                    { text: 'plaqueta divergente', label: 'Plaqueta Divergente', icon: 'qr_code_2', cls: 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100' },
                    { text: 'material divergente', label: 'Material Divergente', icon: 'inventory_2', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100' },
                    { text: 'emergencial', label: 'Emergenciais', icon: 'electric_bolt', cls: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100' }
                ] : [
                    { text: 'concluidas hoje', label: 'Concluídas hoje', icon: 'task_alt', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' },
                    { text: 'atrasada', label: 'SLA Atrasado', icon: 'warning', cls: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100' },
                    { text: 'vencendo', label: 'Vencendo SLA', icon: 'timer', cls: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' },
                    { text: 'emergencial', label: 'Emergenciais', icon: 'electric_bolt', cls: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100' }
                ];
                if (this.context !== 'auditoria' && !isManutentor) {
                    presets.push({ text: 'duplicata', label: 'Duplicatas', icon: 'content_copy', cls: 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100' });
                    presets.push({ text: 'reparo recente', label: 'Reincidência', icon: 'history', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100' });
                }

                const historyList = this.getHistory();
                const historyHtml = historyList.length > 0 ? `
                    <div class="pt-2 mt-1 border-t border-outline-variant/40">
                        <div class="px-1 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">
                            <span>Buscas recentes</span>
                            <button type="button" id="smart-clear-history-btn" class="text-[10px] text-error hover:underline font-semibold cursor-pointer">Limpar</button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            ${historyList.map((h, idx) => {
                                const m = this.engine.MODES[h.mode] || this.engine.MODES.auto;
                                return `
                                    <button type="button" data-history-idx="${idx}" class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/60 text-on-surface cursor-pointer transition-colors">
                                        <span class="material-symbols-outlined text-[13px] text-on-surface-variant">schedule</span>
                                        ${h.mode !== 'auto' ? `<span class="text-[10px] font-bold opacity-75">${m.shortLabel}:</span>` : ''}
                                        <span class="truncate max-w-[140px]">${this.engine.escapeHtml(h.text)}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : '';

                presetsAndHistoryHtml = `
                    <div class="py-2">
                        <div class="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">Atalhos operacionais rápidos</div>
                        <div class="flex flex-wrap gap-1.5">
                            ${presets.map((p, idx) => `
                                <button type="button" data-preset-idx="${idx}" data-preset-text="${this.engine.escapeHtml(p.text)}" data-preset-label="${this.engine.escapeHtml(p.label)}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${p.cls}">
                                    <span class="material-symbols-outlined text-[14px]">${p.icon}</span>
                                    <span>${this.engine.escapeHtml(p.label)}</span>
                                </button>
                            `).join('')}
                        </div>
                        ${historyHtml}
                    </div>
                `;
            }

            let suggestionsHtml = '';
            if (suggestions.length > 0) {
                suggestionsHtml = `
                    <div class="pt-2">
                        <div class="px-2 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">
                            <span>${this.state.liveText.trim() ? 'Sugestões inteligentes (Enter ou clique para fixar)' : 'Filtros por categoria'}</span>
                            <span>${items.length} OS carregadas</span>
                        </div>
                        <div class="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                            ${suggestions.map((sug, idx) => {
                                const m = this.engine.MODES[sug.mode] || this.engine.MODES.auto;
                                const isHighlighted = idx === this.activeSuggestionIndex;
                                return `
                                    <button type="button" data-apply-sug="${idx}" class="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${isHighlighted ? 'bg-secondary/10 text-secondary' : 'hover:bg-surface-container-low text-on-surface'}">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-md border shrink-0 ${m.chipClass}">
                                                <span class="material-symbols-outlined text-[15px]">${sug.icon || m.icon}</span>
                                            </span>
                                            <div class="flex flex-col min-w-0">
                                                <div class="flex items-center gap-1.5">
                                                    <span class="text-[10px] font-bold uppercase tracking-wider opacity-70">${m.shortLabel}</span>
                                                    <span class="text-xs font-semibold truncate">${this.engine.escapeHtml(sug.label)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span class="text-[11px] font-medium text-on-surface-variant shrink-0">${this.engine.escapeHtml(sug.sublabel || '')}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else if (this.state.liveText.trim()) {
                suggestionsHtml = `
                    <div class="pt-2 px-2 py-2 text-xs text-on-surface-variant flex items-center justify-between">
                        <span>Pressione <kbd class="px-1.5 py-0.5 bg-surface-container-high border border-outline-variant rounded text-[10px] font-mono">Enter</kbd> para fixar <strong>"${this.engine.escapeHtml(this.state.liveText.trim())}"</strong> como filtro.</span>
                    </div>
                `;
            }

            this.popover.innerHTML = `
                <div class="flex flex-col divide-y divide-outline-variant/40">
                    <div class="pb-2">
                        <div class="flex items-center justify-between mb-1.5 px-1">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Modo de Busca (Gatilhos)</span>
                            <span class="text-[10px] text-on-surface-variant">Use <code class="font-mono bg-surface-container-high px-1 rounded">p:</code> <code class="font-mono bg-surface-container-high px-1 rounded">e:</code> <code class="font-mono bg-surface-container-high px-1 rounded">prob:</code> <code class="font-mono bg-surface-container-high px-1 rounded">d:</code> ${this.context === 'auditoria' ? '<code class="font-mono bg-surface-container-high px-1 rounded">mat:</code> ' : '<code class="font-mono bg-surface-container-high px-1 rounded">s:</code> '}<code class="font-mono bg-surface-container-high px-1 rounded">tec:</code></span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            ${modePillsHtml}
                        </div>
                    </div>
                    <div class="py-1.5 px-1 flex items-center gap-2 text-xs">
                        <span class="material-symbols-outlined text-[16px] text-secondary shrink-0">${intent.icon}</span>
                        <span class="text-on-surface-variant font-medium truncate">${this.engine.escapeHtml(intent.reason)}</span>
                        ${ambiguityHtml}
                    </div>
                    ${presetsAndHistoryHtml}
                    ${suggestionsHtml}
                </div>
            `;

            this.popover.querySelectorAll('[data-pick-mode]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setMode(btn.getAttribute('data-pick-mode'));
                });
            });

            this.popover.querySelectorAll('[data-preset-idx]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.applyPreset(btn.getAttribute('data-preset-text'), btn.getAttribute('data-preset-label'));
                });
            });

            const historyList = this.getHistory();
            this.popover.querySelectorAll('[data-history-idx]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.getAttribute('data-history-idx'), 10);
                    if (!isNaN(idx) && historyList[idx]) {
                        this.applyExample(historyList[idx].text, historyList[idx].mode || 'auto');
                    }
                });
            });

            this.popover.querySelector('#smart-clear-history-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearHistory();
            });

            this.popover.querySelectorAll('[data-apply-sug]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.getAttribute('data-apply-sug'), 10);
                    if (!isNaN(idx) && this.currentSuggestions[idx]) {
                        this.applySuggestion(this.currentSuggestions[idx]);
                    }
                });
            });

            const switchPlaqBtn = this.popover.querySelector('#smart-switch-plaqueta-btn');
            if (switchPlaqBtn) {
                switchPlaqBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.setMode('plaqueta');
                });
            }
        }

        renderHelpPopover() {
            if (!this.helpPopover) return;
            this.helpPopover.innerHTML = `
                <div class="flex flex-col gap-3 text-xs text-on-surface max-h-[75vh] overflow-y-auto">
                    <div class="flex items-start justify-between gap-2 border-b border-outline-variant/50 pb-2">
                        <div>
                            <div class="font-bold text-sm text-on-surface flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[18px] text-secondary">auto_awesome</span>
                                <span>Como funciona a Busca Inteligente</span>
                            </div>
                            <p class="text-[11px] text-on-surface-variant mt-0.5">Digite frases naturais, use prefixos para travar um campo, ou exclua termos com <code class="font-mono bg-surface-container-high px-1 rounded">-</code>.</p>
                        </div>
                        <button type="button" id="smart-help-close-btn" class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant cursor-pointer" title="Fechar ajuda">
                            <span class="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>

                    <div>
                        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">1. Frases naturais &amp; combinações (clique para testar)</div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <button type="button" data-help-example="concluidas hoje" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-emerald-700">concluidas hoje</code></span>
                                <span class="text-[10px] text-on-surface-variant">Por data de fechamento</span>
                            </button>
                            <button type="button" data-help-example="abertas 7d -praca" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-sky-700">abertas 7d -praca</code></span>
                                <span class="text-[10px] text-on-surface-variant">Com exclusão (-)</span>
                            </button>
                            <button type="button" data-help-example="atrasada" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-rose-700">atrasada</code> · <code class="font-mono font-bold text-amber-700">vencendo</code></span>
                                <span class="text-[10px] text-on-surface-variant">SLA</span>
                            </button>
                            <button type="button" data-help-example="emergencial" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-orange-700">emergencial</code> · <code class="font-mono font-bold text-purple-700">duplicata</code></span>
                                <span class="text-[10px] text-on-surface-variant">Origem / Motivo</span>
                            </button>
                            <button type="button" data-help-example="queimada" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-amber-800">queimada</code> · <code class="font-mono font-bold text-amber-800">acesa dia</code></span>
                                <span class="text-[10px] text-on-surface-variant">Problema</span>
                            </button>
                            <button type="button" data-help-example="26/11" data-help-mode="auto" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary/10 border border-outline-variant/50 text-left cursor-pointer transition-colors">
                                <span><code class="font-mono font-bold text-teal-700">hoje</code> · <code class="font-mono font-bold text-teal-700">26/11</code> · <code class="font-mono font-bold text-teal-700">01/11 a 15/11</code></span>
                                <span class="text-[10px] text-on-surface-variant">Datas / Períodos</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">2. Gatilhos por prefixo (trocam o modo na hora — clique para ativar)</div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <button type="button" data-help-prefix="protocolo" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">p:</code> / <code class="font-mono font-bold">#</code>
                                <span class="text-[11px] truncate">Protocolo</span>
                            </button>
                            <button type="button" data-help-prefix="endereco" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-sky-50/70 hover:bg-sky-100 border border-sky-200 text-sky-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">e:</code> / <code class="font-mono font-bold">@</code>
                                <span class="text-[11px] truncate">Endereço</span>
                            </button>
                            <button type="button" data-help-prefix="problema" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50/70 hover:bg-amber-100 border border-amber-200 text-amber-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">prob:</code> / <code class="font-mono font-bold">!</code>
                                <span class="text-[11px] truncate">Problema</span>
                            </button>
                            <button type="button" data-help-prefix="data" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-teal-50/70 hover:bg-teal-100 border border-teal-200 text-teal-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">d:</code>
                                <span class="text-[11px] truncate">Data</span>
                            </button>
                            <button type="button" data-help-prefix="status" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">s:</code>
                                <span class="text-[11px] truncate">Status</span>
                            </button>
                            <button type="button" data-help-prefix="tecnico" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-50/70 hover:bg-orange-100 border border-orange-200 text-orange-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">tec:</code>
                                <span class="text-[11px] truncate">Técnico</span>
                            </button>
                            <button type="button" data-help-prefix="material" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-cyan-50/70 hover:bg-cyan-100 border border-cyan-200 text-cyan-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">mat:</code>
                                <span class="text-[11px] truncate">Material</span>
                            </button>
                            <button type="button" data-help-prefix="plaqueta" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-violet-50/70 hover:bg-violet-100 border border-violet-200 text-violet-900 cursor-pointer transition-colors">
                                <code class="font-mono font-bold">pl:</code>
                                <span class="text-[11px] truncate">Plaqueta</span>
                            </button>
                        </div>
                    </div>

                    <div class="bg-surface-container-low rounded-lg p-2.5 border border-outline-variant/50 flex flex-col gap-1 text-[11px] text-on-surface-variant">
                        <div class="font-semibold text-on-surface">3. Combine filtros e navegue rápido pelo teclado:</div>
                        <div>• Pressione <kbd class="px-1 py-0.5 bg-white border border-outline-variant rounded font-mono text-[10px]">Enter</kbd> (ou clique numa sugestão) para transformar o filtro em etiqueta e combinar com outros.</div>
                        <div>• Use <code class="font-mono bg-white px-1 rounded border border-outline-variant/60">-praca</code> ou <code class="font-mono bg-white px-1 rounded border border-outline-variant/60">-concluida</code> para excluir resultados rapidamente.</div>
                        <div>• Use <kbd class="px-1 py-0.5 bg-white border border-outline-variant rounded font-mono text-[10px]">Ctrl+K</kbd> ou <kbd class="px-1 py-0.5 bg-white border border-outline-variant rounded font-mono text-[10px]">/</kbd> para focar na busca de qualquer lugar, e <kbd class="px-1 py-0.5 bg-white border border-outline-variant rounded font-mono text-[10px]">Tab</kbd> para travar o modo detectado.</div>
                    </div>
                </div>
            `;

            this.helpPopover.querySelector('#smart-help-close-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeHelp();
            });

            this.helpPopover.querySelectorAll('[data-help-example]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.applyExample(btn.getAttribute('data-help-example'), btn.getAttribute('data-help-mode') || 'auto');
                });
            });

            this.helpPopover.querySelectorAll('[data-help-prefix]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.activatePrefixMode(btn.getAttribute('data-help-prefix'));
                });
            });
        }
    }

    window.SmartSearchBar = SmartSearchBar;
})();
