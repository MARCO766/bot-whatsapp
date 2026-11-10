-- Métricas: conteos del resumen por conexión, en una sola lectura.
-- NO EJECUTAR en esta fase. La aplicación no llama esta función salvo
-- METRICAS_RPC_RESUMEN_CONTEOS=1, que queda apagada.
-- No crea ni elimina índices. No modifica tablas ni datos.
--
-- Una fila por cada uuid de p_conexiones que pertenece a p_usuario_id.
-- Un id de otra cuenta no entra: la función no devuelve esa fila y Node
-- descarta la respuesta entera. __todas__ no se interpreta aquí: la suma
-- por línea, incluido un teléfono presente en dos conexiones, se hace fuera.
-- p_flujo_id, si viene, tiene que ser un flujos_builder de ese usuario.
-- Si no lo es, no hay filas y Node tampoco usa la respuesta.
--
-- Mensajes del periodo actual se recorren una vez:
--   salientes  = direccion = 'saliente'
--   entrantes  = direccion = 'entrante'
--   respuestas = distinto de cliente_numero entrante, sin null ni ''
--   clientes_con_mensaje = distinto de cualquier dirección, sin null ni ''
-- Los extremos son inclusivos: creado_en >= p_desde y creado_en <= p_hasta.
-- Esos instantes los calcula Node, también el periodo anterior.
--
-- Sin p_flujo_id, conversaciones es el conteo de la tabla si es mayor que cero.
-- Si ese conteo es cero, se usa clientes_con_mensaje. Con p_flujo_id no se
-- consulta la tabla conversaciones: el indicador es el distinto de mensajes
-- cuyo teléfono está en metricas_numeros_de_flujo de esa misma conexión.
-- La función de números sigue sin filtro de fecha.
--
-- Ingresos, ventas, leads y seguimientos no se calculan aquí.
--
-- Dos lecturas de mensajes, una por periodo, para que cada una pueda usar
-- mensajes_usuario_conexion_idx (usuario_id, conexion_whatsapp_id, creado_en).
-- No se unen en un OR: ese plan puede dejar de acotar por fecha. No se sube
-- statement_timeout ni se crean índices. Con flujo no se lee conversaciones:
-- el indicador sale de los mensajes. Una cuenta grande, en 30 o 90 días y
-- con todas las líneas, todavía puede pasar de 8 segundos. Si Postgres corta
-- la sentencia, Node vuelve al cálculo anterior y no publica un parcial.

