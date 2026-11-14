-- Coordinación entre un mensaje entrante y la limpieza de un archivo.
-- NO APLICAR en producción hasta autorización explícita.
-- No borra mensajes, conversaciones, contactos, flujos, seguimientos ni objetos.
-- La hora es clock_timestamp() de PostgreSQL. El cliente no envía timestamps.
--
-- limpieza_media_hilo: una conversación a la vez. El webhook la toma en modo
-- entrante antes de insertar y la suelta al terminar la persistencia. La
-- limpieza la toma en modo limpieza y la conserva durante el DELETE de Storage.
-- Un modo vigente impide al otro. Si el titular muere, vence y el otro puede
-- continuar. No es un candado global.
--
-- limpieza_media_objeto: exclusividad de un archivo. No la toma el webhook.
-- Evita que dos limpiezas borren el mismo objeto. Conversaciones distintas no
-- se bloquean entre sí.

create table if not exists public.limpieza_media_hilo (
  hilo text primary key,
  modo text,
  locked_by text,
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.limpieza_media_objeto (
  clave text primary key,
  hilo text,
  locked_by text,
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.limpieza_media_hilo enable row level security;
alter table public.limpieza_media_objeto enable row level security;

revoke all on table public.limpieza_media_hilo from public, anon, authenticated;
revoke all on table public.limpieza_media_objeto from public, anon, authenticated;
grant select, insert, update on table public.limpieza_media_hilo to service_role;
grant select, insert, update on table public.limpieza_media_objeto to service_role;

create or replace function public.limpieza_media_hilo_adquirir(
  p_hilo text,
  p_modo text,
  p_owner text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
  v_row public.limpieza_media_hilo%rowtype;
  v_hilo text;
  v_modo text;
  v_owner text;
begin
  -- NULL NOT IN (...) no es verdadero. El modo nulo se rechaza antes de insertar.
  if p_modo is null
     or length(btrim(p_modo)) = 0
     or btrim(p_modo) not in ('entrante', 'limpieza')
     or p_hilo is null or length(btrim(p_hilo)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0
     or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_modo := btrim(p_modo);
  v_hilo := btrim(p_hilo);
  v_owner := btrim(p_owner);
  v_until := v_now + make_interval(secs => p_ttl_seconds);

  insert into public.limpieza_media_hilo (hilo, modo, locked_by, locked_until, updated_at)
  values (v_hilo, v_modo, v_owner, v_until, v_now)
  on conflict (hilo) do nothing
  returning hilo into v_hilo;

  if v_hilo is not null then
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'hilo', v_hilo, 'modo', v_modo,
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  select * into v_row
  from public.limpieza_media_hilo
  where hilo = btrim(p_hilo)
  for update;

  if not found then
    insert into public.limpieza_media_hilo (hilo, modo, locked_by, locked_until, updated_at)
    values (btrim(p_hilo), v_modo, v_owner, v_until, clock_timestamp())
    on conflict (hilo) do nothing
    returning hilo into v_hilo;
    if v_hilo is not null then
      return jsonb_build_object(
        'ok', true, 'motivo', 'adquirida', 'hilo', v_hilo, 'modo', v_modo,
        'locked_by', v_owner, 'locked_until', v_until, 'ahora', clock_timestamp()
      );
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'valla_ocupada', 'ahora', clock_timestamp());
  end if;

  if v_row.locked_by = v_owner and v_row.modo = v_modo and v_row.locked_until > v_now then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    update public.limpieza_media_hilo
      set locked_until = v_until, updated_at = v_now
      where hilo = btrim(p_hilo) and locked_by = v_owner and modo = v_modo and locked_until > v_now;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', clock_timestamp());
    end if;
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'hilo', btrim(p_hilo), 'modo', v_modo,
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  if v_row.locked_until is null or v_row.locked_until <= v_now or v_row.locked_by is null then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    update public.limpieza_media_hilo
      set modo = v_modo, locked_by = v_owner, locked_until = v_until, updated_at = v_now
      where hilo = btrim(p_hilo)
        and (locked_until is null or locked_until <= v_now or locked_by is null);
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'valla_ocupada', 'ahora', clock_timestamp());
    end if;
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'hilo', btrim(p_hilo), 'modo', v_modo,
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  return jsonb_build_object(
    'ok', false, 'motivo', 'valla_ocupada', 'hilo', btrim(p_hilo),
    'modo', v_row.modo, 'locked_by', v_row.locked_by,
    'locked_until', v_row.locked_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_hilo_renovar(
  p_hilo text,
  p_modo text,
  p_owner text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
  v_updated timestamptz;
  v_modo text;
begin
  if p_modo is null
     or length(btrim(p_modo)) = 0
     or btrim(p_modo) not in ('entrante', 'limpieza')
     or p_hilo is null or length(btrim(p_hilo)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0
     or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_modo := btrim(p_modo);
  v_until := v_now + make_interval(secs => p_ttl_seconds);
  update public.limpieza_media_hilo
    set locked_until = v_until, updated_at = v_now
    where hilo = btrim(p_hilo)
      and modo = v_modo
      and locked_by = btrim(p_owner)
      and locked_until > v_now
    returning locked_until into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'renovada', 'hilo', btrim(p_hilo), 'modo', v_modo,
    'locked_by', btrim(p_owner), 'locked_until', v_updated, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_hilo_verificar(
  p_hilo text,
  p_modo text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.limpieza_media_hilo%rowtype;
  v_modo text;
begin
  if p_modo is null
     or length(btrim(p_modo)) = 0
     or btrim(p_modo) not in ('entrante', 'limpieza')
     or p_hilo is null or length(btrim(p_hilo)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_modo := btrim(p_modo);
  select * into v_row
  from public.limpieza_media_hilo
  where hilo = btrim(p_hilo) and modo = v_modo and locked_by = btrim(p_owner) and locked_until > v_now;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'vigente', 'hilo', btrim(p_hilo), 'modo', v_modo,
    'locked_by', btrim(p_owner), 'locked_until', v_row.locked_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_hilo_liberar(
  p_hilo text,
  p_modo text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hilo text;
  v_row public.limpieza_media_hilo%rowtype;
  v_modo text;
begin
  if p_modo is null
     or length(btrim(p_modo)) = 0
     or btrim(p_modo) not in ('entrante', 'limpieza')
     or p_hilo is null or length(btrim(p_hilo)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_modo := btrim(p_modo);
  select * into v_row
  from public.limpieza_media_hilo
  where hilo = btrim(p_hilo)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'ahora', v_now);
  end if;

  -- El webhook libera con modo entrante. No puede soltar una valla de limpieza.
  if v_row.modo = 'limpieza' and v_modo is distinct from 'limpieza' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_de_limpieza', 'hilo', v_row.hilo,
      'modo', v_row.modo, 'locked_by', v_row.locked_by, 'liberada', false, 'ahora', v_now
    );
  end if;

  update public.limpieza_media_hilo
    set modo = null, locked_by = null, locked_until = v_now, updated_at = v_now
    where hilo = btrim(p_hilo) and modo = v_modo and locked_by = btrim(p_owner)
    returning hilo into v_hilo;
  if v_hilo is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'ahora', v_now);
  end if;
  return jsonb_build_object('ok', true, 'motivo', 'liberada', 'hilo', v_hilo, 'ahora', v_now);
end;
$$;

create or replace function public.limpieza_media_objeto_adquirir(
  p_clave text,
  p_hilo text,
  p_owner text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
  v_row public.limpieza_media_objeto%rowtype;
  v_clave text;
  v_hilo text;
  v_owner text;
begin
  if p_clave is null or length(btrim(p_clave)) = 0
     or p_hilo is null or length(btrim(p_hilo)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0
     or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_clave := btrim(p_clave);
  v_hilo := btrim(p_hilo);
  v_owner := btrim(p_owner);
  v_until := v_now + make_interval(secs => p_ttl_seconds);

  insert into public.limpieza_media_objeto (clave, hilo, locked_by, locked_until, updated_at)
  values (v_clave, v_hilo, v_owner, v_until, v_now)
  on conflict (clave) do nothing
  returning clave into v_clave;

  if v_clave is not null then
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'clave', v_clave, 'hilo', v_hilo,
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  select * into v_row
  from public.limpieza_media_objeto
  where clave = btrim(p_clave)
  for update;

  if not found then
    insert into public.limpieza_media_objeto (clave, hilo, locked_by, locked_until, updated_at)
    values (btrim(p_clave), v_hilo, v_owner, v_until, clock_timestamp())
    on conflict (clave) do nothing
    returning clave into v_clave;
    if v_clave is not null then
      return jsonb_build_object(
        'ok', true, 'motivo', 'adquirida', 'clave', v_clave, 'hilo', v_hilo,
        'locked_by', v_owner, 'locked_until', v_until, 'ahora', clock_timestamp()
      );
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'objeto_ocupado', 'ahora', clock_timestamp());
  end if;

  if v_row.locked_by = v_owner and v_row.locked_until > v_now then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    update public.limpieza_media_objeto
      set hilo = v_hilo, locked_until = v_until, updated_at = v_now
      where clave = btrim(p_clave) and locked_by = v_owner and locked_until > v_now;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', clock_timestamp());
    end if;
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'clave', btrim(p_clave),
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  if v_row.locked_until is null or v_row.locked_until <= v_now or v_row.locked_by is null then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    update public.limpieza_media_objeto
      set hilo = v_hilo, locked_by = v_owner, locked_until = v_until, updated_at = v_now
      where clave = btrim(p_clave)
        and (locked_until is null or locked_until <= v_now or locked_by is null);
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'objeto_ocupado', 'ahora', clock_timestamp());
    end if;
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirida', 'clave', btrim(p_clave),
      'locked_by', v_owner, 'locked_until', v_until, 'ahora', v_now
    );
  end if;

  return jsonb_build_object(
    'ok', false, 'motivo', 'objeto_ocupado', 'clave', btrim(p_clave),
    'locked_by', v_row.locked_by, 'locked_until', v_row.locked_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_objeto_renovar(
  p_clave text,
  p_owner text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
  v_updated timestamptz;
begin
  if p_clave is null or length(btrim(p_clave)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0
     or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_until := v_now + make_interval(secs => p_ttl_seconds);
  update public.limpieza_media_objeto
    set locked_until = v_until, updated_at = v_now
    where clave = btrim(p_clave) and locked_by = btrim(p_owner) and locked_until > v_now
    returning locked_until into v_updated;
  if v_updated is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'renovada', 'clave', btrim(p_clave),
    'locked_by', btrim(p_owner), 'locked_until', v_updated, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_objeto_verificar(
  p_clave text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.limpieza_media_objeto%rowtype;
begin
  if p_clave is null or length(btrim(p_clave)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_objeto
  where clave = btrim(p_clave) and locked_by = btrim(p_owner) and locked_until > v_now;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'valla_perdida', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'vigente', 'clave', btrim(p_clave),
    'locked_by', btrim(p_owner), 'locked_until', v_row.locked_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_objeto_liberar(
  p_clave text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_clave text;
  v_owner text;
begin
  if p_clave is null or length(btrim(p_clave)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  v_owner := btrim(p_owner);
  -- El webhook usa owners wh:. No suelta el objeto reservado por la limpieza.
  if v_owner like 'wh:%' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_de_limpieza', 'clave', btrim(p_clave),
      'liberada', false, 'ahora', v_now
    );
  end if;

  update public.limpieza_media_objeto
    set locked_by = null, locked_until = v_now, updated_at = v_now
    where clave = btrim(p_clave) and locked_by = v_owner
    returning clave into v_clave;
  if v_clave is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'ahora', v_now);
  end if;
  return jsonb_build_object('ok', true, 'motivo', 'liberada', 'clave', v_clave, 'ahora', v_now);
end;
$$;

revoke all on function public.limpieza_media_hilo_adquirir(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.limpieza_media_hilo_renovar(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.limpieza_media_hilo_verificar(text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_hilo_liberar(text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_objeto_adquirir(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.limpieza_media_objeto_renovar(text, text, integer) from public, anon, authenticated;
revoke all on function public.limpieza_media_objeto_verificar(text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_objeto_liberar(text, text) from public, anon, authenticated;

grant execute on function public.limpieza_media_hilo_adquirir(text, text, text, integer) to service_role;
grant execute on function public.limpieza_media_hilo_renovar(text, text, text, integer) to service_role;
grant execute on function public.limpieza_media_hilo_verificar(text, text, text) to service_role;
grant execute on function public.limpieza_media_hilo_liberar(text, text, text) to service_role;
grant execute on function public.limpieza_media_objeto_adquirir(text, text, text, integer) to service_role;
grant execute on function public.limpieza_media_objeto_renovar(text, text, integer) to service_role;
grant execute on function public.limpieza_media_objeto_verificar(text, text) to service_role;
grant execute on function public.limpieza_media_objeto_liberar(text, text) to service_role;
