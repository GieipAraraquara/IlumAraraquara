-- ==============================================================================
-- MIGRAÇÃO: AUDITORIA ESTRUTURADA DE LOCALIZAÇÃO DE PLAQUETAS
-- ==============================================================================
-- 1. RPC 'atualizar_posicao_plaqueta_auditada': rotina atômica transacional
-- 2. Trigger de salvaguarda 'trg_audit_localizacao_plaquetas_safety'
-- ==============================================================================

-- 1. FUNÇÃO RPC TRANSACIONAL ESTRUTURADA
create or replace function public.atualizar_posicao_plaqueta_auditada(
    p_identificacao text,
    p_nova_lat numeric,
    p_nova_lng numeric,
    p_origem text,
    p_numero_os text default null,
    p_usuario text default 'Sistema',
    p_observacao text default null,
    p_desvio_metros numeric default null,
    p_extra_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_old_lat numeric;
    v_old_lng numeric;
    v_desvio numeric := p_desvio_metros;
    v_obs_final text := coalesce(p_observacao, '');
    v_plaq_id text := upper(trim(p_identificacao));
    v_row_updated record;
    v_hist_id uuid;
begin
    -- Sinalizar na transação que esta operação é auditada estruturadamente
    perform set_config('app.audit_origem', p_origem, true);

    -- Buscar localização anterior
    select "Latitude", "Longitude"
    into v_old_lat, v_old_lng
    from public.localizacao_plaquetas
    where upper(trim(identificacao)) = v_plaq_id
    limit 1;

    -- Se não foi passado desvio explicitamente e tínhamos posição anterior válida,
    -- calculamos via fórmula haversine simplificada
    if v_desvio is null and v_old_lat is not null and v_old_lng is not null and p_nova_lat is not null and p_nova_lng is not null then
        declare
            dlat double precision := radians(p_nova_lat - v_old_lat);
            dlng double precision := radians(p_nova_lng - v_old_lng);
            a double precision;
            c double precision;
        begin
            a := sin(dlat/2)^2 + cos(radians(v_old_lat)) * cos(radians(p_nova_lat)) * sin(dlng/2)^2;
            c := 2 * atan2(sqrt(a), sqrt(1 - a));
            v_desvio := round((6371000 * c)::numeric, 1);
        end;
    end if;

    -- Enriquecer a observação com o desvio se houver
    if v_desvio is not null and v_desvio > 0 and position('Desvio' in v_obs_final) = 0 then
        if length(v_obs_final) > 0 then
            v_obs_final := v_obs_final || ' (Desvio: ' || v_desvio || 'm)';
        else
            v_obs_final := 'Desvio calculado: ' || v_desvio || 'm';
        end if;
    end if;

    -- Atualizar a tabela mestre localizacao_plaquetas
    update public.localizacao_plaquetas
    set 
        "Latitude" = p_nova_lat,
        "Longitude" = p_nova_lng,
        "Observação" = case 
            when p_extra_payload->>'limpar_obs' = 'true' then '' 
            when p_extra_payload->>'nova_obs' is not null then p_extra_payload->>'nova_obs'
            else "Observação" 
        end
    where upper(trim(identificacao)) = v_plaq_id
    returning * into v_row_updated;

    -- Inserir na tabela de histórico de movimentações com contexto rico
    insert into public.historico_localizacao_plaquetas (
        identificacao,
        latitude,
        longitude,
        numero_os,
        origem,
        usuario,
        observacao,
        created_at
    )
    values (
        v_plaq_id,
        p_nova_lat,
        p_nova_lng,
        nullif(trim(p_numero_os), ''),
        p_origem,
        coalesce(nullif(trim(p_usuario), ''), 'Sistema'),
        nullif(trim(v_obs_final), ''),
        now()
    )
    returning id into v_hist_id;

    return jsonb_build_object(
        'success', true,
        'identificacao', v_plaq_id,
        'historico_id', v_hist_id,
        'desvio_metros', v_desvio,
        'origem', p_origem
    );
exception when others then
    return jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
end;
$$;

-- Permissões de execução para a API do Supabase
grant execute on function public.atualizar_posicao_plaqueta_auditada to anon, authenticated, service_role;

-- 2. TRIGGER INTELIGENTE DE SEGURANÇA (SAFETY NET)
create or replace function public.fn_audit_localizacao_plaquetas_safety()
returns trigger
language plpgsql
security definer
as $$
declare
    v_audit_origem text;
    v_has_coord_changed boolean;
    v_user_ident text;
begin
    -- Verificar se já foi auditado via RPC nesta transação
    v_audit_origem := current_setting('app.audit_origem', true);
    if v_audit_origem is not null and v_audit_origem <> '' then
        -- Já auditado pela aplicação com contexto completo. Ignora a trigger!
        return NEW;
    end if;

    -- Verificar se as coordenadas realmente mudaram (evita ruído/updates de outros campos)
    v_has_coord_changed := (
        coalesce(NEW."Latitude", 0) <> coalesce(OLD."Latitude", 0) or
        coalesce(NEW."Longitude", 0) <> coalesce(OLD."Longitude", 0)
    );

    if not v_has_coord_changed then
        return NEW;
    end if;

    -- Capturar usuário do Supabase Auth se existir, senão marcar DBA/Sistema
    v_user_ident := coalesce(
        auth.jwt() ->> 'email',
        current_user,
        'DBA / Acesso Direto'
    );

    -- Gravar log salvaguarda categorizado como intervenção direta
    insert into public.historico_localizacao_plaquetas (
        identificacao,
        latitude,
        longitude,
        origem,
        usuario,
        observacao,
        created_at
    )
    values (
        NEW.identificacao,
        NEW."Latitude",
        NEW."Longitude",
        'EDICAO_DIRETA_BANCO',
        v_user_ident,
        'Alteração de coordenadas direta na tabela (sem OS associada)',
        now()
    );

    return NEW;
end;
$$;

-- Remover a trigger antiga que gerava TRIGGER_UPDATE genérico em qualquer alteração
drop trigger if exists trg_registrar_historico_plaqueta on public.localizacao_plaquetas;
drop trigger if exists trg_audit_localizacao_plaquetas on public.localizacao_plaquetas;
drop trigger if exists trg_audit_localizacao_plaquetas_safety on public.localizacao_plaquetas;

-- Criar a nova trigger de segurança
create trigger trg_audit_localizacao_plaquetas_safety
after update on public.localizacao_plaquetas
for each row
execute function public.fn_audit_localizacao_plaquetas_safety();
