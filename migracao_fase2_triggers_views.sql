-- =============================================================================
-- Fase 2: Migração da Trigger trg_sync_manutencao_plaqueta para fechamentos_os
--         e desacoplamento das Views vw_todas_ordens_servico e vw_auditoria_chamados
--         das colunas legadas de ordens_servico / ordens_servico_pracas.
-- =============================================================================

-- 1. Nova função da trigger operando exclusivamente sobre fechamentos_os
CREATE OR REPLACE FUNCTION public.fn_sync_manutencao_plaqueta_from_fechamento()
RETURNS TRIGGER AS $trg$
DECLARE
  elem JSONB;
  pt JSONB;
  mat_text TEXT;
  plaq_cod TEXT;

  tem_luminaria BOOLEAN := FALSE;
  pot_lum TEXT := NULL;
  marca_lum TEXT := NULL;

  tem_rele BOOLEAN := FALSE;
  marca_rel TEXT := NULL;

  data_evento TIMESTAMPTZ;

  marcas_lum_validas TEXT[];
  marcas_rel_validas TEXT[];
  marca_extraida TEXT;
BEGIN
  -- Não sincroniza fechamentos desconsiderados
  IF COALESCE(NEW.desconsiderado, FALSE) IS TRUE THEN
    RETURN NEW;
  END IF;

  data_evento := COALESCE(NEW.data_fechamento, NOW());

  -- Obtém marcas configuradas no sistema (fallback para INSIGHT e EXATRON)
  SELECT
    COALESCE(marcas_luminaria_viaria, ARRAY['INSIGHT']),
    COALESCE(marcas_rele_padrao, ARRAY['EXATRON'])
  INTO marcas_lum_validas, marcas_rel_validas
  FROM public.configuracoes_sistema
  WHERE id = 1;

  IF marcas_lum_validas IS NULL THEN marcas_lum_validas := ARRAY['INSIGHT']; END IF;
  IF marcas_rel_validas IS NULL THEN marcas_rel_validas := ARRAY['EXATRON']; END IF;

  -- 1. Analisa materiais utilizados em fechamentos_os.materiais
  IF NEW.materiais IS NOT NULL AND jsonb_typeof(NEW.materiais) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.materiais)
    LOOP
      IF jsonb_typeof(elem) = 'object' THEN
        mat_text := elem->>'nome';
      ELSE
        mat_text := elem#>>'{}';
      END IF;

      IF mat_text IS NOT NULL THEN
        IF mat_text ~* 'lumin[aá]ria' AND mat_text !~* 'placa de identifica|serviço' THEN
          marca_extraida := fn_extrair_marca(mat_text);
          IF marca_extraida = ANY(marcas_lum_validas) THEN
            tem_luminaria := TRUE;
            IF pot_lum IS NULL THEN
              pot_lum := fn_extrair_potencia_luminaria(mat_text);
            END IF;
            IF marca_lum IS NULL THEN
              marca_lum := marca_extraida;
            END IF;
          END IF;
        END IF;

        IF mat_text ~* 'rel[eé]' AND mat_text !~* 'base para rele|serviço' THEN
          marca_extraida := fn_extrair_marca(mat_text);
          IF marca_extraida IS NULL AND mat_text ~* 'rel[eé] fotoel[ée]trico' THEN
            marca_extraida := marcas_rel_validas[1];
          END IF;

          IF marca_extraida = ANY(marcas_rel_validas) THEN
            tem_rele := TRUE;
            IF marca_rel IS NULL THEN
              marca_rel := marca_extraida;
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NOT tem_luminaria AND NOT tem_rele THEN
    RETURN NEW;
  END IF;

  -- 2. Atualiza cada plaqueta presente em fechamentos_os.fotos (estrutura de pontos)
  IF NEW.fotos IS NOT NULL AND jsonb_typeof(NEW.fotos) = 'array' THEN
    FOR pt IN SELECT * FROM jsonb_array_elements(NEW.fotos)
    LOOP
      plaq_cod := UPPER(TRIM(COALESCE(pt->>'plaqueta', pt->>'plaqueta_final', '')));

      IF plaq_cod IS NOT NULL AND plaq_cod <> '' AND plaq_cod <> 'SEM PLAQUETA' AND plaq_cod <> 'SEM IDENTIFICACAO' THEN
        UPDATE public.localizacao_plaquetas
        SET
          potencia_luminaria = CASE WHEN tem_luminaria AND pot_lum IS NOT NULL THEN pot_lum ELSE potencia_luminaria END,
          marca_luminaria = CASE WHEN tem_luminaria AND marca_lum IS NOT NULL THEN marca_lum ELSE marca_luminaria END,
          data_troca_luminaria = CASE WHEN tem_luminaria THEN data_evento ELSE data_troca_luminaria END,
          marca_rele = CASE WHEN tem_rele AND marca_rel IS NOT NULL THEN marca_rel ELSE marca_rele END,
          data_troca_rele = CASE WHEN tem_rele THEN data_evento ELSE data_troca_rele END,
          ultima_os_manutencao = NEW.protocolo
        WHERE UPPER(TRIM(identificacao)) = plaq_cod;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$trg$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_manutencao_plaqueta_fechamentos ON public.fechamentos_os;
CREATE TRIGGER trg_sync_manutencao_plaqueta_fechamentos
AFTER INSERT OR UPDATE OF materiais, fotos, data_fechamento, desconsiderado
ON public.fechamentos_os
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_manutencao_plaqueta_from_fechamento();

-- Remove a trigger legada de ordens_servico (que dependia de materiais e pontos_final)
DROP TRIGGER IF EXISTS trg_sync_manutencao_plaqueta ON public.ordens_servico;

