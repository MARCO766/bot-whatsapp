-- Bandeja: una página de conversaciones de un producto, sin duplicar sesiones.
-- Ejecutar en Supabase → SQL Editor. Esta migración no se aplica sola.
--
-- Tipos declarados en el repo (sin casts):
--   flow_sessions.usuario_id uuid
--   flow_sessions.conexion_whatsapp_id uuid
--   flow_sessions.cliente_numero text
--   flow_sessions.flujo_id uuid
--   conversaciones.conexion_whatsapp_id uuid
--   flujos_builder.id uuid (comentario y FKs del repo)
--   flujos_builder.conexion_whatsapp_id uuid
--   clientes_etiquetas.conexion_whatsapp_id uuid
--   crm_usuarios.id uuid (comentario del repo; la sesión usa ese id)
--
-- El repo no declara el tipo de estas columnas. La función las compara sin cast.
-- Antes de ejecutar, confirmar en SQL Editor que coinciden; si no, no correr esto:
--   select table_name, column_name, udt_name
--   from information_schema.columns
--   where table_schema = 'public'
--     and (
--       (table_name = 'conversaciones' and column_name in
--         ('usuario_id', 'cliente_numero', 'conexion_whatsapp_id', 'ultimo_mensaje_en'))
--       or (table_name = 'flujos_builder' and column_name in
--         ('id', 'usuario_id', 'conexion_whatsapp_id'))
--       or (table_name = 'clientes_etiquetas' and column_name in
--         ('usuario_id', 'cliente_numero', 'conexion_whatsapp_id', 'etiqueta'))
--       or (table_name = 'flow_sessions' and column_name in
--         ('usuario_id', 'conexion_whatsapp_id', 'cliente_numero', 'flujo_id'))
--     )
--   order by table_name, column_name;
-- Esperado para que compile: usuario_id uuid, cliente_numero text,
-- etiqueta text, ultimo_mensaje_en ordenable y anulable. conexion_whatsapp_id
-- y los id de flujo ya están declarados arriba.
--
-- Permisos: el backend llama con SUPABASE_SECRET_KEY (rol service_role).
-- SECURITY INVOKER. Estas sentencias no prueban los grants reales hasta
-- ejecutarlas. Después, en SQL Editor:
--   select
--     has_function_privilege(
--       'service_role',
--       'public.inbox_conversaciones_por_flujo(uuid,uuid,uuid,integer,integer,text)',
--       'execute') as service_role,
--     has_function_privilege(
--       'anon',
--       'public.inbox_conversaciones_por_flujo(uuid,uuid,uuid,integer,integer,text)',
--       'execute') as anon,
--     has_function_privilege(
--       'authenticated',
--       'public.inbox_conversaciones_por_flujo(uuid,uuid,uuid,integer,integer,text)',
--       'execute') as authenticated,
--     has_function_privilege(
--       'public',
--       'public.inbox_conversaciones_por_flujo(uuid,uuid,uuid,integer,integer,text)',
--       'execute') as public;
-- Esperado: service_role true; anon, authenticated y public false.
-- Equivalente:
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where specific_schema = 'public'
--     and routine_name = 'inbox_conversaciones_por_flujo';
--
-- Rollback:
--   drop function if exists public.inbox_conversaciones_por_flujo(uuid, uuid, uuid, integer, integer, text);
--   drop index if exists public.flow_sessions_usuario_conexion_flujo_numero_idx;

create index if not exists flow_sessions_usuario_conexion_flujo_numero_idx
  on public.flow_sessions (usuario_id, conexion_whatsapp_id, flujo_id, cliente_numero)
  where flujo_id is not null;

create or replace function public.inbox_conversaciones_por_flujo(
  p_usuario_id uuid,
  p_conexion_whatsapp_id uuid,
  p_flujo_id uuid,
  p_limit integer,
  p_offset integer,
  p_etiqueta text default null
)
returns setof public.conversaciones
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.conversaciones c
  where c.usuario_id = p_usuario_id
    and c.conexion_whatsapp_id = p_conexion_whatsapp_id
    and c.cliente_numero is not null
    and exists (
      select 1
      from public.flujos_builder fb
      where fb.id = p_flujo_id
        and fb.usuario_id = p_usuario_id
        and fb.conexion_whatsapp_id = p_conexion_whatsapp_id
    )
    and exists (
      select 1
      from public.flow_sessions fs
      where fs.usuario_id = c.usuario_id
        and fs.conexion_whatsapp_id = c.conexion_whatsapp_id
        and fs.cliente_numero = c.cliente_numero
        and fs.flujo_id = p_flujo_id
    )
    and (
      p_etiqueta is null
      or p_etiqueta = ''
      or exists (
        select 1
        from public.clientes_etiquetas ce
        where ce.usuario_id = c.usuario_id
          and ce.conexion_whatsapp_id = c.conexion_whatsapp_id
          and ce.cliente_numero = c.cliente_numero
          and ce.etiqueta = p_etiqueta
      )
    )
  order by c.ultimo_mensaje_en desc nulls first, c.cliente_numero desc
  limit least(greatest(coalesce(p_limit, 0), 0), 101)
  offset least(greatest(coalesce(p_offset, 0), 0), 100000);
$$;

comment on function public.inbox_conversaciones_por_flujo(uuid, uuid, uuid, integer, integer, text) is
  'Bandeja: conversaciones de un flujo propio de la línea. EXISTS en flow_sessions sin filtrar status. p_etiqueta null o vacía no filtra; cualquier otro texto, incluidos espacios, coincide exacto. Orden ultimo_mensaje_en desc nulls first, desempate cliente_numero desc. p_limit se recorta a 101 y p_offset a 100000; negativos y nulos quedan en 0.';

revoke execute on function public.inbox_conversaciones_por_flujo(uuid, uuid, uuid, integer, integer, text)
  from public, anon, authenticated;

grant execute on function public.inbox_conversaciones_por_flujo(uuid, uuid, uuid, integer, integer, text)
  to service_role;
