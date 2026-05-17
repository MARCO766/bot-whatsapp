-- =============================================================================
-- MacBot — Sistema de seguimientos CRM (Supabase / PostgreSQL)
-- Copiar y pegar completo en: Supabase → SQL Editor → Run
-- =============================================================================
-- Requiere tablas existentes del proyecto:
--   public.crm_usuarios (id uuid)
--   public.flujos_builder (id uuid)
--   public.clientes (numero text, usuario_id uuid)
--   public.mensajes (cliente_numero, usuario_id, direccion, creado_en)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tipos enumerados (estados y tipos de mensaje)
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.seguimiento_estado as enum (
    'pendiente',
    'enviado',
    'cancelado',
    'respondido'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.seguimiento_mensaje_tipo as enum (
    'texto',
    'imagen',
    'audio',
    'pdf'
  );
exception
  when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Tabla principal: seguimientos_programados
-- -----------------------------------------------------------------------------
-- Una fila = un paso de seguimiento programado para un lead.
-- Varias filas comparten campana_id (misma ejecución del nodo en un flujo).
-- -----------------------------------------------------------------------------

create table if not exists public.seguimientos_programados (
  -- Identidad
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null,

  -- Relaciones lógicas (multi-tenant por usuario)
  usuario_id uuid null,
  cliente_numero text not null,
  flujo_id uuid null,
  nodo_id text not null,

  -- Paso dentro del nodo Seguimiento
  paso_index integer not null default 0,
  paso_id text null,

  -- Programación
  run_at timestamptz not null,

  -- Contenido a enviar por WhatsApp
  mensaje_tipo text not null default 'texto',
  mensaje_payload jsonb not null default '{}'::jsonb,

  -- Reglas CRM
  solo_si_no_respondio boolean not null default true,
  detener_si_responde boolean not null default true,
  checkpoint_at timestamptz not null default now(),

  -- Estado del paso
  estado text not null default 'pendiente',

  -- Timestamps de auditoría
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  enviado_en timestamptz null,
  cancelado_en timestamptz null,
  respondido_en timestamptz null,

  -- Errores de envío / motivo de cancelación
  error_detalle text null,

  -- Restricciones
  constraint seguimientos_paso_index_nonneg check (paso_index >= 0),
  constraint seguimientos_estado_valido check (
    estado in ('pendiente', 'enviado', 'cancelado', 'respondido')
  ),
  constraint seguimientos_mensaje_tipo_valido check (
    mensaje_tipo in ('texto', 'imagen', 'audio', 'pdf')
  ),
  constraint seguimientos_mensaje_payload_object check (
    jsonb_typeof(mensaje_payload) = 'object'
  )
);

comment on table public.seguimientos_programados is
  'Pasos de seguimiento automático programados por el motor de flujos MacBot.';

comment on column public.seguimientos_programados.campana_id is
  'Agrupa todos los pasos de una misma activación del nodo Seguimiento.';

comment on column public.seguimientos_programados.checkpoint_at is
  'Momento en que se activó el nodo; se usa para detectar si el lead respondió después.';

comment on column public.seguimientos_programados.run_at is
  'Fecha/hora UTC en la que el worker debe intentar enviar el mensaje.';

comment on column public.seguimientos_programados.mensaje_payload is
  'JSON: { tipo, texto, url, caption } según mensaje_tipo.';

comment on column public.seguimientos_programados.estado is
  'pendiente | enviado | cancelado | respondido';

-- -----------------------------------------------------------------------------
-- 3) Relaciones (foreign keys) — opcionales si las tablas padre existen
-- -----------------------------------------------------------------------------

do $$ begin
  alter table public.seguimientos_programados
    add constraint seguimientos_usuario_fk
    foreign key (usuario_id)
    references public.crm_usuarios (id)
    on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK usuario: tabla crm_usuarios no encontrada.';
end $$;

