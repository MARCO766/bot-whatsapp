-- Lock global para un solo worker de seguimientos (multi-instancia / cron duplicado).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.seguimiento_worker_lock (
  id text primary key default 'global',
  locked_until timestamptz not null default '1970-01-01T00:00:00Z',
  locked_by text,
  updated_at timestamptz not null default now()
);

insert into public.seguimiento_worker_lock (id, locked_until, locked_by)
values ('global', '1970-01-01T00:00:00Z', null)
on conflict (id) do nothing;

comment on table public.seguimiento_worker_lock is 'Un solo tick de worker de seguimientos CRM a la vez (25-30s).';
