-- =============================================================================
-- MacBot CRM — Extensión tabla clientes (embudo, score, fuente, notas)
-- Ejecutar en Supabase → SQL Editor (no rompe Bandeja ni webhook)
-- =============================================================================

alter table public.clientes
  add column if not exists estado_embudo text not null default 'nuevo';

alter table public.clientes
  add column if not exists score text not null default 'frio';

alter table public.clientes
  add column if not exists notas text;

alter table public.clientes
  add column if not exists fuente text default 'whatsapp';

alter table public.clientes
  add column if not exists pais text;

alter table public.clientes
  add column if not exists archivado boolean not null default false;

alter table public.clientes
  add column if not exists ultima_actividad timestamptz;

alter table public.clientes
  add column if not exists total_gastado numeric(14, 2) not null default 0;

comment on column public.clientes.estado is
  'Estado de contacto: nuevo, bloqueado (Bandeja/webhook).';

comment on column public.clientes.estado_embudo is
  'Embudo CRM: nuevo, conversando, interesado, caliente, esperando_pago, compro, recompra, perdido.';

do $$ begin
  alter table public.clientes
    add constraint clientes_estado_embudo_valido check (
      estado_embudo in (
        'nuevo',
        'conversando',
        'interesado',
        'caliente',
        'esperando_pago',
        'compro',
        'recompra',
        'perdido'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.clientes
    add constraint clientes_score_valido check (
      score in ('caliente', 'medio', 'frio')
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_clientes_usuario_embudo
  on public.clientes (usuario_id, estado_embudo)
  where archivado = false;

create index if not exists idx_clientes_usuario_actividad
  on public.clientes (usuario_id, ultima_actividad desc nulls last);

-- Historial de eventos CRM (cambios embudo, acciones manuales)
create table if not exists public.crm_historial_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  cliente_numero text not null,
  tipo text not null,
  titulo text not null,
  detalle text,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_crm_historial_cliente_lead
  on public.crm_historial_cliente (usuario_id, cliente_numero, creado_en desc);

alter table public.crm_historial_cliente enable row level security;

drop policy if exists crm_historial_cliente_service_role_all on public.crm_historial_cliente;

create policy crm_historial_cliente_service_role_all
  on public.crm_historial_cliente
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.crm_historial_cliente to service_role;
