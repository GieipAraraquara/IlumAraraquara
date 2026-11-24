-- 1. Coluna 'ativo'
ALTER TABLE public.localizacao_plaquetas 
ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- 2. Atualizar nulos para true
UPDATE public.localizacao_plaquetas 
SET ativo = true 
WHERE ativo IS NULL;

-- 3. Desativar plaquetas que possuem DESATIVADA / DESATIVADO / INATIVA / INATIVO na Observação
UPDATE public.localizacao_plaquetas
SET ativo = false
WHERE "Observação" ILIKE '%DESATIVAD%' 
   OR "Observação" ILIKE '%INATIV%';

-- 4. Índice
CREATE INDEX IF NOT EXISTS idx_localizacao_plaquetas_ativo 
ON public.localizacao_plaquetas (ativo);