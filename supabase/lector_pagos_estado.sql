-- Lector de Pago v1 (fase 1) - estado aislado
-- Tabla nueva, sin tocar clientes ni otras tablas existentes.

create table if not exists public.lector_pagos_estado (
  id bigserial primary key,
  usuario_id text not null,
  cliente_numero text not null,
  flujo_id text,
  nodo_id text,
  esperando_pago boolean not null default true,
  monto_esperado numeric(14, 2) not null default 0,
  moneda_esperada text not null default 'bs',
  nombre_esperado text,
  tolerancia numeric(14, 2) not null default 0.01,
  estado_pago text not null default 'pendiente',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_lector_pagos_estado_lookup
  on public.lector_pagos_estado (usuario_id, cliente_numero, esperando_pago);
-- MacBot — Lector de Pago v1 (estado por lead)
-- Ejecutar en Supabase → SQL Editor

create table if not exists public.lector_pagos_estado (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid,
  cliente_numero text,
  flujo_id text,
  nodo_id text,
  esperando_pago boolean not null default true,
  monto_esperado numeric,
  moneda_esperada text,
  tolerancia numeric not null default 0.5,
  monto_detectado numeric,
  moneda_detectada text,
  nombre_detectado text,
  confianza numeric,
  estado_pago text,
  producto_texto text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  pagado_en timestamptz
);

create index if not exists idx_lector_pagos_estado_activo
  on public.lector_pagos_estado (usuario_id, cliente_numero, esperando_pago)
  where esperando_pago = true;

comment on table public.lector_pagos_estado is
  'Lector de Pago v1: estado de verificación OCR por lead';

comment on column public.lector_pagos_estado.estado_pago is
  'esperando | valido | invalido';

-- Fase 2: entrega de producto
alter table public.lector_pagos_estado
  add column if not exists producto_texto text;

alter table public.lector_pagos_estado
  add column if not exists producto_url text;

alter table public.lector_pagos_estado
  add column if not exists producto_entregado_at timestamptz;

alter table public.lector_pagos_estado
  add column if not exists mensaje_pago_valido text;

alter table public.lector_pagos_estado
  add column if not exists mensaje_pago_invalido text;

alter table public.lector_pagos_estado
  add column if not exists pagado_en timestamptz;

-- Multi-número Fase 1: estado de pago por línea WhatsApp (usuario + lead + conexión)
alter table public.lector_pagos_estado
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.lector_pagos_estado
      drop constraint if exists lector_pagos_estado_conexion_whatsapp_id_fkey;
    alter table public.lector_pagos_estado
      add constraint lector_pagos_estado_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK lector_pagos_estado.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists idx_lector_pagos_estado_lookup_multi
  on public.lector_pagos_estado (usuario_id, cliente_numero, conexion_whatsapp_id, esperando_pago)
  where esperando_pago = true;

comment on column public.lector_pagos_estado.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). Clave con usuario_id y cliente_numero para multi-número.';
