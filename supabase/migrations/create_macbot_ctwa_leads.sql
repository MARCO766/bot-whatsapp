-- Ledger comercial de entradas CTWA MacBot (Fase 2A).
-- Ejecutar en Supabase → SQL Editor SOLO tras revisión.
--
-- Esta migración SOLO crea la tabla.
-- NO inserta filas.
-- NO conecta el webhook.
-- NO implementa enforcement de plan.
-- NO toca clientes, mensajes, routing, activadores, campañas ni WhatsApp.

create table if not exists public.macbot_ctwa_leads (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  cliente_numero text not null,
  conexion_whatsapp_id uuid null,
  message_id text not null,
  ctwa_ad_id text not null,
  created_at timestamptz not null default now(),
  constraint macbot_ctwa_leads_message_id_nonempty
    check (char_length(trim(message_id)) > 0),
  constraint macbot_ctwa_leads_ad_id_nonempty
    check (char_length(trim(ctwa_ad_id)) > 0)
);

comment on table public.macbot_ctwa_leads is
  'Ledger append-only de entradas CTWA comerciales. Idempotencia por (usuario_id, message_id). No FK a clientes: sobrevive borrado CRM.';

comment on column public.macbot_ctwa_leads.usuario_id is
  'Tenant MacBot (crm_usuarios.id). Resuelto por el webhook; no confiar en datos de cliente.';

comment on column public.macbot_ctwa_leads.cliente_numero is
  'Soft-key del contacto (WhatsApp from). Sin FK a clientes.';

comment on column public.macbot_ctwa_leads.conexion_whatsapp_id is
  'Línea WhatsApp que recibió la entrada. Nullable si no se resolvió la conexión.';

comment on column public.macbot_ctwa_leads.message_id is
  'WhatsApp message.id (wamid). Clave de idempotencia junto con usuario_id.';

comment on column public.macbot_ctwa_leads.ctwa_ad_id is
  'referral.source_id normalizado (trim). Snapshot del anuncio; no decide routing.';

-- Idempotencia durable (retries Meta, multi-instancia Render)
create unique index if not exists macbot_ctwa_leads_usuario_message_unique
  on public.macbot_ctwa_leads (usuario_id, message_id);

-- Conteos / rangos futuros por tenant
create index if not exists macbot_ctwa_leads_usuario_created_idx
  on public.macbot_ctwa_leads (usuario_id, created_at desc);

-- FK usuario: patrón confirmado en meta_capi_leads_enviados, meta_ads_*, flujos_carpetas, etc.
-- ON DELETE CASCADE: al borrar el usuario CRM se limpia su ledger.
-- Sin FK a clientes (retención comercial tras eliminar contacto).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.macbot_ctwa_leads
      drop constraint if exists macbot_ctwa_leads_usuario_id_fkey;
    alter table public.macbot_ctwa_leads
      add constraint macbot_ctwa_leads_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario macbot_ctwa_leads: %', sqlerrm;
end $$;

-- FK conexión: patrón confirmado en meta_capi_leads_enviados, inbox, etc.
-- ON DELETE SET NULL: borrar una línea no elimina historial de leads CTWA.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.macbot_ctwa_leads
      drop constraint if exists macbot_ctwa_leads_conexion_whatsapp_id_fkey;
    alter table public.macbot_ctwa_leads
      add constraint macbot_ctwa_leads_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK conexion macbot_ctwa_leads: %', sqlerrm;
end $$;

alter table public.macbot_ctwa_leads enable row level security;

drop policy if exists macbot_ctwa_leads_service_role_all
  on public.macbot_ctwa_leads;

create policy macbot_ctwa_leads_service_role_all
  on public.macbot_ctwa_leads
  for all
  to service_role
  using (true)
  with check (true);

-- Append-only: sin UPDATE ni DELETE (mismo endurecimiento que admin_logs).
grant select, insert on public.macbot_ctwa_leads to service_role;
