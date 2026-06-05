-- MacBot — Seguimiento CRM multi-línea: conexion_whatsapp_id en seguimientos_programados
-- Ejecutar en Supabase → SQL Editor (o vía pipeline de migraciones).
-- Sin NOT NULL: pueden existir filas legacy sin línea asignada.

alter table public.seguimientos_programados
  add column if not exists conexion_whatsapp_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conexiones_whatsapp'
  ) then
    alter table public.seguimientos_programados
      drop constraint if exists seguimientos_conexion_whatsapp_id_fkey;
    alter table public.seguimientos_programados
      add constraint seguimientos_conexion_whatsapp_id_fkey
      foreign key (conexion_whatsapp_id)
      references public.conexiones_whatsapp (id)
      on delete set null;
  end if;
exception when others then
  raise notice 'Omitida FK seguimientos.conexion_whatsapp_id: %', sqlerrm;
end $$;

comment on column public.seguimientos_programados.conexion_whatsapp_id is
  'Línea WhatsApp (conexiones_whatsapp.id). Clave triple con usuario_id y cliente_numero.';

-- Clave triple lead + línea
create index if not exists idx_seguimientos_programados_triple_key
  on public.seguimientos_programados (usuario_id, cliente_numero, conexion_whatsapp_id);

-- Worker: pendientes vencidos por línea (run_at = fecha programada de envío)
create index if not exists idx_seguimientos_programados_pendientes_conexion
  on public.seguimientos_programados (estado, run_at, conexion_whatsapp_id);

-- Panel builder: listar por flujo + nodo + línea
create index if not exists idx_seguimientos_programados_flujo_nodo_conexion
  on public.seguimientos_programados (usuario_id, flujo_id, nodo_id, conexion_whatsapp_id);
