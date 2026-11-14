-- Marca durable por conversación para la futura limpieza de multimedia.
-- NO APLICAR en producción hasta autorización explícita.
-- No borra mensajes, conversaciones, contactos, flujos, seguimientos ni objetos.
-- No tiene locked_until: el estado borrando no vence solo.
-- Reversible solo con el bloque comentado al final. Este archivo no lo ejecuta.

create table if not exists public.limpieza_media_marca (
  id bigint generated always as identity primary key,
  usuario_id text not null,
  conexion_whatsapp_id text not null,
  cliente_numero text not null,
  estado text,
  owner text,
  clave_archivo text,
  resultado text,
  iniciada_en timestamptz,
  verificacion jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint limpieza_media_marca_hilo_unica
    unique (usuario_id, conexion_whatsapp_id, cliente_numero),
  constraint limpieza_media_marca_estado_chk
    check (estado is null or estado in ('reservado', 'entrante', 'borrando')),
  constraint limpieza_media_marca_resultado_chk
    check (
      resultado is null
      or resultado in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto')
    )
);

create index if not exists limpieza_media_marca_estado_idx
  on public.limpieza_media_marca (estado)
  where estado is not null;

create table if not exists public.limpieza_media_marca_auditoria (
  id bigint generated always as identity primary key,
  marca_id bigint,
  usuario_id text,
  conexion_whatsapp_id text,
  cliente_numero text,
  clave_archivo text,
  accion text not null,
  resultado_conocido text,
  resultado_verificado text,
  actor text not null,
  nota text,
  created_at timestamptz not null default clock_timestamp(),
  constraint limpieza_media_marca_auditoria_accion_chk
    check (accion in ('verificar', 'liberar')),
  constraint limpieza_media_marca_auditoria_resultado_chk
    check (
      resultado_verificado is null
      or resultado_verificado in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto')
    )
);

alter table public.limpieza_media_marca enable row level security;
alter table public.limpieza_media_marca_auditoria enable row level security;

revoke all on table public.limpieza_media_marca from public, anon, authenticated;
revoke all on table public.limpieza_media_marca_auditoria from public, anon, authenticated;

grant select, insert, update on table public.limpieza_media_marca to service_role;
grant select, insert on table public.limpieza_media_marca_auditoria to service_role;

grant usage, select on sequence public.limpieza_media_marca_id_seq to service_role;
grant usage, select on sequence public.limpieza_media_marca_auditoria_id_seq to service_role;

comment on table public.limpieza_media_marca is
  'Una fila por conversación. reservado y borrando frenan al webhook. borrando no vence. La verificación administrativa solo aplica a borrando con resultado ya registrado. Liberar no corre con Storage en curso ni sobre reservado o entrante. La fila se conserva.';
comment on table public.limpieza_media_marca_auditoria is
  'Auditoría append-only de verificaciones y liberaciones. No autoriza un DELETE.';

create or replace function public.limpieza_media_marca_reservar(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_usuario_id is null or length(btrim(p_usuario_id)) = 0
     or p_conexion_id is null or length(btrim(p_conexion_id)) = 0
     or p_cliente_numero is null or length(btrim(p_cliente_numero)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  insert into public.limpieza_media_marca (
    usuario_id, conexion_whatsapp_id, cliente_numero, estado, owner, created_at, updated_at
  ) values (
    btrim(p_usuario_id), btrim(p_conexion_id), btrim(p_cliente_numero),
    'reservado', btrim(p_owner), v_now, v_now
  )
  on conflict (usuario_id, conexion_whatsapp_id, cliente_numero) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object(
      'ok', true, 'motivo', 'reservado', 'id', v_id, 'estado', 'reservado',
      'owner', btrim(p_owner), 'ahora', v_now
    );
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if v_row.estado in ('reservado', 'entrante', 'borrando') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'valla_ocupada', 'id', v_row.id, 'estado', v_row.estado,
      'owner', v_row.owner, 'resultado', v_row.resultado, 'ahora', clock_timestamp()
    );
  end if;

  update public.limpieza_media_marca
    set estado = 'reservado',
        owner = btrim(p_owner),
        clave_archivo = null,
        resultado = null,
        iniciada_en = null,
        verificacion = null,
        updated_at = clock_timestamp()
    where id = v_row.id
      and estado is null
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ocupada', 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'reservado', 'id', v_id, 'estado', 'reservado',
    'owner', btrim(p_owner), 'ahora', clock_timestamp()
  );
