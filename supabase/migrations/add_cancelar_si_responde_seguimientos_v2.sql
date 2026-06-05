-- Seguimiento CRM V2 — flag cancelar_si_responde (idempotente).
-- Ejecutar en Supabase → SQL Editor si la columna aún no existe.

ALTER TABLE public.seguimientos_v2
ADD COLUMN IF NOT EXISTS cancelar_si_responde BOOLEAN NOT NULL DEFAULT true;
