-- Preferencias CRM por usuario (perfil extendido, automatización, notificaciones, Meta Ads)
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.crm_ajustes_usuario (
  usuario_id uuid primary key,
  empresa text,
  zona_horaria text not null default 'America/La_Paz',
  idioma text not null default 'es',
  meta_pixel_id text,
  meta_capi_token text,
  meta_pixel_nombre text,
  meta_activo boolean not null default false,
  automatizacion jsonb not null default '{}'::jsonb,
  notificaciones jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_usuarios'
  ) then
    alter table public.crm_ajustes_usuario
      drop constraint if exists crm_ajustes_usuario_usuario_id_fkey;
    alter table public.crm_ajustes_usuario
      add constraint crm_ajustes_usuario_usuario_id_fkey
      foreign key (usuario_id) references public.crm_usuarios (id) on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK usuario: %', sqlerrm;
end $$;

comment on table public.crm_ajustes_usuario is 'Ajustes MacBot CRM: perfil, Meta Ads, automatización y notificaciones.';
