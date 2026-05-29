-- MacBot CRM — Etiquetas por línea WhatsApp (catálogo).
-- Ejecutar en Supabase → SQL Editor. No modifica bandeja ni clientes_etiquetas.

alter table public.etiquetas
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.etiquetas
      drop constraint if exists etiquetas_conexion_whatsapp_id_fkey;
    alter table public.etiquetas
      add constraint etiquetas_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK etiquetas.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists etiquetas_usuario_conexion_idx
  on public.etiquetas (usuario_id, conexion_whatsapp_id);

create unique index if not exists etiquetas_usuario_conexion_nombre_idx
  on public.etiquetas (usuario_id, conexion_whatsapp_id, nombre)
  where conexion_whatsapp_id is not null;

comment on column public.etiquetas.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). NULL = etiqueta legacy (solo vista Todas las líneas).';

-- Backfill: etiquetas existentes → conexión principal (activo) o la más antigua del usuario.
update public.etiquetas e
set conexion_whatsapp_id = sub.id
from (
  select distinct on (e2.id)
    e2.id as etiqueta_id,
    c.id
  from public.etiquetas e2
  join lateral (
    select cw.id
    from public.conexiones_whatsapp cw
    where cw.usuario_id = e2.usuario_id
    order by cw.activo desc nulls last, cw.creado_en asc nulls last
    limit 1
  ) c on true
  where e2.conexion_whatsapp_id is null
) sub
where e.id = sub.etiqueta_id
  and e.conexion_whatsapp_id is null;
