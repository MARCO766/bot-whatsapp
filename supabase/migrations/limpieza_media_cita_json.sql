-- Cita viva de flujos, campañas e IA, inmediatamente antes de borrar.
-- NO APLICAR hasta autorizar la eliminación real.
-- Solo lee. No inserta, no actualiza y no borra filas ni objetos.
-- No modifica mensajes, conversaciones, contactos ni ventas.
-- No toca los buckets seguimiento-v2-media ni rm24h-media.
-- Si una columna no existe o no es texto/json, no concluye que el archivo está libre.
--
-- Cubre las columnas que el inventario JSON ya protege y que la revalidación
-- por ilike de columnas de texto no vuelve a leer:
--   flujos_builder.data, flujos_builder.datos
--   flujos_builder_versiones.data_snapshot
--   remarketing_global_24h.config_snapshot
--   seguimientos_programados.mensaje_payload
--   ia_sessions.flow_context, chat_history, last_replies

create or replace function public.limpieza_flujo_cita_viva(p_ruta text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ruta text;
  v_patron text;
  v_tabla text;
  v_columna text;
  v_citada boolean;
  v_mal text;
  v_tipo text;
begin
  v_ruta := nullif(btrim(coalesce(p_ruta, '')), '');
  if v_ruta is null
     or v_ruta !~ '^[a-zA-Z0-9._/-]+$'
     or v_ruta like '%..%'
     or char_length(v_ruta) > 500 then
    return jsonb_build_object('citada', false, 'error', 'ruta_no_filtrable');
  end if;
  if v_ruta like 'archivos/%' then
    v_ruta := substr(v_ruta, 10);
  end if;
  if v_ruta !~ '^(whatsapp|whatsapp-meta)/' then
    return jsonb_build_object('citada', true, 'error', null);
  end if;

  select e.tabla || '.' || e.columna, hallazgo.typname
    into v_mal, v_tipo
  from (
    values
      ('flujos_builder', 'data'),
      ('flujos_builder', 'datos'),
      ('flujos_builder_versiones', 'data_snapshot'),
      ('remarketing_global_24h', 'config_snapshot'),
      ('seguimientos_programados', 'mensaje_payload'),
      ('ia_sessions', 'flow_context'),
      ('ia_sessions', 'chat_history'),
      ('ia_sessions', 'last_replies')
  ) as e(tabla, columna)
  left join lateral (
    select y.typname
    from pg_namespace n
    join pg_class c
      on c.relnamespace = n.oid
     and c.relname = e.tabla
     and c.relkind in ('r', 'p')
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = e.columna
     and a.attnum > 0
     and not a.attisdropped
    join pg_type y on y.oid = a.atttypid
    where n.nspname = 'public'
  ) hallazgo on true
  where hallazgo.typname is null
     or hallazgo.typname not in ('text', 'varchar', 'citext', 'json', 'jsonb')
  limit 1;

  if v_mal is not null then
    return jsonb_build_object(
      'citada', false,
      'error', 'tipo_incompatible:' || v_mal || ':' || coalesce(v_tipo, 'ausente')
    );
  end if;

  v_patron := '%' || replace(replace(replace(v_ruta, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  for v_tabla, v_columna in
    select e.tabla, e.columna
    from (
      values
        ('flujos_builder', 'data'),
        ('flujos_builder', 'datos'),
        ('flujos_builder_versiones', 'data_snapshot'),
        ('remarketing_global_24h', 'config_snapshot'),
        ('seguimientos_programados', 'mensaje_payload'),
        ('ia_sessions', 'flow_context'),
        ('ia_sessions', 'chat_history'),
        ('ia_sessions', 'last_replies')
    ) as e(tabla, columna)
  loop
    execute format(
      'select exists (
         select 1
         from public.%I as t
         where t.%I is not null
           and coalesce(t.%I::text, ''''::text) ilike $1 escape ''\''
       )',
      v_tabla,
      v_columna,
      v_columna
    )
    into v_citada
    using v_patron;
    if v_citada then
      return jsonb_build_object('citada', true, 'error', null);
    end if;
  end loop;

  return jsonb_build_object('citada', false, 'error', null);
end;
$$;

comment on function public.limpieza_flujo_cita_viva(text) is
  'Lee si un archivo de conversación está citado por un flujo, una campaña o la IA. No borra nada.';

revoke all on function public.limpieza_flujo_cita_viva(text) from public;
revoke all on function public.limpieza_flujo_cita_viva(text) from anon;
revoke all on function public.limpieza_flujo_cita_viva(text) from authenticated;
grant execute on function public.limpieza_flujo_cita_viva(text) to service_role;
