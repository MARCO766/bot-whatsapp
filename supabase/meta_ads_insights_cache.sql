-- Cache de insights Meta Ads (account-level)
-- Ejecutar en Supabase SQL Editor después de meta_ads_config.sql

create table if not exists public.meta_ads_insights_cache (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid null,
  ad_account_id text not null,
  level text not null default 'account',
  campaign_id text null,
  periodo text not null,
  date_start date not null,
  date_stop date not null,
  spend numeric default 0,
  impressions bigint default 0,
  reach bigint default 0,
  clicks bigint default 0,
  ctr numeric default 0,
  cpc numeric default 0,
  cpm numeric default 0,
  frequency numeric default 0,
  raw_payload jsonb null,
  synced_at timestamptz default now(),
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists meta_ads_insights_cache_usuario_id_idx
  on public.meta_ads_insights_cache (usuario_id);

create index if not exists meta_ads_insights_cache_conexion_whatsapp_id_idx
  on public.meta_ads_insights_cache (conexion_whatsapp_id);

create index if not exists meta_ads_insights_cache_ad_account_id_idx
  on public.meta_ads_insights_cache (ad_account_id);

create index if not exists meta_ads_insights_cache_dates_idx
  on public.meta_ads_insights_cache (date_start, date_stop);

create unique index if not exists meta_ads_insights_cache_unique_key
  on public.meta_ads_insights_cache (
    usuario_id,
    conexion_whatsapp_id,
    ad_account_id,
    level,
    campaign_id,
    periodo,
    date_start,
    date_stop
  )
  nulls not distinct;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.meta_ads_insights_cache
      drop constraint if exists meta_ads_insights_cache_usuario_id_fkey;
    alter table public.meta_ads_insights_cache
      add constraint meta_ads_insights_cache_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario insights: %', sqlerrm;
end $$;

comment on table public.meta_ads_insights_cache is 'Snapshots account-level Meta Ads Insights por periodo.';
