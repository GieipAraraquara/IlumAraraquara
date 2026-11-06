CREATE OR REPLACE FUNCTION fn_extrair_marca(texto TEXT)
RETURNS TEXT AS $fn$
DECLARE
  match_arr TEXT[];
  raw_marca TEXT;
BEGIN
  IF texto IS NULL THEN RETURN NULL; END IF;
  
  -- Pega antes do primeiro hífen
  match_arr := regexp_match(texto, '^\s*([A-Za-z0-9Á-Úá-ú\s]+?)\s*\-\s*');
  IF match_arr IS NOT NULL THEN
    raw_marca := trim(match_arr[1]);
    IF raw_marca ~* '^(PRÓPRIO|SERVIÇO)' THEN
      RETURN NULL;
    END IF;
    -- Se começa com INSIGHT (ex: 'INSIGHT LED IL-MIR...'), padroniza para 'INSIGHT'
    IF raw_marca ~* '^INSIGHT' THEN
      RETURN 'INSIGHT';
    END IF;
    -- Se começa com BRIGHTLUX, padroniza para 'BRIGHTLUX'
    IF raw_marca ~* '^BRIGHTLUX' THEN
      RETURN 'BRIGHTLUX';
    END IF;
    -- Se começa com EXATRON, padroniza para 'EXATRON'
    IF raw_marca ~* '^EXATRON' THEN
      RETURN 'EXATRON';
    END IF;
    RETURN raw_marca;
  END IF;

  -- Fallbacks se não tiver hífen inicial
  IF texto ~* '\mINSIGHT\M' THEN RETURN 'INSIGHT'; END IF;
  IF texto ~* '\mBRIGHTLUX\M' THEN RETURN 'BRIGHTLUX'; END IF;
  IF texto ~* '\mEXATRON\M' THEN RETURN 'EXATRON'; END IF;
  IF texto ~* '\mPHILIPS\M' THEN RETURN 'PHILIPS'; END IF;
  IF texto ~* '\mCOEL\M' THEN RETURN 'COEL'; END IF;

  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE;
