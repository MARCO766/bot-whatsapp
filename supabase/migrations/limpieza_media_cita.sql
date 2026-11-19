-- Citas exactas de archivos de la conversación.
-- NO APLICAR en producción hasta autorización explícita.
-- No borra mensajes, conversaciones, contactos ni objetos de Storage.
-- Borrar una fila de media_cita solo quita la cita.
-- No habilita eliminación real. No modifica el webhook. No empieza M3.
-- No llama al backfill.
--
-- Esquema que esta migración exige cuando public.mensajes existe:
--   mensajes.id                                          uuid
--   mensajes.usuario_id, conexion_whatsapp_id            uuid
--   mensajes.cliente_numero, imagen_url, contenido       text o varchar
-- Si la tabla no existe, deja las funciones y media_cita, y no crea el trigger.
-- Si existe y un tipo no coincide, se detiene sin añadir la columna.
--
-- El parser repite analizarTextoStorage. Una cita entra solo si el bucket
-- es archivos y la ruta empieza por whatsapp/ o whatsapp-meta/.
-- Un texto no verificable no guarda ninguna cita de esa columna.
-- La misma ruta en un mismo texto se guarda una vez.
-- imagen_url y contenido son dos orígenes.
--
-- El trigger es BEFORE INSERT OR UPDATE OF imagen_url, contenido,
-- usuario_id, conexion_whatsapp_id, cliente_numero.
-- Asigna NEW.media_cita_visitado := true. No ejecuta otro UPDATE.
-- Un PATCH de otra columna no lo dispara.
--
-- Backfill: limpieza_media_backfill_media_cita(p_lote integer default 20).
-- p_lote nulo también usa 20. El rango válido es 1..20.
-- FOR UPDATE SKIP LOCKED. agotado solo con cero pendientes visibles.
-- Repetir con todo visitado devuelve procesados 0 y no crea otra cita.
--
-- CREATE INDEX bloquea escrituras de mensajes mientras se construye.
-- No usa CONCURRENTLY: no puede ir dentro de una transacción.
-- Las funciones son SECURITY INVOKER y search_path = public.
-- media_cita tiene RLS y no se abre a anon, authenticated ni public.
-- service_role recibe SELECT, INSERT y DELETE sobre media_cita.
-- Ese DELETE no alcanza a mensajes ni a Storage.

do $$
declare
  v_faltan text;
