/**
 * Domain Layer - Chamado Entity & Mapper
 * Encapsulates Work Order (Chamado/OS) data structure and formatting methods.
 */

class ChamadoModel {
    constructor(data = {}) {
        this.id = data.id || '';
        this.protocolo = data.protocolo || 'N/A';
        this.dataAbertura = data.data_abertura ? new Date(data.data_abertura) : new Date();
        this.rawStatus = data.status || 'Aberta';
        this.prioridade = data.prioridade || 'Normal';
        this.operador = data.operador || '';
        this.municipeNome = data.municipe_nome || '';
        this.rawPontos = data.pontos || null;
        let endExtraido = data.endereco || '';
        let plaqExtraida = data.plaqueta_inicial || data.plaqueta || '';
        let coordExtraida = data.coordenada_inicial || data.coordenada || '';

        if (!endExtraido && data.pontos) {
            let pts = [];
            if (Array.isArray(data.pontos)) pts = data.pontos;
            else if (typeof data.pontos === 'string') {
                try { pts = JSON.parse(data.pontos); } catch(e) {}
            }
            if (pts && pts.length > 0) {
                const p0 = pts[0] || {};
                const listaEnderecos = pts.map(p => p.endereco || p.local || '').filter(Boolean);
                if (listaEnderecos.length > 0) endExtraido = listaEnderecos.join('\n');
                else if (p0.endereco) endExtraido = p0.endereco;
                
                if (!plaqExtraida) plaqExtraida = p0.plaqueta || p0.plaqueta_inicial || '';
                if (!coordExtraida) coordExtraida = p0.coordenada || p0.coordenada_inicial || '';
            }
        }
        if (!endExtraido && data.praca_nome) {
            endExtraido = data.praca_nome + (data.endereco ? (' - ' + data.endereco) : '');
        }

        this.plaquetaInicial = plaqExtraida;
        this.plaquetaFinal = data.plaqueta_final || (data.pontos && Array.isArray(data.pontos) && data.pontos[0]?.plaqueta) || '';
        this.problemaInicial = data.problema_inicial || 'Lâmpada queimada';
        this.problemaEncontrado = data.problema_encontrado || (data.pontos && Array.isArray(data.pontos) && data.pontos[0]?.problema) || '';
        this.qtdInicial = parseInt(data.qtd_inicial, 10) || (data.quantidade ? parseInt(data.quantidade, 10) : 1);
        this.qtdFinal = parseInt(data.qtd_final, 10) || (data.quantidade ? parseInt(data.quantidade, 10) : 1);
        this.endereco = endExtraido;
        this.coordenadaInicial = coordExtraida;
        let coordRep = data.coordenada_reparo || '';
        if (!coordRep && data.pontos && Array.isArray(data.pontos) && data.pontos[0]) {
            coordRep = data.pontos[0].coordenada || (data.pontos[0].lat && data.pontos[0].lng ? `${data.pontos[0].lat}, ${data.pontos[0].lng}` : '');
        }
        this.coordenadaReparo = coordRep;
        this.observacaoInicial = data.observacao_inicial || '';
        this.dataConclusao = data.data_conclusao || data.data_fechamento ? new Date(data.data_conclusao || data.data_fechamento) : null;
        this.observacaoFinal = data.observacao_final || data.descricao || '';
        this.anexoPlaquetaDivergente = data.anexo_plaqueta_divergente === true || data.anexo_plaqueta_divergente === 'true';
        this.anexoFaltante = data.anexo_faltante === true || data.anexo_faltante === 'true';
        this.materialUtilizado = data.material_utilizado || data.materiais || '';
        this.statusAuditoria = data.status_auditoria || (data.auditoria_concluida === true ? 'Concluída' : 'Pendente');
        this.dataConclusaoAuditoria = data.data_conclusao_auditoria ? new Date(data.data_conclusao_auditoria) : null;
        this.audit = data.audit || null;
        this.cpfSolicitante = data.cpf_solicitante || data.user_cpf || '';
        this.evidencias = data.evidencias || null;
        this.fotoEntrada = data.foto_entrada || null;
    }

