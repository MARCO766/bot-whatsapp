-- Flow Sessions (Fase 1) — infraestructura para ciclo de vida del flujo
-- Independiente de ia_sessions. Ningún runtime la usa todavía.
-- Ejecutar en Supabase → SQL Editor → Run

create table if not exists public.flow_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  cliente_numero text not null,
  flujo_id uuid,
  current_node_id text,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_sessions_status_nonempty check (char_length(trim(status)) > 0)
);

comment on table public.flow_sessions is
  'Sesiones de ciclo de vida de flujo por usuario, línea WhatsApp y lead. Fase 1: solo esquema e infraestructura; el runtime no la consume.';

comment on column public.flow_sessions.status is
  'Estado de la sesión. Valores iniciales previstos: active, finished, expired. Extensible en fases posteriores.';

create index if not exists flow_sessions_usuario_id_idx
  on public.flow_sessions (usuario_id);

create index if not exists flow_sessions_conexion_whatsapp_id_idx
  on public.flow_sessions (conexion_whatsapp_id);

create index if not exists flow_sessions_cliente_numero_idx
  on public.flow_sessions (cliente_numero);

create index if not exists flow_sessions_flujo_id_idx
  on public.flow_sessions (flujo_id);

create index if not exists flow_sessions_status_idx
  on public.flow_sessions (status);

create index if not exists flow_sessions_last_activity_at_idx
  on public.flow_sessions (last_activity_at);

-- Reutilizar update_updated_at si ya existe; no duplicar la función.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    create function public.update_updated_at()
    returns trigger
    language plpgsql
    as $func$
    begin
      new.updated_at := now();
      return new;
    end;
    $func$;
  end if;
end;
$$;

drop trigger if exists trg_flow_sessions_updated_at on public.flow_sessions;

create trigger trg_flow_sessions_updated_at
  before update on public.flow_sessions
  for each row
  execute function public.update_updated_at();