create or replace function public.metricas_resumen_conteos(
  p_usuario_id uuid,
  p_conexiones uuid[],
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz default null,
  p_hasta_anterior timestamptz default null,
  p_flujo_id uuid default null
) returns table (
  conexion_whatsapp_id uuid,
  salientes bigint,
  entrantes bigint,
  respuestas bigint,
  clientes_con_mensaje bigint,
  conversaciones bigint,
  conversaciones_anterior bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with conexiones as (
    select distinct cw.id as conexion_whatsapp_id
    from unnest(coalesce(p_conexiones, array[]::uuid[])) as pedido(conexion_whatsapp_id)
    join public.conexiones_whatsapp cw
      on cw.id = pedido.conexion_whatsapp_id
     and cw.usuario_id = p_usuario_id
    where p_usuario_id is not null
      and pedido.conexion_whatsapp_id is not null
      and (
        p_flujo_id is null
        or exists (
          select 1
          from public.flujos_builder fb
          where fb.id = p_flujo_id
            and fb.usuario_id = p_usuario_id
        )
      )
  ),
  numeros as (
    select c.conexion_whatsapp_id, n.numero
    from conexiones c
    cross join lateral public.metricas_numeros_de_flujo(
      p_usuario_id,
      p_flujo_id,
      c.conexion_whatsapp_id
    ) as n
    where p_flujo_id is not null
  ),
  msgs as (
    select
      m.conexion_whatsapp_id,
      (count(*) filter (where m.direccion = 'saliente'))::bigint as salientes,
      (count(*) filter (where m.direccion = 'entrante'))::bigint as entrantes,
      (count(distinct m.cliente_numero) filter (
        where m.direccion = 'entrante'
          and m.cliente_numero is not null
          and m.cliente_numero <> ''
      ))::bigint as respuestas,
      (count(distinct m.cliente_numero) filter (
        where m.cliente_numero is not null
          and m.cliente_numero <> ''
      ))::bigint as clientes_con_mensaje
    from public.mensajes m
    join conexiones c
      on c.conexion_whatsapp_id = m.conexion_whatsapp_id
    where m.usuario_id = p_usuario_id
      and m.creado_en >= p_desde
      and m.creado_en <= p_hasta
      and (
        p_flujo_id is null
        or exists (
          select 1
          from numeros n
          where n.conexion_whatsapp_id = m.conexion_whatsapp_id
            and n.numero = m.cliente_numero
        )
      )
    group by m.conexion_whatsapp_id
  ),
  msgs_ant as (
    select
      m.conexion_whatsapp_id,
      (count(distinct m.cliente_numero) filter (
        where m.cliente_numero is not null
          and m.cliente_numero <> ''
      ))::bigint as clientes_con_mensaje
    from public.mensajes m
    join conexiones c
      on c.conexion_whatsapp_id = m.conexion_whatsapp_id
    where p_desde_anterior is not null
      and p_hasta_anterior is not null
      and m.usuario_id = p_usuario_id
      and m.creado_en >= p_desde_anterior
      and m.creado_en <= p_hasta_anterior
      and (
        p_flujo_id is null
        or exists (
          select 1
          from numeros n
          where n.conexion_whatsapp_id = m.conexion_whatsapp_id
            and n.numero = m.cliente_numero
        )
      )
    group by m.conexion_whatsapp_id
  ),
  conv as (
    select
      c.conexion_whatsapp_id,
      (count(cv.id) filter (
        where cv.creado_en >= p_desde
          and cv.creado_en <= p_hasta
      ))::bigint as actual,
      (count(cv.id) filter (
        where p_desde_anterior is not null
          and p_hasta_anterior is not null
          and cv.creado_en >= p_desde_anterior
          and cv.creado_en <= p_hasta_anterior
      ))::bigint as anterior
    from conexiones c
    left join public.conversaciones cv
      on p_flujo_id is null
     and cv.usuario_id = p_usuario_id
     and cv.conexion_whatsapp_id = c.conexion_whatsapp_id
     and (
       (cv.creado_en >= p_desde and cv.creado_en <= p_hasta)
       or (
         p_desde_anterior is not null
         and p_hasta_anterior is not null
         and cv.creado_en >= p_desde_anterior
         and cv.creado_en <= p_hasta_anterior
       )
     )
    group by c.conexion_whatsapp_id
  )
  select
    c.conexion_whatsapp_id,
    coalesce(m.salientes, 0)::bigint as salientes,
    coalesce(m.entrantes, 0)::bigint as entrantes,
    coalesce(m.respuestas, 0)::bigint as respuestas,
    coalesce(m.clientes_con_mensaje, 0)::bigint as clientes_con_mensaje,
    (case
      when p_flujo_id is not null then coalesce(m.clientes_con_mensaje, 0)
      when coalesce(cv.actual, 0) > 0 then cv.actual
      else coalesce(m.clientes_con_mensaje, 0)
    end)::bigint as conversaciones,
    (case
      when p_desde_anterior is null or p_hasta_anterior is null then 0
      when p_flujo_id is not null then coalesce(ma.clientes_con_mensaje, 0)
      when coalesce(cv.anterior, 0) > 0 then cv.anterior
      else coalesce(ma.clientes_con_mensaje, 0)
    end)::bigint as conversaciones_anterior
  from conexiones c
  left join msgs m on m.conexion_whatsapp_id = c.conexion_whatsapp_id
  left join msgs_ant ma on ma.conexion_whatsapp_id = c.conexion_whatsapp_id
  left join conv cv on cv.conexion_whatsapp_id = c.conexion_whatsapp_id;
$$;

comment on function public.metricas_resumen_conteos(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, uuid) is
  'Conteos del resumen por conexión. No sustituye ingresos, ventas, leads ni seguimientos. Apagada hasta METRICAS_RPC_RESUMEN_CONTEOS=1.';

revoke execute on function public.metricas_resumen_conteos(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.metricas_resumen_conteos(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, uuid)
  to service_role;
