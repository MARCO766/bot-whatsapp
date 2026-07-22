-- Flow Sessions — Fase 1 lifecycle infra
-- Agrega expires_at y finished_at (NULL). No altera columnas existentes ni status.
-- El runtime aún no calcula ni escribe estos campos.

alter table public.flow_sessions
  add column if not exists expires_at timestamptz null;

alter table public.flow_sessions
  add column if not exists finished_at timestamptz null;

comment on column public.flow_sessions.expires_at is
  'Fin de ventana de lifecycle (Fase 1: solo columna; el runtime no la calcula aún).';

comment on column public.flow_sessions.finished_at is
  'Momento en que la sesión pasó a finished (Fase 1: solo columna; el runtime no la escribe aún).';
