-- Conexiones WhatsApp Cloud API (multi-número por usuario)
-- Ejecutar en Supabase SQL Editor si la tabla no existe o faltan columnas.

create table if not exists public.conexiones_whatsapp (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  nombre text,
  numero text,
  phone_id text not null,
  token text not null,
  waba_id text,
  pixel_id text,
  capi_token text,
  activo boolean not null default true,
  estado text not null default 'conectado',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- FK usuario (si crm_usuarios existe)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.conexiones_whatsapp
      drop constraint if exists conexiones_whatsapp_usuario_id_fkey;
    alter table public.conexiones_whatsapp
      add constraint conexiones_whatsapp_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario: %', sqlerrm;
end $$;

-- phone_id único global (un número Meta → un tenant)
create unique index if not exists conexiones_whatsapp_phone_id_unique
  on public.conexiones_whatsapp (phone_id);

create index if not exists conexiones_whatsapp_usuario_idx
  on public.conexiones_whatsapp (usuario_id);

-- Columnas nuevas en tablas ya existentes
alter table public.conexiones_whatsapp add column if not exists waba_id text;
alter table public.conexiones_whatsapp add column if not exists estado text default 'conectado';
alter table public.conexiones_whatsapp add column if not exists creado_en timestamptz default now();
alter table public.conexiones_whatsapp add column if not exists actualizado_en timestamptz default now();

comment on table public.conexiones_whatsapp is 'Credenciales WhatsApp Cloud API por usuario (multi-número).';
