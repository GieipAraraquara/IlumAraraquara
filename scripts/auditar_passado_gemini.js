require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const handler = require('../api/analisar-plaqueta.js');

const SUPABASE_URL = 'http://localhost:8001';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.6SY3guSTC4EAwhMKk7sQkkzYXdZSww9Y3rX0yY0jKLs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Delay entre requisições para respeitar o limite do Free Tier (15 RPM -> ~4.5s por req)
const DELAY_MS = 4500;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function analisarComHandler(imageUrl, plaquetaEsperada) {
    return new Promise((resolve) => {
        const req = {
            method: 'POST',
            body: { imageUrl, plaquetaEsperada }
        };
        const res = {
            statusCode: 200,
            setHeader() {},
            status(code) { this.statusCode = code; return this; },
            json(data) { resolve({ statusCode: this.statusCode, data }); },
            end() { resolve({ statusCode: 500, data: {} }); }
        };
        handler(req, res).catch(err => resolve({ statusCode: 500, data: { error: err.message } }));
    });
}

function extrairFotoPlaqueta(ponto) {
    if (!ponto || !ponto.evidencias) return null;
    for (const k of Object.keys(ponto.evidencias)) {
        if (k.toLowerCase().includes('plaqueta') || k.toLowerCase().includes('poste')) {
            const url = ponto.evidencias[k];
            if (url && typeof url === 'string' && url.startsWith('http')) {
                return url;
            }
        }
    }
    return null;
}

async function run() {
    console.log('🚀 Iniciando auditoria retroativa de plaquetas com Gemini Flash...');

    let page = 0;
    const pageSize = 500;
    let todasOS = [];

    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('ordens_servico')
            .select('id, protocolo, pontos_final, texto_auditoria_ocr, anexo_plaqueta_divergente')
            .not('data_fechamento', 'is', null)
            .order('data_fechamento', { ascending: false })
            .range(from, to);

        if (error) {
            console.error('❌ Erro ao buscar ordens_servico:', error);
            process.exit(1);
        }
        if (!data || data.length === 0) break;
        todasOS = todasOS.concat(data);
        if (data.length < pageSize) break;
        page++;
    }

    console.log(`📦 Total de OSs concluídas encontradas: ${todasOS.length}`);

    const pendentes = todasOS.filter(os => {
        if (!Array.isArray(os.pontos_final) || os.pontos_final.length === 0) return false;
        const temFoto = os.pontos_final.some(p => extrairFotoPlaqueta(p) !== null);
        if (!temFoto) return false;

        const ocr = os.texto_auditoria_ocr;
        return !ocr || ocr === 'Nenhuma leitura realizada' || ocr === 'Leitura pendente';
    });

    console.log(`🔍 OSs com foto de plaqueta pendentes de leitura IA: ${pendentes.length}\n`);

    let processadas = 0;
    let sucessos = 0;
    let erros = 0;

    for (const os of pendentes) {
        processadas++;
        let pontosAtualizados = [...os.pontos_final];
        let textosLidos = [];
        let algumaDivergencia = false;
        let houveAtualizacao = false;

        for (let i = 0; i < pontosAtualizados.length; i++) {
            const p = { ...pontosAtualizados[i] };
            const fotoUrl = extrairFotoPlaqueta(p);
            const plaquetaEsp = p.plaqueta || '';

            if (!fotoUrl) continue;

            console.log(`[${processadas}/${pendentes.length}] OS ${os.protocolo} (Ponto ${i + 1}) | Plaqueta: ${plaquetaEsp || 'N/I'}...`);
            const resp = await analisarComHandler(fotoUrl, plaquetaEsp);

            if (resp.statusCode === 200 && resp.data?.sucesso && resp.data?.resultado) {
                const r = resp.data.resultado;
                p.texto_auditoria_ocr = r.codigo_lido || 'Não identificado';
                p.anexo_plaqueta_divergente = Boolean(r.divergente);
                textosLidos.push(p.texto_auditoria_ocr);
                if (p.anexo_plaqueta_divergente) algumaDivergencia = true;
                houveAtualizacao = true;
                sucessos++;
                console.log(`   ✅ Lido: "${p.texto_auditoria_ocr}" | Divergente: ${p.anexo_plaqueta_divergente}`);
            } else {
                erros++;
                console.log(`   ⚠️ Falha (${resp.statusCode}): ${resp.data?.detalhes || resp.data?.error || 'Erro desconhecido'}`);
            }

            pontosAtualizados[i] = p;
            await sleep(DELAY_MS);
        }

        if (houveAtualizacao) {
            const ocrGeral = textosLidos.join(' | ');
            const { error: upErr } = await supabase
                .from('ordens_servico')
                .update({
                    pontos_final: pontosAtualizados,
                    texto_auditoria_ocr: ocrGeral,
                    anexo_plaqueta_divergente: algumaDivergencia
                })
                .eq('id', os.id);

            if (upErr) {
                console.error(`   ❌ Erro ao atualizar ordens_servico (ID ${os.id}):`, upErr.message);
            } else {
                // Atualiza também fechamentos_os se existir
                await supabase
                    .from('fechamentos_os')
                    .update({
                        texto_auditoria_ocr: ocrGeral,
                        anexo_plaqueta_divergente: algumaDivergencia
                    })
                    .eq('protocolo', os.protocolo);
            }
        }
    }

    console.log(`\n🏁 Auditoria retroativa finalizada! Sucessos: ${sucessos} | Erros: ${erros}`);
}

run();
