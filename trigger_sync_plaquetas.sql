CREATE OR REPLACE FUNCTION fn_extrair_potencia_luminaria(texto TEXT)
RETURNS TEXT AS $fn$
DECLARE
  match_arr TEXT[];
BEGIN
  IF texto IS NULL THEN RETURN NULL; END IF;
  -- Procura 'POTÊNCIA DE ... W' ou '... W'
  match_arr := regexp_match(texto, 'POT[ÊE]NCIA\s+DE\s+(?:AT[ÉE]\s+)?([0-9]+)\s*W', 'i');
  IF match_arr IS NOT NULL THEN
    RETURN match_arr[1] || 'W';
  END IF;
  
  match_arr := regexp_match(texto, '([0-9]{2,3})\s*W', 'i');
  IF match_arr IS NOT NULL THEN
    RETURN match_arr[1] || 'W';
  END IF;

  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_extrair_marca(texto TEXT)
RETURNS TEXT AS $fn$
DECLARE
  match_arr TEXT[];
BEGIN
  IF texto IS NULL THEN RETURN NULL; END IF;
  -- Pega antes do primeiro hífen se tiver formato 'MARCA - DESCRIÇÃO'
  match_arr := regexp_match(texto, '^\s*([A-Za-z0-9Á-Úá-ú\s]+?)\s*\-\s*');
  IF match_arr IS NOT NULL AND trim(match_arr[1]) !~* '^(PRÓPRIO|SERVIÇO)' THEN
    RETURN trim(match_arr[1]);
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

-- Função da Trigger de Sincronização Automática
CREATE OR REPLACE FUNCTION fn_sync_manutencao_plaqueta_from_os()
RETURNS TRIGGER AS $trg$
DECLARE
  item RECORD;
  mat_text TEXT;
  elem JSONB;
  pt JSONB;
  plaq_cod TEXT;
  
  tem_luminaria BOOLEAN := FALSE;
  pot_lum TEXT := NULL;
  marca_lum TEXT := NULL;
  
  tem_rele BOOLEAN := FALSE;
  marca_rel TEXT := NULL;
  
  data_evento TIMESTAMPTZ;
BEGIN
  -- Só processa se a OS estiver Concluída
  IF NEW.status IS NULL OR NEW.status !~* '^Conclu[íi]da$' THEN
    RETURN NEW;
  END IF;

  data_evento := COALESCE(NEW.data_fechamento, NOW());

  -- 1. Analisa materiais utilizados
  IF NEW.materiais IS NOT NULL AND jsonb_typeof(NEW.materiais) = 'array' THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.materiais)
    LOOP
      IF jsonb_typeof(elem) = 'object' THEN
        mat_text := elem->>'nome';
      ELSE
        mat_text := elem#>>'{}';
      END IF;

      IF mat_text IS NOT NULL THEN
        -- Verifica se é Luminária / Refletor (exclui placas de identificação e serviços)
        IF mat_text ~* 'lumin[aá]ria|refletor' AND mat_text !~* 'placa de identifica|serviço de instala|serviço de manu' THEN
          tem_luminaria := TRUE;
          IF pot_lum IS NULL THEN
            pot_lum := fn_extrair_potencia_luminaria(mat_text);
          END IF;
          IF marca_lum IS NULL THEN
            marca_lum := fn_extrair_marca(mat_text);
          END IF;
        END IF;

        -- Verifica se é Relé Fotoelétrico (exclui serviços e bases)
        IF mat_text ~* 'rel[eé]' AND mat_text !~* 'base para rele|serviço' THEN
          tem_rele := TRUE;
          IF marca_rel IS NULL THEN
            marca_rel := fn_extrair_marca(mat_text);
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Se não houve troca de luminária nem de relé, encerra
  IF NOT tem_luminaria AND NOT tem_rele THEN
    RETURN NEW;
  END IF;

  -- 2. Atualiza cada plaqueta presente nos pontos de fechamento (pontos_final)
  IF NEW.pontos_final IS NOT NULL AND jsonb_typeof(NEW.pontos_final) = 'array' THEN
    FOR pt IN SELECT * FROM jsonb_array_elements(NEW.pontos_final)
    LOOP
      plaq_cod := UPPER(TRIM(COALESCE(pt->>'plaqueta', pt->>'plaqueta_final', '')));
      
      IF plaq_cod IS NOT NULL AND plaq_cod <> '' AND plaq_cod <> 'SEM PLAQUETA' THEN
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

-- Criação da Trigger em ordens_servico
DROP TRIGGER IF EXISTS trg_sync_manutencao_plaqueta ON public.ordens_servico;
CREATE TRIGGER trg_sync_manutencao_plaqueta
AFTER INSERT OR UPDATE OF status, materiais, pontos_final, data_fechamento
ON public.ordens_servico
FOR EACH ROW
EXECUTE FUNCTION fn_sync_manutencao_plaqueta_from_os();
