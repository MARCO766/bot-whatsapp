-- Revalidación por lotes de la limpieza de multimedia.
-- Reemplaza la función ya instalada. Misma firma. Solo lee.
-- No inserta, no actualiza y no borra filas ni objetos.
-- No modifica mensajes.imagen_url. No crea índices.
--
-- Cada llamada acepta como máximo 8 claves o 8 hilos.
-- Menciones: una lectura de mensajes para todas las claves del lote.
--   El tope sigue siendo 100 filas por clave. 100 filas es página incompleta.
-- Referencias: una igualdad de media_filename para todas las claves y, solo
--   para las que no coinciden, una lectura por tabla de texto.
--   El tope sigue siendo 5 filas por clave y por tabla. El comodín '_' va escapado.
-- Entrantes: solo direccion = 'entrante', el más reciente. Un saliente no cuenta.
-- La segunda lectura de menciones la pide el proceso después de esta función,
-- en otra llamada, para ver un mensaje que haya entrado durante las referencias.
-- El veredicto de 30 días, la cita completa y el candado siguen en el proceso.
--
-- El ilike es coalesce(columna::text, ''::text) y exige columna is not null.
-- Un nulo no coincide. Si el catálogo no es texto, uuid o tiempo según la columna,
-- la llamada devuelve tipo_incompatible y no concluye que el archivo está libre.
-- Los patrones van en una CTE materializada de hasta 8 filas: la tabla grande
-- se filtra una vez con exists y después se reparte por clave.

