-- Config Meta Ads Insights por usuario / línea WhatsApp
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.meta_ads_config (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid null,
  ad_account_id text null,
  business_id text null,
  ads_access_token text null,
  token_expires_at timestamptz null,
  scopes text[] null,
  account_currency text null,
  ultimo_sync_ok timestamptz null,
  ultimo_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ads_config_usuario_id_idx
  on public.meta_ads_config (usuario_id);

create index if not exists meta_ads_config_conexion_whatsapp_id_idx
  on public.meta_ads_config (conexion_whatsapp_id);

create index if not exists meta_ads_config_ad_account_id_idx
  on public.meta_ads_config (ad_account_id);

-- Una fila por usuario + línea (null = config global del usuario)
create unique index if not exists meta_ads_config_usuario_conexion_unique
  on public.meta_ads_config (usuario_id, conexion_whatsapp_id)
  nulls not distinct;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.meta_ads_config
      drop constraint if exists meta_ads_config_usuario_id_fkey;
    alter table public.meta_ads_config
      add constraint meta_ads_config_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario meta_ads_config: %', sqlerrm;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.meta_ads_config
      drop constraint if exists meta_ads_config_conexion_whatsapp_id_fkey;
    alter table public.meta_ads_config
      add constraint meta_ads_config_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id) references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK conexion meta_ads_config: %', sqlerrm;
end $$;

comment on table public.meta_ads_config is 'Credenciales Meta Marketing API (Ads Insights) por tenant MacBot.';
