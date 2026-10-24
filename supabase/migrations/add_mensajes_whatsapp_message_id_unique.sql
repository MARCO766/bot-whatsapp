-- Idempotencia durable de webhooks entrantes por wamid (Cloud API message.id).
-- Usa la columna existente public.mensajes.whatsapp_message_id (ya usada en salientes).
-- NO ejecutar automáticamente desde la app; aplicar manualmente en Supabase SQL Editor.
--
-- Efecto: un mismo wamid no puede insertarse dos veces → el reintento de Meta
-- no vuelve a reclamar el mensaje ni a disparar un segundo flujo.
--
-- LIMITACIÓN DE RECUPERACIÓN (documentada):
-- Si el proceso reclama (INSERT OK) y luego muere ANTES de responder al cliente,
-- un reintento de Meta verá el wamid ya persistido y NO reejecutará el bot.
-- Sin cola/reclaim, esa respuesta automática puede perderse. UNIQUE evita duplicados;
-- no recupera trabajos interrumpidos.

CREATE UNIQUE INDEX IF NOT EXISTS mensajes_whatsapp_message_id_unique
  ON public.mensajes (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL
    AND length(trim(whatsapp_message_id)) > 0;

COMMENT ON INDEX public.mensajes_whatsapp_message_id_unique IS
  'Claim idempotente por wamid entrante/saliente; no implica recuperación post-crash.';
