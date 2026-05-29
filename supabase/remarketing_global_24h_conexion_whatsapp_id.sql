-- =============================================================================
-- MacBot — Remarketing Global 24h · Multi-número (conexion_whatsapp_id)
-- Ejecutar en Supabase SQL Editor si ya tienes remarketing_global_24h
-- =============================================================================

alter table public.remarketing_global_24h
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.remarketing_global_24h
      drop constraint if exists remarketing_global_24h_conexion_whatsapp_id_fkey;
    alter table public.remarketing_global_24h
      add constraint remarketing_global_24h_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK remarketing_global_24h.conexion_whatsapp_id: %', sqlerrm;
end $$;

create index if not exists idx_rm24h_conexion_whatsapp_id
  on public.remarketing_global_24h (conexion_whatsapp_id);

create index if not exists idx_rm24h_usuario_cliente_conexion
  on public.remarketing_global_24h (usuario_id, cliente_numero, conexion_whatsapp_id);

comment on column public.remarketing_global_24h.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). NULL = fila legacy pre multi-número.';

drop index if exists public.idx_rm24h_unique_activo_pendiente;

create unique index if not exists idx_rm24h_unique_activo_pendiente
  on public.remarketing_global_24h (
    usuario_id,
    cliente_numero,
    conexion_whatsapp_id,
    flujo_id
  )
  where estado in ('activo', 'pendiente_disparo', 'procesando');
