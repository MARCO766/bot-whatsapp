-- Multi-número en Bandeja: vincular mensajes y conversaciones a una línea WhatsApp.
-- Ejecutar en Supabase SQL Editor.

alter table public.mensajes
  add column if not exists conexion_whatsapp_id uuid;

alter table public.conversaciones
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.mensajes
      drop constraint if exists mensajes_conexion_whatsapp_id_fkey;
    alter table public.mensajes
      add constraint mensajes_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;

    alter table public.conversaciones
      drop constraint if exists conversaciones_conexion_whatsapp_id_fkey;
    alter table public.conversaciones
      add constraint conversaciones_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id) on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists mensajes_usuario_conexion_idx
  on public.mensajes (usuario_id, conexion_whatsapp_id, creado_en desc);

create index if not exists conversaciones_usuario_conexion_idx
  on public.conversaciones (usuario_id, conexion_whatsapp_id, ultimo_mensaje_en desc);

create unique index if not exists conversaciones_usuario_numero_conexion_unique
  on public.conversaciones (usuario_id, cliente_numero, conexion_whatsapp_id)
  where conexion_whatsapp_id is not null;

comment on column public.mensajes.conexion_whatsapp_id is 'Línea WhatsApp (conexiones_whatsapp.id) para bandeja multi-número.';
comment on column public.conversaciones.conexion_whatsapp_id is 'Línea WhatsApp (conexiones_whatsapp.id) para bandeja multi-número.';
