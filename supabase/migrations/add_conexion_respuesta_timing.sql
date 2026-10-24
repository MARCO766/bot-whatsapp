-- Conexiones WhatsApp — indicador de escritura + demora de respuesta (idempotente).
-- Valores por defecto seguros: ambas funciones DESACTIVADAS; demora sugerida 3s (no aplica si inactiva).
-- Ejecutar en Supabase → SQL Editor si las columnas aún no existen.
-- Etapa 1: solo persistencia; el runtime no usa estos campos hasta Etapa 2.

ALTER TABLE public.conexiones_whatsapp
  ADD COLUMN IF NOT EXISTS indicador_escritura boolean NOT NULL DEFAULT false;

ALTER TABLE public.conexiones_whatsapp
  ADD COLUMN IF NOT EXISTS demora_respuesta_activa boolean NOT NULL DEFAULT false;

ALTER TABLE public.conexiones_whatsapp
  ADD COLUMN IF NOT EXISTS demora_respuesta_segundos integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.conexiones_whatsapp.indicador_escritura IS
  'Si true, el bot puede enviar typing_indicator oficial de Cloud API (Etapa 2). Default false.';

COMMENT ON COLUMN public.conexiones_whatsapp.demora_respuesta_activa IS
  'Si true, aplica demora artificial antes de respuestas automáticas (Etapa 2). Default false.';

COMMENT ON COLUMN public.conexiones_whatsapp.demora_respuesta_segundos IS
  'Segundos de demora (1-60) cuando demora_respuesta_activa es true. Default 3; no aplica si inactiva.';
