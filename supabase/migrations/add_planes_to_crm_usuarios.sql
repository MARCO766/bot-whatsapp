-- Planes SaaS MacBot — columnas en crm_usuarios (Fase 1: almacenamiento y lectura).
-- Ejecutar en Supabase → SQL Editor.

alter table public.crm_usuarios
  add column if not exists plan text default 'free',
  add column if not exists estado_plan text default 'activo',
  add column if not exists fecha_vencimiento timestamptz,
  add column if not exists max_whatsapp integer default 1,
  add column if not exists max_contactos integer default 100,
  add column if not exists max_flujos integer default 3,
  add column if not exists created_plan_at timestamptz default now(),
  add column if not exists updated_plan_at timestamptz default now();

comment on column public.crm_usuarios.plan is
  'Plan SaaS: free, starter, pro, agency';

comment on column public.crm_usuarios.estado_plan is
  'Estado del plan: activo, vencido, suspendido, trial';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_usuarios_plan_check'
  ) then
    alter table public.crm_usuarios
      add constraint crm_usuarios_plan_check
      check (plan in ('free', 'starter', 'pro', 'agency'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_usuarios_estado_plan_check'
  ) then
    alter table public.crm_usuarios
      add constraint crm_usuarios_estado_plan_check
      check (estado_plan in ('activo', 'vencido', 'suspendido', 'trial'));
  end if;
end $$;

create index if not exists idx_crm_usuarios_plan
  on public.crm_usuarios (plan);

create index if not exists idx_crm_usuarios_estado_plan
  on public.crm_usuarios (estado_plan);
