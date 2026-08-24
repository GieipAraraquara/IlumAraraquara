const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.sql': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // Decodifica a URL para lidar com espaços e caracteres especiais (ex: "Abrir.html")
    let reqUrl = decodeURIComponent(req.url.split('?')[0]);
    if (reqUrl === '/' || reqUrl === '') {
        reqUrl = '/Login.html';
    }

    let filePath = path.join(PUBLIC_DIR, reqUrl);

    // Proteção de segurança contra Directory Traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 - Acesso Negado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>404 - Arquivo Não Encontrado</h1><p>O arquivo <code>${reqUrl}</code> não existe nesta pasta.</p>`);
            return;
        }

        let contentType = MIME_TYPES[ext] || 'application/octet-stream';
        if (reqUrl.endsWith('manifest.json')) {
            contentType = 'application/manifest+json; charset=utf-8';
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/Login.html`;
    console.log(`====================================================`);
    console.log(`🚀 Servidor Web Local Rodando com Sucesso!`);
    console.log(`📍 URL Base: http://localhost:${PORT}`);
    console.log(`📄 Abrindo no navegador: ${url}`);
    console.log(`====================================================`);
    console.log(`💡 Dica: Para fechar o servidor, pressione Ctrl + C no terminal.`);

    // Abre o navegador padrão no Windows automaticamente
    exec(`start ${url}`);
});
