-- Último mensaje entrante de cada conversación.
-- NO APLICAR en producción hasta autorización explícita.
-- No borra mensajes, conversaciones, contactos, flujos, seguimientos ni objetos.
-- No habilita eliminación real. No modifica el webhook.
--
-- Esquema que esta migración exige, el mismo que ya usa el proyecto:
--   conversaciones.id, usuario_id, conexion_whatsapp_id          uuid
--   conversaciones.cliente_numero                                text o varchar
--   conversaciones.ultimo_mensaje_en                             timestamp without time zone
--   mensajes.usuario_id, conexion_whatsapp_id                    uuid
--   mensajes.cliente_numero, direccion                           text o varchar
--   mensajes.creado_en                                           timestamp without time zone
-- El repositorio no declara DEFAULT para mensajes.creado_en.
-- No hay CREATE TABLE de mensajes ni un ALTER que lo fije.
-- Esta migración no añade un DEFAULT y no modifica esa columna.
-- Si creado_en queda nulo, ese mensaje no cuenta para el reloj.
--
-- Si falta una de las dos tablas, no altera nada y solo deja las funciones.
-- Si las tablas existen y un tipo no coincide, se detiene sin añadir la columna.
--
-- El webhook guarda el mensaje y después crea la conversación.
-- El AFTER INSERT de conversaciones lee MAX(creado_en) de los entrantes
-- de ese hilo y escribe ultimo_entrante_en. Si no hay entrante con fecha,
-- el reloj queda nulo. La fila nace marcada como visitada.
--
-- El trigger de mensajes cubre INSERT y UPDATE de creado_en, direccion
-- y de la identidad del hilo. Vuelve a leer el máximo real: puede subir,
-- bajar o quedar nulo. Un saliente no cuenta. Bloquea las conversaciones
-- del hilo viejo y del nuevo en orden de id antes de leer mensajes.
--
-- Backfill: limpieza_media_backfill_ultimo_entrante(p_lote integer default 20).
-- p_lote nulo también usa 20. El rango válido es 1..20.
-- Recorre filas con ultimo_entrante_visitado distinto de true.
-- No usa el orden del uuid como cursor. FOR UPDATE SKIP LOCKED.
-- agotado solo cuando no queda ninguna fila visible sin visitar.
-- Una conversación creada mientras corre el backfill ya trae el reloj
-- y no depende de que su id sea mayor que las ya procesadas.
--
-- La lectura del entrante sigue el índice idx_seguimientos_mensajes_reply
-- (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc)
-- where direccion = 'entrante', si ese índice existe. Esta migración no lo crea.
--
-- CREATE INDEX bloquea escrituras de conversaciones mientras se construye.
-- No usa CONCURRENTLY: no puede ir dentro de una transacción.
-- Las funciones son SECURITY INVOKER y search_path = public.
-- Ejecutar solo con service_role. anon, authenticated y public no ejecutan.

do $$
declare
  v_faltan text;
begin
  if to_regclass('public.conversaciones') is null
     and to_regclass('public.mensajes') is null then
    raise notice 'limpieza_media_ultimo_entrante_en: sin conversaciones ni mensajes; columna, índice y trigger quedan pendientes de esas tablas';
    return;
  end if;

  if to_regclass('public.conversaciones') is null
     or to_regclass('public.mensajes') is null then
    raise exception 'limpieza_media_ultimo_entrante_en: conversaciones y mensajes tienen que existir juntas';
  end if;

  select string_agg(
    esperado.tabla || '.' || esperado.columna || '=' || coalesce(hallazgo.typname, 'ausente'),
    ', ' order by esperado.tabla, esperado.columna
  )
    into v_faltan
  from (
    values
      ('conversaciones', 'id', 'uuid', false),
      ('conversaciones', 'usuario_id', 'uuid', false),
      ('conversaciones', 'conexion_whatsapp_id', 'uuid', false),
      ('conversaciones', 'cliente_numero', 'text', true),
      ('conversaciones', 'ultimo_mensaje_en', 'timestamp', false),
      ('mensajes', 'usuario_id', 'uuid', false),
      ('mensajes', 'conexion_whatsapp_id', 'uuid', false),
      ('mensajes', 'cliente_numero', 'text', true),
      ('mensajes', 'direccion', 'text', true),
      ('mensajes', 'creado_en', 'timestamp', false)
  ) as esperado(tabla, columna, typname, texto)
  left join lateral (
    select y.typname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type y on y.oid = a.atttypid
    where n.nspname = 'public'
      and c.relname = esperado.tabla
      and a.attname = esperado.columna
      and a.attnum > 0
      and not a.attisdropped
  ) hallazgo on true
  where not (
    hallazgo.typname is not null
    and (
      hallazgo.typname = esperado.typname
      or (esperado.texto and hallazgo.typname in ('text', 'varchar'))
    )
  );

  if v_faltan is not null then
    raise exception 'limpieza_media_ultimo_entrante_en: tipos distintos al esquema real: %', v_faltan;
  end if;
