-- =============================================================================
-- MacBot — Reparación segura (sin borrar datos)
-- Ejecutar en Supabase → SQL Editor → Run
-- Corrige: public.crm_conversiones ausente, activadores.prioridad ausente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabla crm_conversiones (ventas / conversiones CRM)
-- -----------------------------------------------------------------------------
create table if not exists public.crm_conversiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  flujo_id uuid null,
  nodo_id text null,
  cliente_numero text not null,
  valor numeric(14, 2) not null default 0,
  moneda text not null default 'BOB',
  origen text not null default 'manual',
  creado_en timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- Columnas por si la tabla existía incompleta
alter table public.crm_conversiones
  add column if not exists nodo_id text null;

alter table public.crm_conversiones
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on table public.crm_conversiones is
  'Ventas/conversiones (nodo Conversión, manual, webhooks).';

create index if not exists idx_crm_conversiones_usuario
  on public.crm_conversiones (usuario_id, creado_en desc);

create index if not exists idx_crm_conversiones_cliente
  on public.crm_conversiones (usuario_id, cliente_numero, creado_en desc);

create index if not exists idx_crm_conversiones_flujo
  on public.crm_conversiones (flujo_id, creado_en desc)
  where flujo_id is not null;

-- Constraints opcionales (no fallan si ya existen)
do $$ begin
  alter table public.crm_conversiones
    add constraint crm_conversiones_valor_nonneg check (valor >= 0);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.crm_conversiones
    add constraint crm_conversiones_origen_valido check (
      origen in (
        'flujo',
        'manual',
        'hotmart',
        'stripe',
        'mercadopago',
        'qr',
        'webhook'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.crm_conversiones
    add constraint crm_conversiones_metadata_object check (
      jsonb_typeof(metadata) = 'object'
    );
exception
  when duplicate_object then null;
end $$;

-- FKs opcionales (no rompen si crm_usuarios / flujos_builder no existen aún)
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

-- -----------------------------------------------------------------------------
-- 2) Columna activadores.prioridad (y otras extendidas usadas por el CRM)
-- -----------------------------------------------------------------------------
alter table public.activadores
  add column if not exists prioridad integer not null default 0;

alter table public.activadores
  add column if not exists coincidencia text not null default 'contiene';

alter table public.activadores
  add column if not exists veces_usado integer not null default 0;

alter table public.activadores
  add column if not exists ultima_ejecucion timestamptz;

alter table public.activadores
  add column if not exists tipo_activador text not null default 'palabra_unica';

alter table public.activadores
  add column if not exists palabras_clave_array text[] default '{}';

comment on column public.activadores.prioridad is
  'Mayor prioridad gana si varias frases coinciden';

-- =============================================================================
-- Fin — Recarga el schema cache en Supabase si los errores persisten 1-2 min
-- =============================================================================
