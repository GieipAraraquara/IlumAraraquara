-- Adiciona coluna para configurar os nomes de operadores permitidos em protocolos emergenciais diretos
ALTER TABLE public.configuracoes_sistema
ADD COLUMN IF NOT EXISTS nomes_operadores_emergencia jsonb DEFAULT '["IGOR","FERNANDO","CARLOS","ANA","ERNESTO","VALTER"]'::jsonb;
