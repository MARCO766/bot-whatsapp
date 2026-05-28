-- Fase 2: flujos por línea WhatsApp (sin backfill de filas existentes).
-- Ejecutar en Supabase SQL Editor.

alter table public.flujos_builder
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.flujos_builder
      drop constraint if exists flujos_builder_conexion_whatsapp_id_fkey;
    alter table public.flujos_builder
      add constraint flujos_builder_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK flujos_builder.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists flujos_builder_usuario_conexion_idx
  on public.flujos_builder (usuario_id, conexion_whatsapp_id);

comment on column public.flujos_builder.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). NULL = flujo legacy, visible solo en Todas las líneas.';
