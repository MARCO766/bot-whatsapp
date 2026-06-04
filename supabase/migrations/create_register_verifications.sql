-- Verificación por PIN en registro MacBot CRM (intento temporal antes de crear crm_usuarios).
-- Ejecutar en Supabase → SQL Editor.

create table if not exists public.register_verifications (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  password_hash text not null,
  pin_hash text not null,
  intentos integer not null default 0,
  expires_at timestamptz not null,
  creado_en timestamptz not null default now()
);

comment on table public.register_verifications is
  'Intentos de registro pendientes de verificación por PIN (máx. 10 min, 5 intentos)';

create index if not exists idx_register_verifications_email
  on public.register_verifications (email);

create index if not exists idx_register_verifications_expires_at
  on public.register_verifications (expires_at);