begin
  if to_regclass('public.mensajes') is null then
    raise notice 'limpieza_media_cita: sin mensajes; la columna y el trigger quedan pendientes de esa tabla';
    return;
  end if;

  select string_agg(
    esperado.tabla || '.' || esperado.columna || '=' || coalesce(hallazgo.typname, 'ausente'),
    ', ' order by esperado.tabla, esperado.columna
  )
    into v_faltan
  from (
    values
      ('mensajes', 'id', 'uuid', false),
      ('mensajes', 'usuario_id', 'uuid', false),
      ('mensajes', 'conexion_whatsapp_id', 'uuid', false),
      ('mensajes', 'cliente_numero', 'text', true),
      ('mensajes', 'imagen_url', 'text', true),
      ('mensajes', 'contenido', 'text', true)
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
    raise exception 'limpieza_media_cita: tipos distintos al esquema real: %', v_faltan;
  end if;
end
$$;

create or replace function public.limpieza_media_decodificar_segmento(p_valor text)
returns text
language plpgsql
immutable
security invoker
set search_path = public
as $fn$
declare
  v_actual text := p_valor;
  v_paso integer;
  v_bytes bytea;
  v_i integer;
  v_n integer;
  v_char text;
  v_hex text;
begin
  if v_actual is null then
    return null;
  end if;

  for v_paso in 1..2 loop
    if v_actual !~ '%[0-9a-fA-F]{2}' then
      return v_actual;
    end if;

    v_bytes := ''::bytea;
    v_i := 1;
    v_n := char_length(v_actual);
    while v_i <= v_n loop
      v_char := substr(v_actual, v_i, 1);
      if v_char = '%' then
        if v_i + 2 > v_n then
          return null;
        end if;
        v_hex := substr(v_actual, v_i + 1, 2);
        if v_hex !~ '^[0-9a-fA-F]{2}$' then
          return null;
        end if;
        v_bytes := v_bytes || decode(v_hex, 'hex');
        v_i := v_i + 3;
      else
        v_bytes := v_bytes || convert_to(v_char, 'UTF8');
        v_i := v_i + 1;
      end if;
    end loop;

    begin
      v_actual := convert_from(v_bytes, 'UTF8');
    exception
      when others then
        return null;
    end;
  end loop;

  if v_actual ~ '%[0-9a-fA-F]{2}' then
    return null;
  end if;
  return v_actual;
exception
  when others then
    return null;
end;
$fn$;

create or replace function public.limpieza_media_partir_bucket_ruta(p_resto text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = public
as $fn$
declare
  v_resto text := coalesce(p_resto, '');
  v_i integer;
  v_fin integer := 0;
  v_char text;
  v_recorte text;
  v_slash integer;
  v_bucket text;
  v_path text;
  v_restante text;
  v_corte integer;
  v_parte text;
begin
  for v_i in 1..char_length(v_resto) loop
    v_char := substr(v_resto, v_i, 1);
    if v_char = any (array['"', E'\'', E'\\', '<', '>', '?', '#', '&'])
       or v_char ~ '[[:space:]]' then
      v_fin := v_i;
      exit;
    end if;
  end loop;

  if v_fin > 0 then
    v_recorte := substr(v_resto, 1, v_fin - 1);
  else
    v_recorte := v_resto;
  end if;

  v_slash := strpos(v_recorte, '/');
  if v_slash <= 1 or v_slash = char_length(v_recorte) then
    return null;
  end if;

  v_bucket := public.limpieza_media_decodificar_segmento(substr(v_recorte, 1, v_slash - 1));
  v_path := public.limpieza_media_decodificar_segmento(substr(v_recorte, v_slash + 1));
  if v_bucket is null or v_path is null or v_bucket = '' or v_path = '' then
    return null;
  end if;

  v_bucket := lower(v_bucket);
  if v_bucket !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    return null;
  end if;
  if left(v_path, 1) = '/' or position(E'\\' in v_path) > 0 or position('*' in v_path) > 0 then
    return null;
  end if;

  v_restante := v_path;
  loop
    v_corte := strpos(v_restante, '/');
    if v_corte = 0 then
      if v_restante = '' or v_restante = '.' or v_restante = '..' then
        return null;
      end if;
      exit;
    end if;
    if v_corte = 1 then
      return null;
    end if;
    v_parte := substr(v_restante, 1, v_corte - 1);
    if v_parte = '.' or v_parte = '..' then
      return null;
    end if;
    v_restante := substr(v_restante, v_corte + 1);
    if v_restante = '' then
      return null;
    end if;
  end loop;

  return jsonb_build_object(
    'bucket', v_bucket,
    'path', v_path,
    'clave', v_bucket || '/' || v_path
  );
exception
  when others then
    return null;
end;
$fn$;

create or replace function public.limpieza_media_analizar_storage(p_texto text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = public
as $fn$
declare
  v_src text;
  v_lower text;
  v_len integer;
  v_cursor integer := 1;
  v_objetos jsonb := '[]'::jsonb;
  v_vistos text[] := '{}';
  v_no boolean := false;
  v_marca text;
  v_rel integer;
  v_abs integer;
  v_mejor_pos integer;
  v_mejor_marca text;
  v_anterior text;
  v_obj jsonb;
  v_clave text;
  v_marcadores text[] := array[
    'render/image/authenticated/',
    'render/image/public/',
    'render/image/sign/',
    'object/authenticated/',
    'object/public/',
    'object/sign/'
  ];
begin
  v_src := replace(coalesce(p_texto, ''), E'\\/', '/');
  v_lower := lower(v_src);
  v_len := char_length(v_src);

  -- v_cursor y v_mejor_pos usan la misma base que substr: el primer carácter es 1.
  -- El carácter anterior al marcador está en v_mejor_pos - 1.
  -- El bucket empieza en el carácter que sigue al marcador.
  while v_cursor <= v_len loop
    v_mejor_pos := null;
    v_mejor_marca := null;
    foreach v_marca in array v_marcadores loop
      v_rel := position(v_marca in substr(v_lower, v_cursor));
      if v_rel > 0 then
        v_abs := v_cursor + v_rel - 1;
        if v_mejor_pos is null or v_abs < v_mejor_pos then
          v_mejor_pos := v_abs;
          v_mejor_marca := v_marca;
        end if;
      end if;
    end loop;

    if v_mejor_pos is null or v_mejor_marca is null then
      exit;
    end if;

    if v_mejor_pos > 1 then
      v_anterior := substr(v_lower, v_mejor_pos - 1, 1);
      if v_anterior ~ '^[a-z0-9]$' then
        v_cursor := v_mejor_pos + char_length(v_mejor_marca);
        continue;
      end if;
    end if;

    v_obj := public.limpieza_media_partir_bucket_ruta(
      substr(v_src, v_mejor_pos + char_length(v_mejor_marca))
    );
    if v_obj is null then
      v_no := true;
    else
      v_clave := v_obj->>'clave';
      if v_clave is not null and not (v_clave = any (v_vistos)) then
        v_vistos := v_vistos || v_clave;
        v_objetos := v_objetos || jsonb_build_array(v_obj);
      end if;
    end if;

    v_cursor := v_mejor_pos + char_length(v_mejor_marca);
  end loop;

  return jsonb_build_object(
    'objetos', v_objetos,
    'noVerificable', v_no
  );
exception
  when others then
    return jsonb_build_object(
      'objetos', '[]'::jsonb,
      'noVerificable', true
    );
end;
$fn$;

create or replace function public.limpieza_media_reemplazar_citas(
  p_origen_id uuid,
  p_origen text,
  p_texto text,
  p_usuario_id uuid,
  p_conexion_id uuid,
  p_cliente_numero text
) returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_analisis jsonb;
  v_obj jsonb;
  v_path text;
begin
  if p_origen_id is null
     or p_origen not in ('mensajes.imagen_url', 'mensajes.contenido') then
    return;
  end if;

  delete from public.media_cita
   where origen_id = p_origen_id
     and origen = p_origen;

  if p_usuario_id is null
     or p_conexion_id is null
     or btrim(coalesce(p_cliente_numero, '')) = '' then
    return;
  end if;

  v_analisis := public.limpieza_media_analizar_storage(p_texto);
  if coalesce((v_analisis->>'noVerificable')::boolean, false) then
    return;
  end if;

  for v_obj in
    select value
      from jsonb_array_elements(coalesce(v_analisis->'objetos', '[]'::jsonb))
  loop
    v_path := v_obj->>'path';
    if v_obj->>'bucket' = 'archivos'
       and v_path is not null
       and left(v_path, 1) <> '/'
       and position('..' in v_path) = 0
       and (
         left(v_path, 9) = 'whatsapp/'
         or left(v_path, 14) = 'whatsapp-meta/'
       ) then
      insert into public.media_cita (
        clave,
        usuario_id,
        conexion_whatsapp_id,
        cliente_numero,
        origen,
        origen_id
      ) values (
        v_obj->>'clave',
        p_usuario_id,
        p_conexion_id,
        p_cliente_numero,
        p_origen,
        p_origen_id
      )
      on conflict on constraint media_cita_pkey do nothing;
    end if;
  end loop;
end;
$fn$;

create or replace function public.limpieza_media_aplicar_citas_mensaje(
  p_origen_id uuid,
  p_usuario_id uuid,
  p_conexion_id uuid,
  p_cliente_numero text,
  p_imagen_url text,
  p_contenido text
) returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  if p_origen_id is null then
    return;
  end if;

  delete from public.media_cita
   where origen_id = p_origen_id;

  if p_usuario_id is null
     or p_conexion_id is null
     or btrim(coalesce(p_cliente_numero, '')) = '' then
    return;
  end if;

  perform public.limpieza_media_reemplazar_citas(
    p_origen_id,
    'mensajes.imagen_url',
    p_imagen_url,
    p_usuario_id,
    p_conexion_id,
    p_cliente_numero
  );
  perform public.limpieza_media_reemplazar_citas(
    p_origen_id,
    'mensajes.contenido',
    p_contenido,
    p_usuario_id,
    p_conexion_id,
    p_cliente_numero
  );
end;
$fn$;

create or replace function public.limpieza_media_media_cita_mensaje()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_completa boolean;
  v_identidad_cambio boolean;
begin
  v_completa := NEW.usuario_id is not null
    and NEW.conexion_whatsapp_id is not null
    and btrim(coalesce(NEW.cliente_numero, '')) <> '';

  if TG_OP = 'INSERT' or not v_completa then
    perform public.limpieza_media_aplicar_citas_mensaje(
      NEW.id,
      NEW.usuario_id,
      NEW.conexion_whatsapp_id,
      NEW.cliente_numero,
      NEW.imagen_url,
      NEW.contenido
    );
    NEW.media_cita_visitado := true;
    return NEW;
  end if;

  v_identidad_cambio := OLD.usuario_id is distinct from NEW.usuario_id
    or OLD.conexion_whatsapp_id is distinct from NEW.conexion_whatsapp_id
    or OLD.cliente_numero is distinct from NEW.cliente_numero;

  if v_identidad_cambio or OLD.media_cita_visitado is distinct from true then
    perform public.limpieza_media_aplicar_citas_mensaje(
      NEW.id,
      NEW.usuario_id,
      NEW.conexion_whatsapp_id,
      NEW.cliente_numero,
      NEW.imagen_url,
      NEW.contenido
    );
  else
    if OLD.imagen_url is distinct from NEW.imagen_url then
      perform public.limpieza_media_reemplazar_citas(
        NEW.id,
        'mensajes.imagen_url',
        NEW.imagen_url,
        NEW.usuario_id,
        NEW.conexion_whatsapp_id,
        NEW.cliente_numero
      );
    end if;
    if OLD.contenido is distinct from NEW.contenido then
      perform public.limpieza_media_reemplazar_citas(
        NEW.id,
        'mensajes.contenido',
        NEW.contenido,
        NEW.usuario_id,
        NEW.conexion_whatsapp_id,
        NEW.cliente_numero
      );
    end if;
  end if;

  NEW.media_cita_visitado := true;
  return NEW;
end;
$fn$;

create or replace function public.limpieza_media_backfill_media_cita(
  p_lote integer default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_lote integer;
  v_procesados integer := 0;
  v_actualizados integer := 0;
  v_pendientes integer := 0;
  v_antes jsonb;
  v_despues jsonb;
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
    select m.id,
           m.usuario_id,
           m.conexion_whatsapp_id,
           m.cliente_numero,
           m.imagen_url,
           m.contenido
      from public.mensajes m
     where m.media_cita_visitado is not true
     order by m.id
     limit v_lote
       for update skip locked
  loop
    v_procesados := v_procesados + 1;

    select coalesce(
             jsonb_agg(
               jsonb_build_object('c', c.clave, 'o', c.origen)
               order by c.origen, c.clave
             ),
             '[]'::jsonb
           )
      into v_antes
      from public.media_cita c
     where c.origen_id = v_fila.id;

    perform public.limpieza_media_aplicar_citas_mensaje(
      v_fila.id,
      v_fila.usuario_id,
      v_fila.conexion_whatsapp_id,
      v_fila.cliente_numero,
      v_fila.imagen_url,
      v_fila.contenido
    );

    select coalesce(
             jsonb_agg(
               jsonb_build_object('c', c.clave, 'o', c.origen)
               order by c.origen, c.clave
             ),
             '[]'::jsonb
           )
      into v_despues
      from public.media_cita c
     where c.origen_id = v_fila.id;

    if v_antes is distinct from v_despues then
      v_actualizados := v_actualizados + 1;
    end if;

    update public.mensajes
       set media_cita_visitado = true
     where id = v_fila.id;
  end loop;

  select count(*)::integer
    into v_pendientes
    from public.mensajes
   where media_cita_visitado is not true;

  return jsonb_build_object(
    'ok', true,
    'motivo', 'lote',
    'procesados', v_procesados,
    'actualizados', v_actualizados,
    'pendientes', v_pendientes,
    'agotado', v_pendientes = 0
  );
end;
$fn$;

revoke all on function public.limpieza_media_decodificar_segmento(text) from public, anon, authenticated;
revoke all on function public.limpieza_media_partir_bucket_ruta(text) from public, anon, authenticated;
revoke all on function public.limpieza_media_analizar_storage(text) from public, anon, authenticated;
revoke all on function public.limpieza_media_reemplazar_citas(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_aplicar_citas_mensaje(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.limpieza_media_media_cita_mensaje() from public, anon, authenticated;
revoke all on function public.limpieza_media_backfill_media_cita(integer) from public, anon, authenticated;

grant execute on function public.limpieza_media_decodificar_segmento(text) to service_role;
grant execute on function public.limpieza_media_partir_bucket_ruta(text) to service_role;
grant execute on function public.limpieza_media_analizar_storage(text) to service_role;
grant execute on function public.limpieza_media_reemplazar_citas(uuid, text, text, uuid, uuid, text) to service_role;
grant execute on function public.limpieza_media_aplicar_citas_mensaje(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.limpieza_media_media_cita_mensaje() to service_role;
grant execute on function public.limpieza_media_backfill_media_cita(integer) to service_role;

comment on function public.limpieza_media_decodificar_segmento(text) is
  'Dos pasadas de decodificación porcentual. Un porcentaje mal formado devuelve null y no aborta al caller.';

comment on function public.limpieza_media_partir_bucket_ruta(text) is
  'Separa bucket y ruta como partirBucketRuta. Null si la ruta no es un objeto válido.';

comment on function public.limpieza_media_analizar_storage(text) is
  'Mismo contrato que analizarTextoStorage: objetos y noVerificable. Un error de decodificación no se propaga.';

comment on function public.limpieza_media_reemplazar_citas(uuid, text, text, uuid, uuid, text) is
  'Borra las citas de un mensaje y un origen, y vuelve a insertar el parseo actual. No borra el mensaje ni el archivo.';

comment on function public.limpieza_media_aplicar_citas_mensaje(uuid, uuid, uuid, text, text, text) is
  'Reescribe las dos columnas de un mensaje. Sin identidad completa no deja citas.';

comment on function public.limpieza_media_media_cita_mensaje() is
  'BEFORE: sincroniza media_cita y marca NEW.media_cita_visitado. No ejecuta un UPDATE sobre mensajes.';

comment on function public.limpieza_media_backfill_media_cita(integer) is
  'Visita mensajes pendientes en lotes de 1 a 20. Null usa 20. No usa el uuid como cursor.';

create table if not exists public.media_cita (
  clave text not null,
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  cliente_numero text not null,
  origen text not null,
  origen_id uuid not null,
  constraint media_cita_pkey primary key (clave, origen, origen_id),
  constraint media_cita_origen_chk check (
    origen in ('mensajes.imagen_url', 'mensajes.contenido')
  )
);

create index if not exists media_cita_origen_id_idx
  on public.media_cita (origen_id);

alter table public.media_cita enable row level security;

revoke all on table public.media_cita from public, anon, authenticated;

grant select, insert, delete on table public.media_cita to service_role;

comment on table public.media_cita is
  'Una fila por cita, no por archivo. Borrar esta fila no borra el mensaje ni el objeto de Storage.';

comment on column public.media_cita.origen is
  'mensajes.imagen_url o mensajes.contenido. La misma ruta en las dos columnas son dos filas.';

do $ddl$
begin
  if to_regclass('public.mensajes') is null then
    return;
  end if;

  execute 'alter table public.mensajes add column if not exists media_cita_visitado boolean not null default false';

  execute $comentario$
    comment on column public.mensajes.media_cita_visitado is
      'El mensaje ya sincronizó sus citas. El backfill no recorre otra vez las filas visitadas.'
  $comentario$;

  execute 'create index if not exists mensajes_media_cita_pendiente_idx on public.mensajes (id) where media_cita_visitado is not true';

  execute 'drop trigger if exists limpieza_media_media_cita_biu on public.mensajes';

  execute $trig$
    create trigger limpieza_media_media_cita_biu
    before insert or update of imagen_url, contenido, usuario_id, conexion_whatsapp_id, cliente_numero
    on public.mensajes
    for each row
    execute function public.limpieza_media_media_cita_mensaje()
  $trig$;
end
$ddl$;

-- Rollback manual, no forma parte de la aplicación de este archivo.
-- No elimina filas de mensajes ni objetos de Storage.
-- drop trigger if exists limpieza_media_media_cita_biu on public.mensajes;
-- drop function if exists public.limpieza_media_media_cita_mensaje();
-- drop function if exists public.limpieza_media_backfill_media_cita(integer);
-- drop function if exists public.limpieza_media_aplicar_citas_mensaje(uuid, uuid, uuid, text, text, text);
-- drop function if exists public.limpieza_media_reemplazar_citas(uuid, text, text, uuid, uuid, text);
-- drop function if exists public.limpieza_media_analizar_storage(text);
-- drop function if exists public.limpieza_media_partir_bucket_ruta(text);
-- drop function if exists public.limpieza_media_decodificar_segmento(text);
-- drop index if exists public.media_cita_origen_id_idx;
-- drop table if exists public.media_cita;
-- drop index if exists public.mensajes_media_cita_pendiente_idx;
-- alter table public.mensajes drop column if exists media_cita_visitado;