end;
$$;

create or replace function public.limpieza_media_marca_entrante(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_usuario_id is null or length(btrim(p_usuario_id)) = 0
     or p_conexion_id is null or length(btrim(p_conexion_id)) = 0
     or p_cliente_numero is null or length(btrim(p_cliente_numero)) = 0
     or p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  insert into public.limpieza_media_marca (
    usuario_id, conexion_whatsapp_id, cliente_numero, estado, owner, created_at, updated_at
  ) values (
    btrim(p_usuario_id), btrim(p_conexion_id), btrim(p_cliente_numero),
    'entrante', btrim(p_owner), v_now, v_now
  )
  on conflict (usuario_id, conexion_whatsapp_id, cliente_numero) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object(
      'ok', true, 'motivo', 'entrante', 'id', v_id, 'estado', 'entrante',
      'owner', btrim(p_owner), 'ahora', v_now
    );
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if v_row.estado in ('reservado', 'borrando')
     or (v_row.estado = 'entrante' and v_row.owner is distinct from btrim(p_owner)) then
    return jsonb_build_object(
      'ok', false, 'motivo', 'valla_ocupada', 'id', v_row.id, 'estado', v_row.estado,
      'owner', v_row.owner, 'resultado', v_row.resultado, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.estado = 'entrante' and v_row.owner = btrim(p_owner) then
    return jsonb_build_object(
      'ok', true, 'motivo', 'entrante', 'id', v_row.id, 'estado', 'entrante',
      'owner', v_row.owner, 'ahora', clock_timestamp()
    );
  end if;

  update public.limpieza_media_marca
    set estado = 'entrante',
        owner = btrim(p_owner),
        updated_at = clock_timestamp()
    where id = v_row.id
      and estado is null
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ocupada', 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'entrante', 'id', v_id, 'estado', 'entrante',
    'owner', btrim(p_owner), 'ahora', clock_timestamp()
  );
end;
$$;

create or replace function public.limpieza_media_marca_soltar_entrante(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;

  -- reservado y borrando pertenecen a la limpieza. Un entrante se suelta aunque quede un resultado viejo.
  if v_row.estado in ('reservado', 'borrando') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_de_limpieza', 'id', v_row.id,
      'estado', v_row.estado, 'resultado', v_row.resultado,
      'liberada', false, 'storage', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.estado is distinct from 'entrante' or v_row.owner is distinct from btrim(p_owner) then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;

  update public.limpieza_media_marca
    set estado = null,
        owner = null,
        updated_at = v_now
    where id = v_row.id
      and estado = 'entrante'
      and owner = btrim(p_owner)
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object('ok', true, 'motivo', 'soltada', 'id', v_id, 'estado', null, 'liberada', true, 'storage', false, 'ahora', v_now);
end;
$$;

create or replace function public.limpieza_media_marca_soltar_reservado(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_owner is null or length(btrim(p_owner)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'liberada', false, 'storage', false, 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;

  if v_row.estado in ('entrante', 'borrando') or v_row.resultado is not null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_de_limpieza', 'id', v_row.id,
      'estado', v_row.estado, 'resultado', v_row.resultado,
      'liberada', false, 'storage', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.estado is distinct from 'reservado' or v_row.owner is distinct from btrim(p_owner) then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;

  update public.limpieza_media_marca
    set estado = null,
        owner = null,
        updated_at = v_now
    where id = v_row.id
      and estado = 'reservado'
      and owner = btrim(p_owner)
      and resultado is null
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ajena', 'liberada', false, 'storage', false, 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'soltada', 'id', v_id, 'estado', null,
    'liberada', true, 'storage', false, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_marca_borrando(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text,
  p_clave_archivo text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_owner is null or length(btrim(p_owner)) = 0
     or p_clave_archivo is null or length(btrim(p_clave_archivo)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'ahora', clock_timestamp());
  end if;
  if v_row.estado = 'borrando' or v_row.resultado = 'incierto' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'resultado_incierto', 'reintentar', false,
      'id', v_row.id, 'estado', v_row.estado, 'resultado', v_row.resultado,
      'ahora', clock_timestamp()
    );
  end if;
  if v_row.estado is distinct from 'reservado' or v_row.owner is distinct from btrim(p_owner) then
    return jsonb_build_object(
      'ok', false, 'motivo', 'owner_incorrecto', 'id', v_row.id,
      'estado', v_row.estado, 'owner', v_row.owner, 'ahora', clock_timestamp()
    );
  end if;

  update public.limpieza_media_marca
    set estado = 'borrando',
        clave_archivo = btrim(p_clave_archivo),
        iniciada_en = v_now,
        resultado = null,
        verificacion = null,
        updated_at = v_now
    where id = v_row.id
      and estado = 'reservado'
      and owner = btrim(p_owner)
      and resultado is distinct from 'incierto'
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'valla_ocupada', 'reintentar', false, 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'borrando', 'id', v_id, 'estado', 'borrando',
    'clave_archivo', btrim(p_clave_archivo), 'iniciada_en', v_now,
    'reintentar', false, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_marca_resultado(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_owner text,
  p_resultado text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_row public.limpieza_media_marca%rowtype;
begin
  if p_resultado is null
     or p_resultado not in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto') then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found or v_row.estado is distinct from 'borrando' then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'reintentar', false, 'ahora', clock_timestamp());
  end if;
  if v_row.owner is distinct from btrim(p_owner) then
    return jsonb_build_object('ok', false, 'motivo', 'owner_incorrecto', 'reintentar', false, 'ahora', clock_timestamp());
  end if;
  if v_row.resultado = 'incierto' or v_row.resultado is not null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'resultado_incierto', 'reintentar', false,
      'resultado', v_row.resultado, 'ahora', clock_timestamp()
    );
  end if;

  update public.limpieza_media_marca
    set resultado = p_resultado,
        updated_at = v_now
    where id = v_row.id
      and estado = 'borrando'
      and owner = btrim(p_owner)
      and resultado is null
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'resultado_incierto', 'reintentar', false, 'ahora', clock_timestamp());
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'resultado_registrado', 'id', v_id,
    'resultado', p_resultado, 'reintentar', false, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_marca_verificar(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_resultado_verificado text,
  p_actor text,
  p_nota text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_audit bigint;
  v_row public.limpieza_media_marca%rowtype;
  v_verificacion jsonb;
  v_resultado text := nullif(btrim(p_resultado_verificado), '');
  v_requiere_resolucion boolean;
begin
  -- NULL NOT IN (...) no es verdadero en SQL. El NULL y el vacío se rechazan aparte.
  if p_actor is null or length(btrim(p_actor)) = 0
     or p_resultado_verificado is null
     or v_resultado is null
     or v_resultado not in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'verificacion_invalida', 'storage', false,
      'liberada', false, 'reintentar', false, 'ahora', v_now
    );
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found or v_row.estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'storage', false, 'liberada', false, 'ahora', clock_timestamp());
  end if;

  if v_row.estado in ('reservado', 'entrante') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'id', v_row.id, 'estado', v_row.estado,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  -- Requiere resolución solo si el borrado ya dejó un resultado. NULL sigue siendo Storage en curso.
  v_requiere_resolucion := v_row.estado = 'borrando'
    and v_row.resultado is not null
    and v_row.resultado in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto');

  if v_row.estado = 'borrando' and v_row.resultado is null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'storage_en_curso', 'id', v_row.id, 'estado', v_row.estado,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if not v_requiere_resolucion then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'id', v_row.id, 'estado', v_row.estado,
      'resultado', v_row.resultado, 'storage', false, 'liberada', false,
      'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  v_verificacion := jsonb_build_object(
    'resultadoVerificado', v_resultado,
    'resultadoConocido', v_row.resultado,
    'actor', btrim(p_actor),
    'nota', p_nota,
    'en', v_now
  );

  update public.limpieza_media_marca
    set verificacion = v_verificacion,
        updated_at = v_now
    where id = v_row.id
      and estado = 'borrando'
      and resultado is not null
      and resultado in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto')
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'storage', false,
      'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  insert into public.limpieza_media_marca_auditoria (
    marca_id, usuario_id, conexion_whatsapp_id, cliente_numero, clave_archivo,
    accion, resultado_conocido, resultado_verificado, actor, nota, created_at
  ) values (
    v_row.id, v_row.usuario_id, v_row.conexion_whatsapp_id, v_row.cliente_numero, v_row.clave_archivo,
    'verificar', v_row.resultado, v_resultado, btrim(p_actor), p_nota, v_now
  ) returning id into v_audit;

  return jsonb_build_object(
    'ok', true, 'motivo', 'verificada', 'id', v_id, 'auditoria_id', v_audit,
    'liberada', false, 'storage', false, 'reintentar', false, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_marca_liberar(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_actor text,
  p_nota text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id bigint;
  v_audit bigint;
  v_row public.limpieza_media_marca%rowtype;
  v_verificado text;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'actor_requerido', 'storage', false, 'liberada', false, 'ahora', v_now);
  end if;

  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero)
  for update;

  if not found or v_row.estado is null then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'storage', false, 'liberada', false, 'ahora', clock_timestamp());
  end if;

  if v_row.estado in ('reservado', 'entrante') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'id', v_row.id, 'estado', v_row.estado,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.estado is distinct from 'borrando' then
    return jsonb_build_object('ok', false, 'motivo', 'marca_ausente', 'storage', false, 'liberada', false, 'ahora', clock_timestamp());
  end if;

  -- resultado null: la llamada a Storage todavía no terminó. No se libera.
  if v_row.resultado is null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'storage_en_curso', 'id', v_row.id, 'estado', v_row.estado,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  -- incierto permanece bloqueado hasta una verificación manual previa.
  v_verificado := v_row.verificacion->>'resultadoVerificado';
  if v_verificado is null
     or v_verificado not in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto') then
    return jsonb_build_object(
      'ok', false, 'motivo', 'verificacion_requerida', 'storage', false,
      'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  update public.limpieza_media_marca
    set estado = null,
        owner = null,
        updated_at = v_now
    where id = v_row.id
      and estado = 'borrando'
      and estado not in ('reservado', 'entrante')
      and resultado is not null
      and resultado in ('eliminado_confirmado', 'no_eliminado_confirmado', 'incierto')
      and verificacion->>'resultadoVerificado' = v_verificado
    returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'verificacion_requerida', 'storage', false, 'liberada', false, 'ahora', clock_timestamp());
  end if;

  insert into public.limpieza_media_marca_auditoria (
    marca_id, usuario_id, conexion_whatsapp_id, cliente_numero, clave_archivo,
    accion, resultado_conocido, resultado_verificado, actor, nota, created_at
  ) values (
    v_row.id, v_row.usuario_id, v_row.conexion_whatsapp_id, v_row.cliente_numero, v_row.clave_archivo,
    'liberar', coalesce(v_row.resultado, 'incierto'), v_verificado, btrim(p_actor), p_nota, v_now
  ) returning id into v_audit;

  return jsonb_build_object(
    'ok', true, 'motivo', 'liberada', 'id', v_id, 'auditoria_id', v_audit,
    'liberada', true, 'storage', false, 'reintentar', false, 'ahora', v_now
  );
