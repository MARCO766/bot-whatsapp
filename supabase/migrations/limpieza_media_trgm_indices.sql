-- Diseño de índices para la revalidación por lotes.
-- NO APLICAR. Este archivo no crea la extensión ni ningún índice.
-- La migración definitiva se escribe después de medir pg_relation_size.
--
-- La función filtra con:
--   columna is not null
--   and coalesce(columna::text, ''::text) ilike patron escape '\'
-- Un gin (columna gin_trgm_ops) no sirve: la expresión indexada tiene que ser
-- exactamente coalesce(columna::text, ''::text), con el mismo predicado
-- columna is not null. El btree de media_filename cubre la igualdad.
--
-- Se indexarían, en este orden y de a una sentencia con autocommit:
--   mensajes.imagen_url
--     gin ((coalesce(imagen_url::text, ''::text)) gin_trgm_ops) where imagen_url is not null
--   mensajes.contenido
--     gin ((coalesce(contenido::text, ''::text)) gin_trgm_ops) where contenido is not null
--   seguimientos_v2.media_url, contenido, error_detalle, con la misma expresión
--   seguimientos_v2.media_filename btree where media_filename is not null
--   seguimientos_programados.error_detalle, con la misma expresión
--   conversaciones.ultimo_mensaje, con la misma expresión
--   clientes.comprobante_url, con la misma expresión
-- remarketing_global_24h, lector_pagos_estado, crm_historial_cliente,
-- flujos y flujo_pasos se dejan en recorrido secuencial: son tablas chicas
-- y un gin por cada columna costaría más de lo que ahorra.
-- mensajes.contenido es el índice grande: ocupa del orden de una a tres veces
-- la columna y se mantiene en cada mensaje del webhook.

do $$
begin
  raise notice 'limpieza_media_trgm_indices no crea índices';
end
$$;
