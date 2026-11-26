/**
 * Fase 1: Script idempotente de Backfill e Conciliação para fechamentos_os + justificativa_status.
 * Uso:
 *   node scripts/migrar_para_fechamentos_os.js --dry-run   (padrão: apenas simula e exibe o que será feito)
 *   node scripts/migrar_para_fechamentos_os.js --apply     (aplica as alterações no banco)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const applyMode = process.argv.includes('--apply');
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:8001';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAll(table, select) {
  let all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function main() {
  console.log(`==========================================================`);
  console.log(`  MIGRAÇÃO FASE 1 -> fechamentos_os (${applyMode ? 'MODO APPLY' : 'MODO DRY-RUN'})`);
  console.log(`  URL: ${supabaseUrl}`);
  console.log(`==========================================================\n`);

  const fechamentos = await fetchAll('fechamentos_os', '*');
  const osList = await fetchAll('ordens_servico', '*');
  const pracasList = await fetchAll('ordens_servico_pracas', '*');

  const fechByProto = new Map();
  for (const f of fechamentos) {
    if (!fechByProto.has(f.protocolo)) fechByProto.set(f.protocolo, []);
    fechByProto.get(f.protocolo).push(f);
  }

  // 1. Backfill OSs Viárias com ZERO registros em fechamentos_os
  const insertsFech = [];
  for (const r of osList) {
    const allF = fechByProto.get(r.protocolo) || [];
    const isClosed = !!r.data_fechamento || ['Concluída', 'Finalizada', 'Fechada'].includes(r.status);
    if (isClosed && allF.length === 0) {
      const pts = Array.isArray(r.pontos_final) ? r.pontos_final : [];
      const firstPlaq = pts[0] && (pts[0].plaqueta || pts[0].plaqueta_final);
      insertsFech.push({
        protocolo: r.protocolo,
        os_id: String(r.id),
        numero_fechamento: 1,
        ponto_referencia: pts.length > 1 ? `${pts.length} Pontos` : (firstPlaq ? `Plaqueta ${firstPlaq}` : 'Geral'),
        operador: (r.operador_finalizacao || r.operador || 'Técnico Responsável').trim(),
        data_fechamento: r.data_fechamento || new Date().toISOString(),
        relatorio_tecnico: null,
        observacoes: null,
        texto_auditoria_ocr: r.texto_auditoria_ocr || null,
        anexo_plaqueta_divergente: Boolean(r.anexo_plaqueta_divergente),
        materiais: Array.isArray(r.materiais) ? r.materiais : [],
        fotos: pts
      });
    }
  }

  // 2. Backfill OSs de Praças com ZERO registros em fechamentos_os
  const backfilledPracaProtos = new Set();
  for (const r of pracasList) {
    const allF = fechByProto.get(r.protocolo) || [];
    const isClosed = !!r.data_fechamento || ['Concluída', 'Finalizada', 'Fechada'].includes(r.status);
    if (isClosed && allF.length === 0) {
      backfilledPracaProtos.add(r.protocolo);
      const fotos = [];
      if (r.foto_entrada) {
        fotos.push({ url: r.foto_entrada, titulo: 'Foto de Entrada/Conclusão Praça' });
      }
      insertsFech.push({
        protocolo: r.protocolo,
        os_id: String(r.id),
        numero_fechamento: 1,
        ponto_referencia: r.praca_nome || 'Praça Pública',
        operador: (r.operador || 'Técnico Responsável').trim(),
        data_fechamento: r.data_fechamento || new Date().toISOString(),
        relatorio_tecnico: r.observacao_final || 'Conclusão de Serviço em Praça Pública',
        observacoes: r.observacao_final || '',
        texto_auditoria_ocr: null,
        materiais: Array.isArray(r.materiais) ? r.materiais : [],
        fotos
      });
    }
  }

  console.log(`[1] Backfill de fechamentos_os ausentes: ${insertsFech.length} registro(s)`);
  insertsFech.forEach(i => console.log(`    + ${i.protocolo} (operador=${i.operador}, mats=${i.materiais.length}, fotos=${i.fotos.length})`));

  // 3. Conciliar operador divergente (UI exibe ordens_servico.operador_finalizacao)
  const updatesOperador = [];
  for (const r of osList) {
    const activeF = (fechByProto.get(r.protocolo) || []).filter(f => !f.desconsiderado);
    if (activeF.length === 0) continue;
    const lastF = activeF.sort((a, b) => (b.numero_fechamento || 0) - (a.numero_fechamento || 0))[0];
    const opOS = (r.operador_finalizacao || '').trim();
    const opFech = (lastF.operador || '').trim();
    if (opOS && opOS !== opFech) {
      updatesOperador.push({
        id: lastF.id,
        protocolo: r.protocolo,
        de: opFech,
        para: opOS
      });
    }
  }

  console.log(`\n[2] Conciliação de operador em fechamentos_os: ${updatesOperador.length} registro(s)`);
  updatesOperador.forEach(u => console.log(`    ~ ${u.protocolo}: "${u.de}" -> "${u.para}"`));

  // 4. Migrar justificativas administrativas de ordens_servico_pracas.observacao_final -> justificativa_status
  const updatesJustificativa = [];
  for (const r of pracasList) {
    const obsFinal = (r.observacao_final || '').trim();
    if (!obsFinal) continue;
    if (backfilledPracaProtos.has(r.protocolo)) continue; // era observação técnica do backfill
    if ((r.justificativa_status || '').trim()) continue; // já migrado

    const activeF = (fechByProto.get(r.protocolo) || []).filter(f => !f.desconsiderado);
    const lastObsFech = activeF.length > 0
      ? (activeF.sort((a, b) => (b.numero_fechamento || 0) - (a.numero_fechamento || 0))[0].observacoes || '').trim()
      : '';

    // Se for idêntico à observação técnica já salva em fechamentos_os, não é justificativa de status
    if (lastObsFech && obsFinal === lastObsFech) continue;

    updatesJustificativa.push({
      id: r.id,
      protocolo: r.protocolo,
      status: r.status,
      justificativa_status: obsFinal
    });
  }

  console.log(`\n[3] Migração de observacao_final -> justificativa_status (Praças): ${updatesJustificativa.length} registro(s)`);
  updatesJustificativa.forEach(u => console.log(`    ~ ${u.protocolo} [${u.status}]: ${JSON.stringify(u.justificativa_status)}`));

  if (!applyMode) {
    console.log('\n✅ Dry-run concluído. Nenhuma alteração foi gravada no banco.');
    console.log('   Para aplicar, execute: node scripts/migrar_para_fechamentos_os.js --apply');
    return;
  }

  console.log('\n🚀 Aplicando alterações...');

  if (insertsFech.length > 0) {
    const { error } = await supabase.from('fechamentos_os').insert(insertsFech);
    if (error) throw error;
    console.log(`   ✅ ${insertsFech.length} registro(s) inserido(s) em fechamentos_os.`);
  }

  for (const u of updatesOperador) {
    const { error } = await supabase.from('fechamentos_os').update({ operador: u.para }).eq('id', u.id);
    if (error) throw error;
  }
  console.log(`   ✅ ${updatesOperador.length} operador(es) conciliado(s) em fechamentos_os.`);

  for (const u of updatesJustificativa) {
    const { error } = await supabase.from('ordens_servico_pracas').update({ justificativa_status: u.justificativa_status }).eq('id', u.id);
    if (error) throw error;
  }
  console.log(`   ✅ ${updatesJustificativa.length} justificativa(s) migrada(s) para ordens_servico_pracas.justificativa_status.`);

  console.log('\n🎉 Migração Fase 1 concluída com sucesso!');
}

main().catch(err => {
  console.error('❌ Erro na migração:', err);
  process.exit(1);
});