end;
$$;

create or replace function public.limpieza_media_marca_consultar(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.limpieza_media_marca%rowtype;
begin
  select * into v_row
  from public.limpieza_media_marca
  where usuario_id = btrim(p_usuario_id)
    and conexion_whatsapp_id = btrim(p_conexion_id)
    and cliente_numero = btrim(p_cliente_numero);

  if not found then
    return jsonb_build_object('ok', true, 'motivo', 'marca_ausente', 'marca', null, 'ahora', v_now);
  end if;
  return jsonb_build_object(
    'ok', true, 'motivo', 'consultada', 'ahora', v_now,
    'marca', jsonb_build_object(
      'id', v_row.id,
      'usuario_id', v_row.usuario_id,
      'conexion_whatsapp_id', v_row.conexion_whatsapp_id,
      'cliente_numero', v_row.cliente_numero,
      'estado', v_row.estado,
      'owner', v_row.owner,
      'clave_archivo', v_row.clave_archivo,
      'resultado', v_row.resultado,
      'iniciada_en', v_row.iniciada_en,
      'verificacion', v_row.verificacion,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    )
  );
end;
$$;

create or replace function public.limpieza_media_marca_listar(p_estado text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_marcas jsonb;
begin
  if p_estado is not null and p_estado not in ('reservado', 'entrante', 'borrando') then
    return jsonb_build_object('ok', false, 'motivo', 'parametro_invalido', 'marcas', '[]'::jsonb, 'ahora', v_now);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'usuario_id', usuario_id,
    'conexion_whatsapp_id', conexion_whatsapp_id,
    'cliente_numero', cliente_numero,
    'estado', estado,
    'owner', owner,
    'clave_archivo', clave_archivo,
    'resultado', resultado,
    'iniciada_en', iniciada_en,
    'verificacion', verificacion,
    'created_at', created_at,
    'updated_at', updated_at
  ) order by iniciada_en nulls last, id), '[]'::jsonb)
  into v_marcas
  from public.limpieza_media_marca
  where estado is not null
    and (p_estado is null or estado = p_estado);

  return jsonb_build_object('ok', true, 'motivo', 'listada', 'marcas', v_marcas, 'ahora', v_now);
