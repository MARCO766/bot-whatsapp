-- Idempotencia: un mensaje saliente por seguimiento programado (anti-duplicado Meta/inbox).
-- Ejecutar en Supabase → SQL Editor.

alter table public.mensajes
  add column if not exists seguimiento_id uuid;

create unique index if not exists mensajes_seguimiento_id_unique
  on public.mensajes (seguimiento_id)
  where seguimiento_id is not null;

create index if not exists mensajes_seguimiento_id_idx
  on public.mensajes (seguimiento_id)
  where seguimiento_id is not null;

comment on column public.mensajes.seguimiento_id is 'FK lógica a seguimientos_programados.id — mensaje CRM de un paso de seguimiento.';
