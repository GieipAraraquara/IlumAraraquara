/**
 * Domain Layer - Chamado Entity & Mapper
 * Encapsulates Work Order (Chamado/OS) data structure and formatting methods.
 */

class ChamadoModel {
    constructor(data = {}) {
        this.id = data.id || data.protocolo || '';
        this.protocolo = data.protocolo || data.id || 'N/A';
        this.dataAbertura = data.data_abertura ? new Date(data.data_abertura) : new Date();
        this.rawStatus = data.status || 'Aberta';
        this.prioridade = data.prioridade || 'Normal';
        this.rawRow = data;
        const cleanVal = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val).trim();
            if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'não informado' || str.toLowerCase() === 'nao informado') {
                return '';
            }
            return str;
        };

        this.userEmail = cleanVal(data.user_email);
        this.operadorAbertura = cleanVal(data.operador_abertura) || cleanVal(data.operador) || cleanVal(data.cadastrado_por) || cleanVal(data.usuario_cadastro) || cleanVal(data.user_email) || cleanVal(data.solicitante_operador) || cleanVal(data.criado_por) || cleanVal(data.usuario_abertura) || '';
        this.operador = cleanVal(data.operador) || this.operadorAbertura || cleanVal(data.user_email) || '';
        this.operadorFinalizacao = cleanVal(data.operador_finalizacao) || cleanVal(data.finalizado_por) || cleanVal(data.usuario_finalizacao) || cleanVal(data.operador_fechamento) || cleanVal(data.tecnico) || cleanVal(data.fechado_por) || cleanVal(data.usuario_conclusao) || '';
        this.municipeNome = cleanVal(data.municipe_nome) || '';
        this.rawPontosInicial = data.pontos_inicial || null;
        this.rawPontosFinal = data.pontos_final || null;
        this.rawPontos = data.pontos_final || data.pontos_inicial || data.pontos || null;

        const parseArrayJson = (val) => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch(e) {}
            }
            return null;
        };

        const ptsInicial = parseArrayJson(data.pontos_inicial) || parseArrayJson(data.pontos);
        const ptsFinal = parseArrayJson(data.pontos_final) || (String(data.status || '').toLowerCase().includes('conclu') ? parseArrayJson(data.pontos) : null);

        let endExtraido = data.endereco || '';
        let plaqExtraida = data.plaqueta_inicial || data.plaqueta || '';
        let coordExtraida = data.coordenada_inicial || data.coordenada || '';

        if (ptsInicial && ptsInicial.length > 0) {
            const p0Ini = ptsInicial[0] || {};
            const listaEnderecos = ptsInicial.map(p => p.endereco || p.local || '').filter(Boolean);
            if (!endExtraido && listaEnderecos.length > 0) endExtraido = listaEnderecos.join('\n');
            else if (!endExtraido && p0Ini.endereco) endExtraido = p0Ini.endereco;
            
            if (!plaqExtraida) plaqExtraida = p0Ini.plaqueta || p0Ini.plaqueta_inicial || '';
            if (!coordExtraida) coordExtraida = p0Ini.coordenada || p0Ini.coordenada_inicial || (p0Ini.lat && p0Ini.lng ? `${p0Ini.lat}, ${p0Ini.lng}` : '');
        }

        let plaqFinExtraida = data.plaqueta_final || '';
        let coordRepExtraida = data.coordenada_reparo || '';
        let probFinExtraido = data.problema_encontrado || '';

        if (ptsFinal && ptsFinal.length > 0) {
            const p0Fin = ptsFinal[0] || {};
            if (!plaqFinExtraida) plaqFinExtraida = p0Fin.plaqueta || '';
            if (!coordRepExtraida) coordRepExtraida = p0Fin.coordenada || (p0Fin.lat && p0Fin.lng ? `${p0Fin.lat}, ${p0Fin.lng}` : '');
            if (!probFinExtraido) probFinExtraido = p0Fin.problema || '';
        }

        this.plaquetaInicial = plaqExtraida;
        this.plaquetaFinal = plaqFinExtraida || '';
        this.problemaInicial = data.problema_inicial || (ptsInicial && ptsInicial[0]?.problema) || '';
        this.problemaEncontrado = probFinExtraido || data.problema_encontrado || (ptsFinal && ptsFinal[0]?.problema) || '';
        this.qtdInicial = parseInt(data.qtd_inicial, 10) || (ptsInicial ? ptsInicial.length : (data.quantidade ? parseInt(data.quantidade, 10) : 1));
        this.qtdFinal = parseInt(data.qtd_final, 10) || (ptsFinal ? ptsFinal.length : this.qtdInicial);
        this.endereco = endExtraido;
        this.coordenadaInicial = coordExtraida;
        this.coordenadaReparo = coordRepExtraida;
        this.descricao = data.descricao || data.observacao || data.observacoes || data.obs || '';
        this.observacaoInicial = data.observacao_inicial || data.observacao || data.observacoes || data.descricao || data.obs || '';
        this.dataConclusao = (data.data_conclusao || data.data_fechamento) ? new Date(data.data_conclusao || data.data_fechamento) : null;
        this.observacaoFinal = data.observacao_final || data.observacao_conclusao || data.justificativa || '';
        this.anexoPlaquetaDivergente = data.anexo_plaqueta_divergente === true || data.anexo_plaqueta_divergente === 'true';
        this.anexoFaltante = data.anexo_faltante === true || data.anexo_faltante === 'true';
        this.materialUtilizado = data.material_utilizado || data.materiais || '';
        this.statusAuditoria = data.status_auditoria || (data.auditoria_concluida === true ? 'Concluída' : 'Pendente');
        this.dataConclusaoAuditoria = data.data_conclusao_auditoria ? new Date(data.data_conclusao_auditoria) : null;
        this.motivoAprovacao = cleanVal(data.motivo_aprovacao) || cleanVal(data.motivo_pendencia) || cleanVal(data.motivo) || '';
        this.audit = data.audit || null;
        this.cpfSolicitante = data.cpf_solicitante || data.user_cpf || '';
        this.evidencias = data.evidencias || null;
        this.tipoOs = data.tipo_os || (data.praca_nome ? 'Praça' : (data.protocolo && String(data.protocolo).toUpperCase().startsWith('P') ? 'Praça' : 'Viária'));
        this.pracaNome = data.praca_nome || '';
        this.fotoEntrada = data.foto_entrada || null;
        this.qtdEletricistas = parseInt(data.qtd_eletricistas, 10) || parseInt(data.qtd_eletricista, 10) || 1;
        this.historicoSessoes = data.historico_sessoes || data.historico_sessao || data.sessoes || data.historico || null;
        this.tempoTotalMinutos = data.tempo_total_minutos !== undefined && data.tempo_total_minutos !== null ? parseInt(data.tempo_total_minutos, 10) : null;
    }

    /**
     * Retorna a versão resumida do motivo para exibição em tabelas
     */
    get motivoResumido() {
        const full = String(this.motivoAprovacao || '').trim();
        if (!full) return '';
        if (full.toLowerCase().includes('duplicata')) return 'Duplicata';
        if (full.includes('#')) {
            const part = full.split('#')[0].trim();
            if (part) return part;
        }
        return full;
    }

    /**
     * Retorna se a OS é uma Demanda Emergencial / Atendimento Direto por técnico nominativo
     */
    get isDireto() {
        const NOMES_DIRETOS = ["IGOR", "FERNANDO", "CARLOS", "ANA", "ERNESTO", "VALTER"];
        const prot = String(this.protocolo || '').trim().toUpperCase();
        const mun = String(this.municipeNome || '').trim().toUpperCase();

        // 1. Verificação por flag explícita do banco de dados (is_direto)
        if (this.rawRow && (this.rawRow.is_direto === true || this.rawRow.is_direto === 'true' || this.rawRow.isDireto === true)) return true;

        // 2. Verificação por texto de munícipe ("ATENDIMENTO DIRETO" ou "EMERGENCIAL")
        if (mun.includes('ATENDIMENTO DIRETO') || mun.includes('EMERGENCIAL')) return true;

        // 3. Protocolo de atendimento emergencial nominativo (ex: IP8A1B200826-IGOR, IP2VGOA-IGOR..., IP2-FERNANDO...)
        if (prot.includes('-')) {
            const parts = prot.split('-');
            const suf = parts[parts.length - 1].trim();
            if (NOMES_DIRETOS.includes(suf) || suf === 'DIRETO' || suf === 'EMERGENCIAL') return true;
        }

        if (prot.startsWith('IP2VGOA-') || prot.startsWith('IP2-')) return true;

        // 4. Protocolo idêntico ao nome do técnico de emergência (digitado no input do Finalizar.html)
        if (NOMES_DIRETOS.includes(prot)) return true;

        return false;
    }

    /**
     * Retorna se a OS é de Praça Pública (por protocolo 'P...', tipo_os 'Praça', nome de praça, foto de entrada ou sessões ativas)
     */
    get isPraca() {
        // 1. Verificação primária pelo protocolo ('P' = Praça, 'I' = Viário)
        const prot = (this.protocolo || '').trim().toUpperCase();
        if (prot.startsWith('P')) return true;
        if (prot.startsWith('I')) return false;

        // 2. Verificação pelo campo tipo_os (da view vw_todas_ordens_servico)
        if (this.tipoOs) {
            const t = String(this.tipoOs).trim().toLowerCase();
            if (t.includes('praça') || t.includes('praca')) return true;
            if (t.includes('viária') || t.includes('viaria')) return false;
        }

        // 3. Verificação por nome de praça
        if (this.pracaNome && String(this.pracaNome).trim().length > 0) return true;

        // 4. Verificação por foto de entrada da praça
        if (this.fotoEntrada && String(this.fotoEntrada).trim().length > 0) return true;

        // 5. Verificação por histórico de sessões (array não vazio ou JSON válido)
        if (this.historicoSessoes) {
            if (Array.isArray(this.historicoSessoes) && this.historicoSessoes.length > 0) return true;
            if (typeof this.historicoSessoes === 'string') {
                const trimmed = this.historicoSessoes.trim();
                if (trimmed !== '' && trimmed !== '[]' && trimmed !== '{}' && trimmed !== 'null') return true;
            }
        }

        return false;
    }

    /**
     * Retorna a lista detalhada de sessões de trabalho emparelhadas (com início, fim, duração e fotos)
     */
    get sessoesList() {
        let rawList = null;
        if (this.historicoSessoes) {
            rawList = this.historicoSessoes;
            if (typeof rawList === 'string') {
                try { rawList = JSON.parse(rawList); } catch(e) {}
            }
            if (typeof rawList === 'object' && rawList !== null && !Array.isArray(rawList)) {
                try { rawList = Object.values(rawList); } catch(e) {}
            }
        }

        if (Array.isArray(rawList) && rawList.length > 0) {
            return rawList.map((s, idx) => {
                const st = (s.status || '').toUpperCase();
                const inc = s.inicio ? new Date(s.inicio) : null;
                const fm = s.fim ? new Date(s.fim) : null;
                
                let dur = s.duracao_minutos;
                if ((dur === null || dur === undefined || isNaN(dur)) && inc && fm) {
                    dur = Math.max(1, Math.round((fm.getTime() - inc.getTime()) / 60000));
                }

                const inicioFormatted = inc && !isNaN(inc.getTime()) 
                    ? inc.toLocaleString('pt-BR') 
                    : (s.inicioStr || 'Início registrado');
                
                const fimFormatted = fm && !isNaN(fm.getTime()) 
                    ? fm.toLocaleString('pt-BR') 
                    : (s.fimStr || (st.includes('ANDAMENTO') ? 'Em andamento...' : 'Concluída'));

                return {
                    numero: s.numero || (idx + 1),
                    status: st || (s.fim ? 'ENCERRADA' : 'EM ANDAMENTO'),
                    inicio: s.inicio || null,
                    inicioStr: inicioFormatted,
                    fim: s.fim || null,
                    fimStr: fimFormatted,
                    duracao_minutos: dur,
                    qtd_eletricistas: parseInt(s.qtd_eletricistas, 10) || this.qtdEletricistas || 1,
                    tecnico: s.tecnico || this.operador || 'Técnico',
                    foto_entrada: s.foto_entrada || s.foto || (idx === 0 ? this.fotoEntrada : null),
                    foto_saida: s.foto_saida || null,
                    coordenada_inicio: s.coordenada_inicio || s.coordenada || null,
                    coordenada_fim: s.coordenada_fim || null,
                    materiais: s.materiais || []
                };
            });
        }

        // Fallback: Paireia as entradas e saídas registradas na observação/descrição em texto
        const obs = (this.observacaoFinal || '') + '\n' + (this.descricao || '');
        const lines = obs.split('\n');
        const pairedSessions = [];
        let currentSess = null;
        let sessCounter = 1;

        lines.forEach(line => {
            const match = line.match(/\[(.*?)\]\s*(ENTRADA|SAÍDA|SAIDA|CONCLUSÃO|CONCLUSAO)\s*-\s*(\d+)\s*Eletricista/i);
            if (match) {
                const dateStr = match[1].trim();
                const tag = match[2].toUpperCase();
                const qtd = parseInt(match[3], 10) || 1;

                if (tag === 'ENTRADA') {
                    if (currentSess) {
                        pairedSessions.push(currentSess);
                    }
                    currentSess = {
                        numero: sessCounter++,
                        status: 'EM ANDAMENTO',
                        inicioStr: dateStr,
                        fimStr: 'Em andamento...',
                        duracao_minutos: null,
                        qtd_eletricistas: qtd,
                        tecnico: this.operador || 'Técnico',
                        foto_entrada: pairedSessions.length === 0 ? this.fotoEntrada : null
                    };
                } else if (tag.includes('SAÍDA') || tag.includes('SAIDA') || tag.includes('CONCLU')) {
                    if (!currentSess) {
                        currentSess = {
                            numero: sessCounter++,
                            status: tag.includes('CONCLU') ? 'CONCLUÍDA' : 'ENCERRADA',
                            inicioStr: 'Não registrado',
                            fimStr: dateStr,
                            duracao_minutos: null,
                            qtd_eletricistas: qtd,
                            tecnico: this.operador || 'Técnico',
                            foto_entrada: null
                        };
                    } else {
                        currentSess.fimStr = dateStr;
                        currentSess.status = tag.includes('CONCLU') ? 'CONCLUÍDA' : 'ENCERRADA';
                        
                        try {
                            const parseBrDate = (str) => {
                                const parts = str.split(' ');
                                const dParts = parts[0].split('/');
                                const timeStr = parts[1] || '00:00:00';
                                return new Date(`${dParts[2]}-${dParts[1]}-${dParts[0]}T${timeStr}`);
                            };
                            const d1 = parseBrDate(currentSess.inicioStr);
                            const d2 = parseBrDate(dateStr);
                            if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
                                currentSess.duracao_minutos = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 60000));
                            }
                        } catch(e) {}
                    }
                    pairedSessions.push(currentSess);
                    currentSess = null;
                }
            }
        });

        if (currentSess) {
            pairedSessions.push(currentSess);
        }

        return pairedSessions;
    }

    /**
     * Retorna o tempo total trabalhado formatado (ex: 2h 30min ou 45 min)
     */
    get tempoTotalFormatado() {
        let totalMin = this.tempoTotalMinutos;
        if ((totalMin === null || totalMin === undefined || isNaN(totalMin)) && this.sessoesList.length > 0) {
            totalMin = this.sessoesList.reduce((acc, s) => acc + (s.duracao_minutos || 0), 0);
        }
        if (totalMin === null || totalMin === undefined || isNaN(totalMin) || totalMin <= 0) {
            return null;
        }
        const hor = Math.floor(totalMin / 60);
        const min = totalMin % 60;
        if (hor > 0) {
            return `${hor}h ${min}min (${totalMin} min)`;
        }
        return `${min} min`;
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

        // 4. Fotos registradas em cada sessão da praça (sessoesList)
        if (this.sessoesList && this.sessoesList.length > 0) {
            this.sessoesList.forEach((s, sIdx) => {
                const fotoEnt = s.foto_entrada || s.foto || s.url_foto;
                if (fotoEnt && typeof fotoEnt === 'string' && (fotoEnt.startsWith('http') || fotoEnt.startsWith('data:'))) {
                    if (!list.some(item => item.url === fotoEnt)) {
                        list.push({
                            url: fotoEnt,
                            titulo: `Foto de Entrada (Sessão #${s.numero || (sIdx + 1)})`,
                            origem: 'Sessão de Praça'
                        });
                    }
                }
                const fotoSai = s.foto_saida;
                if (fotoSai && typeof fotoSai === 'string' && (fotoSai.startsWith('http') || fotoSai.startsWith('data:'))) {
                    if (!list.some(item => item.url === fotoSai)) {
                        list.push({
                            url: fotoSai,
                            titulo: `Foto de Encerramento (Sessão #${s.numero || (sIdx + 1)})`,
                            origem: 'Sessão de Praça'
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
     * Retorna o nome/email do operador que cadastrou/abriu a OS
     */
    get displayOperadorAbertura() {
        const cleanVal = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val).trim();
            if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'não informado' || str.toLowerCase() === 'nao informado') {
                return '';
            }
            return str;
        };

        const val = cleanVal(this.operadorAbertura) ||
                    cleanVal(this.operador) ||
                    cleanVal(this.userEmail) ||
                    cleanVal(this.rawRow?.user_email) ||
                    cleanVal(this.rawRow?.operador) ||
                    cleanVal(this.rawRow?.operador_abertura) ||
                    cleanVal(this.rawRow?.cadastrado_por) ||
                    cleanVal(this.rawRow?.usuario_cadastro) ||
                    cleanVal(this.municipeNome);

        return val || 'Não informado';
    }

    /**
     * Retorna o nome/email do operador/técnico que finalizou a OS
     */
    get displayOperadorFinalizacao() {
        const val = String(this.operadorFinalizacao || '').trim();
        if (val && val !== 'null' && val !== 'undefined') return val;

        if (this.audit && this.audit.usuario_finalizacao) {
            const auditUser = String(this.audit.usuario_finalizacao).trim();
            if (auditUser) return auditUser;
        }

        if (this.sessoesList && this.sessoesList.length > 0) {
            const lastSession = this.sessoesList[this.sessoesList.length - 1];
            if (lastSession && lastSession.tecnico && lastSession.tecnico !== 'Técnico' && lastSession.tecnico !== 'Não informado') {
                return String(lastSession.tecnico).trim();
            }
        }

        const stNorm = this.normalizedStatus;
        if (stNorm === 'concluida') {
            return 'Técnico Responsável';
        }
        return 'Pendente finalização';
    }

    /**
     * Retorna a lista completa e pareada dos pontos de Abertura (Inicial) e Conclusão (Final)
     */
    get pontosDetalhados() {
        const parseArrayJson = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try {
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) return parsed;
                    if (parsed && typeof parsed === 'object') return [parsed];
                } catch(e) {}
            }
            return [];
        };

        const ptsIni = parseArrayJson(this.rawPontosInicial);
        const ptsFin = parseArrayJson(this.rawPontosFinal);
        const ptsLegacy = parseArrayJson(this.rawPontos);

        const iniList = ptsIni.length > 0 ? ptsIni : (ptsLegacy.length > 0 && !this.rawPontosFinal ? ptsLegacy : []);
        const finList = ptsFin.length > 0 ? ptsFin : (ptsLegacy.length > 0 && String(this.rawStatus || '').toLowerCase().includes('conclu') ? ptsLegacy : []);

        const maxLen = Math.max(iniList.length, finList.length, 1);
        const result = [];

        for (let i = 0; i < maxLen; i++) {
            const pIni = iniList[i] || null;
            const pFin = finList[i] || null;

            let endIni = pIni ? (pIni.endereco || pIni.local || '') : (i === 0 ? this.endereco : '');
            let plqIni = pIni ? (pIni.plaqueta || pIni.plaqueta_inicial || '') : (i === 0 ? this.plaquetaInicial : '');
            let coordIni = pIni ? (pIni.coordenada || pIni.coordenada_inicial || (pIni.lat && pIni.lng ? `${pIni.lat}, ${pIni.lng}` : '')) : (i === 0 ? this.coordenadaInicial : '');
            let probIni = pIni ? (pIni.problema || pIni.problema_inicial || '') : (i === 0 ? this.problemaInicial : '');

            let endFin = pFin ? (pFin.endereco || pFin.local || '') : (i === 0 ? (this.coordenadaReparo || this.plaquetaFinal || this.dataConclusao ? (this.endereco || '') : '') : '');
            let plqFin = pFin ? (pFin.plaqueta || pFin.plaqueta_final || '') : (i === 0 ? (this.plaquetaFinal || '') : '');
            let coordFin = pFin ? (pFin.coordenada_reparo || (pFin.lat && pFin.lng ? `${pFin.lat}, ${pFin.lng}` : '')) : (i === 0 ? (this.coordenadaReparo || '') : '');
            let probFin = pFin ? (pFin.problema_encontrado || pFin.problema || '') : (i === 0 ? (this.problemaEncontrado || '') : '');
            let matFin = pFin ? ChamadoModel.parseMaterialsList(pFin.materiais || pFin.material_utilizado) : (i === 0 ? ChamadoModel.parseMaterialsList(this.materialUtilizado) : []);

            const isConcluida = this.normalizedStatus === 'concluida' || Boolean(this.dataConclusao);
            const hasFinalData = !!pFin || Boolean((plqFin && plqFin !== 'Não informada') || (coordFin && coordFin !== 'Não informada') || (probFin && probFin !== 'Não informado') || (matFin && matFin.length > 0)) || isConcluida;

            result.push({
                numero: i + 1,
                enderecoInicial: ChamadoModel.isRealAddress(endIni) ? ChamadoModel.formatLocationText(endIni) : '',
                plaquetaInicial: ChamadoModel.formatLocationText(plqIni),
                coordenadaInicial: ChamadoModel.formatLocationText(coordIni),
                problemaInicial: ChamadoModel.formatLocationText(probIni),
                enderecoFinal: ChamadoModel.isRealAddress(endFin) ? ChamadoModel.formatLocationText(endFin) : '',
                plaquetaFinal: ChamadoModel.formatLocationText(plqFin),
                coordenadaFinal: ChamadoModel.formatLocationText(coordFin),
                problemaEncontrado: ChamadoModel.formatLocationText(probFin),
                materiais: matFin,
                hasFinalData: hasFinalData
            });
        }

        return result;
    }

    /**
     * Retorna a lista de plaquetas registradas em todos os pontos da OS
     */
    get plaquetasFinalList() {
        const list = [];
        const pts = this.pontosDetalhados;
        pts.forEach(p => {
            const plq = p.plaquetaFinal;
            if (plq && plq !== 'Não informada' && plq !== '---' && plq !== 'null') {
                if (!list.includes(plq)) list.push(plq);
            }
        });

        if (list.length === 0 && (this.normalizedStatus === 'concluida' || Boolean(this.dataConclusao))) {
            const fallback = ChamadoModel.formatLocationText(this.plaquetaFinal);
            if (fallback && fallback !== 'Não informada' && fallback !== '---' && fallback !== 'null') {
                list.push(fallback);
            }
        }

        return list;
    }

    /**
     * Retorna a lista de coordenadas de abertura (inicial) para todos os pontos da OS
     */
    get coordenadasInicialList() {
        const list = [];
        const pts = this.pontosDetalhados;
        pts.forEach((p, idx) => {
            const coord = p.coordenadaInicial;
            if (coord) {
                const parsed = ChamadoModel.parseLatLng(coord);
                if (parsed) {
                    list.push({
                        index: idx,
                        lat: parsed.lat.toFixed(5),
                        lng: parsed.lng.toFixed(5),
                        raw: coord
                    });
                }
            }
        });
        return list;
    }

    /**
     * Retorna a lista de coordenadas de reparo/finalização para todos os pontos da OS
     */
    get coordenadasReparoList() {
        const list = [];
        const pts = this.pontosDetalhados;
        pts.forEach((p, idx) => {
            if (p.hasFinalData && p.coordenadaFinal && p.coordenadaFinal !== 'Não informada') {
                const parsed = ChamadoModel.parseLatLng(p.coordenadaFinal);
                if (parsed) {
                    list.push({
                        index: idx,
                        lat: parsed.lat.toFixed(5),
                        lng: parsed.lng.toFixed(5),
                        raw: p.coordenadaFinal
                    });
                }
            }
        });

        if (list.length === 0 && this.coordenadaReparo) {
            const parsed = ChamadoModel.parseLatLng(this.coordenadaReparo);
            if (parsed) {
                list.push({
                    index: 0,
                    lat: parsed.lat.toFixed(5),
                    lng: parsed.lng.toFixed(5),
                    raw: this.coordenadaReparo
                });
            }
        }

        return list;
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
        if (this.isDireto) return false;
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
        if (this.isDireto) return false;
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
        if (this.isDireto) return false;
        if (this.qtdInicial && this.qtdFinal && this.qtdInicial !== this.qtdFinal) {
            return true;
        }
        if (this.audit && this.audit.quantidade_divergente !== undefined && this.audit.quantidade_divergente !== null) {
            return Boolean(this.audit.quantidade_divergente);
        }
        return false;
    }

    get distanciaCalculadaMetros() {
        if (this.isDireto) return null;
        if (this.coordenadaInicial && this.coordenadaReparo) {
            return ChamadoModel.calcularDistanciaMetros(this.coordenadaInicial, this.coordenadaReparo);
        }
        if (this.audit && this.audit.distancia !== undefined && this.audit.distancia !== null) {
            return Number(this.audit.distancia);
        }
        return null;
    }

    get formattedDistancia() {
        if (this.isDireto) return 'N/A (Atendimento Direto)';
        const d = this.distanciaCalculadaMetros;
        if (d === null || isNaN(d)) return 'N/A';
        if (d < 1000) {
            return `${Math.round(d)} m`;
        }
        return `${(d / 1000).toFixed(2)} km`;
    }

    get isDistanciaAcima100m() {
        if (this.isDireto) return false;
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
        if (this.isDireto) return false;
        if (this.audit && this.audit.outra_plaqueta_proxima !== undefined && this.audit.outra_plaqueta_proxima !== null) {
            return Boolean(this.audit.outra_plaqueta_proxima);
        }
        return false;
    }

    get isPlaquetaProblematica() {
        if (this.isDireto) return false;
        if (this.audit && this.audit.outro_reparo_no_mes !== undefined && this.audit.outro_reparo_no_mes !== null) {
            return Boolean(this.audit.outro_reparo_no_mes);
        }
        return false;
    }

    get isPrecisaAnexarFoto() {
        if (this.isDireto) return false;
        if (this.isPlaquetaDivergente || this.anexoPlaquetaDivergente) return true;
        if (this.audit && this.audit.precisa_anexar_foto !== undefined && this.audit.precisa_anexar_foto !== null) {
            return Boolean(this.audit.precisa_anexar_foto);
        }
        return false;
    }

    get isAnexoFaltante() {
        if (this.isDireto) return false;
        return Boolean(this.anexoFaltante);
    }

    get isMaterialDivergente() {
        if (this.isDireto) return false;
        if (this.audit && this.audit.material_divergente !== undefined && this.audit.material_divergente !== null) {
            return Boolean(this.audit.material_divergente);
        }
        return false;
    }

    get isProblemaExterno() {
        if (this.isDireto) return false;
        if (this.audit && this.audit.problema_externo !== undefined && this.audit.problema_externo !== null) {
            return Boolean(this.audit.problema_externo);
        }
        return false;
    }

    get hasDivergence() {
        if (this.isDireto) return false;
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
     * Maps database status string to UI status code ('aberto', 'em_andamento', 'concluida', 'cancelada', 'pendente')
     */
    get normalizedStatus() {
        const statusStr = ChamadoModel.formatLocationText(this.rawStatus);
        const statusLower = statusStr.toLowerCase().trim();
        if (statusLower.includes('abert') || statusLower === 'aberta') return 'aberto';
        if (statusLower.includes('andamento') || statusLower.includes('iniciad') || statusLower.includes('execu')) return 'em_andamento';
        if (statusLower.includes('conclu') || statusLower.includes('resolv')) return 'concluida';
        if (statusLower.includes('canc')) return 'cancelada';
        if (statusLower.includes('rejeit') || statusLower.includes('recus')) return 'rejeitada';
        if (statusLower.includes('pend')) return 'pendente';
        return 'aberto';
    }

    /**
     * Human readable status label for badges
     */
    get statusBadgeLabel() {
        const rawLower = ChamadoModel.formatLocationText(this.rawStatus).toLowerCase().trim();
        if (rawLower.includes('iniciad')) {
            return 'Iniciado';
        }
        switch (this.normalizedStatus) {
            case 'aberto': return 'Em aberto';
            case 'em_andamento': return 'Em andamento';
            case 'concluida': return 'Concluída';
            case 'cancelada': return 'Cancelada';
            case 'rejeitada': return rawLower.includes('recus') ? 'Recusada' : 'Rejeitada';
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
        if (prob.includes('queimada') || prob.includes('apagada') || prob.includes('desligada') || prob.includes('sem luz') || prob.includes('não acende') || prob.includes('nao acende')) return 'lampada-queimada';
        if (prob.includes('acesa')) return 'acesa-dia';
        if (prob.includes('quebrada') || prob.includes('danificada') || prob.includes('caída') || prob.includes('caida')) return 'lampada-quebrada';
        return 'outro';
    }

    /**
     * Maps problema_encontrado (finalization) to select values
     */
    get problemEncontradoSelectValue() {
        if (this.problemaEncontrado) {
            const prob = ChamadoModel.formatLocationText(this.problemaEncontrado).toLowerCase();
            if (prob.includes('queimada') || prob.includes('apagada') || prob.includes('desligada') || prob.includes('sem luz') || prob.includes('não acende') || prob.includes('nao acende')) return 'lampada-queimada';
            if (prob.includes('acesa')) return 'acesa-dia';
            if (prob.includes('quebrada') || prob.includes('danificada') || prob.includes('caída') || prob.includes('caida')) return 'lampada-quebrada';
            return 'outro';
        }
        return this.problemSelectValue;
    }

    /**
     * Helper estático para converter qualquer formato de material (JSON, Array, Object ou String) em um Array de strings formatadas
     */
    static parseMaterialsList(rawMaterial) {
        if (!rawMaterial) return [];
        
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
        return this.materialsList.length > 0 ? this.materialsList.join(', ') : '';
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
     * Helper to validate if a string is a real human-readable address (and not empty, placeholder, or coordinate string)
     */
    static isRealAddress(val) {
        if (val === null || val === undefined) return false;
        const str = ChamadoModel.formatLocationText(val).trim();
        if (!str || str === '[---]' || str === '---' || str === 'null' || str === 'undefined') return false;
        const lower = str.toLowerCase();
        if (lower === 'não informado' || lower === 'nao informado' || lower === 'endereço não informado' || lower === 'endereco nao informado') return false;
        if (lower.startsWith('coord:') || lower.startsWith('coordenada:') || lower.startsWith('coord ')) return false;
        if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(str)) return false;
        return true;
    }

    /**
     * Returns location points with fallback hierarchy: Endereço -> Coordenada -> Plaqueta
     */
    get addressPoints() {
        try {
            const list = this.pontosDetalhados;
            if (list && list.length > 0) {
                const formatted = list.map(p => {
                    const parts = [];
                    const end = p.enderecoFinal || p.enderecoInicial;
                    const plq = p.plaquetaFinal || p.plaquetaInicial;
                    const coord = p.coordenadaFinal || p.coordenadaInicial;
                    if (end && end !== 'Endereço não informado' && end !== '---') parts.push(end);
                    if (plq && plq !== 'Não informada' && plq !== '---' && plq !== 'null') parts.push(`Plaqueta: ${plq}`);
                    if (coord && coord !== 'Sem coordenadas') parts.push(`Coord: ${coord}`);
                    return parts.length > 0 ? parts.join(' | ') : null;
                }).filter(Boolean);

                if (formatted.length > 0) return formatted;
            }

            if (ChamadoModel.isValidLocationText(this.endereco)) {
                const cleanAddress = ChamadoModel.formatLocationText(this.endereco);
                const lines = cleanAddress.split(/\r?\n/).map(l => l.trim()).filter(l => ChamadoModel.isValidLocationText(l));
                if (lines.length > 0) return lines;
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
        if (typeof str === 'object' && str !== null) {
            if (str.lat !== undefined && str.lng !== undefined) {
                const lat = parseFloat(str.lat);
                const lng = parseFloat(str.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    if (Math.abs(lat) > 35 && Math.abs(lng) < 35) {
                        return { lat: lng, lng: lat };
                    }
                    return { lat, lng };
                }
            }
            if (str.coordinates && Array.isArray(str.coordinates) && str.coordinates.length >= 2) {
                const p1 = parseFloat(str.coordinates[0]);
                const p2 = parseFloat(str.coordinates[1]);
                if (!isNaN(p1) && !isNaN(p2)) {
                    if (Math.abs(p1) > 35 && Math.abs(p2) < 35) {
                        return { lat: p2, lng: p1 };
                    }
                    return { lat: p1, lng: p2 };
                }
            }
        }

        const clean = ChamadoModel.formatLocationText(str);
        if (!clean || clean === '[---]' || clean === '---' || clean === 'null') return null;

        if (/POINT\s*\(([^)]+)\)/i.test(clean)) {
            const matches = clean.match(/POINT\s*\(([^)]+)\)/i);
            if (matches && matches[1]) {
                const parts = matches[1].trim().split(/\s+/);
                if (parts.length >= 2) {
                    const p1 = parseFloat(parts[0]);
                    const p2 = parseFloat(parts[1]);
                    if (!isNaN(p1) && !isNaN(p2)) {
                        if (Math.abs(p1) > 35 && Math.abs(p2) < 35) {
                            return { lat: p2, lng: p1 };
                        }
                        return { lat: p1, lng: p2 };
                    }
                }
            }
        }

        const parts = clean.split(',').map(s => parseFloat(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const p1 = parts[0];
            const p2 = parts[1];
            if (Math.abs(p1) > 35 && Math.abs(p2) < 35) {
                return { lat: p2, lng: p1 };
            }
            return { lat: p1, lng: p2 };
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
