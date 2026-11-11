-- ==============================================================================
-- ATUALIZAÇÃO DA ESTRUTURA: TABELA ORDENS_SERVICO_PRACAS E SESSÕES
-- Arquivo: atualizar_estrutura_pracas_sessoes.sql
-- ==============================================================================
-- Objetivo:
-- 1. Adicionar a coluna 'operador_finalizacao' e colunas complementares de sessões,
--    fotos e auditoria na tabela 'ordens_servico_pracas'.
-- 2. Atualizar a view unificada 'vw_todas_ordens_servico' para projetar 
--    corretamente o operador de finalização das praças públicas.
-- 3. Preencher retroativamente o operador de finalização em OSs de praça já concluídas.
-- 4. Recarregar o cache do PostgREST no Supabase.
-- ==============================================================================

-- 1. ADICIONA AS COLUNAS NECESSÁRIAS NA TABELA ordens_servico_pracas
ALTER TABLE public.ordens_servico_pracas
    ADD COLUMN IF NOT EXISTS operador_finalizacao text,
    ADD COLUMN IF NOT EXISTS texto_auditoria_ocr text,
    ADD COLUMN IF NOT EXISTS motivo_aprovacao text,
    ADD COLUMN IF NOT EXISTS glosas jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS qtd_eletricistas integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS historico_sessoes jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tempo_total_minutos integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS foto_entrada text,
    ADD COLUMN IF NOT EXISTS observacao_final text,
    ADD COLUMN IF NOT EXISTS data_fechamento timestamp with time zone,
    ADD COLUMN IF NOT EXISTS status_auditoria character varying(50) DEFAULT 'Pendente'::character varying,
    ADD COLUMN IF NOT EXISTS data_conclusao_auditoria timestamp with time zone;

-- 2. COMENTÁRIOS EXPLICATIVOS DAS COLUNAS
COMMENT ON COLUMN public.ordens_servico_pracas.operador_finalizacao IS 'Nome ou login do operador/técnico que realizou a conclusão da Ordem de Serviço da Praça';
COMMENT ON COLUMN public.ordens_servico_pracas.texto_auditoria_ocr IS 'Texto de validação OCR ou notas de auditoria da finalização';
COMMENT ON COLUMN public.ordens_servico_pracas.qtd_eletricistas IS 'Quantidade de eletricistas na equipe na sessão atual/última';
COMMENT ON COLUMN public.ordens_servico_pracas.historico_sessoes IS 'Array de objetos JSON com histórico detalhado de sessões de trabalho';
COMMENT ON COLUMN public.ordens_servico_pracas.tempo_total_minutos IS 'Soma total de minutos trabalhados nas sessões encerradas da OS';
COMMENT ON COLUMN public.ordens_servico_pracas.foto_entrada IS 'URL da foto de entrada capturada na praça pública';
COMMENT ON COLUMN public.ordens_servico_pracas.observacao_final IS 'Observações finais e justificativas registradas no encerramento ou conclusão';

-- 3. PREENCHIMENTO RETROATIVO PARA PRAÇAS JÁ CONCLUÍDAS
-- Busca preferencialmente o operador registrado em fechamentos_os ou o operador da OS
UPDATE public.ordens_servico_pracas p
SET operador_finalizacao = COALESCE(
    (
        SELECT f.operador 
        FROM public.fechamentos_os f 
        WHERE f.protocolo = p.protocolo 
        ORDER BY f.data_fechamento DESC, f.id DESC 
        LIMIT 1
    ),
    p.operador,
    'Técnico'
)
WHERE (p.status = 'Concluída' OR p.data_fechamento IS NOT NULL)
  AND p.operador_finalizacao IS NULL;

