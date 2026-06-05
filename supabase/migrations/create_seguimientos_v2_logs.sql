-- Seguimiento CRM V2 — auditoría de eventos por paso.
-- Ejecutar en Supabase → SQL Editor → Run
-- Requiere: create_seguimientos_v2.sql

create table if not exists public.seguimientos_v2_logs (
  id uuid primary key default gen_random_uuid(),
  seguimiento_id uuid references public.seguimientos_v2 (id) on delete cascade,
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  cliente_numero text not null,
  evento text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seguimientos_v2_logs_seguimiento_idx
  on public.seguimientos_v2_logs (seguimiento_id);

create index if not exists seguimientos_v2_logs_clave_triple_idx
  on public.seguimientos_v2_logs (usuario_id, cliente_numero, conexion_whatsapp_id);

comment on table public.seguimientos_v2_logs is
  'Eventos de auditoría del worker/programador Seguimiento CRM V2.';
