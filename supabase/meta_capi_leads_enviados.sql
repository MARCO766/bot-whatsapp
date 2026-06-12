-- =============================================================================
-- MacBot CRM — Control dedup Lead Meta CAPI (una vez por línea WhatsApp)
-- Ejecutar en Supabase → SQL Editor cuando quieras activar deduplicación Lead.
-- Si no está ejecutado, el backend loguea aviso y sigue en modo degradado.
-- =============================================================================

create table if not exists public.meta_capi_leads_enviados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  cliente_numero text not null,
  conexion_whatsapp_id uuid null,
  event_id text null,
  enviado_en timestamptz not null default now()
);

-- Una fila por usuario + lead + línea (null = línea no resuelta en webhook)
create unique index if not exists meta_capi_leads_enviados_dedup_unique
  on public.meta_capi_leads_enviados (usuario_id, cliente_numero, conexion_whatsapp_id)
  nulls not distinct;

create index if not exists meta_capi_leads_enviados_usuario_idx
  on public.meta_capi_leads_enviados (usuario_id, enviado_en desc);

comment on table public.meta_capi_leads_enviados is
  'Registro de Lead CAPI enviados a Meta (dedup por usuario, cliente y línea WhatsApp).';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.meta_capi_leads_enviados
      drop constraint if exists meta_capi_leads_enviados_usuario_id_fkey;
    alter table public.meta_capi_leads_enviados
      add constraint meta_capi_leads_enviados_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario meta_capi_leads_enviados: %', sqlerrm;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.meta_capi_leads_enviados
      drop constraint if exists meta_capi_leads_enviados_conexion_whatsapp_id_fkey;
    alter table public.meta_capi_leads_enviados
      add constraint meta_capi_leads_enviados_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK conexion meta_capi_leads_enviados: %', sqlerrm;
end $$;

alter table public.meta_capi_leads_enviados enable row level security;

drop policy if exists meta_capi_leads_enviados_service_role_all on public.meta_capi_leads_enviados;

create policy meta_capi_leads_enviados_service_role_all
  on public.meta_capi_leads_enviados
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.meta_capi_leads_enviados to service_role;
