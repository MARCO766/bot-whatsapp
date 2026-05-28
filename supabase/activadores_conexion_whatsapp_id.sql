-- Fase 3: activadores por línea WhatsApp (sin backfill de filas existentes).
-- Ejecutar en Supabase SQL Editor.

alter table public.activadores
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.activadores
      drop constraint if exists activadores_conexion_whatsapp_id_fkey;
    alter table public.activadores
      add constraint activadores_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK activadores.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists activadores_usuario_conexion_idx
  on public.activadores (usuario_id, conexion_whatsapp_id);

comment on column public.activadores.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). NULL = activador legacy, visible solo en Todas las líneas.';
