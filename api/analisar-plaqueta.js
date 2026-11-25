/**
 * Serverless Function & Node.js Endpoint: Análise de Foto de Plaqueta com Google Gemini Flash
 * Endpoint: POST /api/analisar-plaqueta
 * 
 * Funcionalidade:
 * 1. Recebe a URL da foto (Cloudinary ou Storage) ou Base64 direto
 * 2. Recebe a plaqueta informada na OS
 * 3. Envia para o Gemini 1.5/2.0 Flash
 * 4. Retorna a leitura exata da plaqueta e o status de divergência
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
const http = require('http');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Helper para baixar imagem e converter em formato inline para o Gemini
async function urlToGenerativePart(imageUrl) {
    if (imageUrl.startsWith('data:image')) {
        const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        return {
            inlineData: {
                data: matches[2],
                mimeType: matches[1] || 'image/jpeg'
            }
        };
    }

    return new Promise((resolve, reject) => {
        const client = imageUrl.startsWith('https') ? https : http;
        client.get(imageUrl, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Falha ao baixar imagem: Status ${res.statusCode}`));
            }
            const mimeType = res.headers['content-type'] || 'image/jpeg';
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve({
                    inlineData: {
                        data: buffer.toString('base64'),
                        mimeType: mimeType
                    }
                });
            });
        }).on('error', (err) => reject(err));
    });
}

// Normalização inteligente de strings para comparar plaquetas
function normalizarCodigo(str) {
    if (!str) return '';
    return String(str)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });

    if (!genAI) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
    }

    try {
        const { imageUrl, imageBase64, plaquetaEsperada } = req.body || {};

        if (!imageUrl && !imageBase64) {
            return res.status(400).json({ error: 'Parâmetro obrigatório ausente: forneça imageUrl ou imageBase64.' });
        }

        const imagePart = imageBase64 
            ? { inlineData: { data: imageBase64.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/jpeg' } }
            : await urlToGenerativePart(imageUrl);

        const plaquetaAlvo = (plaquetaEsperada || '').trim();

        const prompt = `
Você é um auditor especialista em iluminação pública e reconhecimento óptico de caracteres em postes e equipamentos.
Analise a fotografia fornecida que deve conter uma plaqueta ou número de identificação gravado/fixado no poste ou luminária.

A plaqueta informada no sistema pelo técnico eletricista foi: "${plaquetaAlvo}".

Instruções:
1. Localize a plaqueta ou código de identificação gravado/estampado (pode ser alfanumérico, ex: "N0939", "C1956", "E-0245", "PLQ-88492").
2. Identifique e extraia todo o texto visível da plaqueta.
3. Compare o código identificado com a plaqueta informada: "${plaquetaAlvo}".
4. Retorne ESTRITAMENTE o JSON estruturado:
{
  "encontrou_plaqueta": boolean,
  "codigo_lido": string,
  "divergente": boolean,
  "confianca": "alta" | "media" | "baixa",
  "observacao": string
}

Regras para "divergente":
- Se o código lido for compatível com "${plaquetaAlvo}" (ignorando espaços, traços ou zeros à esquerda), marque divergente = false.
- Se o número na imagem for visivelmente diferente da plaqueta informada, marque divergente = true.
- Se a imagem não mostrar uma plaqueta ou estiver totalmente ilegível, marque encontrou_plaqueta = false e divergente = true.
`;

        // Modelo com fallback e retry automático em caso de 503 (alta demanda momentânea)
        let responseText = null;
        let lastErr = null;
        const modelosTentativa = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.7-flash'];

        for (const nomeModelo of modelosTentativa) {
            for (let tentativa = 1; tentativa <= 2; tentativa++) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: nomeModelo,
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.1
                        }
                    });

                    const result = await model.generateContent([prompt, imagePart]);
                    responseText = result.response.text();
                    break;
                } catch (e) {
                    lastErr = e;
                    if (e.status === 503 || e.message?.includes('503')) {
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                    break;
                }
            }
            if (responseText) break;
        }

        if (!responseText) {
            throw lastErr || new Error('Não foi possível obter resposta dos modelos do Gemini.');
        }

        let parsedJson = {};
        try {
            parsedJson = JSON.parse(responseText);
        } catch (e) {
            parsedJson = {
                encontrou_plaqueta: true,
                codigo_lido: responseText.trim(),
                divergente: true,
                observacao: 'Resposta bruta do Gemini'
            };
        }

        // Padroniza o código lido (remove espaços e converte para maiúsculas, ex: "C 1049" -> "C1049")
        if (parsedJson.codigo_lido) {
            parsedJson.codigo_lido = String(parsedJson.codigo_lido).replace(/\s+/g, '').toUpperCase().trim();
        }

        // Dupla checagem algorítmica
        const codNormalizadoLido = normalizarCodigo(parsedJson.codigo_lido);
        const codNormalizadoEsp = normalizarCodigo(plaquetaAlvo);

        if (codNormalizadoEsp && codNormalizadoLido) {
            const isMatch = codNormalizadoLido.includes(codNormalizadoEsp) || codNormalizadoEsp.includes(codNormalizadoLido);
            parsedJson.divergente = !isMatch;
        }

        return res.status(200).json({
            sucesso: true,
            resultado: parsedJson
        });

    } catch (err) {
        console.error('❌ [analisar-plaqueta] Erro:', err);
        return res.status(500).json({
            error: 'Falha ao analisar plaqueta com Gemini.',
            detalhes: err.message
        });
    }
};
