-- =============================================================================
-- Fase 5: Remoção definitiva das colunas redundantes de encerramento nas
--         tabelas ordens_servico e ordens_servico_pracas.
-- Pré-requisitos concluídos:
--   - Fase 1: Backup + backfill + conciliação + justificativa_status
--   - Fase 2: Trigger migrada para fechamentos_os + Views desacopladas
--   - Fase 3: Leitura unificada em fechamentos_os
--   - Fase 4: Escrita unificada em fechamentos_os
-- =============================================================================

ALTER TABLE public.ordens_servico
  DROP COLUMN IF EXISTS materiais,
  DROP COLUMN IF EXISTS operador_finalizacao,
  DROP COLUMN IF EXISTS pontos_final,
  DROP COLUMN IF EXISTS texto_auditoria_ocr,
  DROP COLUMN IF EXISTS anexo_plaqueta_divergente;

ALTER TABLE public.ordens_servico_pracas
  DROP COLUMN IF EXISTS materiais,
  DROP COLUMN IF EXISTS texto_auditoria_ocr,
  DROP COLUMN IF EXISTS plaqueta_final,
  DROP COLUMN IF EXISTS coordenada_reparo,
  DROP COLUMN IF EXISTS observacao_final;

NOTIFY pgrst, 'reload schema';
