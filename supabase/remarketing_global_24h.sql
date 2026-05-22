-- =============================================================================
-- MacBot — Remarketing Global 24h (Supabase / PostgreSQL)
-- Copiar y pegar completo en: Supabase → SQL Editor → Run
-- Fase 1: contador por inactividad (sin envío automático de WhatsApp)
-- =============================================================================

create table if not exists public.remarketing_global_24h (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  cliente_numero text not null,
  flujo_id text not null,
  flujo_nombre text null,
  estado text not null default 'activo',
  activo boolean not null default true,
  ultimo_mensaje_lead_at timestamptz null,
  expira_en timestamptz not null,
  ultimo_nodo_id text null,
  ultimo_nodo_tipo text null,
  ultimo_nodo_nombre text null,
  ultimo_camino text null,
  contador_resets int not null default 0,
  mensaje_remarketing text null,
  config_snapshot jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  disparado_en timestamptz null,
  cancelado_en timestamptz null,
  motivo_cancelacion text null,
  constraint remarketing_global_24h_estado_check check (
    estado in ('activo', 'pendiente_disparo', 'disparado', 'cancelado', 'convertido')
  )
);

comment on table public.remarketing_global_24h is
  'Contador global de remarketing por lead/flujo (ventana 23h, Fase 1 sin envío WA).';

create index if not exists idx_rm24h_usuario_id
  on public.remarketing_global_24h (usuario_id);

create index if not exists idx_rm24h_cliente_numero
  on public.remarketing_global_24h (cliente_numero);

create index if not exists idx_rm24h_flujo_id
  on public.remarketing_global_24h (flujo_id);

create index if not exists idx_rm24h_estado
  on public.remarketing_global_24h (estado);

create index if not exists idx_rm24h_expira_en
  on public.remarketing_global_24h (expira_en);

-- Un solo contador activo/pendiente por usuario + cliente + flujo
create unique index if not exists idx_rm24h_unique_activo_pendiente
  on public.remarketing_global_24h (usuario_id, cliente_numero, flujo_id)
  where estado in ('activo', 'pendiente_disparo');

create index if not exists idx_rm24h_vencidos
  on public.remarketing_global_24h (estado, activo, expira_en)
  where estado = 'activo' and activo = true;
