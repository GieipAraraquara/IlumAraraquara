/**
 * Script de Importação dos Postes Aéreos (Shapefile -> Supabase)
 * Converte coordenadas UTM 22S (SIRGAS 2000) para WGS84 Geográfico
 * Insere em lotes de 1.000 registros com segurança.
 */
const fs = require('fs');
const path = require('path');

const SHP_PATH = path.join(__dirname, 'Delimitações - Postes Elétricos', 'POSTE_REDE_ELETRICA.shp');
const SUPABASE_REST_URL = 'http://localhost:8001/rest/v1/postes_base_aerea';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.ICKUfcc29vSnq8wme0GuMujaROsH5T-RlNtJVcAzFb4';

// Constantes do Elipsoide GRS80 / SIRGAS 2000 / WGS84
const a = 6378137.0;
const f = 1 / 298.257222101;
const b = a * (1 - f);
const e = Math.sqrt((a*a - b*b) / (a*a));
const ePrimeSquared = (a*a - b*b) / (b*b);
const k0 = 0.9996;
const falseEasting = 500000.0;
const falseNorthing = 10000000.0;
const centralMeridian = -51.0 * Math.PI / 180.0; // Meridiano Central da Zona 22 (-51W)

function utm22sToLatLng(x, y) {
    const xRel = x - falseEasting;
    const yRel = y - falseNorthing;

    const M = yRel / k0;
    const mu = M / (a * (1 - e*e/4 - 3*e*e*e*e/64 - 5*e*e*e*e*e*e/256));
    
    const e1 = (1 - Math.sqrt(1 - e*e)) / (1 + Math.sqrt(1 - e*e));
    const J1 = (3*e1/2 - 27*Math.pow(e1, 3)/32);
    const J2 = (21*e1*e1/16 - 55*Math.pow(e1, 4)/32);
    const J3 = (151*Math.pow(e1, 3)/96);
    const J4 = (1097*Math.pow(e1, 4)/512);

    const fp = mu + J1*Math.sin(2*mu) + J2*Math.sin(4*mu) + J3*Math.sin(6*mu) + J4*Math.sin(8*mu);

    const C1 = ePrimeSquared * Math.pow(Math.cos(fp), 2);
    const T1 = Math.pow(Math.tan(fp), 2);
    const R1 = a * (1 - e*e) / Math.pow(1 - e*e*Math.pow(Math.sin(fp), 2), 1.5);
    const N1 = a / Math.sqrt(1 - e*e*Math.pow(Math.sin(fp), 2));
    const D = xRel / (N1 * k0);

    const lat = fp - (N1 * Math.tan(fp) / R1) * (
        D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ePrimeSquared)*Math.pow(D, 4)/24
        + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ePrimeSquared - 3*C1*C1)*Math.pow(D, 6)/720
    );

    const lng = centralMeridian + (
        D - (1 + 2*T1 + C1)*Math.pow(D, 3)/6
        + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ePrimeSquared + 24*T1*T1)*Math.pow(D, 5)/120
    ) / Math.cos(fp);

    return {
        lat: Number((lat * 180 / Math.PI).toFixed(7)),
        lng: Number((lng * 180 / Math.PI).toFixed(7))
    };
}

async function importar() {
    console.log('📂 Lendo arquivo SHP:', SHP_PATH);
    const shpBuf = fs.readFileSync(SHP_PATH);
    const fileLength = shpBuf.length;

    let offset = 100; // Cabeçalho do SHP tem 100 bytes
    const pontos = [];

    while (offset < fileLength) {
        const recNum = shpBuf.readInt32BE(offset);
        const contentLenWords = shpBuf.readInt32BE(offset + 4);
        const contentLenBytes = contentLenWords * 2;
        const shapeType = shpBuf.readInt32LE(offset + 8);

        if (shapeType === 1) { // Point
            const x = shpBuf.readDoubleLE(offset + 12);
            const y = shpBuf.readDoubleLE(offset + 20);
            const { lat, lng } = utm22sToLatLng(x, y);
            pontos.push({ latitude: lat, longitude: lng });
        }

        offset += 8 + contentLenBytes;
    }

    console.log(`✅ Total de pontos lidos do shapefile: ${pontos.length}`);
    if (pontos.length > 0) {
        console.log('📍 Exemplo Ponto 0:', pontos[0]);
        console.log('📍 Exemplo Ponto final:', pontos[pontos.length - 1]);
    }

    // Inserção em lotes de 1.000 no Supabase
    const BATCH_SIZE = 1000;
    console.log(`🚀 Iniciando upload para ${SUPABASE_REST_URL} em lotes de ${BATCH_SIZE}...`);

    for (let i = 0; i < pontos.length; i += BATCH_SIZE) {
        const batch = pontos.slice(i, i + BATCH_SIZE);
        const res = await fetch(SUPABASE_REST_URL, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal' // Zero egress retornado
            },
            body: JSON.stringify(batch)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Erro ao enviar lote ${i} - ${i + batch.length}: ${res.status} ${errText}`);
        }

        process.stdout.write(`\r📦 Inseridos: ${Math.min(i + BATCH_SIZE, pontos.length)} / ${pontos.length} (${Math.round((Math.min(i + BATCH_SIZE, pontos.length) / pontos.length) * 100)}%)`);
    }

    console.log('\n🎉 Importação de todos os 46.210 postes concluída com sucesso!');
}

importar().catch(err => {
    console.error('\n❌ Falha na importação:', err);
    process.exit(1);
});