-- 4. ATUALIZAÇÃO DA VIEW UNIFICADA vw_todas_ordens_servico
CREATE OR REPLACE VIEW public.vw_todas_ordens_servico AS
 SELECT ordens_servico.id,
    ordens_servico.protocolo,
    ordens_servico.status,
    ordens_servico.prioridade,
    ordens_servico.telefone_fixo,
    ordens_servico.telefone_celular,
    ordens_servico.quantidade,
    ordens_servico.descricao,
    ordens_servico.materiais,
    ordens_servico.data_abertura,
    ordens_servico.data_fechamento,
    ordens_servico.cpf_solicitante,
    ordens_servico.municipe_nome,
    ordens_servico.user_id,
    ordens_servico.user_email,
    ordens_servico.origem_login,
    ordens_servico.operador,
    ordens_servico.status_auditoria,
    ordens_servico.data_conclusao_auditoria,
    ordens_servico.pontos_inicial,
    ordens_servico.pontos_final,
    ordens_servico.motivo_aprovacao,
    ordens_servico.operador_finalizacao,
    ordens_servico.texto_auditoria_ocr,
    ordens_servico.glosas,
    NULL::text AS praca_nome,
    NULL::jsonb AS problemas,
    NULL::text AS endereco,
    NULL::text AS coordenada,
    NULL::text AS plaqueta_inicial,
    NULL::text AS plaqueta_final,
    NULL::text AS coordenada_reparo,
    NULL::integer AS qtd_eletricistas,
    NULL::jsonb AS historico_sessoes,
    NULL::integer AS tempo_total_minutos,
    NULL::text AS foto_entrada,
    NULL::text AS observacao_final,
    'iluminacao'::text AS tipo_os
   FROM public.ordens_servico
UNION ALL
 SELECT ordens_servico_pracas.id,
    ordens_servico_pracas.protocolo,
    ordens_servico_pracas.status,
    ordens_servico_pracas.prioridade,
    ordens_servico_pracas.telefone_fixo,
    ordens_servico_pracas.telefone_celular,
    NULL::integer AS quantidade,
    ordens_servico_pracas.descricao,
    ordens_servico_pracas.materiais,
    ordens_servico_pracas.data_abertura,
    ordens_servico_pracas.data_fechamento,
    ordens_servico_pracas.cpf_solicitante,
    ordens_servico_pracas.municipe_nome,
    ordens_servico_pracas.user_id,
    ordens_servico_pracas.user_email,
    ordens_servico_pracas.origem_login,
    ordens_servico_pracas.operador,
    ordens_servico_pracas.status_auditoria,
    ordens_servico_pracas.data_conclusao_auditoria,
    NULL::jsonb AS pontos_inicial,
    NULL::jsonb AS pontos_final,
    ordens_servico_pracas.motivo_aprovacao,
    ordens_servico_pracas.operador_finalizacao,
    ordens_servico_pracas.texto_auditoria_ocr,
    ordens_servico_pracas.glosas,
    ordens_servico_pracas.praca_nome,
    ordens_servico_pracas.problemas,
    ordens_servico_pracas.endereco,
    ordens_servico_pracas.coordenada,
    ordens_servico_pracas.plaqueta_inicial,
    ordens_servico_pracas.plaqueta_final,
    ordens_servico_pracas.coordenada_reparo,
    ordens_servico_pracas.qtd_eletricistas,
    ordens_servico_pracas.historico_sessoes,
    ordens_servico_pracas.tempo_total_minutos,
    ordens_servico_pracas.foto_entrada,
    ordens_servico_pracas.observacao_final,
    'praca'::text AS tipo_os
   FROM public.ordens_servico_pracas;

-- 5. PERMISSÕES DA VIEW
ALTER VIEW public.vw_todas_ordens_servico OWNER TO postgres;
GRANT ALL ON TABLE public.vw_todas_ordens_servico TO anon;
GRANT ALL ON TABLE public.vw_todas_ordens_servico TO authenticated;
GRANT ALL ON TABLE public.vw_todas_ordens_servico TO service_role;

-- 6. RECARREGAR O CACHE DO POSTGREST NO SUPABASE
NOTIFY pgrst, 'reload schema';
