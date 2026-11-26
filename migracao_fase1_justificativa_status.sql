-- Fase 1: Criação da coluna dedicada para justificativas administrativas de status
-- (Reabertura, Bloqueio, Rejeição, Cancelamento), evitando sobrescrita com observações técnicas de fechamento.

ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS justificativa_status TEXT;

ALTER TABLE public.ordens_servico_pracas
  ADD COLUMN IF NOT EXISTS justificativa_status TEXT;

COMMENT ON COLUMN public.ordens_servico.justificativa_status
  IS 'Justificativa administrativa ao alterar o status da OS (reabertura, bloqueio, rejeição ou cancelamento)';

COMMENT ON COLUMN public.ordens_servico_pracas.justificativa_status
  IS 'Justificativa administrativa ao alterar o status da OS de praça (reabertura, bloqueio, rejeição ou cancelamento)';