    /**
     * Extrai e formata a lista completa de fotos/evidências do Cloudinary associadas à OS
     */
    get fotosEvidencias() {
        const list = [];
        
        // 1. Foto de entrada (Praça Pública ou chamado direto)
        if (this.fotoEntrada && typeof this.fotoEntrada === 'string' && (this.fotoEntrada.startsWith('http') || this.fotoEntrada.startsWith('data:'))) {
            list.push({
                url: this.fotoEntrada,
                titulo: 'Foto de Entrada',
                origem: 'Praça Pública'
            });
        }

        // 2. Evidências do objeto principal (dicionário de estágios -> URLs)
        if (this.evidencias) {
            let ev = this.evidencias;
            if (typeof ev === 'string') {
                try { ev = JSON.parse(ev); } catch (e) {}
            }
            if (typeof ev === 'object' && ev !== null) {
                for (const key in ev) {
                    const url = ev[key];
                    if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) {
                        if (!list.some(item => item.url === url)) {
                            list.push({
                                url: url,
                                titulo: key,
                                origem: 'Evidência OS'
                            });
                        }
                    }
                }
            }
        }

        // 3. Evidências dos pontos (array JSONB 'pontos')
        let pts = [];
        if (Array.isArray(this.rawPontos)) pts = this.rawPontos;
        else if (typeof this.rawPontos === 'string') {
            try { pts = JSON.parse(this.rawPontos); } catch(e) {}
        }

