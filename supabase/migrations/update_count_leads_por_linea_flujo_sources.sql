-- MacBot — Ampliar filtro p_flujo_id en count_leads_por_linea.
-- Antes solo intersectaba seguimientos_programados; ventas ya usaban crm_conversiones.flujo_id.
-- Ahora leads por flujo también reconocen conversiones e ia_sessions (misma fuente que métricas JS).

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
  'Métricas CRM: cuenta clientes (leads) en rango por línea WhatsApp. p_flujo_id filtra por seguimientos, conversiones o sesiones IA del flujo.';

grant execute on function public.count_leads_por_linea(uuid, uuid, timestamptz, timestamptz, uuid)
  to service_role;
