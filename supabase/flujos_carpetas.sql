-- MacBot CRM — Carpetas premium de flujos (por usuario y línea WhatsApp)
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.flujos_carpetas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  categoria text not null,
  nombre text not null,
  slug text,
  es_sistema boolean not null default false,
  orden int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint flujos_carpetas_categoria_check check (
    categoria in (
      'ventas_automaticas',
      'lanzamientos',
      'recuperacion',
      'atencion',
      'retargeting',
      'evergreen'
    )
  )
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.flujos_carpetas
      drop constraint if exists flujos_carpetas_usuario_id_fkey;
    alter table public.flujos_carpetas
      add constraint flujos_carpetas_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK flujos_carpetas.usuario_id: %', sqlerrm;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.flujos_carpetas
      drop constraint if exists flujos_carpetas_conexion_whatsapp_id_fkey;
    alter table public.flujos_carpetas
      add constraint flujos_carpetas_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id) references public.conexiones_whatsapp (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK flujos_carpetas.conexion_whatsapp_id: %', sqlerrm;
end $$;

create unique index if not exists flujos_carpetas_usuario_conexion_slug_idx
  on public.flujos_carpetas (usuario_id, conexion_whatsapp_id, slug)
  where slug is not null;

create index if not exists flujos_carpetas_usuario_conexion_idx
  on public.flujos_carpetas (usuario_id, conexion_whatsapp_id);

comment on table public.flujos_carpetas is
  'Carpetas premium de flujos por usuario y línea WhatsApp. sin_carpeta es virtual (no fila).';
