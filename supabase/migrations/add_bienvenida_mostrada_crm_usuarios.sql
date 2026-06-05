-- Fase 3 MacBot — modal de bienvenida en primer login del CRM.
alter table public.crm_usuarios
  add column if not exists bienvenida_mostrada boolean not null default false;

comment on column public.crm_usuarios.bienvenida_mostrada is
  'true cuando el usuario cerró el modal de bienvenida premium en el CRM.';
