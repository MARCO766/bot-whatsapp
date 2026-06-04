-- Historial de acciones del panel admin MacBot (Fase 3).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_usuario_id uuid,
  admin_email text,
  usuario_afectado_id uuid,
  usuario_afectado_email text,
  accion text not null,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

comment on table public.admin_logs is
  'Auditoría de cambios realizados desde /admin (planes, activación, etc.)';

create index if not exists admin_logs_admin_usuario_id_idx
  on public.admin_logs (admin_usuario_id);

create index if not exists admin_logs_usuario_afectado_id_idx
  on public.admin_logs (usuario_afectado_id);

create index if not exists admin_logs_creado_en_idx
  on public.admin_logs (creado_en desc);

alter table public.admin_logs enable row level security;

drop policy if exists admin_logs_service_role_all on public.admin_logs;

create policy admin_logs_service_role_all
  on public.admin_logs
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert on public.admin_logs to service_role;