end
$$;

create or replace function public.limpieza_media_refrescar_ultimo_entrante(
  p_usuario_id uuid,
  p_conexion_id uuid,
  p_cliente_numero text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_max timestamp without time zone;
begin
  if p_usuario_id is null
     or p_conexion_id is null
     or p_cliente_numero is null then
    return;
  end if;

  perform 1
    from public.conversaciones c
   where c.usuario_id = p_usuario_id
     and c.conexion_whatsapp_id = p_conexion_id
     and c.cliente_numero = p_cliente_numero
   order by c.id
     for update;

  if not found then
    return;
  end if;

  -- idx_seguimientos_mensajes_reply
  -- (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc)
  -- where direccion = 'entrante'
  select m.creado_en
    into v_max
    from public.mensajes m
   where m.direccion = 'entrante'
     and m.usuario_id = p_usuario_id
     and m.cliente_numero = p_cliente_numero
     and m.conexion_whatsapp_id = p_conexion_id
     and m.creado_en is not null
   order by m.creado_en desc
   limit 1;

  update public.conversaciones
     set ultimo_entrante_en = v_max
   where usuario_id = p_usuario_id
     and conexion_whatsapp_id = p_conexion_id
     and cliente_numero = p_cliente_numero;
end;
$$;

create or replace function public.limpieza_media_registrar_ultimo_entrante()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_viejo boolean := false;
  v_nuevo boolean := false;
  v_mismo boolean := false;
begin
  v_nuevo := (
    NEW.direccion = 'entrante'
    and NEW.creado_en is not null
    and NEW.usuario_id is not null
    and NEW.conexion_whatsapp_id is not null
    and NEW.cliente_numero is not null
  ) is true;

  if TG_OP = 'INSERT' then
    if v_nuevo then
      perform public.limpieza_media_refrescar_ultimo_entrante(
        NEW.usuario_id,
        NEW.conexion_whatsapp_id,
        NEW.cliente_numero
      );
    end if;
    return NEW;
  end if;

  v_viejo := (
    OLD.direccion = 'entrante'
    and OLD.creado_en is not null
    and OLD.usuario_id is not null
    and OLD.conexion_whatsapp_id is not null
    and OLD.cliente_numero is not null
  ) is true;

  if not v_viejo and not v_nuevo then
    return NEW;
  end if;

  v_mismo := OLD.usuario_id is not distinct from NEW.usuario_id
    and OLD.conexion_whatsapp_id is not distinct from NEW.conexion_whatsapp_id
    and OLD.cliente_numero is not distinct from NEW.cliente_numero;

  if v_viejo and v_nuevo and not v_mismo then
    perform 1
      from public.conversaciones c
     where (c.usuario_id, c.conexion_whatsapp_id, c.cliente_numero) in (
       (OLD.usuario_id, OLD.conexion_whatsapp_id, OLD.cliente_numero),
       (NEW.usuario_id, NEW.conexion_whatsapp_id, NEW.cliente_numero)
     )
     order by c.id
       for update;

    perform public.limpieza_media_refrescar_ultimo_entrante(
      OLD.usuario_id,
      OLD.conexion_whatsapp_id,
      OLD.cliente_numero
    );
    perform public.limpieza_media_refrescar_ultimo_entrante(
      NEW.usuario_id,
      NEW.conexion_whatsapp_id,
      NEW.cliente_numero
    );
    return NEW;
  end if;

  if v_viejo then
    perform public.limpieza_media_refrescar_ultimo_entrante(
      OLD.usuario_id,
      OLD.conexion_whatsapp_id,
      OLD.cliente_numero
    );
  end if;
  if v_nuevo and not (v_viejo and v_mismo) then
    perform public.limpieza_media_refrescar_ultimo_entrante(
      NEW.usuario_id,
      NEW.conexion_whatsapp_id,
      NEW.cliente_numero
    );
  end if;
  return NEW;
end;
$$;

create or replace function public.limpieza_media_conversacion_ultimo_entrante()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if NEW.usuario_id is not null
     and NEW.conexion_whatsapp_id is not null
     and NEW.cliente_numero is not null then
    perform public.limpieza_media_refrescar_ultimo_entrante(
      NEW.usuario_id,
      NEW.conexion_whatsapp_id,
      NEW.cliente_numero
    );
  else
    update public.conversaciones
       set ultimo_entrante_en = null
     where id = NEW.id;
  end if;

  update public.conversaciones
     set ultimo_entrante_visitado = true
   where id = NEW.id
     and ultimo_entrante_visitado is distinct from true;

  return NEW;
end;
$$;

drop function if exists public.limpieza_media_backfill_ultimo_entrante(uuid, integer);

create or replace function public.limpieza_media_backfill_ultimo_entrante(
  p_lote integer default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote integer;
  v_procesados integer := 0;
  v_actualizados integer := 0;
  v_pendientes integer := 0;
  v_entrante timestamp without time zone;
  v_fila record;
begin
  if p_lote is null then
    v_lote := 20;
  elsif p_lote < 1 or p_lote > 20 then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'lote_invalido',
      'procesados', 0,
      'actualizados', 0,
      'pendientes', null,
      'agotado', false
    );
  else
    v_lote := p_lote;
  end if;

  for v_fila in
    select c.id,
           c.usuario_id,
           c.conexion_whatsapp_id,
           c.cliente_numero,
           c.ultimo_entrante_en
      from public.conversaciones c
     where c.ultimo_entrante_visitado is not true
     order by c.id
     limit v_lote
       for update skip locked
  loop
    v_procesados := v_procesados + 1;
    v_entrante := null;

    if v_fila.usuario_id is not null
       and v_fila.conexion_whatsapp_id is not null
       and v_fila.cliente_numero is not null then
      -- idx_seguimientos_mensajes_reply
      -- (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc)
      -- where direccion = 'entrante'
      select m.creado_en
        into v_entrante
        from public.mensajes m
       where m.direccion = 'entrante'
         and m.usuario_id = v_fila.usuario_id
         and m.cliente_numero = v_fila.cliente_numero
         and m.conexion_whatsapp_id = v_fila.conexion_whatsapp_id
         and m.creado_en is not null
       order by m.creado_en desc
       limit 1;
    end if;

    update public.conversaciones
       set ultimo_entrante_en = v_entrante,
           ultimo_entrante_visitado = true
     where id = v_fila.id;

    if v_fila.ultimo_entrante_en is distinct from v_entrante then
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  select count(*)::integer
    into v_pendientes
    from public.conversaciones
   where ultimo_entrante_visitado is not true;

  return jsonb_build_object(
    'ok', true,
    'motivo', 'lote',
    'procesados', v_procesados,
    'actualizados', v_actualizados,
    'pendientes', v_pendientes,
    'agotado', v_pendientes = 0
  );
end;
$$;

revoke all on function public.limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_registrar_ultimo_entrante() from public, anon, authenticated;
revoke all on function public.limpieza_media_conversacion_ultimo_entrante() from public, anon, authenticated;
revoke all on function public.limpieza_media_backfill_ultimo_entrante(integer) from public, anon, authenticated;

grant execute on function public.limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text) to service_role;
grant execute on function public.limpieza_media_registrar_ultimo_entrante() to service_role;
grant execute on function public.limpieza_media_conversacion_ultimo_entrante() to service_role;
grant execute on function public.limpieza_media_backfill_ultimo_entrante(integer) to service_role;

