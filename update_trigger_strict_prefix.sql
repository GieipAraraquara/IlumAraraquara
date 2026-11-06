-- 1. Função estrita de extração de marca: EXIGE O PREFIXO "MARCA - "
CREATE OR REPLACE FUNCTION fn_extrair_marca(texto TEXT)
RETURNS TEXT AS $fn$
DECLARE
  match_arr TEXT[];
  raw_marca TEXT;
BEGIN
  IF texto IS NULL THEN RETURN NULL; END IF;
  
  -- Pega obrigatoriamente antes do primeiro hífen (formato 'MARCA - DESCRIÇÃO...')
  match_arr := regexp_match(texto, '^\s*([A-Za-z0-9Á-Úá-ú\s]+?)\s*\-\s*');
  IF match_arr IS NOT NULL THEN
    raw_marca := trim(match_arr[1]);
    IF raw_marca ~* '^(PRÓPRIO|SERVIÇO)' THEN
      RETURN NULL;
    END IF;
    IF raw_marca ~* '^INSIGHT' THEN
      RETURN 'INSIGHT';
    END IF;
    IF raw_marca ~* '^EXATRON' THEN
      RETURN 'EXATRON';
    END IF;
    RETURN raw_marca;
  END IF;

  -- Sem prefixo explícito com hífen, não considera marca
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Atualiza Trigger para aceitar estritamente marcas prefixadas válidas
CREATE OR REPLACE FUNCTION fn_sync_manutencao_plaqueta_from_os()
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
  -- Só processa se a OS estiver Concluída
  IF NEW.status IS NULL OR NEW.status !~* '^Conclu[íi]da$' THEN
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

  -- Analisa materiais utilizados (apenas com prefixo formal de marca)
  IF NEW.materiais IS NOT NULL AND jsonb_typeof(NEW.materiais) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.materiais)
    LOOP
      IF jsonb_typeof(elem) = 'object' THEN
        mat_text := elem->>'nome';
      ELSE
        mat_text := elem#>>'{}';
      END IF;

      IF mat_text IS NOT NULL THEN
        -- Verifica se é Luminária Pública com prefixo de marca válido
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

        -- Verifica se é Relé Fotoelétrico com prefixo de marca válido
        IF mat_text ~* 'rel[eé]' AND mat_text !~* 'base para rele|serviço' THEN
          marca_extraida := fn_extrair_marca(mat_text);
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

  -- Se não houve troca com marca prefixada válida, encerra
  IF NOT tem_luminaria AND NOT tem_rele THEN
    RETURN NEW;
  END IF;

  -- Atualiza cada plaqueta presente nos pontos de fechamento (pontos_final)
  IF NEW.pontos_final IS NOT NULL AND jsonb_typeof(NEW.pontos_final) = 'array' THEN
    FOR pt IN SELECT * FROM jsonb_array_elements(NEW.pontos_final)
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
