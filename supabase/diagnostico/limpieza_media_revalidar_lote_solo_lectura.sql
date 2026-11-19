-- SOLO LECTURA.
-- Diagnóstico de las columnas, índices y tamaños que usa
-- public.limpieza_media_revalidar_lote.
-- Una sola sentencia SELECT. Lee el catálogo y pg_stats.
-- No recorre las filas de mensajes, seguimientos_v2, conversaciones ni clientes.
-- El tamaño de columna es una estimación: avg_width del último analyze
-- por las filas estimadas de pg_class. Si analyze nunca corrió, queda vacía.
-- Revisar el resultado antes de decidir índices. No aplicar nada con este archivo.

with esperado (
  orden,
  tabla,
  columna,
  clase
) as (
  values
    (1, 'mensajes', 'imagen_url', 'texto'),
    (2, 'mensajes', 'contenido', 'texto'),
    (3, 'mensajes', 'usuario_id', 'uuid'),
    (4, 'mensajes', 'conexion_whatsapp_id', 'uuid'),
    (5, 'mensajes', 'cliente_numero', 'texto'),
    (6, 'mensajes', 'direccion', 'texto'),
    (7, 'mensajes', 'creado_en', 'tiempo'),
    (8, 'seguimientos_v2', 'media_filename', 'texto'),
    (9, 'seguimientos_v2', 'media_url', 'texto'),
    (10, 'seguimientos_v2', 'contenido', 'texto'),
    (11, 'seguimientos_v2', 'error_detalle', 'texto'),
    (12, 'remarketing_global_24h', 'mensaje_remarketing', 'texto'),
    (13, 'remarketing_global_24h', 'ultimo_camino', 'texto'),
    (14, 'remarketing_global_24h', 'motivo_cancelacion', 'texto'),
    (15, 'remarketing_global_24h', 'ultimo_nodo_id', 'texto'),
    (16, 'remarketing_global_24h', 'ultimo_nodo_tipo', 'texto'),
    (17, 'remarketing_global_24h', 'ultimo_nodo_nombre', 'texto'),
    (18, 'remarketing_global_24h', 'flujo_nombre', 'texto'),
    (19, 'remarketing_global_24h', 'oferta_nombre', 'texto'),
    (20, 'remarketing_global_24h', 'oferta_validez', 'texto'),
    (21, 'remarketing_global_24h', 'oferta_moneda', 'texto'),
    (22, 'remarketing_global_24h', 'oferta_consumida_por', 'texto'),
    (23, 'seguimientos_programados', 'error_detalle', 'texto'),
    (24, 'conversaciones', 'ultimo_mensaje', 'texto'),
    (25, 'clientes', 'comprobante_url', 'texto'),
    (26, 'lector_pagos_estado', 'producto_url', 'texto'),
    (27, 'lector_pagos_estado', 'producto_texto', 'texto'),
    (28, 'lector_pagos_estado', 'mensaje_pago_valido', 'texto'),
    (29, 'lector_pagos_estado', 'mensaje_pago_invalido', 'texto'),
    (30, 'crm_historial_cliente', 'titulo', 'texto'),
    (31, 'crm_historial_cliente', 'detalle', 'texto'),
    (32, 'flujos', 'nombre', 'texto'),
    (33, 'flujos', 'producto', 'texto'),
    (34, 'flujos', 'precio_normal', 'texto'),
    (35, 'flujos', 'precio_descuento', 'texto'),
    (36, 'flujos', 'mensaje_1', 'texto'),
    (37, 'flujos', 'mensaje_2', 'texto'),
    (38, 'flujos', 'qr_29', 'texto'),
    (39, 'flujos', 'qr_19', 'texto'),
    (40, 'flujos', 'seguimiento_1', 'texto'),
    (41, 'flujos', 'seguimiento_2', 'texto'),
    (42, 'flujos', 'seguimiento_3', 'texto'),
    (43, 'flujos', 'seguimiento_4', 'texto'),
    (44, 'flujos', 'seguimiento_5', 'texto'),
    (45, 'flujos', 'numero_whatsapp', 'texto'),
    (46, 'flujo_pasos', 'contenido', 'texto'),
    (47, 'flujo_pasos', 'imagen_url', 'texto'),
    (48, 'flujo_pasos', 'boton_texto', 'texto'),
    (49, 'flujo_pasos', 'boton_id', 'texto')
),
columna as (
  select
    e.orden,
    e.tabla,
    e.columna,
    e.clase,
    c.oid as tabla_oid,
    a.attnum,
    a.attname,
    a.attnotnull,
    y.typname,
    case
      when a.attname is null then null
      else format_type(a.atttypid, a.atttypmod)
    end as tipo_real
  from esperado as e
  left join pg_namespace as n
    on n.nspname = 'public'
  left join pg_class as c
    on c.relnamespace = n.oid
   and c.relname = e.tabla
   and c.relkind in ('r', 'p')
  left join pg_attribute as a
    on a.attrelid = c.oid
   and a.attname = e.columna
   and a.attnum > 0
   and not a.attisdropped
  left join pg_type as y
    on y.oid = a.atttypid
)
select seccion, orden, tabla, columna, dato, valor
from (
  select
    '1_extension'::text as seccion,
    1 as orden,
    'pg_trgm'::text as tabla,
    ''::text as columna,
    'disponible'::text as dato,
    coalesce(a.name, 'no figura en pg_available_extensions') as valor
  from (select 1) as uno
  left join pg_available_extensions as a on a.name = 'pg_trgm'

  union all
  select
    '1_extension',
    2,
    'pg_trgm',
    '',
    'instalada',
    case
      when e.extname is null then 'no'
      else 'si | version=' || e.extversion
    end
  from (select 1) as uno
  left join pg_extension as e on e.extname = 'pg_trgm'

  union all
  select
    '2_columna',
    c.orden,
    c.tabla,
    c.columna,
    'tipo',
    case
      when c.tabla_oid is null then 'tabla ausente'
      when c.attname is null then 'columna ausente'
      else c.tipo_real
        || ' | typname=' || c.typname
        || ' | nulos=' || case when c.attnotnull then 'no' else 'si' end
        || ' | compatible=' || case
          when c.clase = 'texto' and c.typname in ('text', 'varchar', 'citext') then 'si'
          when c.clase = 'uuid' and c.typname = 'uuid' then 'si'
          when c.clase = 'tiempo' and c.typname in ('timestamptz', 'timestamp') then 'si'
          else 'no | se espera ' || c.clase
        end
    end
  from columna as c

  union all
  select
    '3_indice',
    c.orden,
    c.tabla,
    c.columna,
    case when ix.indexrelid is null then 'ninguno' else 'indice' end,
    case
      when c.tabla_oid is null then 'tabla ausente'
      when c.attname is null then 'columna ausente'
      when ix.indexrelid is null then 'sin indice sobre esta columna'
      else i.relname
        || ' | metodo=' || am.amname
        || ' | valido=' || case when ix.indisvalid then 'si' else 'no' end
        || ' | listo=' || case when ix.indisready then 'si' else 'no' end
        || ' | tamano=' || pg_size_pretty(pg_relation_size(i.oid))
        || ' | clase=' || case
          when pg_get_indexdef(ix.indexrelid) ~* 'gin_trgm_ops'
           and pg_get_indexdef(ix.indexrelid) ~* 'coalesce' then 'trgm_funcional'
          when pg_get_indexdef(ix.indexrelid) ~* 'gin_trgm_ops' then 'trgm_columna'
          when am.amname = 'btree' then 'btree'
          else am.amname
        end
        || ' | def=' || pg_get_indexdef(ix.indexrelid)
    end
  from columna as c
  left join pg_index as ix
    on ix.indrelid = c.tabla_oid
   and (
     (c.attnum is not null and c.attnum = any (ix.indkey))
     or pg_get_indexdef(ix.indexrelid) ~* ('(^|[^[:alnum:]_])' || c.columna || '([^[:alnum:]_]|$)')
   )
  left join pg_class as i
    on i.oid = ix.indexrelid
  left join pg_am as am
    on am.oid = i.relam

  union all
  select
    '4_tabla',
    m.orden,
    m.tabla,
    '',
    'tamano',
    case
      when c.oid is null then 'tabla ausente'
      else 'heap=' || pg_size_pretty(pg_relation_size(c.oid))
        || ' | toast=' || pg_size_pretty(coalesce(pg_relation_size(nullif(c.reltoastrelid, 0)), 0))
        || ' | indices=' || pg_size_pretty(pg_indexes_size(c.oid))
        || ' | total=' || pg_size_pretty(pg_total_relation_size(c.oid))
        || ' | filas_estimadas=' || case
          when c.reltuples < 0 then 'desconocidas'
          else trunc(c.reltuples)::text
        end
        || ' | ultimo_analyze=' || coalesce(
          st.last_analyze::text,
          st.last_autoanalyze::text,
          'nunca'
        )
    end
  from (
    values
      (1, 'mensajes'),
      (2, 'seguimientos_v2'),
      (3, 'conversaciones'),
      (4, 'clientes')
  ) as m(orden, tabla)
  left join pg_namespace as n
    on n.nspname = 'public'
  left join pg_class as c
    on c.relnamespace = n.oid
   and c.relname = m.tabla
   and c.relkind in ('r', 'p')
  left join pg_stat_user_tables as st
    on st.relid = c.oid

  union all
  select
    '5_columna_tamano',
    e.orden,
    e.tabla,
    e.columna,
    'estimado_sin_leer_filas',
    case
      when c.oid is null then 'tabla ausente'
      when a.attname is null then 'columna ausente'
      when s.attname is null or c.reltuples < 0 then 'sin estadisticas de analyze'
      else 'avg_width_bytes=' || s.avg_width::text
        || ' | null_frac=' || round(s.null_frac::numeric, 4)::text
        || ' | filas_estimadas=' || trunc(c.reltuples)::text
        || ' | bytes_estimados=' || pg_size_pretty((
          s.avg_width::numeric
          * c.reltuples
          * (1 - least(greatest(s.null_frac, 0), 1))
        )::bigint)
        || ' | ultimo_analyze=' || coalesce(
          st.last_analyze::text,
          st.last_autoanalyze::text,
          'nunca'
        )
    end
  from (
    values
      (1, 'mensajes', 'contenido'),
      (2, 'conversaciones', 'ultimo_mensaje')
  ) as e(orden, tabla, columna)
  left join pg_namespace as n
    on n.nspname = 'public'
  left join pg_class as c
    on c.relnamespace = n.oid
   and c.relname = e.tabla
   and c.relkind in ('r', 'p')
  left join pg_attribute as a
    on a.attrelid = c.oid
   and a.attname = e.columna
   and a.attnum > 0
   and not a.attisdropped
  left join pg_stats as s
    on s.schemaname = 'public'
   and s.tablename = e.tabla
   and s.attname = e.columna
  left join pg_stat_user_tables as st
    on st.relid = c.oid
) as diagnostico
order by seccion, orden, tabla, columna, dato;
