-- Pausa de automatización por conversación (lead + línea WhatsApp).
-- Ejecutar en Supabase SQL Editor.

alter table public.conversaciones
  add column if not exists bot_pausado boolean not null default false;

alter table public.conversaciones
  add column if not exists bot_pausado_hasta timestamptz null;

alter table public.conversaciones
  add column if not exists bot_pausado_motivo text null;

comment on column public.conversaciones.bot_pausado is
  'Si true y bot_pausado_hasta es null o futuro, no ejecutar automatización en esta línea.';

comment on column public.conversaciones.bot_pausado_hasta is
  'Fin de pausa temporal; null = indefinido mientras bot_pausado = true.';

comment on column public.conversaciones.bot_pausado_motivo is
  'Origen de la pausa (bandeja_1h, bandeja_24h, bandeja_indefinido, resetbot, etc.).';
