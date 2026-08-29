-- MacBot — RPC escalable: contar leads (clientes) por línea WhatsApp.
-- Un lead = registro en clientes. La línea se resuelve vía EXISTS en conversaciones.
-- p_flujo_id opcional: intersecta con seguimientos_programados, crm_conversiones e ia_sessions.
-- Pensado para >100.000 clientes: 1 round-trip HTTP, trabajo en PostgreSQL con índices.
--
-- EXPLAIN conceptual (PostgreSQL elegirá según estadísticas):
--
--   Aggregate  (COUNT)
--     ->  Nested Loop Semi Join
--           ->  Index Scan on clientes
--                 Index: idx_clientes_usuario_creado_no_bloqueado
--                 Filter: usuario_id, creado_en rango, estado ≠ bloqueado
--           ->  Index Only Scan on conversaciones
--                 Index: conversaciones_usuario_numero_conexion_unique
--                 Filter: usuario_id, cliente_numero = c.numero, conexion_whatsapp_id
--           ->  [si p_flujo_id IS NOT NULL] Index Scan on seguimientos_programados
--                 Index: idx_seguimientos_programados_flujo_nodo_conexion (o bitmap)
--                 Filter: usuario_id, cliente_numero = c.numero, flujo_id = p_flujo_id
--
-- Índices utilizados / requeridos:
--   1. idx_clientes_usuario_creado_no_bloqueado
--   2. conversaciones_usuario_numero_conexion_unique
--   3. conversaciones_usuario_conexion_idx (plan alternativo)
--   4. idx_seguimientos_programados_flujo_nodo_conexion (cuando p_flujo_id tiene valor)

create index if not exists idx_clientes_usuario_creado_no_bloqueado
  on public.clientes (usuario_id, creado_en)
  where estado is distinct from 'bloqueado';

create or replace function public.count_leads_por_linea(
  p_usuario_id uuid,
  p_conexion_whatsapp_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_flujo_id uuid default null
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.clientes c
  where c.usuario_id = p_usuario_id
    and c.estado is distinct from 'bloqueado'
    and c.creado_en >= p_desde
    and c.creado_en <= p_hasta
    and exists (
      select 1
      from public.conversaciones conv
      where conv.usuario_id = c.usuario_id
        and conv.cliente_numero = c.numero
        and conv.conexion_whatsapp_id = p_conexion_whatsapp_id
    )
    and (
      p_flujo_id is null
      or exists (
        select 1
        from public.seguimientos_programados s
        where s.usuario_id = c.usuario_id
          and s.cliente_numero = c.numero
          and s.flujo_id = p_flujo_id
          and s.conexion_whatsapp_id = p_conexion_whatsapp_id
      )
      or exists (
        select 1
        from public.crm_conversiones cv
        where cv.usuario_id = c.usuario_id
          and cv.cliente_numero = c.numero
          and cv.flujo_id = p_flujo_id
          and cv.conexion_whatsapp_id = p_conexion_whatsapp_id
      )
      or exists (
        select 1
        from public.ia_sessions ia
        where ia.usuario_id = c.usuario_id
          and ia.cliente_numero = c.numero
          and ia.flujo_id = p_flujo_id
          and ia.conexion_whatsapp_id = p_conexion_whatsapp_id
      )
    );
$$;

comment on function public.count_leads_por_linea(uuid, uuid, timestamptz, timestamptz, uuid) is
  'Métricas CRM: cuenta clientes (leads) en un rango de fechas pertenecientes a una línea WhatsApp (vía conversaciones). p_flujo_id opcional filtra por seguimientos, conversiones o sesiones IA del flujo.';

grant execute on function public.count_leads_por_linea(uuid, uuid, timestamptz, timestamptz, uuid)
  to service_role;
