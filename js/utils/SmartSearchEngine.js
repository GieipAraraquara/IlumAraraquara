(function() {
    if (window.SmartSearchEngine) return;

    const MODES = {
        auto: {
            id: 'auto',
            label: 'Auto',
            shortLabel: 'Auto',
            icon: 'auto_awesome',
            prefix: '',
            placeholder: 'Ex: concluidas hoje, abertas 7d -praca, emergencial, P0123... (p:, e:, prob:, d:, s:, tec:)',
            pillClass: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70',
            chipClass: 'bg-slate-100 text-slate-800 border-slate-300'
        },
        protocolo: {
            id: 'protocolo',
            label: 'Protocolo',
            shortLabel: 'Protocolo',
            icon: 'tag',
            prefix: 'p:',
            placeholder: 'Digite o protocolo (ex: P0123, I2026) ou P / I...',
            pillClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
            chipClass: 'bg-indigo-50 text-indigo-800 border-indigo-200'
        },
        endereco: {
            id: 'endereco',
            label: 'Endereço',
            shortLabel: 'Endereço',
            icon: 'location_on',
            prefix: 'e:',
            placeholder: 'Digite rua, avenida, praça, bairro ou coordenada...',
            pillClass: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
            chipClass: 'bg-sky-50 text-sky-800 border-sky-200'
        },
        problema: {
            id: 'problema',
            label: 'Problema',
            shortLabel: 'Problema',
            icon: 'bolt',
            prefix: 'prob:',
            placeholder: 'Ex: lâmpada queimada, acesa dia, quebrada, outro...',
            pillClass: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
            chipClass: 'bg-amber-50 text-amber-900 border-amber-200'
        },
        data: {
            id: 'data',
            label: 'Data',
            shortLabel: 'Data',
            icon: 'calendar_today',
            prefix: 'd:',
            placeholder: 'Ex: hoje, ontem, 7d, 30d, 26/11, 01/11 a 15/11, atrasada...',
            pillClass: 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100',
            chipClass: 'bg-teal-50 text-teal-900 border-teal-200'
        },
        status: {
            id: 'status',
            label: 'Status',
            shortLabel: 'Status',
            icon: 'flag',
            prefix: 's:',
            placeholder: 'Ex: em aberto, em andamento, concluída, pendente, bloqueada...',
            pillClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
            chipClass: 'bg-emerald-50 text-emerald-900 border-emerald-200'
        },
        tecnico: {
            id: 'tecnico',
            label: 'Técnico / Op.',
            shortLabel: 'Técnico',
            icon: 'engineering',
            prefix: 'tec:',
            placeholder: 'Nome do técnico ou operador (abertura ou finalização)...',
            pillClass: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100',
            chipClass: 'bg-orange-50 text-orange-900 border-orange-200'
        },
        plaqueta: {
            id: 'plaqueta',
            label: 'Plaqueta',
            shortLabel: 'Plaqueta',
            icon: 'qr_code_2',
            prefix: 'pl:',
            placeholder: 'Digite o código da plaqueta inicial ou final...',
            pillClass: 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100',
            chipClass: 'bg-violet-50 text-violet-900 border-violet-200'
        }
    };

    const STATUS_CATALOG = [
        { code: 'aberto', label: 'Em aberto', aliases: ['aberto', 'aberta', 'abertos', 'abertas', 'em aberto'] },
        { code: 'em_andamento', label: 'Em andamento', aliases: ['andamento', 'em andamento', 'iniciado', 'iniciada', 'iniciadas', 'execucao', 'em execucao'] },
        { code: 'concluida', label: 'Concluída', aliases: ['concluida', 'concluido', 'concluidas', 'concluidos', 'finalizada', 'finalizado', 'finalizadas', 'fechada', 'fechadas', 'fechado', 'resolvida', 'resolvidas'] },
        { code: 'bloqueada', label: 'Bloqueada', aliases: ['bloqueada', 'bloqueado', 'bloqueadas', 'bloqueados'] },
        { code: 'pendente', label: 'Pendente aprovação', aliases: ['pendente', 'pendentes', 'aprovacao', 'pendente aprovacao', 'aguardando'] },
        { code: 'cancelada', label: 'Cancelada', aliases: ['cancelada', 'cancelado', 'canceladas', 'cancelados'] },
        { code: 'rejeitada', label: 'Rejeitada / Recusada', aliases: ['rejeitada', 'rejeitado', 'rejeitadas', 'recusada', 'recusado', 'recusadas'] }
    ];

    const PROBLEM_CATALOG = [
        { code: 'lampada-queimada', label: 'Lâmpada Queimada', aliases: ['lampada queimada', 'queimada', 'queimado', 'apagada', 'apagado', 'desligada', 'sem luz', 'nao acende'] },
        { code: 'acesa-dia', label: 'Acesa Dia', aliases: ['acesa dia', 'acesa', 'aceso', 'ligada de dia', 'dia'] },
        { code: 'lampada-quebrada', label: 'Lâmpada Quebrada', aliases: ['lampada quebrada', 'quebrada', 'quebrado', 'danificada', 'caida'] },
        { code: 'outro', label: 'Outro', aliases: ['outro', 'outros', 'poste', 'braco', 'fiacao', 'rele'] }
    ];

    const ADDRESS_PREFIXES = [
        'rua', 'r.', 'r ', 'av', 'av.', 'avenida', 'praca', 'pç', 'pc', 'travessa', 'tv',
        'alameda', 'al.', 'rodovia', 'rod', 'estrada', 'estr', 'largo', 'jardim', 'jd',
        'vila', 'parque', 'pq', 'condominio', 'residencial', 'bairro', 'centro'
    ];

    function cleanStr(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function rawValueOr(v, fb) {
        return (v === undefined || v === null) ? fb : v;
    }

    function highlightText(text, terms) {
        const raw = String(text || '');
        if (!raw || !Array.isArray(terms) || terms.length === 0) {
            return escapeHtml(raw);
        }

        const validTerms = Array.from(new Set(
            terms.map(t => cleanStr(t)).filter(t => t.length >= 1)
        ));
        if (validTerms.length === 0) return escapeHtml(raw);

        let norm = '';
        const indexMap = [];
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            const stripped = ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (let k = 0; k < stripped.length; k++) {
                norm += stripped[k];
                indexMap.push(i);
            }
        }

        const ranges = [];
        validTerms.forEach(term => {
            let startPos = 0;
            while (startPos < norm.length) {
                const idx = norm.indexOf(term, startPos);
                if (idx === -1) break;
                const origStart = indexMap[idx];
                const origEnd = indexMap[idx + term.length - 1] + 1;
                ranges.push([origStart, origEnd]);
                startPos = idx + term.length;
            }
        });

        if (ranges.length === 0) return escapeHtml(raw);

        ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const merged = [ranges[0]];
        for (let i = 1; i < ranges.length; i++) {
            const prev = merged[merged.length - 1];
            const curr = ranges[i];
            if (curr[0] <= prev[1]) {
                prev[1] = Math.max(prev[1], curr[1]);
            } else {
                merged.push(curr);
            }
        }

        let html = '';
        let cursor = 0;
        merged.forEach(([s, e]) => {
            if (s > cursor) html += escapeHtml(raw.slice(cursor, s));
            html += `<mark class="smart-search-mark">${escapeHtml(raw.slice(s, e))}</mark>`;
            cursor = e;
        });
        if (cursor < raw.length) html += escapeHtml(raw.slice(cursor));
        return html;
    }

    /**
     * Checks if user typed a prefix trigger at the start of the input
     */
    function consumePrefixTrigger(rawValue) {
        const text = String(rawValue || '');
        const trimmedStart = text.replace(/^\s+/, '');

        const colonMatch = trimmedStart.match(/^(p|prot|protocolo|e|end|endereco|endereço|local|prob|problema|d|data|dt|s|st|status|tec|tecnico|técnico|op|operador|por|pl|plaq|plaqueta):(.*)$/i);
        if (colonMatch) {
            const key = cleanStr(colonMatch[1]);
            const rest = colonMatch[2].replace(/^\s+/, '');
            if (['p', 'prot', 'protocolo'].includes(key)) return { triggered: true, mode: 'protocolo', rest };
            if (['e', 'end', 'endereco', 'local'].includes(key)) return { triggered: true, mode: 'endereco', rest };
            if (['prob', 'problema'].includes(key)) return { triggered: true, mode: 'problema', rest };
            if (['d', 'data', 'dt'].includes(key)) return { triggered: true, mode: 'data', rest };
            if (['s', 'st', 'status'].includes(key)) return { triggered: true, mode: 'status', rest };
            if (['tec', 'tecnico', 'op', 'operador', 'por'].includes(key)) return { triggered: true, mode: 'tecnico', rest };
            if (['pl', 'plaq', 'plaqueta'].includes(key)) return { triggered: true, mode: 'plaqueta', rest };
        }

        if (trimmedStart.startsWith('#')) {
            return { triggered: true, mode: 'protocolo', rest: trimmedStart.slice(1).replace(/^\s+/, '') };
        }
        if (trimmedStart.startsWith('@')) {
            return { triggered: true, mode: 'endereco', rest: trimmedStart.slice(1).replace(/^\s+/, '') };
        }
        if (trimmedStart.startsWith('!')) {
            return { triggered: true, mode: 'problema', rest: trimmedStart.slice(1).replace(/^\s+/, '') };
        }

        return { triggered: false, mode: null, rest: text };
    }

    function parseStatusCodes(query) {
        const q = cleanStr(query);
        if (!q) return [];
        const matched = [];
        STATUS_CATALOG.forEach(entry => {
            const labelNorm = cleanStr(entry.label);
            const codeNorm = cleanStr(entry.code.replace('_', ' '));
            const hit = entry.aliases.some(a => a === q || (q.length >= 3 && a.includes(q))) ||
                        (q.length >= 3 && (labelNorm.includes(q) || codeNorm.includes(q)));
            if (hit) matched.push(entry.code);
        });
        return Array.from(new Set(matched));
    }

    function parseProblemCodes(query) {
        const q = cleanStr(query);
        if (!q) return [];
        const matched = [];
        PROBLEM_CATALOG.forEach(entry => {
            const labelNorm = cleanStr(entry.label);
            const hit = entry.aliases.some(a => a === q || (q.length >= 3 && a.includes(q))) ||
                        (q.length >= 3 && labelNorm.includes(q));
            if (hit) matched.push(entry.code);
        });
        return Array.from(new Set(matched));
    }

    function parseDatePart(partStr, fallbackYear) {
        const m = String(partStr || '').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (!m) return null;
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        if (day < 1 || day > 31 || month < 1 || month > 12) return null;
        let year = fallbackYear || new Date().getFullYear();
        let hasYear = false;
        if (m[3]) {
            hasYear = true;
            year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
        }
        return { day, month, year, hasYear };
    }

    /**
     * Parses natural language dates, dd/mm, dd/mm/yyyy, mm/yyyy, ranges, and SLA keywords.
     * @param {string} raw
     * @param {'abertura'|'conclusao'} dateField Which date field to check for calendar dates
     */
    function parseDateQuery(raw, dateField = 'abertura') {
        const q = cleanStr(raw);
        if (!q) return null;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const getTargetDate = (item) => {
            if (!item) return null;
            const rawDate = dateField === 'conclusao' ? item.dataConclusao : item.dataAbertura;
            if (!rawDate) return null;
            const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
            return isNaN(d.getTime()) ? null : d;
        };

        if (q === 'hoje') {
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            return {
                label: 'Hoje',
                dateField,
                highlightDateTerms: dateField === 'conclusao' ? [] : [`${dd}/${mm}`],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    return Boolean(d && d >= todayStart && d <= todayEnd);
                }
            };
        }

        if (q === 'ontem') {
            const yStart = new Date(todayStart);
            yStart.setDate(yStart.getDate() - 1);
            const yEnd = new Date(yStart);
            yEnd.setHours(23, 59, 59, 999);
            const dd = String(yStart.getDate()).padStart(2, '0');
            const mm = String(yStart.getMonth() + 1).padStart(2, '0');
            return {
                label: 'Ontem',
                dateField,
                highlightDateTerms: dateField === 'conclusao' ? [] : [`${dd}/${mm}`],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    return Boolean(d && d >= yStart && d <= yEnd);
                }
            };
        }

        if (q === 'anteontem') {
            const aStart = new Date(todayStart);
            aStart.setDate(aStart.getDate() - 2);
            const aEnd = new Date(aStart);
            aEnd.setHours(23, 59, 59, 999);
            const dd = String(aStart.getDate()).padStart(2, '0');
            const mm = String(aStart.getMonth() + 1).padStart(2, '0');
            return {
                label: 'Anteontem',
                dateField,
                highlightDateTerms: dateField === 'conclusao' ? [] : [`${dd}/${mm}`],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    return Boolean(d && d >= aStart && d <= aEnd);
                }
            };
        }

        if (['7d', '7dias', '7 dias', 'semana', 'essa semana', 'ultima semana', 'ultimos 7 dias'].includes(q)) {
            const start = new Date(todayStart);
            start.setDate(start.getDate() - 7);
            return {
                label: 'Últimos 7 dias',
                dateField,
                highlightDateTerms: [],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    return Boolean(d && d >= start && d <= todayEnd);
                }
            };
        }

        if (['30d', '30dias', '30 dias', 'mes', 'esse mes', 'ultimo mes', 'ultimos 30 dias'].includes(q)) {
            const start = new Date(todayStart);
            start.setDate(start.getDate() - 30);
            return {
                label: 'Últimos 30 dias',
                dateField,
                highlightDateTerms: [],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    return Boolean(d && d >= start && d <= todayEnd);
                }
            };
        }

        if (['atrasada', 'atrasadas', 'atraso', 'sla', 'vencida', 'vencidas', 'sla vencido', 'fora do sla'].includes(q)) {
            return {
                label: 'SLA Atrasado',
                dateField: 'sla',
                highlightDateTerms: ['atrasada', 'atrasado', 'atraso'],
                isSlaQuery: true,
                predicate: (item) => {
                    if (!item || typeof item.calcularSLA !== 'function') return false;
                    const sla = item.calcularSLA();
                    return Boolean(sla && (sla.statusSla === 'atrasado' || (sla.label && cleanStr(sla.label).includes('atras'))));
                }
            };
        }

        if (['vencendo', 'critico', 'critica', 'criticas', 'urgente sla'].includes(q)) {
            return {
                label: 'SLA Crítico / Vencendo',
                dateField: 'sla',
                highlightDateTerms: ['Vence em'],
                isSlaQuery: true,
                predicate: (item) => {
                    if (!item || typeof item.calcularSLA !== 'function') return false;
                    const sla = item.calcularSLA();
                    return Boolean(sla && (sla.statusSla === 'critico' || sla.statusSla === 'amarelo'));
                }
            };
        }

        if (['no prazo', 'dentro do sla', 'no sla'].includes(q)) {
            return {
                label: 'Dentro do SLA',
                dateField: 'sla',
                highlightDateTerms: ['No SLA', 'restantes'],
                isSlaQuery: true,
                predicate: (item) => {
                    if (!item || typeof item.calcularSLA !== 'function') return false;
                    const sla = item.calcularSLA();
                    return Boolean(sla && sla.statusSla !== 'atrasado' && (!sla.label || !cleanStr(sla.label).includes('atras')));
                }
            };
        }

        const rangeMatch = q.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*(?:a|ate|-|\.\.)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
        if (rangeMatch) {
            const p1 = parseDatePart(rangeMatch[1], now.getFullYear());
            const p2 = parseDatePart(rangeMatch[2], p1 ? p1.year : now.getFullYear());
            if (p1 && p2) {
                const start = new Date(p1.year, p1.month - 1, p1.day, 0, 0, 0, 0);
                const end = new Date(p2.year, p2.month - 1, p2.day, 23, 59, 59, 999);
                return {
                    label: `${rangeMatch[1]} a ${rangeMatch[2]}`,
                    dateField,
                    highlightDateTerms: [],
                    predicate: (item) => {
                        const d = getTargetDate(item);
                        return Boolean(d && d >= start && d <= end);
                    }
                };
            }
        }

        const single = parseDatePart(q);
        if (single) {
            const dd = String(single.day).padStart(2, '0');
            const mm = String(single.month).padStart(2, '0');
            return {
                label: single.hasYear ? `${dd}/${mm}/${single.year}` : `${dd}/${mm}`,
                dateField,
                highlightDateTerms: dateField === 'conclusao' ? [] : [`${dd}/${mm}`],
                predicate: (item) => {
                    const d = getTargetDate(item);
                    if (!d) return false;
                    if (d.getDate() !== single.day || (d.getMonth() + 1) !== single.month) return false;
                    if (single.hasYear && d.getFullYear() !== single.year) return false;
                    return true;
                }
            };
        }

        const monthYearMatch = q.match(/^(\d{1,2})\/(\d{4})$/);
        if (monthYearMatch) {
            const month = parseInt(monthYearMatch[1], 10);
            const year = parseInt(monthYearMatch[2], 10);
            if (month >= 1 && month <= 12) {
                const mm = String(month).padStart(2, '0');
                return {
                    label: `${mm}/${year}`,
                    dateField,
                    highlightDateTerms: dateField === 'conclusao' ? [] : [`/${mm}`],
                    predicate: (item) => {
                        const d = getTargetDate(item);
                        return Boolean(d && (d.getMonth() + 1) === month && d.getFullYear() === year);
                    }
                };
            }
        }

        return null;
    }

    /**
     * Extracts composite natural-language clauses in Auto mode:
     * - Exclusions: -praca, -concluida, -outro
     * - Multi-word & single-word status clauses: "concluidas", "em aberto", "em andamento"
     * - Date clauses: "hoje", "ontem", "7d", "26/11", "01/11 a 15/11" (uses dataConclusao if paired with concluida!)
     * - Operational / Audit / SLA tags: "emergencial", "praca", "viaria", "atrasada", "duplicata", "reparo recente", etc.
     * - Remaining free text tokens
     */
    function extractCompositeClauses(rawText) {
        let remaining = cleanStr(rawText);
        if (!remaining) {
            return {
                exclusions: [],
                statusCodes: [],
                dateSpecs: [],
                specialTags: [],
                remainingTokens: [],
                dateField: 'abertura',
                hasStatusClause: false
            };
        }

        const exclusions = [];
        const statusCodes = [];
        const dateSpecs = [];
        const specialTags = [];

        // 1. Extract exclusions like "-praca", "-concluida" (not "-23.5" coordinates)
        remaining = remaining.replace(/(?:^|\s)-([a-z][a-z0-9_-]{1,})/g, (m, term) => {
            exclusions.push(term.trim());
            return ' ';
        });

        // 2. Extract multi-word date ranges first (e.g. "01/11 a 15/11", "01/11..15/11")
        remaining = remaining.replace(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:a|ate|-|\.\.)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/g, (m, rng) => {
            dateSpecs.push(rng.trim());
            return ' ';
        });

        // 3. Extract multi-word special / status / date phrases
        const multiPhraseRules = [
            { pattern: /\bem aberto\b/g, type: 'status', value: 'aberto' },
            { pattern: /\bem andamento\b/g, type: 'status', value: 'em_andamento' },
            { pattern: /\bpendente(?:s)?(?: de)? aprovacao\b/g, type: 'status', value: 'pendente' },
            { pattern: /\bultimos 7 dias\b|\bultima semana\b|\bessa semana\b|\b7 dias\b/g, type: 'date', value: '7d' },
            { pattern: /\bultimos 30 dias\b|\bultimo mes\b|\besse mes\b|\b30 dias\b/g, type: 'date', value: '30d' },
            { pattern: /\bfora do sla\b|\bsla vencido\b/g, type: 'tag', value: 'atrasada', label: 'SLA Atrasado' },
            { pattern: /\bno prazo\b|\bdentro do sla\b|\bno sla\b/g, type: 'tag', value: 'no_prazo', label: 'No Prazo' },
            { pattern: /\breparo recente\b/g, type: 'tag', value: 'reparo_recente', label: 'Reparo Recente' },
            { pattern: /\bplaqueta divergente\b/g, type: 'tag', value: 'plaqueta_divergente', label: 'Plaqueta Divergente' },
            { pattern: /\bcom glosa\b/g, type: 'tag', value: 'com_glosa', label: 'Com Glosa' },
            { pattern: /\bauditoria pendente\b/g, type: 'tag', value: 'auditoria_pendente', label: 'Auditoria Pendente' },
            { pattern: /\bmultiplos pontos\b|\bvarios pontos\b/g, type: 'tag', value: 'multiplos_pontos', label: 'Múltiplos Pontos' },
            { pattern: /\b2 eletricistas\b/g, type: 'tag', value: 'dupla', label: '2 Eletricistas' }
        ];

        multiPhraseRules.forEach(rule => {
            remaining = remaining.replace(rule.pattern, () => {
                if (rule.type === 'status') statusCodes.push(rule.value);
                else if (rule.type === 'date') dateSpecs.push(rule.value);
                else if (rule.type === 'tag') specialTags.push({ id: rule.value, label: rule.label });
                return ' ';
            });
        });

        // 4. Inspect remaining single tokens
        const tokens = remaining.split(/\s+/).filter(Boolean);
        const remainingTokens = [];

        const singleStatusMap = {
            aberto: 'aberto', aberta: 'aberto', abertos: 'aberto', abertas: 'aberto',
            andamento: 'em_andamento', iniciado: 'em_andamento', iniciada: 'em_andamento', iniciadas: 'em_andamento',
            concluida: 'concluida', concluido: 'concluida', concluidas: 'concluida', concluidos: 'concluida',
            finalizada: 'concluida', finalizado: 'concluida', finalizadas: 'concluida',
            fechada: 'concluida', fechadas: 'concluida', fechado: 'concluida',
            bloqueada: 'bloqueada', bloqueado: 'bloqueada', bloqueadas: 'bloqueada',
            pendente: 'pendente', pendentes: 'pendente',
            cancelada: 'cancelada', cancelado: 'cancelada', canceladas: 'cancelada',
            rejeitada: 'rejeitada', rejeitado: 'rejeitada', rejeitadas: 'rejeitada',
            recusada: 'rejeitada', recusado: 'rejeitada', recusadas: 'rejeitada'
        };

        const singleDateTokens = new Set(['hoje', 'ontem', 'anteontem', '7d', '7dias', 'semana', '30d', '30dias', 'mes']);

        const singleTagMap = {
            emergencial: { id: 'emergencial', label: 'Emergencial' },
            emergenciais: { id: 'emergencial', label: 'Emergencial' },
            praca: { id: 'praca', label: 'Praça' },
            pracas: { id: 'praca', label: 'Praça' },
            viaria: { id: 'viaria', label: 'Viária' },
            viarias: { id: 'viaria', label: 'Viária' },
            atrasada: { id: 'atrasada', label: 'SLA Atrasado' },
            atrasadas: { id: 'atrasada', label: 'SLA Atrasado' },
            atraso: { id: 'atrasada', label: 'SLA Atrasado' },
            vencida: { id: 'atrasada', label: 'SLA Atrasado' },
            vencidas: { id: 'atrasada', label: 'SLA Atrasado' },
            vencendo: { id: 'vencendo', label: 'Vencendo SLA' },
            critica: { id: 'vencendo', label: 'SLA Crítico' },
            criticas: { id: 'vencendo', label: 'SLA Crítico' },
            critico: { id: 'vencendo', label: 'SLA Crítico' },
            urgente: { id: 'urgente', label: 'Prioridade Urgente' },
            duplicata: { id: 'duplicata', label: 'Duplicata' },
            duplicatas: { id: 'duplicata', label: 'Duplicata' },
            duplicidade: { id: 'duplicata', label: 'Duplicata' },
            reincidencia: { id: 'reparo_recente', label: 'Reincidência' },
            divergente: { id: 'plaqueta_divergente', label: 'Plaqueta Divergente' },
            glosa: { id: 'com_glosa', label: 'Com Glosa' },
            glosas: { id: 'com_glosa', label: 'Com Glosa' },
            dupla: { id: 'dupla', label: '2 Eletricistas' }
        };

        tokens.forEach(tok => {
            if (singleStatusMap[tok]) {
                statusCodes.push(singleStatusMap[tok]);
                return;
            }
            if (singleDateTokens.has(tok) || /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(tok) || /^\d{1,2}\/\d{4}$/.test(tok)) {
                dateSpecs.push(tok);
                return;
            }
            if (singleTagMap[tok]) {
                specialTags.push(singleTagMap[tok]);
                return;
            }
            remainingTokens.push(tok);
        });

        const uniqueStatuses = Array.from(new Set(statusCodes));
        const hasConcluida = uniqueStatuses.includes('concluida');
        const dateField = hasConcluida ? 'conclusao' : 'abertura';

        return {
            exclusions: Array.from(new Set(exclusions)),
            statusCodes: uniqueStatuses,
            dateSpecs: Array.from(new Set(dateSpecs)),
            specialTags,
            remainingTokens,
            dateField,
            hasStatusClause: uniqueStatuses.length > 0
        };
    }

    /**
     * Semantic intent detector for "Auto" mode
     */
    function detectQueryIntent(rawText, activeMode = 'auto') {
        const text = String(rawValueOr(rawText, '')).trim();
        const q = cleanStr(text);

        if (activeMode && activeMode !== 'auto' && MODES[activeMode]) {
            const modeMeta = MODES[activeMode];
            return {
                activeMode,
                detectedMode: activeMode,
                isAutoDetected: false,
                reason: `Modo fixo: ${modeMeta.label}`,
                badgeLabel: modeMeta.shortLabel,
                icon: modeMeta.icon,
                pillClass: modeMeta.pillClass,
                parsedDate: activeMode === 'data' ? parseDateQuery(text, 'abertura') : null,
                matchedStatusCodes: activeMode === 'status' ? parseStatusCodes(text) : [],
                matchedProblemCodes: activeMode === 'problema' ? parseProblemCodes(text) : [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        if (!q) {
            return {
                activeMode: 'auto',
                detectedMode: 'auto',
                isAutoDetected: false,
                reason: 'Busca inteligente automática',
                badgeLabel: 'Auto',
                icon: MODES.auto.icon,
                pillClass: MODES.auto.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // Check composite clauses first
        const comp = extractCompositeClauses(text);
        if (comp.statusCodes.length > 0 && comp.dateSpecs.length > 0) {
            const stObj = STATUS_CATALOG.find(s => s.code === comp.statusCodes[0]);
            const dtParsed = parseDateQuery(comp.dateSpecs[0], comp.dateField);
            const dateKindLabel = comp.dateField === 'conclusao' ? 'Data de conclusão' : 'Data de abertura';
            return {
                activeMode: 'auto',
                detectedMode: 'status',
                isAutoDetected: true,
                reason: `${stObj ? stObj.label : comp.statusCodes[0]} + ${dateKindLabel}: ${dtParsed ? dtParsed.label : comp.dateSpecs[0]}${comp.remainingTokens.length ? ` + "${comp.remainingTokens.join(' ')}"` : ''}`,
                badgeLabel: 'Auto → Status + Data',
                icon: 'event_available',
                pillClass: MODES.status.pillClass,
                parsedDate: dtParsed,
                matchedStatusCodes: comp.statusCodes,
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        if (comp.exclusions.length > 0 && (comp.statusCodes.length > 0 || comp.dateSpecs.length > 0 || comp.specialTags.length > 0 || comp.remainingTokens.length > 0)) {
            return {
                activeMode: 'auto',
                detectedMode: 'auto',
                isAutoDetected: true,
                reason: `Filtrando com exclusão: exceto ${comp.exclusions.map(e => `"${e}"`).join(', ')}`,
                badgeLabel: 'Auto → c/ Exclusão',
                icon: 'rule',
                pillClass: MODES.auto.pillClass,
                parsedDate: comp.dateSpecs[0] ? parseDateQuery(comp.dateSpecs[0], comp.dateField) : null,
                matchedStatusCodes: comp.statusCodes,
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        if (comp.specialTags.length > 0 && comp.remainingTokens.length === 0 && comp.statusCodes.length === 0 && comp.dateSpecs.length === 0) {
            const tag = comp.specialTags[0];
            const isSla = ['atrasada', 'vencendo', 'no_prazo'].includes(tag.id);
            return {
                activeMode: 'auto',
                detectedMode: isSla ? 'data' : 'auto',
                isAutoDetected: true,
                reason: `Filtro operacional: ${comp.specialTags.map(t => t.label).join(' + ')}`,
                badgeLabel: `Auto → ${tag.label}`,
                icon: isSla ? 'timer' : (tag.id === 'emergencial' ? 'electric_bolt' : 'auto_awesome'),
                pillClass: isSla ? MODES.data.pillClass : (tag.id === 'emergencial' ? MODES.problema.pillClass : MODES.auto.pillClass),
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 1. Standalone Date intent
        const parsedDate = parseDateQuery(text, 'abertura');
        if (parsedDate) {
            return {
                activeMode: 'auto',
                detectedMode: 'data',
                isAutoDetected: true,
                reason: `Data detectada: ${parsedDate.label}`,
                badgeLabel: 'Auto → Data',
                icon: MODES.data.icon,
                pillClass: MODES.data.pillClass,
                parsedDate,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 2. Protocol prefix pattern
        if (/^(p|i)[-/\s]?\d+/i.test(q) || /^\d{4}\/\d+/.test(q) || q === 'p' || q === 'i') {
            return {
                activeMode: 'auto',
                detectedMode: 'protocolo',
                isAutoDetected: true,
                reason: 'Padrão de Protocolo detectado',
                badgeLabel: 'Auto → Protocolo',
                icon: MODES.protocolo.icon,
                pillClass: MODES.protocolo.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 3. Status exact/strong keyword
        const statusCodes = parseStatusCodes(text);
        const exactStatusHit = STATUS_CATALOG.some(s => s.aliases.includes(q) || cleanStr(s.label) === q);
        if (statusCodes.length > 0 && (exactStatusHit || q.length >= 4)) {
            return {
                activeMode: 'auto',
                detectedMode: 'status',
                isAutoDetected: true,
                reason: 'Status detectado',
                badgeLabel: 'Auto → Status',
                icon: MODES.status.icon,
                pillClass: MODES.status.pillClass,
                parsedDate: null,
                matchedStatusCodes: statusCodes,
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 4. Problem keyword
        const problemCodes = parseProblemCodes(text);
        const exactProblemHit = PROBLEM_CATALOG.some(p => p.aliases.some(a => a === q || (q.length >= 4 && a.includes(q))));
        if (problemCodes.length > 0 && exactProblemHit) {
            return {
                activeMode: 'auto',
                detectedMode: 'problema',
                isAutoDetected: true,
                reason: 'Problema detectado',
                badgeLabel: 'Auto → Problema',
                icon: MODES.problema.icon,
                pillClass: MODES.problema.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: problemCodes,
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 5. Coordinate or explicit street/place prefix
        const isCoord = /^-?\d{1,2}\.\d+/.test(q);
        const isAddressPrefix = ADDRESS_PREFIXES.some(pref => q.startsWith(pref + ' ') || q === pref.trim());
        if (isCoord || isAddressPrefix) {
            return {
                activeMode: 'auto',
                detectedMode: 'endereco',
                isAutoDetected: true,
                reason: isCoord ? 'Coordenada detectada' : 'Logradouro/Praça detectado',
                badgeLabel: 'Auto → Endereço',
                icon: MODES.endereco.icon,
                pillClass: MODES.endereco.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        // 6. Pure digits (could be Protocolo or Plaqueta)
        if (/^\d{2,}$/.test(q)) {
            return {
                activeMode: 'auto',
                detectedMode: 'protocolo',
                isAutoDetected: true,
                reason: 'Código numérico (Protocolo ou Plaqueta)',
                badgeLabel: 'Auto → Prot./Plaq.',
                icon: MODES.protocolo.icon,
                pillClass: MODES.protocolo.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: true
            };
        }

        // 7. Multi-token general search
        const tokens = q.split(/\s+/).filter(Boolean);
        if (tokens.length > 1) {
            return {
                activeMode: 'auto',
                detectedMode: 'auto',
                isAutoDetected: true,
                reason: `Busca combinada (${tokens.length} termos)`,
                badgeLabel: `Auto (${tokens.length} termos)`,
                icon: MODES.auto.icon,
                pillClass: MODES.auto.pillClass,
                parsedDate: null,
                matchedStatusCodes: [],
                matchedProblemCodes: [],
                isAmbiguousProtocolOrPlaqueta: false
            };
        }

        return {
            activeMode: 'auto',
            detectedMode: 'auto',
            isAutoDetected: true,
            reason: 'Busca em todos os campos',
            badgeLabel: 'Auto → Geral',
            icon: MODES.auto.icon,
            pillClass: MODES.auto.pillClass,
            parsedDate: null,
            matchedStatusCodes: [],
            matchedProblemCodes: [],
            isAmbiguousProtocolOrPlaqueta: false
        };
    }

    function getProblemDisplayLabel(item) {
        const map = {
            'lampada-queimada': 'Lâmpada Queimada',
            'acesa-dia': 'Acesa Dia',
            'lampada-quebrada': 'Lâmpada Quebrada',
            'outro': 'Outro'
        };
        return map[item.problemSelectValue] || item.problemaInicial || 'Outro';
    }

    function getFullFormattedDate(dateObj) {
        if (!dateObj) return '';
        const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
        if (isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    function matchesSpecialTag(item, tagId, highlights) {
        const slaInfo = (typeof item.calcularSLA === 'function') ? item.calcularSLA() : null;
        const prioNorm = cleanStr(item.prioridade || '');
        const motivoNorm = cleanStr(item.motivoAprovacao || '');

        switch (tagId) {
            case 'emergencial':
                if (item.isDireto) {
                    highlights.protocolo.push('Emergencial');
                    return true;
                }
                return false;
            case 'praca':
                return Boolean(item.isPraca);
            case 'viaria':
                return !item.isPraca;
            case 'atrasada':
                if (slaInfo && (slaInfo.statusSla === 'atrasado' || (slaInfo.label && cleanStr(slaInfo.label).includes('atras')))) {
                    highlights.sla.push('atrasada', 'atrasado', 'atraso');
                    return true;
                }
                return false;
            case 'vencendo':
                if (slaInfo && (slaInfo.statusSla === 'critico' || slaInfo.statusSla === 'amarelo')) {
                    highlights.sla.push('Vence em');
                    return true;
                }
                return false;
            case 'no_prazo':
                if (slaInfo && slaInfo.statusSla !== 'atrasado' && (!slaInfo.label || !cleanStr(slaInfo.label).includes('atras'))) {
                    highlights.sla.push('No SLA', 'restantes');
                    return true;
                }
                return false;
            case 'urgente':
                return prioNorm.includes('urg') || prioNorm.includes('emerg') || prioNorm.includes('crit');
            case 'duplicata':
                return motivoNorm.includes('duplicat') || motivoNorm.includes('duplicid');
            case 'reparo_recente':
                return motivoNorm.includes('reparo recente') || motivoNorm.includes('reincid');
            case 'plaqueta_divergente':
                return Boolean(item.anexoPlaquetaDivergente);
            case 'com_glosa':
                return Array.isArray(item.glosas) && item.glosas.length > 0;
            case 'auditoria_pendente':
                return cleanStr(item.statusAuditoria) === 'pendente';
            case 'multiplos_pontos':
                return (Array.isArray(item.addressPointsIniciais) && item.addressPointsIniciais.length > 1) || (Number(item.qtdInicial || 1) > 1);
            case 'dupla':
                return Number(item.qtdEletricistas || 1) >= 2;
            default:
                return false;
        }
    }

    function matchSingleTokenAllFields(item, token, fmt, highlights) {
        const protStr = fmt(item.protocolo);
        const protClean = cleanStr(protStr);
        const plaqIni = fmt(item.plaquetaInicial);
        const plaqFin = fmt(item.plaquetaFinal);
        const addrStr = fmt(item.endereco);
        const pracaStr = fmt(item.pracaNome);
        const ptsList = Array.isArray(item.addressPointsIniciais) ? item.addressPointsIniciais.map(p => fmt(p)) : [];
        const coordIni = fmt(item.coordenadaInicial);
        const coordRep = fmt(item.coordenadaReparo);
        const probIni = fmt(item.problemaInicial);
        const probEnc = fmt(item.problemaEncontrado);
        const probLabel = getProblemDisplayLabel(item);
        const dateShort = item.formattedDateShort || '';
        const dateFull = getFullFormattedDate(item.dataAbertura);
        const dateConcShort = item.formattedDateConclusaoShort || '';
        const dateConcFull = getFullFormattedDate(item.dataConclusao);
        const statusLabel = item.statusBadgeLabel || '';
        const statusNorm = item.normalizedStatus || '';
        const statusRaw = item.rawStatus || '';
        const municipe = fmt(item.municipeNome);
        const opAbert = item.operadorAbertura || '';
        const opFin = item.operadorFinalizacao || '';
        const motivo = item.motivoAprovacao || '';
        const prio = item.prioridade || '';
        const slaInfo = (typeof item.calcularSLA === 'function') ? item.calcularSLA() : null;
        const slaLabel = slaInfo && slaInfo.label ? slaInfo.label : '';

        let tokenMatched = false;
        let score = 0;

        if (protClean.includes(token)) {
            tokenMatched = true;
            score += protClean === token ? 100 : (protClean.startsWith(token) ? 75 : 55);
            highlights.protocolo.push(token);
        }
        if (cleanStr(plaqIni).includes(token) || cleanStr(plaqFin).includes(token)) {
            tokenMatched = true;
            score += 65;
            highlights.endereco.push(token);
        }
        if (
            cleanStr(addrStr).includes(token) ||
            cleanStr(pracaStr).includes(token) ||
            ptsList.some(pt => cleanStr(pt).includes(token)) ||
            cleanStr(coordIni).includes(token) ||
            cleanStr(coordRep).includes(token)
        ) {
            tokenMatched = true;
            score += 55;
            highlights.endereco.push(token);
        }
        if (
            cleanStr(probIni).includes(token) ||
            cleanStr(probEnc).includes(token) ||
            cleanStr(probLabel).includes(token) ||
            (token.length >= 4 && parseProblemCodes(token).includes(item.problemSelectValue))
        ) {
            tokenMatched = true;
            score += 50;
            highlights.problema.push(token);
        }
        if (
            cleanStr(dateShort).includes(token) ||
            cleanStr(dateFull).includes(token) ||
            cleanStr(dateConcShort).includes(token) ||
            cleanStr(dateConcFull).includes(token) ||
            cleanStr(slaLabel).includes(token)
        ) {
            tokenMatched = true;
            score += 45;
            highlights.data.push(token);
            if (cleanStr(slaLabel).includes(token)) highlights.sla.push(token);
        }
        if (
            cleanStr(statusLabel).includes(token) ||
            cleanStr(statusNorm.replace('_', ' ')).includes(token) ||
            cleanStr(statusRaw).includes(token) ||
            (token.length >= 4 && parseStatusCodes(token).includes(statusNorm))
        ) {
            tokenMatched = true;
            score += 45;
            highlights.status.push(token);
        }
        if (
            cleanStr(opAbert).includes(token) ||
            cleanStr(opFin).includes(token) ||
            cleanStr(municipe).includes(token) ||
            cleanStr(motivo).includes(token) ||
            cleanStr(prio).includes(token)
        ) {
            tokenMatched = true;
            score += 40;
            if (cleanStr(opFin).includes(token) || cleanStr(opAbert).includes(token)) {
                highlights.tecnico.push(token);
            }
        }

        return { matched: tokenMatched, score };
    }

    /**
     * Evaluates a single criterion ({ mode, value }) against a ChamadoModel item.
     */
    function evaluateCriterion(item, mode, rawValue, fmt) {
        const val = String(rawValue || '').trim();
        if (!val) return { matched: true, score: 0, matchedFields: [], highlightTermsByField: {} };

        const q = cleanStr(val);
        const protStr = fmt(item.protocolo);
        const protClean = cleanStr(protStr);
        const plaqIni = fmt(item.plaquetaInicial);
        const plaqFin = fmt(item.plaquetaFinal);
        const addrStr = fmt(item.endereco);
        const pracaStr = fmt(item.pracaNome);
        const ptsList = Array.isArray(item.addressPointsIniciais) ? item.addressPointsIniciais.map(p => fmt(p)) : [];
        const coordIni = fmt(item.coordenadaInicial);
        const coordRep = fmt(item.coordenadaReparo);
        const probIni = fmt(item.problemaInicial);
        const probEnc = fmt(item.problemaEncontrado);
        const probLabel = getProblemDisplayLabel(item);
        const dateShort = item.formattedDateShort || '';
        const dateFull = getFullFormattedDate(item.dataAbertura);
        const statusLabel = item.statusBadgeLabel || '';
        const statusNorm = item.normalizedStatus || '';
        const statusRaw = item.rawStatus || '';
        const opAbert = item.operadorAbertura || '';
        const opFin = item.operadorFinalizacao || '';
        const userEmail = item.userEmail || '';

        const slaInfo = (typeof item.calcularSLA === 'function') ? item.calcularSLA() : null;
        const slaLabel = slaInfo && slaInfo.label ? slaInfo.label : '';

        const highlights = {
            protocolo: [],
            data: [],
            sla: [],
            endereco: [],
            problema: [],
            status: [],
            tecnico: []
        };
        const matchedFields = [];
        let score = 0;

        if (mode === 'protocolo') {
            if (protClean === q) {
                score = 100;
                matchedFields.push('protocolo');
                highlights.protocolo.push(val);
            } else if (protClean.startsWith(q)) {
                score = 80;
                matchedFields.push('protocolo');
                highlights.protocolo.push(val);
            } else if (protClean.includes(q)) {
                score = 60;
                matchedFields.push('protocolo');
                highlights.protocolo.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'plaqueta') {
            if (cleanStr(plaqIni).includes(q) || cleanStr(plaqFin).includes(q)) {
                score = (cleanStr(plaqIni) === q || cleanStr(plaqFin) === q) ? 95 : 70;
                matchedFields.push('plaqueta');
                highlights.endereco.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'endereco') {
            const addrHit = cleanStr(addrStr).includes(q) ||
                cleanStr(pracaStr).includes(q) ||
                ptsList.some(pt => cleanStr(pt).includes(q)) ||
                cleanStr(coordIni).includes(q) ||
                cleanStr(coordRep).includes(q);
            if (addrHit) {
                score = cleanStr(pracaStr).startsWith(q) || cleanStr(addrStr).startsWith(q) ? 80 : 60;
                matchedFields.push('endereco');
                highlights.endereco.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'problema') {
            const probCodes = parseProblemCodes(val);
            const codeMatch = probCodes.length > 0 && probCodes.includes(item.problemSelectValue);
            const textMatch = cleanStr(probIni).includes(q) ||
                cleanStr(probEnc).includes(q) ||
                cleanStr(probLabel).includes(q);
            if (codeMatch || textMatch) {
                score = 75;
                matchedFields.push('problema');
                highlights.problema.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'data') {
            const parsedDate = parseDateQuery(val, 'abertura');
            if (parsedDate) {
                if (parsedDate.predicate(item)) {
                    score = 80;
                    matchedFields.push('data');
                    if (parsedDate.isSlaQuery) {
                        highlights.sla.push(...(parsedDate.highlightDateTerms || []));
                    } else if (parsedDate.highlightDateTerms && parsedDate.highlightDateTerms.length > 0) {
                        highlights.data.push(...parsedDate.highlightDateTerms);
                    } else if (dateShort) {
                        highlights.data.push(dateShort);
                    }
                }
            } else if (cleanStr(dateShort).includes(q) || cleanStr(dateFull).includes(q) || cleanStr(slaLabel).includes(q)) {
                score = 60;
                matchedFields.push('data');
                highlights.data.push(val);
                if (cleanStr(slaLabel).includes(q)) highlights.sla.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'status') {
            const statusCodes = parseStatusCodes(val);
            const codeMatch = statusCodes.length > 0 && statusCodes.includes(statusNorm);
            const textMatch = cleanStr(statusLabel).includes(q) ||
                cleanStr(statusNorm.replace('_', ' ')).includes(q) ||
                cleanStr(statusRaw).includes(q);
            if (codeMatch || textMatch) {
                score = 80;
                matchedFields.push('status');
                highlights.status.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        if (mode === 'tecnico') {
            if (
                cleanStr(opFin).includes(q) ||
                cleanStr(opAbert).includes(q) ||
                cleanStr(userEmail).includes(q)
            ) {
                score = cleanStr(opFin).includes(q) ? 85 : 70;
                matchedFields.push('tecnico');
                highlights.tecnico.push(val);
            }
            return { matched: matchedFields.length > 0, score, matchedFields, highlightTermsByField: highlights };
        }

        // Mode === 'auto' -> Composite semantic + multi-token + exclusions
        const comp = extractCompositeClauses(val);
        const hasAnyComposite = comp.statusCodes.length > 0 || comp.dateSpecs.length > 0 || comp.specialTags.length > 0 || comp.exclusions.length > 0;

        if (hasAnyComposite) {
            let totalScore = 0;

            // 1. Check status clauses
            if (comp.statusCodes.length > 0) {
                if (!comp.statusCodes.includes(statusNorm)) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                totalScore += 55;
                matchedFields.push('status');
                if (statusLabel) highlights.status.push(statusLabel);
            }

            // 2. Check date clauses (respecting dateField: 'conclusao' vs 'abertura')
            for (const ds of comp.dateSpecs) {
                const parsedDate = parseDateQuery(ds, comp.dateField);
                if (!parsedDate || !parsedDate.predicate(item)) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                totalScore += 55;
                matchedFields.push('data');
                if (parsedDate.isSlaQuery) {
                    highlights.sla.push(...(parsedDate.highlightDateTerms || []));
                } else if (parsedDate.highlightDateTerms?.length) {
                    highlights.data.push(...parsedDate.highlightDateTerms);
                }
            }

            // 3. Check operational / SLA / audit special tags
            for (const tag of comp.specialTags) {
                if (!matchesSpecialTag(item, tag.id, highlights)) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                totalScore += 50;
                matchedFields.push(tag.id);
            }

            // 4. Check exclusions (-praca, -concluida, -outro, etc.)
            for (const excl of comp.exclusions) {
                const exclComp = extractCompositeClauses(excl);
                if (exclComp.statusCodes.length > 0 && exclComp.statusCodes.includes(statusNorm)) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                if (exclComp.specialTags.length > 0 && exclComp.specialTags.some(t => matchesSpecialTag(item, t.id, { protocolo: [], sla: [] }))) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                const dummyHl = { protocolo: [], data: [], sla: [], endereco: [], problema: [], status: [], tecnico: [] };
                const hitExcl = matchSingleTokenAllFields(item, excl, fmt, dummyHl);
                if (hitExcl.matched) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
            }

            // 5. Check remaining positive tokens (AND)
            for (const token of comp.remainingTokens) {
                const tokRes = matchSingleTokenAllFields(item, token, fmt, highlights);
                if (!tokRes.matched) {
                    return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
                }
                totalScore += tokRes.score;
            }

            return {
                matched: true,
                score: totalScore || 60,
                matchedFields: Array.from(new Set(matchedFields)),
                highlightTermsByField: highlights
            };
        }

        // Standard multi-token AND search
        const tokens = q.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return { matched: true, score: 0, matchedFields: [], highlightTermsByField: highlights };

        let totalScore = 0;
        for (const token of tokens) {
            const tokRes = matchSingleTokenAllFields(item, token, fmt, highlights);
            if (!tokRes.matched) {
                return { matched: false, score: 0, matchedFields: [], highlightTermsByField: highlights };
            }
            totalScore += tokRes.score;
        }

        if (tokens.length > 1) {
            const statusCodes = parseStatusCodes(val);
            if (statusCodes.length > 0 && statusCodes.includes(statusNorm)) {
                totalScore += 30;
                highlights.status.push(val);
            }
            const probCodes = parseProblemCodes(val);
            if (probCodes.length > 0 && probCodes.includes(item.problemSelectValue)) {
                totalScore += 30;
                highlights.problema.push(val);
            }
        }

        return {
            matched: true,
            score: totalScore,
            matchedFields: Array.from(new Set(matchedFields)),
            highlightTermsByField: highlights
        };
    }

    /**
     * Evaluates full smart search state (chips[] + liveText + activeMode) against a ChamadoModel item.
     */
    function matchItem(item, smartState = {}) {
        const chips = Array.isArray(smartState.chips) ? smartState.chips : [];
        const liveText = String(smartState.liveText || '').trim();
        const activeMode = smartState.activeMode || 'auto';
        const fmt = (window.ChamadoModel && typeof window.ChamadoModel.formatLocationText === 'function')
            ? window.ChamadoModel.formatLocationText
            : (v => String(v || ''));

        const mergedHighlights = {
            protocolo: [],
            data: [],
            sla: [],
            endereco: [],
            problema: [],
            status: [],
            tecnico: []
        };
        const allMatchedFields = [];
        let totalScore = 0;

        for (const chip of chips) {
            const res = evaluateCriterion(item, chip.mode, chip.value, fmt);
            if (!res.matched) {
                return { matched: false, score: 0, matchedFields: [], highlightTermsByField: mergedHighlights };
            }
            totalScore += res.score;
            allMatchedFields.push(...res.matchedFields);
            Object.keys(mergedHighlights).forEach(k => {
                if (res.highlightTermsByField[k]?.length) {
                    mergedHighlights[k].push(...res.highlightTermsByField[k]);
                }
            });
        }

        if (liveText) {
            const resLive = evaluateCriterion(item, activeMode, liveText, fmt);
            if (!resLive.matched) {
                return { matched: false, score: 0, matchedFields: [], highlightTermsByField: mergedHighlights };
            }
            totalScore += resLive.score;
            allMatchedFields.push(...resLive.matchedFields);
            Object.keys(mergedHighlights).forEach(k => {
                if (resLive.highlightTermsByField[k]?.length) {
                    mergedHighlights[k].push(...resLive.highlightTermsByField[k]);
                }
            });
        }

        return {
            matched: true,
            score: totalScore,
            matchedFields: Array.from(new Set(allMatchedFields)),
            highlightTermsByField: mergedHighlights
        };
    }

    /**
     * Builds intelligent live autocomplete suggestions directly from in-memory chamadosList (0 egress!)
     */
    function buildSuggestions(chamadosList = [], liveText = '', activeMode = 'auto', chips = [], isManutentor = false) {
        const list = Array.isArray(chamadosList) ? chamadosList : [];
        const q = cleanStr(liveText);
        const fmt = (window.ChamadoModel && typeof window.ChamadoModel.formatLocationText === 'function')
            ? window.ChamadoModel.formatLocationText
            : (v => String(v || ''));

        const suggestions = [];
        const hasChip = (mode, val) => chips.some(c => c.mode === mode && cleanStr(c.value) === cleanStr(val));

        const statusCounts = {};
        const problemCounts = {};
        const techCounts = new Map();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const weekAgo = new Date(todayStart);
        weekAgo.setDate(weekAgo.getDate() - 7);
        let hojeCount = 0;
        let semanaCount = 0;
        let atrasadasCount = 0;
        let concluidasHojeCount = 0;

        list.forEach(item => {
            const st = item.normalizedStatus || 'aberto';
            statusCounts[st] = (statusCounts[st] || 0) + 1;

            const pb = item.problemSelectValue || 'outro';
            problemCounts[pb] = (problemCounts[pb] || 0) + 1;

            if (item.dataAbertura) {
                const d = item.dataAbertura instanceof Date ? item.dataAbertura : new Date(item.dataAbertura);
                if (!isNaN(d.getTime())) {
                    if (d >= todayStart && d <= todayEnd) hojeCount++;
                    if (d >= weekAgo && d <= todayEnd) semanaCount++;
                }
            }
            if (st === 'concluida' && item.dataConclusao) {
                const dc = item.dataConclusao instanceof Date ? item.dataConclusao : new Date(item.dataConclusao);
                if (!isNaN(dc.getTime()) && dc >= todayStart && dc <= todayEnd) {
                    concluidasHojeCount++;
                }
            }
            if (typeof item.calcularSLA === 'function') {
                const sla = item.calcularSLA();
                if (sla && sla.statusSla === 'atrasado') atrasadasCount++;
            }

            const opName = String(item.operadorFinalizacao || item.operadorAbertura || '').trim();
            if (opName && opName.length >= 2) {
                const opKey = cleanStr(opName);
                if (!techCounts.has(opKey)) {
                    techCounts.set(opKey, { display: opName, count: 1 });
                } else {
                    techCounts.get(opKey).count++;
                }
            }
        });

        // Empty query -> Quick Smart Suggestions
        if (!q) {
            if (activeMode === 'auto') {
                if (concluidasHojeCount > 0 && !hasChip('auto', 'concluidas hoje')) {
                    suggestions.push({
                        type: 'chip',
                        mode: 'auto',
                        value: 'concluidas hoje',
                        label: 'Concluídas hoje',
                        sublabel: `${concluidasHojeCount} OS`,
                        icon: 'task_alt'
                    });
                }
            }
            if (activeMode === 'auto' || activeMode === 'status') {
                STATUS_CATALOG.forEach(s => {
                    if (isManutentor && (s.code === 'pendente' || s.code === 'bloqueada')) return;
                    const count = statusCounts[s.code] || 0;
                    if (count > 0 && !hasChip('status', s.label)) {
                        suggestions.push({
                            type: 'chip',
                            mode: 'status',
                            value: s.label,
                            label: s.label,
                            sublabel: `${count} OS`,
                            icon: MODES.status.icon
                        });
                    }
                });
            }
            if (activeMode === 'auto' || activeMode === 'problema') {
                PROBLEM_CATALOG.forEach(p => {
                    const count = problemCounts[p.code] || 0;
                    if (count > 0 && !hasChip('problema', p.label)) {
                        suggestions.push({
                            type: 'chip',
                            mode: 'problema',
                            value: p.label,
                            label: p.label,
                            sublabel: `${count} OS`,
                            icon: MODES.problema.icon
                        });
                    }
                });
            }
            if (activeMode === 'auto' || activeMode === 'data') {
                if (!hasChip('data', 'hoje')) {
                    suggestions.push({ type: 'chip', mode: 'data', value: 'hoje', label: 'Abertas hoje', sublabel: `${hojeCount} OS`, icon: MODES.data.icon });
                }
                if (!hasChip('data', '7d')) {
                    suggestions.push({ type: 'chip', mode: 'data', value: '7d', label: 'Últimos 7 dias', sublabel: `${semanaCount} OS`, icon: MODES.data.icon });
                }
                if (atrasadasCount > 0 && !hasChip('data', 'atrasada')) {
                    suggestions.push({ type: 'chip', mode: 'data', value: 'atrasada', label: 'SLA Atrasado', sublabel: `${atrasadasCount} OS`, icon: 'warning' });
                }
            }
            if (activeMode === 'tecnico') {
                Array.from(techCounts.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 6)
                    .forEach(t => {
                        if (!hasChip('tecnico', t.display)) {
                            suggestions.push({
                                type: 'chip',
                                mode: 'tecnico',
                                value: t.display,
                                label: t.display,
                                sublabel: `${t.count} OS`,
                                icon: MODES.tecnico.icon
                            });
                        }
                    });
            }
            if (activeMode === 'protocolo') {
                suggestions.push({ type: 'chip', mode: 'protocolo', value: 'P', label: 'Somente Praça (P)', sublabel: 'Prefixo P', icon: 'park' });
                suggestions.push({ type: 'chip', mode: 'protocolo', value: 'I', label: 'Somente Viária (I)', sublabel: 'Prefixo I', icon: 'alt_route' });
            }
            return suggestions.slice(0, 8);
        }

        // Composite suggestion (e.g. "concluidas hoje")
        const comp = extractCompositeClauses(liveText);
        if (activeMode === 'auto' && (comp.statusCodes.length > 0 && comp.dateSpecs.length > 0)) {
            const count = list.filter(it => evaluateCriterion(it, 'auto', liveText, fmt).matched).length;
            suggestions.push({
                type: 'chip',
                mode: 'auto',
                value: liveText.trim(),
                label: liveText.trim(),
                sublabel: `${count} OS`,
                icon: 'event_available'
            });
        }

        if (activeMode === 'auto' || activeMode === 'status') {
            STATUS_CATALOG.forEach(s => {
                if (isManutentor && (s.code === 'pendente' || s.code === 'bloqueada')) return;
                const hit = cleanStr(s.label).includes(q) || s.aliases.some(a => a.includes(q));
                if (hit && !hasChip('status', s.label)) {
                    suggestions.push({
                        type: 'chip',
                        mode: 'status',
                        value: s.label,
                        label: s.label,
                        sublabel: `${statusCounts[s.code] || 0} OS`,
                        icon: MODES.status.icon
                    });
                }
            });
        }

        if (activeMode === 'auto' || activeMode === 'problema') {
            PROBLEM_CATALOG.forEach(p => {
                const hit = cleanStr(p.label).includes(q) || p.aliases.some(a => a.includes(q));
                if (hit && !hasChip('problema', p.label)) {
                    suggestions.push({
                        type: 'chip',
                        mode: 'problema',
                        value: p.label,
                        label: p.label,
                        sublabel: `${problemCounts[p.code] || 0} OS`,
                        icon: MODES.problema.icon
                    });
                }
            });
        }

        if (activeMode === 'auto' || activeMode === 'data') {
            const parsedDate = parseDateQuery(liveText, 'abertura');
            if (parsedDate && !hasChip('data', liveText)) {
                const count = list.filter(it => parsedDate.predicate(it)).length;
                suggestions.push({
                    type: 'chip',
                    mode: 'data',
                    value: liveText.trim(),
                    label: parsedDate.label,
                    sublabel: `${count} OS`,
                    icon: MODES.data.icon
                });
            }
        }

        if (activeMode === 'auto' || activeMode === 'tecnico') {
            Array.from(techCounts.values())
                .filter(t => cleanStr(t.display).includes(q))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .forEach(t => {
                    if (!hasChip('tecnico', t.display)) {
                        suggestions.push({
                            type: 'chip',
                            mode: 'tecnico',
                            value: t.display,
                            label: t.display,
                            sublabel: `${t.count} OS`,
                            icon: MODES.tecnico.icon
                        });
                    }
                });
        }

        if (activeMode === 'auto' || activeMode === 'protocolo') {
            let protAdded = 0;
            for (const item of list) {
                if (protAdded >= 4) break;
                const prot = fmt(item.protocolo);
                if (cleanStr(prot).includes(q) && !hasChip('protocolo', prot)) {
                    const addrPreview = item.isPraca
                        ? (item.pracaNome || fmt(item.endereco) || '')
                        : ((item.addressPointsIniciais && item.addressPointsIniciais[0]) || fmt(item.endereco) || '');
                    suggestions.push({
                        type: 'chip',
                        mode: 'protocolo',
                        value: prot,
                        label: prot,
                        sublabel: `${item.statusBadgeLabel}${addrPreview ? ' • ' + addrPreview.slice(0, 32) : ''}`,
                        icon: MODES.protocolo.icon
                    });
                    protAdded++;
                }
            }
        }

        if (activeMode === 'auto' || activeMode === 'plaqueta') {
            const seenPlaq = new Set();
            for (const item of list) {
                if (seenPlaq.size >= 3) break;
                const p1 = fmt(item.plaquetaInicial);
                const p2 = fmt(item.plaquetaFinal);
                [p1, p2].forEach(pl => {
                    if (pl && pl !== 'Não informada' && cleanStr(pl).includes(q) && !seenPlaq.has(pl) && !hasChip('plaqueta', pl)) {
                        seenPlaq.add(pl);
                        suggestions.push({
                            type: 'chip',
                            mode: 'plaqueta',
                            value: pl,
                            label: `Plaqueta ${pl}`,
                            sublabel: `${item.protocolo} • ${item.statusBadgeLabel}`,
                            icon: MODES.plaqueta.icon
                        });
                    }
                });
            }
        }

        if (activeMode === 'auto' || activeMode === 'endereco') {
            const addrMap = new Map();
            list.forEach(item => {
                const candidates = [];
                if (item.pracaNome) candidates.push(fmt(item.pracaNome));
                if (item.endereco) candidates.push(fmt(item.endereco).split('\n')[0]);
                if (Array.isArray(item.addressPointsIniciais)) {
                    item.addressPointsIniciais.forEach(pt => {
                        const cleanPt = String(pt || '').split(' | ')[0].trim();
                        if (cleanPt && !cleanPt.startsWith('Plaqueta:') && !cleanPt.startsWith('Coord:')) {
                            candidates.push(cleanPt);
                        }
                    });
                }
                candidates.forEach(cand => {
                    const cNorm = cleanStr(cand);
                    if (cNorm && cNorm.includes(q)) {
                        if (!addrMap.has(cNorm)) {
                            addrMap.set(cNorm, { display: cand, count: 1 });
                        } else {
                            addrMap.get(cNorm).count++;
                        }
                    }
                });
            });

            Array.from(addrMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 4)
                .forEach(entry => {
                    if (!hasChip('endereco', entry.display)) {
                        suggestions.push({
                            type: 'chip',
                            mode: 'endereco',
                            value: entry.display,
                            label: entry.display,
                            sublabel: `${entry.count} OS`,
                            icon: MODES.endereco.icon
                        });
                    }
                });
        }

        return suggestions.slice(0, 8);
    }

    window.SmartSearchEngine = {
        MODES,
        STATUS_CATALOG,
        PROBLEM_CATALOG,
        cleanStr,
        escapeHtml,
        highlightText,
        consumePrefixTrigger,
        parseStatusCodes,
        parseProblemCodes,
        parseDateQuery,
        extractCompositeClauses,
        detectQueryIntent,
        matchItem,
        buildSuggestions
    };
})();
