-- Marca incierta: no se vuelve a reservar y la recuperación no borra.
-- Aplicar después de limpieza_media_marca.sql. La tabla ya existe.
-- Ejecutar una vez. Volver a ejecutarla reemplaza las mismas funciones
-- y no duplica filas.
--
-- No borra ni modifica mensajes, conversaciones, contactos ni archivos.
-- No hace DELETE. No toca Storage. No suelta la conversación.
-- Solo reemplaza limpieza_media_marca_reservar y crea
-- limpieza_media_marca_recuperar. Los permisos quedan en service_role.
--
-- reservar: una fila con resultado incierto responde resultado_incierto
-- aunque liberar haya dejado estado null. El UPDATE no puede borrar
-- ese resultado.
-- recuperar: exige el booleano de existencia, deja resultado incierto,
-- conserva estado borrando y devuelve liberada false.

comment on table public.limpieza_media_marca is
  'Una fila por conversación. reservado y borrando frenan al webhook. borrando no vence. Un resultado incierto no vuelve a reservarse aunque se libere el estado. La recuperación de borrando sin resultado exige verificar el objeto y deja resultado incierto, sin soltar la fila y sin un segundo DELETE. Liberar no corre con Storage en curso ni sobre reservado o entrante. La fila se conserva.';

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

  -- Liberar deja estado null y conserva resultado incierto. Esa fila no se reserva otra vez.
  if v_row.resultado = 'incierto' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'resultado_incierto', 'reintentar', false,
      'id', v_row.id, 'estado', v_row.estado, 'resultado', v_row.resultado,
      'ahora', clock_timestamp()
    );
  end if;

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
      and resultado is distinct from 'incierto'
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

create or replace function public.limpieza_media_marca_recuperar(
  p_usuario_id text,
  p_conexion_id text,
  p_cliente_numero text,
  p_actor text,
  p_objeto_existe boolean,
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
begin
  -- No borra objetos ni filas de mensajes. No cambia estado: la suelta sigue siendo otro paso.
  if p_actor is null or length(btrim(p_actor)) = 0 or p_objeto_existe is null then
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

  if not found or v_row.estado is distinct from 'borrando' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'storage', false,
      'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.resultado is not null and v_row.resultado is distinct from 'incierto' then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_no_resoluble', 'id', v_row.id,
      'estado', v_row.estado, 'resultado', v_row.resultado,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  if v_row.clave_archivo is null or length(btrim(v_row.clave_archivo)) = 0 then
    return jsonb_build_object(
      'ok', false, 'motivo', 'marca_sin_clave', 'id', v_row.id,
      'storage', false, 'liberada', false, 'reintentar', false, 'ahora', clock_timestamp()
    );
  end if;

  v_verificacion := jsonb_build_object(
    'resultadoVerificado', 'incierto',
    'resultadoConocido', v_row.resultado,
    'objetoExiste', p_objeto_existe,
    'actor', btrim(p_actor),
    'nota', p_nota,
    'procedimiento', 'recuperacion',
    'en', v_now
  );

  update public.limpieza_media_marca
    set resultado = 'incierto',
        verificacion = v_verificacion,
        updated_at = v_now
    where id = v_row.id
      and estado = 'borrando'
      and (resultado is null or resultado = 'incierto')
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
    'verificar', coalesce(v_row.resultado, 'incierto'), 'incierto', btrim(p_actor), p_nota, v_now
  ) returning id into v_audit;

  return jsonb_build_object(
    'ok', true, 'motivo', 'recuperada', 'id', v_id, 'auditoria_id', v_audit,
    'estado', 'borrando', 'resultado', 'incierto', 'objeto_existe', p_objeto_existe,
    'liberada', false, 'storage', false, 'reintentar', false, 'ahora', v_now
  );
end;
$$;

revoke all on function public.limpieza_media_marca_reservar(text, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_marca_recuperar(text, text, text, text, boolean, text) from public, anon, authenticated;

grant execute on function public.limpieza_media_marca_reservar(text, text, text, text) to service_role;
grant execute on function public.limpieza_media_marca_recuperar(text, text, text, text, boolean, text) to service_role;

-- Rollback manual, no forma parte de la aplicación de este archivo:
-- drop function if exists public.limpieza_media_marca_recuperar(text, text, text, text, boolean, text);
-- La función reservar anterior vive en limpieza_media_marca.sql.
-- Volver a aplicarla restaura la reserva sin el bloqueo de incierto.
