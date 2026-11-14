-- Reloj y candado atómico de la limpieza de multimedia.
-- NO APLICAR en producción hasta autorización explícita.
-- No borra objetos ni filas de mensajes, conversaciones, contactos, flujos o seguimientos.
-- La hora de vigencia es clock_timestamp() de PostgreSQL. El cliente no envía timestamps.

create or replace function public.limpieza_media_adquirir(p_worker text, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
  v_row public.limpieza_media_lock%rowtype;
begin
  if p_worker is null or length(btrim(p_worker)) = 0 or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_lock
  where id = 'global'
  for update;

  if not found then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    insert into public.limpieza_media_lock (id, locked_by, locked_until, updated_at)
    values ('global', p_worker, v_until, v_now);
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirido', 'locked_by', p_worker,
      'locked_until', v_until, 'ahora', v_now
    );
  end if;

  if v_row.locked_by = p_worker and v_row.locked_until > v_now then
    v_until := v_now + make_interval(secs => p_ttl_seconds);
    update public.limpieza_media_lock
      set locked_until = v_until,
          updated_at = v_now
      where id = 'global'
        and locked_by = p_worker
        and locked_until > v_now;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'candado_perdido', 'ahora', clock_timestamp());
    end if;
    return jsonb_build_object(
      'ok', true, 'motivo', 'adquirido', 'locked_by', p_worker,
      'locked_until', v_until, 'ahora', v_now
    );
  end if;

  if v_row.locked_by = p_worker and v_row.locked_until <= v_now then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'candado_vencido_no_recuperable',
      'locked_by', v_row.locked_by,
      'locked_until', v_row.locked_until,
      'ahora', v_now
    );
  end if;

  if v_row.locked_by is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'ok', false, 'motivo', 'candado_ocupado',
      'locked_by', v_row.locked_by,
      'locked_until', v_row.locked_until,
      'ahora', v_now
    );
  end if;

  v_until := v_now + make_interval(secs => p_ttl_seconds);
  update public.limpieza_media_lock
    set locked_by = p_worker,
        locked_until = v_until,
        updated_at = v_now
    where id = 'global'
      and locked_by is distinct from p_worker
      and (locked_until is null or locked_until <= v_now);
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'candado_ocupado', 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'adquirido', 'locked_by', p_worker,
    'locked_until', v_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_renovar(p_worker text, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_until timestamptz := v_now + make_interval(secs => p_ttl_seconds);
  v_updated timestamptz;
begin
  if p_worker is null or length(btrim(p_worker)) = 0 or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  update public.limpieza_media_lock
    set locked_until = v_until,
        updated_at = v_now
    where id = 'global'
      and locked_by = p_worker
      and locked_until > v_now
    returning locked_until into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'motivo', 'candado_perdido', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'renovado', 'locked_by', p_worker,
    'locked_until', v_updated, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_verificar(p_worker text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.limpieza_media_lock%rowtype;
begin
  if p_worker is null or length(btrim(p_worker)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'candado_perdido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_lock
  where id = 'global'
    and locked_by = p_worker
    and locked_until > v_now;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'candado_perdido', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'vigente', 'locked_by', v_row.locked_by,
    'locked_until', v_row.locked_until, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_liberar(p_worker text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id text;
begin
  if p_worker is null or length(btrim(p_worker)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'candado_ajeno', 'ahora', v_now);
  end if;

  update public.limpieza_media_lock
    set locked_by = null,
        locked_until = v_now,
        updated_at = v_now
    where id = 'global'
      and locked_by = p_worker
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'candado_ajeno', 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'liberado', 'locked_by', null,
    'locked_until', v_now, 'ahora', v_now
  );
end;
$$;

revoke all on function public.limpieza_media_adquirir(text, integer) from public;
revoke all on function public.limpieza_media_adquirir(text, integer) from anon;
revoke all on function public.limpieza_media_adquirir(text, integer) from authenticated;
grant execute on function public.limpieza_media_adquirir(text, integer) to service_role;

revoke all on function public.limpieza_media_renovar(text, integer) from public;
revoke all on function public.limpieza_media_renovar(text, integer) from anon;
revoke all on function public.limpieza_media_renovar(text, integer) from authenticated;
grant execute on function public.limpieza_media_renovar(text, integer) to service_role;

revoke all on function public.limpieza_media_verificar(text) from public;
revoke all on function public.limpieza_media_verificar(text) from anon;
revoke all on function public.limpieza_media_verificar(text) from authenticated;
grant execute on function public.limpieza_media_verificar(text) to service_role;

revoke all on function public.limpieza_media_liberar(text) from public;
revoke all on function public.limpieza_media_liberar(text) from anon;
revoke all on function public.limpieza_media_liberar(text) from authenticated;
grant execute on function public.limpieza_media_liberar(text) to service_role;

comment on function public.limpieza_media_adquirir(text, integer) is
  'Toma el candado global solo si está libre para otro worker, o si este worker todavía lo tiene vigente. Un worker no recupera su propio candado vencido. Usa clock_timestamp().';
comment on function public.limpieza_media_renovar(text, integer) is
  'Renueva en una sola sentencia si locked_by es el worker y locked_until > clock_timestamp(). Si venció, no escribe.';