create or replace function public.limpieza_media_revalidar_lote(
  p_fase text,
  p_claves text[] default array[]::text[],
  p_hilos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_filas jsonb := '[]'::jsonb;
  v_invalidas jsonb := '[]'::jsonb;
  v_ok jsonb := '[]'::jsonb;
  v_claves_ok text[] := array[]::text[];
  v_patrones text[] := array[]::text[];
  v_archivos text[] := array[]::text[];
  v_ordenes int[] := array[]::int[];
  v_hallados text[] := array[]::text[];
  v_claves_txt text[] := array[]::text[];
  v_patrones_txt text[] := array[]::text[];
  v_bloques jsonb := '{}'::jsonb;
  v_textos_map jsonb := '{}'::jsonb;
  v_total integer;
  v_mal text;
  v_tipo text;
begin
  if p_fase is null or p_fase not in ('menciones', 'referencias', 'entrantes') then
    return jsonb_build_object('error', 'fase_desconocida', 'filas', '[]'::jsonb);
  end if;

  select e.tabla || '.' || e.columna, hallazgo.typname
    into v_mal, v_tipo
  from (
    values
      ('mensajes', 'imagen_url', 'texto'),
      ('mensajes', 'contenido', 'texto'),
      ('mensajes', 'usuario_id', 'uuid'),
      ('mensajes', 'conexion_whatsapp_id', 'uuid'),
      ('mensajes', 'cliente_numero', 'texto'),
      ('mensajes', 'direccion', 'texto'),
      ('mensajes', 'creado_en', 'tiempo'),
      ('seguimientos_v2', 'media_filename', 'texto'),
      ('seguimientos_v2', 'media_url', 'texto'),
      ('seguimientos_v2', 'contenido', 'texto'),
      ('seguimientos_v2', 'error_detalle', 'texto'),
      ('remarketing_global_24h', 'mensaje_remarketing', 'texto'),
      ('remarketing_global_24h', 'ultimo_camino', 'texto'),
      ('remarketing_global_24h', 'motivo_cancelacion', 'texto'),
      ('remarketing_global_24h', 'ultimo_nodo_id', 'texto'),
      ('remarketing_global_24h', 'ultimo_nodo_tipo', 'texto'),
      ('remarketing_global_24h', 'ultimo_nodo_nombre', 'texto'),
      ('remarketing_global_24h', 'flujo_nombre', 'texto'),
      ('remarketing_global_24h', 'oferta_nombre', 'texto'),
      ('remarketing_global_24h', 'oferta_validez', 'texto'),
      ('remarketing_global_24h', 'oferta_moneda', 'texto'),
      ('remarketing_global_24h', 'oferta_consumida_por', 'texto'),
      ('seguimientos_programados', 'error_detalle', 'texto'),
      ('conversaciones', 'ultimo_mensaje', 'texto'),
      ('clientes', 'comprobante_url', 'texto'),
      ('lector_pagos_estado', 'producto_url', 'texto'),
      ('lector_pagos_estado', 'producto_texto', 'texto'),
      ('lector_pagos_estado', 'mensaje_pago_valido', 'texto'),
      ('lector_pagos_estado', 'mensaje_pago_invalido', 'texto'),
      ('crm_historial_cliente', 'titulo', 'texto'),
      ('crm_historial_cliente', 'detalle', 'texto'),
      ('flujos', 'nombre', 'texto'),
      ('flujos', 'producto', 'texto'),
      ('flujos', 'precio_normal', 'texto'),
      ('flujos', 'precio_descuento', 'texto'),
      ('flujos', 'mensaje_1', 'texto'),
      ('flujos', 'mensaje_2', 'texto'),
      ('flujos', 'qr_29', 'texto'),
      ('flujos', 'qr_19', 'texto'),
      ('flujos', 'seguimiento_1', 'texto'),
      ('flujos', 'seguimiento_2', 'texto'),
      ('flujos', 'seguimiento_3', 'texto'),
      ('flujos', 'seguimiento_4', 'texto'),
      ('flujos', 'seguimiento_5', 'texto'),
      ('flujos', 'numero_whatsapp', 'texto'),
      ('flujo_pasos', 'contenido', 'texto'),
      ('flujo_pasos', 'imagen_url', 'texto'),
      ('flujo_pasos', 'boton_texto', 'texto'),
      ('flujo_pasos', 'boton_id', 'texto')
  ) as e(tabla, columna, clase)
  left join lateral (
    select y.typname
    from pg_namespace n
    join pg_class c
      on c.relnamespace = n.oid
     and c.relname = e.tabla
     and c.relkind in ('r', 'p')
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = e.columna
     and a.attnum > 0
     and not a.attisdropped
    join pg_type y on y.oid = a.atttypid
    where n.nspname = 'public'
  ) hallazgo on true
  where hallazgo.typname is null
     or (e.clase = 'texto' and hallazgo.typname not in ('text', 'varchar', 'citext'))
     or (e.clase = 'uuid' and hallazgo.typname <> 'uuid')
     or (e.clase = 'tiempo' and hallazgo.typname not in ('timestamptz', 'timestamp'))
  limit 1;

  if v_mal is not null then
    return jsonb_build_object(
      'error', 'tipo_incompatible:' || v_mal || ':' || coalesce(v_tipo, 'ausente'),
      'filas', '[]'::jsonb
    );
  end if;

  if p_fase = 'entrantes' then
    if jsonb_typeof(coalesce(p_hilos, '[]'::jsonb)) <> 'array' then
      return jsonb_build_object('error', 'hilos_ilegibles', 'filas', '[]'::jsonb);
    end if;
    if jsonb_array_length(coalesce(p_hilos, '[]'::jsonb)) > 8 then
      return jsonb_build_object('error', 'lote_excedido', 'filas', '[]'::jsonb);
    end if;

    select coalesce(jsonb_agg(fila), '[]'::jsonb)
      into v_filas
    from (
      select jsonb_build_object(
        'usuario_id', h.usuario_id,
        'conexion_whatsapp_id', h.conexion_whatsapp_id,
        'cliente_numero', h.cliente_numero,
        'creado_en', m.creado_en,
        'error', case
          when h.usuario_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or h.conexion_whatsapp_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or h.cliente_numero !~ '^[0-9]+$'
          then 'hilo_no_filtrable'
          else null
        end
      ) as fila
      from jsonb_to_recordset(coalesce(p_hilos, '[]'::jsonb))
        as h(usuario_id text, conexion_whatsapp_id text, cliente_numero text)
      left join lateral (
        select m.creado_en
        from public.mensajes m
        where h.usuario_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and h.conexion_whatsapp_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and h.cliente_numero ~ '^[0-9]+$'
          and m.usuario_id = case
            when h.usuario_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then h.usuario_id::uuid
            else null
          end
          and m.conexion_whatsapp_id = case
            when h.conexion_whatsapp_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then h.conexion_whatsapp_id::uuid
            else null
          end
          and m.cliente_numero = h.cliente_numero
          and m.direccion = 'entrante'
        order by m.creado_en desc
        limit 1
      ) m on true
    ) q;
    return jsonb_build_object('error', null, 'filas', v_filas);
  end if;

  v_total := coalesce(array_length(p_claves, 1), 0);
  if v_total > 8 then
    return jsonb_build_object('error', 'lote_excedido', 'filas', '[]'::jsonb);
  end if;

  select
    coalesce((jsonb_agg(jsonb_build_object(
      'ord', cruda.ord,
      'clave', cruda.clave,
      'error', 'ruta_no_filtrable',
      'truncada', false,
      'filas', '[]'::jsonb,
      'filename', false,
      'textos', '[]'::jsonb
    ) order by cruda.ord) filter (where cruda.invalida)), '[]'::jsonb),
    coalesce(array_agg(cruda.clave order by cruda.ord) filter (where not cruda.invalida), array[]::text[]),
    coalesce(array_agg(cruda.patron order by cruda.ord) filter (where not cruda.invalida), array[]::text[]),
    coalesce(array_agg(cruda.archivo order by cruda.ord) filter (where not cruda.invalida), array[]::text[]),
    coalesce(array_agg(cruda.ord order by cruda.ord) filter (where not cruda.invalida), array[]::int[])
    into v_invalidas, v_claves_ok, v_patrones, v_archivos, v_ordenes
  from (
    select
      base.clave,
      base.ord,
      base.invalida,
      calc.archivo,
      calc.patron
    from (
      select
        u.clave,
        u.ord::int as ord,
        (
          u.clave is null
          or u.clave !~ '^[a-zA-Z0-9._/-]+$'
          or char_length(u.clave) > 500
          or u.clave like '%..%'
        ) as invalida,
        case
          when u.clave like 'archivos/%' then substr(u.clave, 10)
          else u.clave
        end as ruta
      from unnest(coalesce(p_claves, array[]::text[])) with ordinality as u(clave, ord)
    ) base
    cross join lateral (
      select
        regexp_replace(coalesce(base.ruta, ''), '^.*/', '') as archivo,
        '%' || replace(replace(replace(coalesce(base.ruta, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
    ) calc
  ) cruda;

  if coalesce(array_length(v_claves_ok, 1), 0) = 0 then
    v_ok := '[]'::jsonb;
  elsif p_fase = 'menciones' then
    with patrones as materialized (
      select c.clave, p.patron, o.ord
      from unnest(v_claves_ok) with ordinality as c(clave, pos)
      join unnest(v_patrones) with ordinality as p(patron, pos) using (pos)
      join unnest(v_ordenes) with ordinality as o(ord, pos) using (pos)
    ),
    vistos as materialized (
      select m.usuario_id, m.conexion_whatsapp_id, m.cliente_numero, m.imagen_url, m.contenido
      from public.mensajes m
      where (
          m.imagen_url is not null
          and exists (
            select 1
            from patrones p
            where coalesce(m.imagen_url::text, ''::text) ilike p.patron escape '\'
          )
        )
        or (
          m.contenido is not null
          and exists (
            select 1
            from patrones p
            where coalesce(m.contenido::text, ''::text) ilike p.patron escape '\'
          )
        )
    ),
    marcado as (
      select p.ord,
             p.clave,
             v.usuario_id,
             v.conexion_whatsapp_id,
             v.cliente_numero,
             v.imagen_url,
             v.contenido,
             row_number() over (partition by p.clave) as n,
             count(*) over (partition by p.clave) as total
      from vistos v
      join patrones p
        on (
          v.imagen_url is not null
          and coalesce(v.imagen_url::text, ''::text) ilike p.patron escape '\'
        )
        or (
          v.contenido is not null
          and coalesce(v.contenido::text, ''::text) ilike p.patron escape '\'
        )
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ord', p.ord,
      'clave', p.clave,
      'error', null,
      'truncada', coalesce(g.total, 0) >= 100,
      'filas', coalesce(g.filas, '[]'::jsonb),
      'filename', false,
      'textos', '[]'::jsonb
    ) order by p.ord), '[]'::jsonb)
      into v_ok
    from patrones p
    left join lateral (
      select max(m.total) as total,
             coalesce(jsonb_agg(jsonb_build_object(
               'usuario_id', m.usuario_id,
               'conexion_whatsapp_id', m.conexion_whatsapp_id,
               'cliente_numero', m.cliente_numero,
               'imagen_url', m.imagen_url,
               'contenido', m.contenido
             )) filter (where m.n <= 100), '[]'::jsonb) as filas
      from marcado m
      where m.clave = p.clave
    ) g on true;
  else
    select coalesce(array_agg(distinct s.media_filename), array[]::text[])
      into v_hallados
    from public.seguimientos_v2 s
    where s.media_filename is not null
      and s.media_filename = any (v_archivos);

    select
      coalesce(array_agg(c.clave order by o.ord), array[]::text[]),
      coalesce(array_agg(p.patron order by o.ord), array[]::text[])
      into v_claves_txt, v_patrones_txt
    from unnest(v_claves_ok) with ordinality as c(clave, pos)
    join unnest(v_archivos) with ordinality as a(archivo, pos) using (pos)
    join unnest(v_patrones) with ordinality as p(patron, pos) using (pos)
    join unnest(v_ordenes) with ordinality as o(ord, pos) using (pos)
    where not (a.archivo = any (v_hallados));

    v_textos_map := '{}'::jsonb;
    if coalesce(array_length(v_claves_txt, 1), 0) > 0 then

    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.mensaje_remarketing, t.ultimo_camino, t.motivo_cancelacion, t.ultimo_nodo_id, t.ultimo_nodo_tipo, t.ultimo_nodo_nombre, t.flujo_nombre, t.oferta_nombre, t.oferta_validez, t.oferta_moneda, t.oferta_consumida_por
      from public.remarketing_global_24h t
      where exists (
        select 1
        from patrones p
        where (t.mensaje_remarketing is not null and coalesce(t.mensaje_remarketing::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_camino is not null and coalesce(t.ultimo_camino::text, ''::text) ilike p.patron escape '\')
        or (t.motivo_cancelacion is not null and coalesce(t.motivo_cancelacion::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_id is not null and coalesce(t.ultimo_nodo_id::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_tipo is not null and coalesce(t.ultimo_nodo_tipo::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_nombre is not null and coalesce(t.ultimo_nodo_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.flujo_nombre is not null and coalesce(t.flujo_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_nombre is not null and coalesce(t.oferta_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_validez is not null and coalesce(t.oferta_validez::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_moneda is not null and coalesce(t.oferta_moneda::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_consumida_por is not null and coalesce(t.oferta_consumida_por::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'remarketing_global_24h',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('mensaje_remarketing', marcado.mensaje_remarketing, 'ultimo_camino', marcado.ultimo_camino, 'motivo_cancelacion', marcado.motivo_cancelacion, 'ultimo_nodo_id', marcado.ultimo_nodo_id, 'ultimo_nodo_tipo', marcado.ultimo_nodo_tipo, 'ultimo_nodo_nombre', marcado.ultimo_nodo_nombre, 'flujo_nombre', marcado.flujo_nombre, 'oferta_nombre', marcado.oferta_nombre, 'oferta_validez', marcado.oferta_validez, 'oferta_moneda', marcado.oferta_moneda, 'oferta_consumida_por', marcado.oferta_consumida_por)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.mensaje_remarketing, t.ultimo_camino, t.motivo_cancelacion, t.ultimo_nodo_id, t.ultimo_nodo_tipo, t.ultimo_nodo_nombre, t.flujo_nombre, t.oferta_nombre, t.oferta_validez, t.oferta_moneda, t.oferta_consumida_por,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.mensaje_remarketing is not null and coalesce(t.mensaje_remarketing::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_camino is not null and coalesce(t.ultimo_camino::text, ''::text) ilike p.patron escape '\')
        or (t.motivo_cancelacion is not null and coalesce(t.motivo_cancelacion::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_id is not null and coalesce(t.ultimo_nodo_id::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_tipo is not null and coalesce(t.ultimo_nodo_tipo::text, ''::text) ilike p.patron escape '\')
        or (t.ultimo_nodo_nombre is not null and coalesce(t.ultimo_nodo_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.flujo_nombre is not null and coalesce(t.flujo_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_nombre is not null and coalesce(t.oferta_nombre::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_validez is not null and coalesce(t.oferta_validez::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_moneda is not null and coalesce(t.oferta_moneda::text, ''::text) ilike p.patron escape '\')
        or (t.oferta_consumida_por is not null and coalesce(t.oferta_consumida_por::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'remarketing_global_24h', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.media_url, t.contenido, t.error_detalle
      from public.seguimientos_v2 t
      where exists (
        select 1
        from patrones p
        where (t.media_url is not null and coalesce(t.media_url::text, ''::text) ilike p.patron escape '\')
        or (t.contenido is not null and coalesce(t.contenido::text, ''::text) ilike p.patron escape '\')
        or (t.error_detalle is not null and coalesce(t.error_detalle::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'seguimientos_v2',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('media_url', marcado.media_url, 'contenido', marcado.contenido, 'error_detalle', marcado.error_detalle)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.media_url, t.contenido, t.error_detalle,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.media_url is not null and coalesce(t.media_url::text, ''::text) ilike p.patron escape '\')
        or (t.contenido is not null and coalesce(t.contenido::text, ''::text) ilike p.patron escape '\')
        or (t.error_detalle is not null and coalesce(t.error_detalle::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'seguimientos_v2', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.error_detalle
      from public.seguimientos_programados t
      where exists (
        select 1
        from patrones p
        where (t.error_detalle is not null and coalesce(t.error_detalle::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'seguimientos_programados',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('error_detalle', marcado.error_detalle)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.error_detalle,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.error_detalle is not null and coalesce(t.error_detalle::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'seguimientos_programados', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.ultimo_mensaje
      from public.conversaciones t
      where exists (
        select 1
        from patrones p
        where (t.ultimo_mensaje is not null and coalesce(t.ultimo_mensaje::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'conversaciones',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('ultimo_mensaje', marcado.ultimo_mensaje)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.ultimo_mensaje,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.ultimo_mensaje is not null and coalesce(t.ultimo_mensaje::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'conversaciones', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.comprobante_url
      from public.clientes t
      where exists (
        select 1
        from patrones p
        where (t.comprobante_url is not null and coalesce(t.comprobante_url::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'clientes',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('comprobante_url', marcado.comprobante_url)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.comprobante_url,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.comprobante_url is not null and coalesce(t.comprobante_url::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'clientes', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.producto_url, t.producto_texto, t.mensaje_pago_valido, t.mensaje_pago_invalido
      from public.lector_pagos_estado t
      where exists (
        select 1
        from patrones p
        where (t.producto_url is not null and coalesce(t.producto_url::text, ''::text) ilike p.patron escape '\')
        or (t.producto_texto is not null and coalesce(t.producto_texto::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_pago_valido is not null and coalesce(t.mensaje_pago_valido::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_pago_invalido is not null and coalesce(t.mensaje_pago_invalido::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'lector_pagos_estado',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('producto_url', marcado.producto_url, 'producto_texto', marcado.producto_texto, 'mensaje_pago_valido', marcado.mensaje_pago_valido, 'mensaje_pago_invalido', marcado.mensaje_pago_invalido)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.producto_url, t.producto_texto, t.mensaje_pago_valido, t.mensaje_pago_invalido,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.producto_url is not null and coalesce(t.producto_url::text, ''::text) ilike p.patron escape '\')
        or (t.producto_texto is not null and coalesce(t.producto_texto::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_pago_valido is not null and coalesce(t.mensaje_pago_valido::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_pago_invalido is not null and coalesce(t.mensaje_pago_invalido::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'lector_pagos_estado', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.titulo, t.detalle
      from public.crm_historial_cliente t
      where exists (
        select 1
        from patrones p
        where (t.titulo is not null and coalesce(t.titulo::text, ''::text) ilike p.patron escape '\')
        or (t.detalle is not null and coalesce(t.detalle::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'crm_historial_cliente',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('titulo', marcado.titulo, 'detalle', marcado.detalle)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.titulo, t.detalle,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.titulo is not null and coalesce(t.titulo::text, ''::text) ilike p.patron escape '\')
        or (t.detalle is not null and coalesce(t.detalle::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'crm_historial_cliente', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.nombre, t.producto, t.precio_normal, t.precio_descuento, t.mensaje_1, t.mensaje_2, t.qr_29, t.qr_19, t.seguimiento_1, t.seguimiento_2, t.seguimiento_3, t.seguimiento_4, t.seguimiento_5, t.numero_whatsapp
      from public.flujos t
      where exists (
        select 1
        from patrones p
        where (t.nombre is not null and coalesce(t.nombre::text, ''::text) ilike p.patron escape '\')
        or (t.producto is not null and coalesce(t.producto::text, ''::text) ilike p.patron escape '\')
        or (t.precio_normal is not null and coalesce(t.precio_normal::text, ''::text) ilike p.patron escape '\')
        or (t.precio_descuento is not null and coalesce(t.precio_descuento::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_1 is not null and coalesce(t.mensaje_1::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_2 is not null and coalesce(t.mensaje_2::text, ''::text) ilike p.patron escape '\')
        or (t.qr_29 is not null and coalesce(t.qr_29::text, ''::text) ilike p.patron escape '\')
        or (t.qr_19 is not null and coalesce(t.qr_19::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_1 is not null and coalesce(t.seguimiento_1::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_2 is not null and coalesce(t.seguimiento_2::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_3 is not null and coalesce(t.seguimiento_3::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_4 is not null and coalesce(t.seguimiento_4::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_5 is not null and coalesce(t.seguimiento_5::text, ''::text) ilike p.patron escape '\')
        or (t.numero_whatsapp is not null and coalesce(t.numero_whatsapp::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'flujos',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('nombre', marcado.nombre, 'producto', marcado.producto, 'precio_normal', marcado.precio_normal, 'precio_descuento', marcado.precio_descuento, 'mensaje_1', marcado.mensaje_1, 'mensaje_2', marcado.mensaje_2, 'qr_29', marcado.qr_29, 'qr_19', marcado.qr_19, 'seguimiento_1', marcado.seguimiento_1, 'seguimiento_2', marcado.seguimiento_2, 'seguimiento_3', marcado.seguimiento_3, 'seguimiento_4', marcado.seguimiento_4, 'seguimiento_5', marcado.seguimiento_5, 'numero_whatsapp', marcado.numero_whatsapp)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.nombre, t.producto, t.precio_normal, t.precio_descuento, t.mensaje_1, t.mensaje_2, t.qr_29, t.qr_19, t.seguimiento_1, t.seguimiento_2, t.seguimiento_3, t.seguimiento_4, t.seguimiento_5, t.numero_whatsapp,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.nombre is not null and coalesce(t.nombre::text, ''::text) ilike p.patron escape '\')
        or (t.producto is not null and coalesce(t.producto::text, ''::text) ilike p.patron escape '\')
        or (t.precio_normal is not null and coalesce(t.precio_normal::text, ''::text) ilike p.patron escape '\')
        or (t.precio_descuento is not null and coalesce(t.precio_descuento::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_1 is not null and coalesce(t.mensaje_1::text, ''::text) ilike p.patron escape '\')
        or (t.mensaje_2 is not null and coalesce(t.mensaje_2::text, ''::text) ilike p.patron escape '\')
        or (t.qr_29 is not null and coalesce(t.qr_29::text, ''::text) ilike p.patron escape '\')
        or (t.qr_19 is not null and coalesce(t.qr_19::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_1 is not null and coalesce(t.seguimiento_1::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_2 is not null and coalesce(t.seguimiento_2::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_3 is not null and coalesce(t.seguimiento_3::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_4 is not null and coalesce(t.seguimiento_4::text, ''::text) ilike p.patron escape '\')
        or (t.seguimiento_5 is not null and coalesce(t.seguimiento_5::text, ''::text) ilike p.patron escape '\')
        or (t.numero_whatsapp is not null and coalesce(t.numero_whatsapp::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'flujos', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);


    with patrones as materialized (
      select c.clave, p.patron
      from unnest(v_claves_txt) with ordinality as c(clave, pos)
      join unnest(v_patrones_txt) with ordinality as p(patron, pos) using (pos)
    ),
    tocadas as materialized (
      select t.contenido, t.imagen_url, t.boton_texto, t.boton_id
      from public.flujo_pasos t
      where exists (
        select 1
        from patrones p
        where (t.contenido is not null and coalesce(t.contenido::text, ''::text) ilike p.patron escape '\')
        or (t.imagen_url is not null and coalesce(t.imagen_url::text, ''::text) ilike p.patron escape '\')
        or (t.boton_texto is not null and coalesce(t.boton_texto::text, ''::text) ilike p.patron escape '\')
        or (t.boton_id is not null and coalesce(t.boton_id::text, ''::text) ilike p.patron escape '\')
      )
    )
    select coalesce(jsonb_object_agg(agrupado.clave, jsonb_build_object(
      'tabla', 'flujo_pasos',
      'truncada', agrupado.total >= 5,
      'filas', agrupado.filas
    )), '{}'::jsonb)
      into v_bloques
    from (
      select marcado.clave,
             max(marcado.total) as total,
             coalesce(jsonb_agg(jsonb_build_object('contenido', marcado.contenido, 'imagen_url', marcado.imagen_url, 'boton_texto', marcado.boton_texto, 'boton_id', marcado.boton_id)) filter (where marcado.n <= 5), '[]'::jsonb) as filas
      from (
        select p.clave,
               t.contenido, t.imagen_url, t.boton_texto, t.boton_id,
               row_number() over (partition by p.clave) as n,
               count(*) over (partition by p.clave) as total
        from tocadas t
        join patrones p
          on (t.contenido is not null and coalesce(t.contenido::text, ''::text) ilike p.patron escape '\')
        or (t.imagen_url is not null and coalesce(t.imagen_url::text, ''::text) ilike p.patron escape '\')
        or (t.boton_texto is not null and coalesce(t.boton_texto::text, ''::text) ilike p.patron escape '\')
        or (t.boton_id is not null and coalesce(t.boton_id::text, ''::text) ilike p.patron escape '\')
      ) marcado
      group by marcado.clave
    ) agrupado;

    select coalesce(jsonb_object_agg(
      c.clave,
      coalesce(v_textos_map -> c.clave, '[]'::jsonb) || jsonb_build_array(
        coalesce(
          v_bloques -> c.clave,
          jsonb_build_object('tabla', 'flujo_pasos', 'truncada', false, 'filas', '[]'::jsonb)
        )
      )
    ), '{}'::jsonb)
      into v_textos_map
    from unnest(v_claves_txt) as c(clave);

    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ord', o.ord,
      'clave', c.clave,
      'error', null,
      'truncada', false,
      'filas', '[]'::jsonb,
      'filename', a.archivo = any (v_hallados),
      'textos', case
        when a.archivo = any (v_hallados) then '[]'::jsonb
        else coalesce(v_textos_map -> c.clave, '[]'::jsonb)
      end
    ) order by o.ord), '[]'::jsonb)
      into v_ok
    from unnest(v_claves_ok) with ordinality as c(clave, pos)
    join unnest(v_archivos) with ordinality as a(archivo, pos) using (pos)
    join unnest(v_ordenes) with ordinality as o(ord, pos) using (pos);
  end if;

  select coalesce(jsonb_agg((item - 'ord') order by (item ->> 'ord')::int), '[]'::jsonb)
    into v_filas
  from jsonb_array_elements(v_invalidas || v_ok) as item;

  return jsonb_build_object('error', null, 'filas', v_filas);

end;
$$;

comment on function public.limpieza_media_revalidar_lote(text, text[], jsonb) is
  'Lectura por lotes para revalidar limpieza multimedia. No borra nada. Pendiente de revisión antes de producción.';

revoke all on function public.limpieza_media_revalidar_lote(text, text[], jsonb) from public;
revoke all on function public.limpieza_media_revalidar_lote(text, text[], jsonb) from anon;
revoke all on function public.limpieza_media_revalidar_lote(text, text[], jsonb) from authenticated;
grant execute on function public.limpieza_media_revalidar_lote(text, text[], jsonb) to service_role;
