-- Reset de contraseña MacBot CRM — columnas en crm_usuarios (token nunca en claro).
-- Ejecutar en Supabase → SQL Editor.

alter table public.crm_usuarios
  add column if not exists password_reset_token_hash text,
  add column if not exists password_reset_expires_at timestamptz;

comment on column public.crm_usuarios.password_reset_token_hash is
  'SHA-256 hex del token de reset (nunca guardar el token en claro)';

comment on column public.crm_usuarios.password_reset_expires_at is
  'Expiración UTC del token; NULL = sin reset pendiente';

create index if not exists idx_crm_usuarios_password_reset_expires
  on public.crm_usuarios (password_reset_expires_at)
  where password_reset_token_hash is not null;