-- 2. Atualiza vw_auditoria_chamados para ler pontos de fechamento a partir de fechamentos_os
CREATE OR REPLACE VIEW public.vw_auditoria_chamados AS
SELECT
  os.id,
  os.protocolo,
  os.status,
  os.status_auditoria,
  CASE
    WHEN ((os.pontos_inicial -> 0) ->> 'problema') IS NOT NULL
      AND ((f.fotos -> 0) ->> 'problema') IS NOT NULL
      AND ((os.pontos_inicial -> 0) ->> 'problema') <> ((f.fotos -> 0) ->> 'problema')
    THEN true
    ELSE false
  END AS problema_divergente,
  CASE
    WHEN ((os.pontos_inicial -> 0) ->> 'plaqueta') IS NOT NULL
      AND ((f.fotos -> 0) ->> 'plaqueta') IS NOT NULL
      AND ((os.pontos_inicial -> 0) ->> 'plaqueta') <> ((f.fotos -> 0) ->> 'plaqueta')
    THEN true
    ELSE false
  END AS plaqueta_divergente,
  false AS quantidade_divergente,
  0 AS distancia,
  false AS distancia_acima_100m,
  false AS outra_plaqueta_proxima,
  false AS outro_reparo_no_mes,
  false AS precisa_anexar_foto,
  false AS material_divergente,
  false AS problema_externo,
  COALESCE(f.operador, os.operador::text)::character varying(255) AS usuario_finalizacao
FROM public.ordens_servico os
LEFT JOIN LATERAL (
  SELECT fe.fotos, fe.operador
  FROM public.fechamentos_os fe
  WHERE fe.protocolo = os.protocolo
    AND COALESCE(fe.desconsiderado, false) = false
  ORDER BY fe.numero_fechamento DESC, fe.data_fechamento DESC
  LIMIT 1
) f ON true;

-- 3. Atualiza vw_todas_ordens_servico mantendo assinatura compatível com o frontend,
--    mas sem depender das colunas legadas de encerramento em ordens_servico / ordens_servico_pracas
CREATE OR REPLACE VIEW public.vw_todas_ordens_servico AS
SELECT
  os.id,
  os.protocolo,
  os.status,
  os.prioridade,
  os.telefone_fixo,
  os.telefone_celular,
  os.quantidade,
  os.descricao,
  f.materiais,
  os.data_abertura,
  COALESCE(os.data_fechamento, f.data_fechamento) AS data_fechamento,
  os.cpf_solicitante,
  os.municipe_nome,
  os.user_id,
  os.user_email,
  os.origem_login,
  os.operador,
  os.status_auditoria,
  os.data_conclusao_auditoria,
  os.pontos_inicial,
  f.fotos AS pontos_final,
  os.motivo_aprovacao,
  f.operador AS operador_finalizacao,
  f.texto_auditoria_ocr,
  os.glosas,
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
  os.justificativa_status AS observacao_final,
  'iluminacao'::text AS tipo_os,
  COALESCE(f.anexo_plaqueta_divergente, false) AS anexo_plaqueta_divergente,
  os.justificativa_status
FROM public.ordens_servico os
LEFT JOIN LATERAL (
  SELECT fe.materiais, fe.data_fechamento, fe.fotos, fe.operador, fe.texto_auditoria_ocr, fe.anexo_plaqueta_divergente
  FROM public.fechamentos_os fe
  WHERE fe.protocolo = os.protocolo
    AND COALESCE(fe.desconsiderado, false) = false
  ORDER BY fe.numero_fechamento DESC, fe.data_fechamento DESC
  LIMIT 1
) f ON true

UNION ALL

SELECT
  p.id,
  p.protocolo,
  p.status,
  p.prioridade,
  p.telefone_fixo,
  p.telefone_celular,
  NULL::integer AS quantidade,
  p.descricao,
  f.materiais,
  p.data_abertura,
  COALESCE(p.data_fechamento, f.data_fechamento) AS data_fechamento,
  p.cpf_solicitante,
  p.municipe_nome,
  p.user_id,
  p.user_email,
  p.origem_login,
  p.operador,
  p.status_auditoria,
  p.data_conclusao_auditoria,
  NULL::jsonb AS pontos_inicial,
  NULL::jsonb AS pontos_final,
  p.motivo_aprovacao,
  f.operador AS operador_finalizacao,
  f.texto_auditoria_ocr,
  p.glosas,
  p.praca_nome,
  p.problemas,
  p.endereco,
  p.coordenada,
  p.plaqueta_inicial,
  NULL::text AS plaqueta_final,
  NULL::text AS coordenada_reparo,
  p.qtd_eletricistas,
  p.historico_sessoes,
  p.tempo_total_minutos,
  p.foto_entrada,
  COALESCE(p.justificativa_status, f.observacoes) AS observacao_final,
  'praca'::text AS tipo_os,
  COALESCE(f.anexo_plaqueta_divergente, false) AS anexo_plaqueta_divergente,
  p.justificativa_status
FROM public.ordens_servico_pracas p
LEFT JOIN LATERAL (
  SELECT fe.materiais, fe.data_fechamento, fe.operador, fe.texto_auditoria_ocr, fe.observacoes, fe.anexo_plaqueta_divergente
  FROM public.fechamentos_os fe
  WHERE fe.protocolo = p.protocolo
    AND COALESCE(fe.desconsiderado, false) = false
  ORDER BY fe.numero_fechamento DESC, fe.data_fechamento DESC
  LIMIT 1
) f ON true;