do $$ begin
  alter table public.seguimientos_programados
    add constraint seguimientos_flujo_fk
    foreign key (flujo_id)
    references public.flujos_builder (id)
    on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK flujo: tabla flujos_builder no encontrada.';
end $$;

-- Nota: clientes suele usar (numero, usuario_id); no forzamos FK compuesta
-- para no romper instalaciones con esquemas distintos.

-- -----------------------------------------------------------------------------
-- 4) Índices (consultas del worker y del panel)
-- -----------------------------------------------------------------------------

-- Worker: pendientes vencidos ORDER BY run_at
create index if not exists idx_seguimientos_worker_pendientes
  on public.seguimientos_programados (estado, run_at)
  where estado = 'pendiente';

create index if not exists idx_seguimientos_run
  on public.seguimientos_programados (estado, run_at);

-- Webhook: cancelar por cliente + usuario
create index if not exists idx_seguimientos_cliente_estado
  on public.seguimientos_programados (cliente_numero, usuario_id, estado)
  where estado = 'pendiente';

create index if not exists idx_seguimientos_cliente
  on public.seguimientos_programados (cliente_numero, usuario_id, estado);

-- Cancelar campaña completa
create index if not exists idx_seguimientos_campana
  on public.seguimientos_programados (campana_id);

create index if not exists idx_seguimientos_campana_pendiente
  on public.seguimientos_programados (campana_id, estado)
  where estado = 'pendiente';

-- Panel builder: listar por flujo + nodo
create index if not exists idx_seguimientos_flujo_nodo
  on public.seguimientos_programados (flujo_id, nodo_id, usuario_id, creado_en desc);

-- Historial por lead
create index if not exists idx_seguimientos_cliente_creado
  on public.seguimientos_programados (cliente_numero, usuario_id, creado_en desc);

-- -----------------------------------------------------------------------------
-- 5) Trigger: actualizar actualizado_en automáticamente
-- -----------------------------------------------------------------------------

create or replace function public.seguimientos_touch_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_seguimientos_actualizado_en on public.seguimientos_programados;

create trigger trg_seguimientos_actualizado_en
  before update on public.seguimientos_programados
  for each row
  execute function public.seguimientos_touch_actualizado_en();

-- -----------------------------------------------------------------------------
-- 6) Vista resumen por campaña (opcional, útil para reportes)
-- -----------------------------------------------------------------------------

create or replace view public.seguimientos_campanas_resumen as
select
  campana_id,
  usuario_id,
  cliente_numero,
  flujo_id,
  nodo_id,
  min(checkpoint_at) as checkpoint_at,
  min(creado_en) as campana_iniciada_en,
  max(run_at) as ultimo_run_at,
  count(*) as total_pasos,
  count(*) filter (where estado = 'pendiente') as pasos_pendientes,
  count(*) filter (where estado = 'enviado') as pasos_enviados,
  count(*) filter (where estado = 'cancelado') as pasos_cancelados,
  count(*) filter (where estado = 'respondido') as pasos_respondidos
from public.seguimientos_programados
group by campana_id, usuario_id, cliente_numero, flujo_id, nodo_id;

comment on view public.seguimientos_campanas_resumen is
  'Resumen agregado por campaña de seguimiento.';

-- -----------------------------------------------------------------------------
-- 7) RLS (Row Level Security) — desactivado por defecto
-- El backend usa SUPABASE_SECRET_KEY (service role) y accede sin RLS.
-- Si usas anon key desde el cliente, habilita políticas por usuario_id.
-- -----------------------------------------------------------------------------

alter table public.seguimientos_programados enable row level security;

drop policy if exists seguimientos_service_role_all on public.seguimientos_programados;

-- Permite todo al service role (backend Node)
create policy seguimientos_service_role_all
  on public.seguimientos_programados
  for all
  to service_role
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- 8) Grants básicos
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.seguimientos_programados to service_role;
grant select on public.seguimientos_campanas_resumen to service_role;

-- =============================================================================
-- FIN — Verificación rápida
-- =============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'seguimientos_programados'
-- order by ordinal_position;
