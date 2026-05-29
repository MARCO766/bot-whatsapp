-- MacBot CRM — Asignación de etiquetas por línea WhatsApp (Fase 2A bandeja).
-- Ejecutar en Supabase → SQL Editor DESPUÉS de etiquetas_conexion_whatsapp_id.sql

alter table public.clientes_etiquetas
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.clientes_etiquetas
      drop constraint if exists clientes_etiquetas_conexion_whatsapp_id_fkey;
    alter table public.clientes_etiquetas
      add constraint clientes_etiquetas_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete cascade;
  end if;
exception when others then
  raise notice 'Omitida FK clientes_etiquetas.conexion_whatsapp_id: %', sqlerrm;
end $$;

-- Backfill filas legacy → conexión principal del usuario
update public.clientes_etiquetas ce
set conexion_whatsapp_id = sub.id
from (
  select distinct on (ce2.id)
    ce2.id as asignacion_id,
    cw.id
  from public.clientes_etiquetas ce2
  join lateral (
    select c.id
    from public.conexiones_whatsapp c
    where c.usuario_id = ce2.usuario_id
    order by c.activo desc nulls last, c.creado_en asc nulls last
    limit 1
  ) cw on true
  where ce2.conexion_whatsapp_id is null
) sub
where ce.id = sub.asignacion_id
  and ce.conexion_whatsapp_id is null;

drop index if exists clientes_etiquetas_usuario_numero_unique;
drop index if exists clientes_etiquetas_usuario_numero_conexion_idx;
alter table public.clientes_etiquetas
  drop constraint if exists clientes_etiquetas_usuario_id_cliente_numero_key;

-- Permite múltiples etiquetas por chat; evita duplicar la misma etiqueta en la misma línea
create unique index if not exists clientes_etiquetas_usuario_numero_conexion_etiqueta_idx
  on public.clientes_etiquetas (usuario_id, cliente_numero, conexion_whatsapp_id, etiqueta);

create index if not exists clientes_etiquetas_usuario_conexion_idx
  on public.clientes_etiquetas (usuario_id, conexion_whatsapp_id);

comment on column public.clientes_etiquetas.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). Scope de asignación en bandeja multi-número.';
