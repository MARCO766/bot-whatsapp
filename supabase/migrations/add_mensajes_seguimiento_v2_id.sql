-- Idempotencia inbox: un mensaje saliente por paso Seguimiento CRM V2.
-- Ejecutar en Supabase → SQL Editor → Run

alter table public.mensajes
  add column if not exists seguimiento_v2_id uuid;

create unique index if not exists mensajes_seguimiento_v2_id_unique
  on public.mensajes (seguimiento_v2_id)
  where seguimiento_v2_id is not null;

create index if not exists mensajes_seguimiento_v2_id_idx
  on public.mensajes (seguimiento_v2_id)
  where seguimiento_v2_id is not null;

comment on column public.mensajes.seguimiento_v2_id is
  'FK lógica a seguimientos_v2.id — mensaje CRM de un paso V2 (aislado de seguimiento_id legacy).';
