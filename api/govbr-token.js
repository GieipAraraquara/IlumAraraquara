/**
 * Vercel Serverless Function - Troca segura de token gov.br
 * Endpoint: POST /api/govbr-token
 *
 * Esta função executa no lado do servidor (Vercel) e mantém o GOVBR_CLIENT_SECRET
 * totalmente protegido contra inspeção do navegador no frontend.
 */

module.exports = async (req, res) => {
    // Configura cabeçalhos de CORS para o frontend
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { code, redirectUri } = body || {};

        if (!code || !redirectUri) {
            return res.status(400).json({ error: 'Parâmetros "code" e "redirectUri" são obrigatórios.' });
        }

        const clientId = process.env.GOVBR_CLIENT_ID || 'h-iluminacaoararaquara.netlify.app';
        const clientSecret = process.env.GOVBR_CLIENT_SECRET || '51XS5NyjnroVlBEjEVgtsXoVEbVOqDAohd6VHQGGs0J_bi3ciqkNEeFxsF1p8PUtPlZIBUT6lhfSWfGC21klLg';
        const tokenUrl = process.env.GOVBR_TOKEN_URL || 'https://sso.staging.acesso.gov.br/token';

        const bodyParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri
        });

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`
            },
            body: bodyParams.toString()
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error('❌ [Vercel API govbr-token] Erro:', err);
        return res.status(500).json({ error: 'Falha interna ao comunicar com servidor gov.br', details: err.message });
    }
};
