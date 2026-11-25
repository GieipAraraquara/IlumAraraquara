const handler = require('../api/analisar-plaqueta.js');

const amostras = [
  {
    protocolo: 'IE0ZB6BA',
    plaqueta: 'N0939',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1794619427/sistema_os/IE0ZB6BA_N0939_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_13-11-2026_22-23-47.jpg'
  },
  {
    protocolo: 'I1J3FR32810A',
    plaqueta: 'C1956',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1794402778/sistema_os/I1J3FR32810A_C1956_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_11-11-2026_10-12-57.jpg'
  },
  {
    protocolo: 'IP3IMGY280826',
    plaqueta: 'E0245',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1789002134/sistema_os/IP3IMGY280826_E0245_FECHAMENTO_1_PLAQUETA_SETEMBRO_2026_09-09-2026_22-02-14.jpg'
  },
  {
    protocolo: 'I8PAJ4BA',
    plaqueta: 'C7982',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1794416432/sistema_os/I8PAJ4BA_C7982_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_11-11-2026_14-00-31.jpg'
  },
  {
    protocolo: 'IJKC3ABA',
    plaqueta: 'C4079',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1795040803/sistema_os/IJKC3ABA_C4079_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_18-11-2026_19-26-42.jpg'
  },
  {
    protocolo: 'IKC7YBBA',
    plaqueta: 'N0937',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1794886662/sistema_os/IKC7YBBA_N0937_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_17-11-2026_00-37-42.jpg'
  },
  {
    protocolo: 'IDYHFHBA',
    plaqueta: 'C2850',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1795107571/sistema_os/IDYHFHBA_C2850_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_19-11-2026_13-59-31.jpg'
  },
  {
    protocolo: 'IP19UDQ011026',
    plaqueta: 'F0955',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1792457483/sistema_os/IP19UDQ011026_F0955_FECHAMENTO_1_PLAQUETA_OUTUBRO_2026_19-10-2026_21-51-22.jpg'
  },
  {
    protocolo: 'IAH1JABA',
    plaqueta: 'C6060',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1795127187/sistema_os/IAH1JABA_C6060_FECHAMENTO_1_PLAQUETA_NOVEMBRO_2026_19-11-2026_19-26-27.jpg'
  },
  {
    protocolo: 'I1V426O0810A',
    plaqueta: 'F1830',
    fotoPlaqueta: 'https://res.cloudinary.com/vwn8memy/image/upload/v1793239908/sistema_os/I1V426O0810A_F1830_FECHAMENTO_1_PLAQUETA_OUTUBRO_2026_28-10-2026_23-11-47.jpg'
  }
];

async function executarLote() {
    console.log('Iniciando analise das 10 OSs em lote com Gemini Flash...\n');
    const resultados = [];

    for (let i = 0; i < amostras.length; i++) {
        const item = amostras[i];
        const num = i + 1;
        process.stdout.write(`[${num}/10] OS: ${item.protocolo} | Plaqueta OS: ${item.plaqueta} ... `);
        const t0 = Date.now();

        await new Promise((resolve) => {
            const req = {
                method: 'POST',
                body: {
                    imageUrl: item.fotoPlaqueta,
                    plaquetaEsperada: item.plaqueta
                }
            };
            const res = {
                statusCode: 200,
                headers: {},
                setHeader() {},
                status(code) { this.statusCode = code; return this; },
                json(data) {
                    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
                    if (data.sucesso && data.resultado) {
                        const r = data.resultado;
                        const statusMatch = r.divergente ? 'DIVERGENTE' : 'COMPATIVEL';
                        console.log(`${statusMatch} (${elapsed}s) | Lido: "${r.codigo_lido}"`);
                        console.log(`    -> Obs: ${r.observacao}`);
                        resultados.push({
                            OS: item.protocolo,
                            Plaqueta_OS: item.plaqueta,
                            Lido_IA: r.codigo_lido,
                            Status: statusMatch,
                            Confianca: r.confianca,
                            Tempo: `${elapsed}s`
                        });
                    } else {
                        console.log(`ERRO (${elapsed}s):`, data.error || data);
                    }
                    resolve();
                },
                end() { resolve(); }
            };
            handler(req, res);
        });
    }

    console.log('\n=================== TABELA CONSOLIDADA ===================');
    console.table(resultados);
}

executarLote();
