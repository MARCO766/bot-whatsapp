-- Números de un flujo: seguimientos, conversiones y sesiones IA.
-- Ejecutar en Supabase → SQL Editor. Esta migración no se aplica sola.
-- Aplicar este archivo antes de supabase/migrations/create_metricas_resumen_conteos_rpc.sql.
-- Debe existir antes de metricas_resumen_conteos.
-- No crea tablas ni índices. No modifica datos.
-- Apagada para la aplicación hasta METRICAS_RPC_RESUMEN_CONTEOS=1.

create or replace function public.metricas_numeros_de_flujo(
  p_usuario_id uuid,
  p_flujo_id uuid,
  p_conexion_whatsapp_id uuid
) returns table (numero text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.cliente_numero
  from public.seguimientos_programados s
  where s.usuario_id = p_usuario_id
    and s.flujo_id = p_flujo_id
    and (
      p_conexion_whatsapp_id is null
      or s.conexion_whatsapp_id = p_conexion_whatsapp_id
    )
    and s.cliente_numero is not null
    and s.cliente_numero <> ''
  union
  select distinct cv.cliente_numero
  from public.crm_conversiones cv
  where cv.usuario_id = p_usuario_id
    and cv.flujo_id = p_flujo_id
    and (
      p_conexion_whatsapp_id is null
      or cv.conexion_whatsapp_id = p_conexion_whatsapp_id
    )
    and cv.cliente_numero is not null
    and cv.cliente_numero <> ''
  union
  select distinct ia.cliente_numero
  from public.ia_sessions ia
  where ia.usuario_id = p_usuario_id
    and ia.flujo_id = p_flujo_id
    and (
      p_conexion_whatsapp_id is null
      or ia.conexion_whatsapp_id = p_conexion_whatsapp_id
    )
    and ia.cliente_numero is not null
    and ia.cliente_numero <> '';
$$;

revoke execute on function public.metricas_numeros_de_flujo(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.metricas_numeros_de_flujo(uuid, uuid, uuid)
  to service_role;
