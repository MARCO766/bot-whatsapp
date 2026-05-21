-- =============================================================================
-- MacBot — Remarketing Global (motor aislado, no depende de edges del canvas)
-- Ejecutar en Supabase → SQL Editor
-- =============================================================================

create table if not exists public.remarketing_global_programados (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null,

  usuario_id uuid null,
  cliente_numero text not null,
  flujo_id uuid null,
  nodo_id text not null,

  paso_index integer not null default 0,
  paso_id text null,
  paso_nombre text null,

  run_at timestamptz not null,

  mensaje_tipo text not null default 'texto',
  mensaje_payload jsonb not null default '{}'::jsonb,

  config_snapshot jsonb not null default '{}'::jsonb,
  checkpoint_at timestamptz not null default now(),

  estado text not null default 'pendiente',
  error_detalle text null,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  enviado_en timestamptz null,
  cancelado_en timestamptz null,
  respondido_en timestamptz null,

  constraint remarketing_paso_index_nonneg check (paso_index >= 0),
  constraint remarketing_estado_valido check (
    estado in ('pendiente', 'enviado', 'cancelado', 'respondido', 'fuera_ventana_24h')
  )
);

create index if not exists idx_remarketing_pendientes_run
  on public.remarketing_global_programados (estado, run_at)
  where estado = 'pendiente';

create index if not exists idx_remarketing_cliente
  on public.remarketing_global_programados (cliente_numero, usuario_id, estado);

create index if not exists idx_remarketing_campana
  on public.remarketing_global_programados (campana_id, estado);

comment on table public.remarketing_global_programados is
  'Pasos del motor Remarketing Global — recuperación de leads sin respuesta.';
