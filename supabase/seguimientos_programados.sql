-- Ejecutar en Supabase SQL Editor
create table if not exists public.seguimientos_programados (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null,
  usuario_id uuid,
  cliente_numero text not null,
  flujo_id uuid,
  nodo_id text not null,
  paso_index int not null default 0,
  paso_id text,
  run_at timestamptz not null,
  mensaje_tipo text not null default 'texto',
  mensaje_payload jsonb not null default '{}'::jsonb,
  solo_si_no_respondio boolean not null default true,
  detener_si_responde boolean not null default true,
  checkpoint_at timestamptz not null default now(),
  estado text not null default 'pendiente',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  enviado_en timestamptz,
  cancelado_en timestamptz,
  respondido_en timestamptz,
  error_detalle text
);

create index if not exists idx_seguimientos_run
  on public.seguimientos_programados (estado, run_at);

create index if not exists idx_seguimientos_cliente
  on public.seguimientos_programados (cliente_numero, usuario_id, estado);

create index if not exists idx_seguimientos_campana
  on public.seguimientos_programados (campana_id);
