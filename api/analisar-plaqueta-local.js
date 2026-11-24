/**
 * Serverless Function & Node.js Endpoint: Análise de Foto de Plaqueta com IA Local (Qwen2.5-VL via Ollama)
 * Endpoint: POST /api/analisar-plaqueta-local
 * 
 * Funcionalidade:
 * 1. Recebe a URL da foto (Cloudinary ou Storage) ou Base64 direto
 * 2. Recebe a plaqueta esperada / informada na OS
 * 3. Envia para o Ollama local (modelo qwen2.5vl:3b)
 * 4. Retorna a leitura da plaqueta e o status de divergência
 */

const https = require('https');
const http = require('http');

// Helper para converter URL de imagem em Base64
async function urlToBase64(imageUrl) {
    if (imageUrl.startsWith('data:image')) {
        return imageUrl.split(',')[1];
    }

    return new Promise((resolve, reject) => {
        const client = imageUrl.startsWith('https') ? https : http;
        client.get(imageUrl, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Falha ao baixar imagem: Status ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString('base64'));
            });
        }).on('error', (err) => reject(err));
    });
}

// Normalização de string para comparação inteligente (remove hífens, espaços, pontuações)
function normalizarCodigo(str) {
    if (!str) return '';
    return String(str)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

module.exports = async function handler(req, res) {
    // Habilita CORS para consumo pelo frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
    }

    try {
        const { imageUrl, imageBase64, plaquetaEsperada } = req.body || {};

        if (!imageUrl && !imageBase64) {
            return res.status(400).json({ error: 'Parâmetro obrigatório ausente: forneça imageUrl ou imageBase64.' });
        }

        // Obtém o Base64 da imagem
        const base64Data = imageBase64 || await urlToBase64(imageUrl);

        // Monta o prompt para o modelo de visão Qwen2.5-VL
        const plaquetaAlvo = (plaquetaEsperada || '').trim();
        const prompt = `Você é um perito em auditoria de iluminação pública e leitura de plaquetas de identificação de postes/luminárias.
Analise a imagem da plaqueta com atenção.
A plaqueta informada no sistema pelo técnico foi: "${plaquetaAlvo}".

Tarefa:
1. Localize a plaqueta ou número gravado/impresso no poste ou equipamento.
2. Extraia o código identificador (letras e números).
3. Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "encontrou_plaqueta": boolean,
  "codigo_lido": string,
  "divergente": boolean,
  "observacao": string
}
Regra para divergente: Se o código lido for compatível com "${plaquetaAlvo}" (ignorando hífens ou zeros à esquerda), divergente deve ser false. Se não encontrou plaqueta legível ou se os números forem claramente diferentes, divergente deve ser true.`;

        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

        // Requisição para a API do Ollama
        const ollamaPayload = JSON.stringify({
            model: 'qwen2.5vl:3b',
            prompt: prompt,
            images: [base64Data],
            format: 'json',
            stream: false,
            options: {
                temperature: 0.1 // Baixa temperatura para respostas determinísticas e exatas
            }
        });

        const ollamaUrl = new URL('/api/generate', ollamaHost);
        const requestClient = ollamaUrl.protocol === 'https:' ? https : http;

        const ollamaResponse = await new Promise((resolve, reject) => {
            const reqOllama = requestClient.request({
                hostname: ollamaUrl.hostname,
                port: ollamaUrl.port || 11434,
                path: ollamaUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(ollamaPayload)
                },
                timeout: 120000 // 2 minutos para processamento de imagem
            }, (resOllama) => {
                let data = '';
                resOllama.on('data', chunk => data += chunk);
                resOllama.on('end', () => resolve({ statusCode: resOllama.statusCode, body: data }));
            });

            reqOllama.on('error', (err) => reject(err));
            reqOllama.on('timeout', () => {
                reqOllama.destroy();
                reject(new Error('Tempo limite excedido ao consultar o modelo local (Ollama).'));
            });

            reqOllama.write(ollamaPayload);
            reqOllama.end();
        });

        if (ollamaResponse.statusCode !== 200) {
            return res.status(502).json({
                error: `Erro retornado pelo Ollama (${ollamaResponse.statusCode})`,
                detalhes: ollamaResponse.body
            });
        }

        const parsedOllama = JSON.parse(ollamaResponse.body);
        let resultadoIa = {};

        try {
            resultadoIa = JSON.parse(parsedOllama.response);
        } catch (e) {
            resultadoIa = {
                encontrou_plaqueta: true,
                codigo_lido: parsedOllama.response.trim(),
                divergente: true,
                observacao: 'Resposta bruta do modelo (JSON parse falhou).'
            };
        }

        // Validação adicional de segurança no backend
        const codNormalizadoLido = normalizarCodigo(resultadoIa.codigo_lido);
        const codNormalizadoEsp = normalizarCodigo(plaquetaAlvo);

        if (codNormalizadoEsp && codNormalizadoLido) {
            const isMatch = codNormalizadoLido.includes(codNormalizadoEsp) || codNormalizadoEsp.includes(codNormalizadoLido);
            resultadoIa.divergente = !isMatch;
        }

        return res.status(200).json({
            sucesso: true,
            resultado: resultadoIa,
            tempo_processamento_ms: parsedOllama.total_duration ? Math.round(parsedOllama.total_duration / 1e6) : null
        });

    } catch (err) {
        console.error('❌ [analisar-plaqueta-local] Erro:', err);
        return res.status(500).json({
            error: 'Falha interna ao analisar plaqueta com IA local.',
            detalhes: err.message
        });
    }
};
