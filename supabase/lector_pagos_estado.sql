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