        if (pts && pts.length > 0) {
            pts.forEach((p, idx) => {
                if (!p) return;
                let pEv = p.evidencias || p.fotosEstagios || null;
                if (typeof pEv === 'string') {
                    try { pEv = JSON.parse(pEv); } catch(e) {}
                }
                if (typeof pEv === 'object' && pEv !== null) {
                    for (const estagio in pEv) {
                        const url = pEv[estagio];
                        if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) {
                            if (!list.some(item => item.url === url)) {
                                list.push({
                                    url: url,
                                    titulo: `${estagio} (Ponto #${idx + 1})`,
                                    pontoIndex: idx + 1,
                                    estagio: estagio
                                });
                            }
                        }
                    }
                }
                const fotoUnica = p.foto || p.url_foto || p.foto_url;
                if (fotoUnica && typeof fotoUnica === 'string' && (fotoUnica.startsWith('http') || fotoUnica.startsWith('data:'))) {
                    if (!list.some(item => item.url === fotoUnica)) {
                        list.push({
                            url: fotoUnica,
                            titulo: `Foto Ponto #${idx + 1}`,
                            pontoIndex: idx + 1
                        });
                    }
                }
            });
        }

        return list;
    }

    /**
     * Retorna o CPF mascarado para proteção de dados (LGPD) ou completo se autorizado
     */
    get maskedCpfSolicitante() {
        if (!this.cpfSolicitante) return 'Não informado';
        const clean = String(this.cpfSolicitante).replace(/\D/g, '');
        if (clean.length === 11) {
            return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
        }
        return this.cpfSolicitante;
    }

    /**
     * Retorna se a auditoria desta OS já foi dada como Concluída
     */
    get isAuditoriaConcluida() {
        const s = ChamadoModel.formatLocationText(this.statusAuditoria).toLowerCase().trim();
        return s === 'concluída' || s === 'concluida';
    }

    /**
     * Audit Divergence Indicators mapped from vw_auditoria_chamados or dynamic fallback logic
     */
    get isProblemaDivergente() {
        if (this.problemaInicial && this.problemaEncontrado) {
            const pIni = ChamadoModel.formatLocationText(this.problemaInicial).trim().toLowerCase();
            const pFin = ChamadoModel.formatLocationText(this.problemaEncontrado).trim().toLowerCase();
            if (pIni && pFin && pIni !== pFin) return true;
        }
        if (this.audit && this.audit.problema_divergente !== undefined && this.audit.problema_divergente !== null) {
            return Boolean(this.audit.problema_divergente);
        }
        return false;
    }

    get isPlaquetaDivergente() {
        if (this.plaquetaInicial && this.plaquetaFinal) {
            const pIni = ChamadoModel.formatLocationText(this.plaquetaInicial).trim().toUpperCase();
            const pFin = ChamadoModel.formatLocationText(this.plaquetaFinal).trim().toUpperCase();
            if (pIni && pFin && pIni !== pFin) return true;
        }
        if (this.audit && this.audit.plaqueta_divergente !== undefined && this.audit.plaqueta_divergente !== null) {
            return Boolean(this.audit.plaqueta_divergente);
        }
        return false;
    }

    get isQuantidadeDivergente() {
        if (this.qtdInicial && this.qtdFinal && this.qtdInicial !== this.qtdFinal) {
            return true;
        }
        if (this.audit && this.audit.quantidade_divergente !== undefined && this.audit.quantidade_divergente !== null) {
            return Boolean(this.audit.quantidade_divergente);
        }
        return false;
    }

    get distanciaCalculadaMetros() {
        if (this.coordenadaInicial && this.coordenadaReparo) {
            return ChamadoModel.calcularDistanciaMetros(this.coordenadaInicial, this.coordenadaReparo);
        }
        if (this.audit && this.audit.distancia !== undefined && this.audit.distancia !== null) {
            return Number(this.audit.distancia);
        }
        return null;
    }

    get formattedDistancia() {
        const d = this.distanciaCalculadaMetros;
        if (d === null || isNaN(d)) return 'N/A';
        if (d < 1000) {
            return `${Math.round(d)} m`;
        }
        return `${(d / 1000).toFixed(2)} km`;
    }

    get isDistanciaAcima100m() {
        if (this.coordenadaInicial && this.coordenadaReparo) {
            const dist = ChamadoModel.calcularDistanciaMetros(this.coordenadaInicial, this.coordenadaReparo);
            if (dist !== null && dist > 100) return true;
        }
        if (this.audit && this.audit.distancia_acima_100m !== undefined && this.audit.distancia_acima_100m !== null) {
            return Boolean(this.audit.distancia_acima_100m);
        }
        return false;
    }

    get isOutraPlaquetaProxima() {
        if (this.audit && this.audit.outra_plaqueta_proxima !== undefined && this.audit.outra_plaqueta_proxima !== null) {
            return Boolean(this.audit.outra_plaqueta_proxima);
        }
        return false;
    }

    get isPlaquetaProblematica() {
        if (this.audit && this.audit.outro_reparo_no_mes !== undefined && this.audit.outro_reparo_no_mes !== null) {
            return Boolean(this.audit.outro_reparo_no_mes);
        }
        return false;
    }

    get isPrecisaAnexarFoto() {
        if (this.isPlaquetaDivergente || this.anexoPlaquetaDivergente) return true;
        if (this.audit && this.audit.precisa_anexar_foto !== undefined && this.audit.precisa_anexar_foto !== null) {
            return Boolean(this.audit.precisa_anexar_foto);
        }
        return false;
    }

    get isAnexoFaltante() {
        return Boolean(this.anexoFaltante);
    }

    get isMaterialDivergente() {
        if (this.audit && this.audit.material_divergente !== undefined && this.audit.material_divergente !== null) {
            return Boolean(this.audit.material_divergente);
        }
        return false;
    }

    get isProblemaExterno() {
        if (this.audit && this.audit.problema_externo !== undefined && this.audit.problema_externo !== null) {
            return Boolean(this.audit.problema_externo);
        }
        return false;
    }

    get hasDivergence() {
        return this.isProblemaDivergente ||
               this.isPlaquetaDivergente ||
               this.isQuantidadeDivergente ||
               this.isDistanciaAcima100m ||
               this.isOutraPlaquetaProxima ||
               this.isPlaquetaProblematica ||
               this.isPrecisaAnexarFoto ||
               this.isAnexoFaltante ||
               this.isMaterialDivergente ||
               this.isProblemaExterno;
    }

    /**
     * Maps database status string to UI status code ('aberto', 'concluida', 'cancelada', 'pendente')
     */
    get normalizedStatus() {
        const statusStr = ChamadoModel.formatLocationText(this.rawStatus);
        const statusLower = statusStr.toLowerCase().trim();
        if (statusLower.includes('abert') || statusLower === 'aberta') return 'aberto';
        if (statusLower.includes('conclu') || statusLower.includes('resolv')) return 'concluida';
        if (statusLower.includes('canc')) return 'cancelada';
        if (statusLower.includes('pend')) return 'pendente';
        return 'aberto';
    }

    /**
     * Human readable status label for badges
     */
    get statusBadgeLabel() {
        switch (this.normalizedStatus) {
            case 'aberto': return 'Em aberto';
            case 'concluida': return 'Concluída';
            case 'cancelada': return 'Cancelada';
            case 'pendente': return 'Pendente aprovação';
            default: return 'Em aberto';
        }
    }

    /**
     * Returns formatted date string DD/MM for table display
     */
    get formattedDateShort() {
        if (!this.dataAbertura || isNaN(this.dataAbertura.getTime())) return '--/--';
        const day = String(this.dataAbertura.getDate()).padStart(2, '0');
        const month = String(this.dataAbertura.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}`;
    }

    /**
     * Returns formatted completion date string DD/MM for finalization table display
     */
    get formattedDateConclusaoShort() {
        if (!this.dataConclusao || isNaN(this.dataConclusao.getTime())) return this.formattedDateShort;
        const day = String(this.dataConclusao.getDate()).padStart(2, '0');
        const month = String(this.dataConclusao.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}`;
    }

    /**
     * Maps problem string to standard HTML select values ('lampada-queimada', 'acesa-dia', 'lampada-quebrada', 'outro')
     */
    get problemSelectValue() {
        const prob = ChamadoModel.formatLocationText(this.problemaInicial).toLowerCase();
        if (prob.includes('queimada')) return 'lampada-queimada';
        if (prob.includes('acesa')) return 'acesa-dia';
        if (prob.includes('quebrada')) return 'lampada-quebrada';
        return 'outro';
    }

    /**
     * Maps problema_encontrado (finalization) to select values
     */
    get problemEncontradoSelectValue() {
        if (this.problemaEncontrado) {
            const prob = ChamadoModel.formatLocationText(this.problemaEncontrado).toLowerCase();
            if (prob.includes('queimada')) return 'lampada-queimada';
            if (prob.includes('acesa')) return 'acesa-dia';
            if (prob.includes('quebrada')) return 'lampada-quebrada';
            return 'outro';
        }
        return this.problemSelectValue;
    }

    /**
     * Helper estático para converter qualquer formato de material (JSON, Array, Object ou String) em um Array de strings formatadas
     */
    static parseMaterialsList(rawMaterial) {
        if (!rawMaterial) return ['Lâmpada LED 50W'];
        
        let raw = rawMaterial;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try { raw = JSON.parse(trimmed); } catch (e) {}
            }
        }

        let list = [];

        if (Array.isArray(raw)) {
            list = raw.map(item => {
                if (!item) return '';
                if (typeof item === 'string') return item.trim();
                if (typeof item === 'object') {
                    const qtd = item.qtd || item.quantidade || item.qtd_final || item.qtd_inicial;
                    const nome = item.nome || item.material || item.item || item.descricao;
                    if (nome) {
                        return (qtd && parseInt(qtd, 10) > 1) ? `${nome.trim()} (x${qtd})` : nome.trim();
                    }
                    return JSON.stringify(item);
                }
                return String(item).trim();
            }).filter(Boolean);
        } else if (typeof raw === 'object' && raw !== null) {
            const values = Object.values(raw);
            list = values.map(item => {
                if (!item) return '';
                if (typeof item === 'string') return item.trim();
                if (typeof item === 'object') {
                    const qtd = item.qtd || item.quantidade;
                    const nome = item.nome || item.material || item.item;
                    if (nome) {
                        return (qtd && parseInt(qtd, 10) > 1) ? `${nome.trim()} (x${qtd})` : nome.trim();
                    }
                    return JSON.stringify(item);
                }
                return String(item).trim();
            }).filter(Boolean);
        } else if (typeof raw === 'string') {
            // String com divisores (vírgula, ponto e vírgula, quebra de linha)
            list = raw.split(/[\n,;\r]+/).map(s => s.trim()).filter(Boolean);
        }

        if (list.length === 0) return ['Lâmpada LED 50W'];
        return list;
    }

    /**
     * Retorna a lista parseada de materiais utilizados como um Array de strings formatadas
     */
    get materialsList() {
        return ChamadoModel.parseMaterialsList(this.materialUtilizado);
    }

    /**
     * Returns human readable material string from JSONB/Text field
     */
    get formattedMaterialUtilizado() {
        return this.materialsList.join(', ');
    }

    /**
     * Helper to safely format any location text/object (including PostGIS Point objects) into a string
     */
    static formatLocationText(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            if (val.coordinates && Array.isArray(val.coordinates) && val.coordinates.length >= 2) {
                return `${val.coordinates[1]}, ${val.coordinates[0]}`;
            }
            try {
                return JSON.stringify(val);
            } catch (e) {
                return '';
            }
        }
        return String(val).replace(/^"|"$/g, '').trim();
    }

    /**
     * Helper to validate if a location field is valid (not empty, null, or '[---]')
     */
    static isValidLocationText(val) {
        const formatted = ChamadoModel.formatLocationText(val);
        return formatted.length > 0 && formatted !== '[---]' && formatted !== '---' && formatted !== 'null';
    }

    /**
     * Returns location points with fallback hierarchy: Endereço -> Coordenada -> Plaqueta
     */
    get addressPoints() {
        try {
            // 1ª Opção: Se existirem múltiplos pontos no array JSON 'rawPontos'
            let ptsArray = [];
            if (Array.isArray(this.rawPontos)) ptsArray = this.rawPontos;
            else if (typeof this.rawPontos === 'string') {
                try { ptsArray = JSON.parse(this.rawPontos); } catch(e) {}
            }

            if (ptsArray && ptsArray.length > 0) {
                const formattedPoints = ptsArray.map(p => {
                    if (!p) return null;
                    if (typeof p === 'string') return ChamadoModel.isValidLocationText(p) ? ChamadoModel.formatLocationText(p) : null;
                    if (ChamadoModel.isValidLocationText(p.endereco)) return ChamadoModel.formatLocationText(p.endereco);
                    if (ChamadoModel.isValidLocationText(p.local)) return ChamadoModel.formatLocationText(p.local);
                    if (ChamadoModel.isValidLocationText(p.plaqueta)) return `Plaqueta: ${p.plaqueta}`;
                    if (ChamadoModel.isValidLocationText(p.coordenada)) return ChamadoModel.formatLocationText(p.coordenada);
                    if (p.lat && p.lng) return `${p.lat}, ${p.lng}`;
                    return null;
                }).filter(Boolean);

                if (formattedPoints.length > 0) {
                    return formattedPoints;
                }
            }

            // 2ª Opção: Endereço único / string
            if (ChamadoModel.isValidLocationText(this.endereco)) {
                const cleanAddress = ChamadoModel.formatLocationText(this.endereco);
                const lines = cleanAddress.split(/\r?\n/).map(l => l.trim()).filter(l => ChamadoModel.isValidLocationText(l));
                if (lines.length > 0) return lines;
            }

            // 3ª Opção: Plaqueta
            if (ChamadoModel.isValidLocationText(this.plaquetaInicial)) {
                const cleanPlaqueta = ChamadoModel.formatLocationText(this.plaquetaInicial);
                return [`Plaqueta: ${cleanPlaqueta}`];
            }

            // 4ª Opção: Coordenada
            if (ChamadoModel.isValidLocationText(this.coordenadaInicial || this.coordenadaReparo)) {
                const cleanCoord = ChamadoModel.formatLocationText(this.coordenadaReparo || this.coordenadaInicial);
                return [cleanCoord];
            }

            return ['Ponto não informado'];
        } catch (err) {
            console.error('Erro ao processar addressPoints:', err);
            return ['Ponto não informado'];
        }
    }

    /**
     * Static Factory method to build ChamadoModel instance from Supabase row
     */
    static fromRow(row) {
        return new ChamadoModel(row);
    }

    /**
     * Calcula distância em metros entre duas coordenadas via fórmula de Haversine
     */
    static calcularDistanciaMetros(coord1, coord2) {
        const c1 = ChamadoModel.parseLatLng(coord1);
        const c2 = ChamadoModel.parseLatLng(coord2);
        if (!c1 || !c2) return null;

        const R = 6371000;
        const dLat = (c2.lat - c1.lat) * Math.PI / 180;
        const dLng = (c2.lng - c1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(c1.lat * Math.PI / 180) * Math.cos(c2.lat * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    static parseLatLng(str) {
        if (!str) return null;
        const clean = ChamadoModel.formatLocationText(str);
        if (/POINT\s*\(([^)]+)\)/i.test(clean)) {
            const matches = clean.match(/POINT\s*\(([^)]+)\)/i);
            if (matches && matches[1]) {
                const parts = matches[1].trim().split(/\s+/);
                if (parts.length >= 2) {
                    const lng = parseFloat(parts[0]);
                    const lat = parseFloat(parts[1]);
                    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
                }
            }
        }
        const parts = clean.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return { lat: parts[0], lng: parts[1] };
        }
        return null;
    }

    /**
     * Formata qualquer representação de coordenada em par lat/lng limpo e legível
     */
    static formatCoordPair(coord) {
        const pt = ChamadoModel.parseLatLng(coord);
        if (!pt) {
            return { lat: '--', lng: '--', formatted: 'Não informada' };
        }
        const latStr = pt.lat.toFixed(6);
        const lngStr = pt.lng.toFixed(6);
        return {
            lat: latStr,
            lng: lngStr,
            formatted: `${latStr}, ${lngStr}`
        };
    }

    /**
     * Tabela centralizada de regras e descrições de auditoria (fonte única de verdade)
     */
    static AUDIT_RULES = [
        {
            key: 'problemaDivergente',
            label: 'Problema Divergente',
            headerText1: 'Problema',
            headerText2: 'Divergente?',
            modelProperty: 'isProblemaDivergente',
            explicacao: 'O problema cadastrado na abertura da ordem de serviço é diferente do problema identificado na finalização.'
        },
        {
            key: 'plaquetaDivergente',
            label: 'Plaqueta Divergente',
            headerText1: 'Plaqueta',
            headerText2: 'Divergente?',
            modelProperty: 'isPlaquetaDivergente',
            explicacao: 'A plaqueta cadastrada na abertura do protocolo é diferente da plaqueta informada na finalização.'
        },
        {
            key: 'quantidadeDivergente',
            label: 'Qtd. Divergente',
            headerText1: 'Quantidade',
            headerText2: 'Divergente?',
            modelProperty: 'isQuantidadeDivergente',
            explicacao: 'A quantidade de pontos da abertura do protocolo é diferente da quantidade de finalização.'
        },
        {
            key: 'distanciaAcima100m',
            label: 'Distância > 100m',
            headerText1: 'Distância',
            headerText2: 'acima 100m?',
            modelProperty: 'isDistanciaAcima100m',
            explicacao: 'A coordenada de abertura da ordem de serviço tem uma distância superior a 100m da coordenada do serviço realizado.'
        },
        {
            key: 'outraPlaquetaProxima',
            label: 'Plaqueta Próxima',
            headerText1: 'Outra plaqueta',
            headerText2: 'próxima?',
            modelProperty: 'isOutraPlaquetaProxima',
            explicacao: 'Uma nova plaqueta é cadastrada no banco de dados, e existe outra plaqueta cadastrada em menos de 20m.'
        },
        {
            key: 'plaquetaProblematica',
            label: 'Plaqueta Problemática',
            headerText1: 'Plaqueta',
            headerText2: 'Problemática?',
            modelProperty: 'isPlaquetaProblematica',
            explicacao: 'A plaqueta está duplicada na base de dados.'
        },
        {
            key: 'anexoPlaquetaDivergente',
            label: 'Anexo Plaqueta Div.',
            headerText1: 'Anexo Plaqueta',
            headerText2: 'Divergente?',
            modelProperty: 'isPrecisaAnexarFoto',
            explicacao: 'A imagem anexa da plaqueta tem um texto divergente da plaqueta informada na finalização.'
        },
        {
            key: 'anexoFaltante',
            label: 'Anexo Faltante',
            headerText1: 'Anexo',
            headerText2: 'Faltante?',
            modelProperty: 'isAnexoFaltante',
            explicacao: 'Algum dos 3 anexos não foram enviados.'
        },
        {
            key: 'materialDivergente',
            label: 'Material Divergente',
            headerText1: 'Material',
            headerText2: 'Divergente?',
            modelProperty: 'isMaterialDivergente',
            explicacao: 'Foi solicitada mais que um serviço de manutenção no material.'
        },
        {
            key: 'problemaExterno',
            label: 'Problema Externo',
            headerText1: 'Problema',
            headerText2: 'Externo?',
            modelProperty: 'isProblemaExterno',
            explicacao: 'O problema selecionado pela empresa prestadora de serviço necessita de intervenção da CPFL.'
        }
    ];
}

window.ChamadoModel = ChamadoModel;