end;
$$;

revoke all on function public.limpieza_media_marca_reservar(text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_entrante(text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_soltar_entrante(text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_soltar_reservado(text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_borrando(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_resultado(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_verificar(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_liberar(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_consultar(text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_listar(text) from public, anon, authenticated;

grant execute on function public.limpieza_media_marca_reservar(text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_entrante(text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_soltar_entrante(text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_soltar_reservado(text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_borrando(text, text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_resultado(text, text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_verificar(text, text, text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_liberar(text, text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_consultar(text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_listar(text) to service_role;

-- Rollback manual, no forma parte de la aplicación de este archivo:
-- drop function if exists public.limpieza_media_marca_listar(text);
-- drop function if exists public.limpieza_media_marca_consultar(text, text, text);
-- drop function if exists public.limpieza_media_marca_liberar(text, text, text, text, text);
-- drop function if exists public.limpieza_media_marca_verificar(text, text, text, text, text, text);
-- drop function if exists public.limpieza_media_marca_resultado(text, text, text, text, text);
-- drop function if exists public.limpieza_media_marca_borrando(text, text, text, text, text);
-- drop function if exists public.limpieza_media_marca_soltar_reservado(text, text, text, text);
-- drop function if exists public.limpieza_media_marca_soltar_entrante(text, text, text, text);
-- drop function if exists public.limpieza_media_marca_entrante(text, text, text, text);
-- drop function if exists public.limpieza_media_marca_reservar(text, text, text, text);
-- drop table if exists public.limpieza_media_marca_auditoria;
-- drop table if exists public.limpieza_media_marca;
