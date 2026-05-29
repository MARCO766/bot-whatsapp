-- =============================================================================
-- MacBot CRM — Conversiones de venta (solo nodo 💰 Conversión y webhooks futuros)
-- Ejecutar en Supabase → SQL Editor
-- =============================================================================

create table if not exists public.crm_conversiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  flujo_id uuid null,
  nodo_id text null,
  cliente_numero text not null,
  conexion_whatsapp_id uuid null,
  valor numeric(14, 2) not null default 0,
  moneda text not null default 'USD',
  origen text not null default 'flujo',
  creado_en timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint crm_conversiones_valor_nonneg check (valor >= 0),
  constraint crm_conversiones_origen_valido check (
    origen in (
      'flujo',
      'manual',
      'hotmart',
      'stripe',
      'mercadopago',
      'qr',
      'webhook'
    )
  ),
  constraint crm_conversiones_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

comment on table public.crm_conversiones is
  'Ventas/conversiones registradas por el nodo Conversión o integraciones de pago.';

create index if not exists idx_crm_conversiones_usuario
  on public.crm_conversiones (usuario_id, creado_en desc);

create index if not exists idx_crm_conversiones_flujo
  on public.crm_conversiones (flujo_id, creado_en desc)
  where flujo_id is not null;

create index if not exists idx_crm_conversiones_cliente
  on public.crm_conversiones (usuario_id, cliente_numero, creado_en desc);

-- Multi-número Fase 1: conversión por línea (usuario + lead + conexión)
alter table public.crm_conversiones
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.crm_conversiones
      drop constraint if exists crm_conversiones_conexion_whatsapp_id_fkey;
    alter table public.crm_conversiones
      add constraint crm_conversiones_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK crm_conversiones.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists idx_crm_conversiones_cliente_conexion
  on public.crm_conversiones (usuario_id, cliente_numero, conexion_whatsapp_id, creado_en desc);

comment on column public.crm_conversiones.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). Clave con usuario_id y cliente_numero para multi-número.';

do $$ begin
  alter table public.crm_conversiones
    add constraint crm_conversiones_usuario_fk
    foreign key (usuario_id)
    references public.crm_usuarios (id)
    on delete cascade;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK usuario: crm_usuarios no encontrada.';
end $$;

do $$ begin
  alter table public.crm_conversiones
    add constraint crm_conversiones_flujo_fk
    foreign key (flujo_id)
    references public.flujos_builder (id)
    on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK flujo: flujos_builder no encontrada.';
end $$;

alter table public.crm_conversiones enable row level security;

drop policy if exists crm_conversiones_service_role_all on public.crm_conversiones;

create policy crm_conversiones_service_role_all
  on public.crm_conversiones
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.crm_conversiones to service_role;
