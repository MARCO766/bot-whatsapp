-- Memoria persistente IA (Fase 1) — tabla ia_sessions
-- Ejecutar en Supabase → SQL Editor → Run
-- Solo infraestructura: ningún servicio lee/escribe esta tabla aún.

create table if not exists public.ia_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  cliente_numero text not null,
  flujo_id uuid,
  nodo_id text,
  flow_context jsonb not null default '{}'::jsonb,
  chat_history jsonb not null default '[]'::jsonb,
  last_replies jsonb not null default '[]'::jsonb,
  payment_reader_status text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.ia_sessions is
  'Memoria persistente de sesiones IA por usuario, línea WhatsApp y lead. Fase 1: solo esquema.';

create index if not exists ia_sessions_usuario_id_idx
  on public.ia_sessions (usuario_id);

create index if not exists ia_sessions_conexion_whatsapp_id_idx
  on public.ia_sessions (conexion_whatsapp_id);

create index if not exists ia_sessions_cliente_numero_idx
  on public.ia_sessions (cliente_numero);

create unique index if not exists ia_sessions_usuario_conexion_cliente_uidx
  on public.ia_sessions (usuario_id, conexion_whatsapp_id, cliente_numero);

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

drop trigger if exists trg_ia_sessions_updated_at on public.ia_sessions;

create trigger trg_ia_sessions_updated_at
  before update on public.ia_sessions
  for each row
  execute function public.update_updated_at();