comment on function public.limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text) is
  'Iguala ultimo_entrante_en al entrante con creado_en más reciente del hilo. Bloquea la conversación antes de leer mensajes. Puede dejar el reloj nulo.';

comment on function public.limpieza_media_registrar_ultimo_entrante() is
  'INSERT y UPDATE: recalcula ultimo_entrante_en. Puede subir, bajar o quedar nulo. No crea la conversación. Un saliente no cuenta.';

comment on function public.limpieza_media_conversacion_ultimo_entrante() is
  'Al insertar o cambiar la identidad, copia el máximo de entrantes ya guardados y marca la fila como visitada.';

comment on function public.limpieza_media_backfill_ultimo_entrante(integer) is
  'Visita conversaciones pendientes en lotes de 1 a 20. Null usa 20. No usa el uuid como cursor y no pisa una conversación creada durante la pasada.';

do $ddl$
begin
  if to_regclass('public.conversaciones') is null
     or to_regclass('public.mensajes') is null then
    return;
  end if;

  execute 'alter table public.conversaciones add column if not exists ultimo_entrante_en timestamp without time zone';
  execute 'alter table public.conversaciones add column if not exists ultimo_entrante_visitado boolean not null default false';

  execute $comentario$
    comment on column public.conversaciones.ultimo_entrante_en is
      'Instante del entrante real más reciente con creado_en. Puede bajar o quedar nulo si ese mensaje cambia de fecha, dirección o hilo.'
  $comentario$;

  execute $comentario$
    comment on column public.conversaciones.ultimo_entrante_visitado is
      'La fila ya recibió su reloj al crearse, o el backfill ya la visitó. El backfill no recorre otra vez las filas visitadas.'
  $comentario$;

  execute 'create index if not exists conversaciones_ultimo_entrante_en_idx on public.conversaciones (usuario_id, conexion_whatsapp_id, cliente_numero, ultimo_entrante_en desc nulls last)';
  execute 'create index if not exists conversaciones_ultimo_entrante_pendiente_idx on public.conversaciones (id) where ultimo_entrante_visitado is not true';

  execute 'drop trigger if exists limpieza_media_ultimo_entrante_ai on public.mensajes';
  execute 'drop trigger if exists limpieza_media_ultimo_entrante_au on public.mensajes';
  execute 'drop trigger if exists limpieza_media_conversacion_ultimo_entrante_ai on public.conversaciones';

  execute $trig$
    create trigger limpieza_media_ultimo_entrante_ai
    after insert on public.mensajes
    for each row
    when (
      NEW.direccion = 'entrante'
      and NEW.creado_en is not null
      and NEW.usuario_id is not null
      and NEW.conexion_whatsapp_id is not null
      and NEW.cliente_numero is not null
    )
    execute function public.limpieza_media_registrar_ultimo_entrante()
  $trig$;

  execute $trig$
    create trigger limpieza_media_ultimo_entrante_au
    after update of creado_en, direccion, usuario_id, conexion_whatsapp_id, cliente_numero
    on public.mensajes
    for each row
    execute function public.limpieza_media_registrar_ultimo_entrante()
  $trig$;

  execute $trig$
    create trigger limpieza_media_conversacion_ultimo_entrante_ai
    after insert or update of usuario_id, conexion_whatsapp_id, cliente_numero
    on public.conversaciones
    for each row
    execute function public.limpieza_media_conversacion_ultimo_entrante()
  $trig$;
end
$ddl$;

-- Rollback manual, no forma parte de la aplicación de este archivo.
-- No elimina filas de mensajes ni de conversaciones.
-- drop trigger if exists limpieza_media_ultimo_entrante_ai on public.mensajes;
-- drop trigger if exists limpieza_media_ultimo_entrante_au on public.mensajes;
-- drop trigger if exists limpieza_media_conversacion_ultimo_entrante_ai on public.conversaciones;
-- drop function if exists public.limpieza_media_registrar_ultimo_entrante();
-- drop function if exists public.limpieza_media_conversacion_ultimo_entrante();
-- drop function if exists public.limpieza_media_backfill_ultimo_entrante(integer);
-- drop function if exists public.limpieza_media_backfill_ultimo_entrante(uuid, integer);
-- drop function if exists public.limpieza_media_refrescar_ultimo_entrante(uuid, uuid, text);
-- drop index if exists public.conversaciones_ultimo_entrante_pendiente_idx;
-- drop index if exists public.conversaciones_ultimo_entrante_en_idx;
-- alter table public.conversaciones drop column if exists ultimo_entrante_visitado;
-- alter table public.conversaciones drop column if exists ultimo_entrante_en;
