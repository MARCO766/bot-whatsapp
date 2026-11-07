-- Ajuste acumulativo de leads CTWA — idempotencia persistente.
-- Ejecutar en Supabase → SQL Editor SOLO tras revisión. Esta migración no se aplica sola.
--
-- No inserta ajustes.
-- No modifica macbot_ctwa_leads: solo cuenta filas.
-- No modifica macbot_contactos_bloques: solo suma los pagados.
-- No cambia plan, estado_plan, fecha_vencimiento, max_whatsapp ni max_flujos.
--
-- Antes de ejecutar, confirmar en SQL Editor:
--   select table_name, column_name, udt_name
--   from information_schema.columns
--   where table_schema = 'public'
--     and (
--       (table_name = 'crm_usuarios' and column_name in ('id', 'plan', 'max_contactos'))
--       or (table_name = 'macbot_ctwa_leads' and column_name = 'usuario_id')
--       or (table_name = 'macbot_contactos_bloques' and column_name in ('usuario_id', 'cantidad', 'estado'))
--     );
-- Esperado: id y usuario_id uuid; max_contactos y cantidad integer; plan y estado text.
--
-- SECURITY INVOKER, no DEFINER. El backend usa service_role, que ya actualiza
-- crm_usuarios. DEFINER correría como el dueño de la función. search_path queda
-- fijo en public.
--
-- Después de ejecutar, service_role debe poder ejecutar la función y anon,
-- authenticated y public no:
--   select has_function_privilege(
--            'service_role',
--            'public.aplicar_ajuste_capacidad_leads(uuid,uuid,integer)',
--            'execute') as service_role,
--          has_function_privilege(
--            'anon',
--            'public.aplicar_ajuste_capacidad_leads(uuid,uuid,integer)',
--            'execute') as anon,
--          has_function_privilege(
--            'authenticated',
--            'public.aplicar_ajuste_capacidad_leads(uuid,uuid,integer)',
--            'execute') as authenticated,
--          has_function_privilege(
--            'public',
--            'public.aplicar_ajuste_capacidad_leads(uuid,uuid,integer)',
--            'execute') as public;
--
-- Rollback:
--   drop function if exists public.aplicar_ajuste_capacidad_leads(uuid, uuid, integer);
--   drop table if exists public.macbot_ajustes_leads_ops;

create table if not exists public.macbot_ajustes_leads_ops (
  operacion_id uuid primary key,
  usuario_id uuid not null,
  delta integer not null,
  base_anterior integer not null,
  base_nueva integer not null,
  bloques bigint not null,
  limite_anterior bigint not null,
  limite_nuevo bigint not null,
  leads_utilizados bigint not null,
  leads_disponibles bigint not null,
  reduccion_maxima_base bigint not null,
  creado_en timestamptz not null default now(),
  constraint macbot_ajustes_leads_ops_delta_nonzero check (delta <> 0),
  constraint macbot_ajustes_leads_ops_base_nueva_nonneg check (base_nueva >= 0),
  constraint macbot_ajustes_leads_ops_usuario_fk
    foreign key (usuario_id) references public.crm_usuarios (id)
);

comment on table public.macbot_ajustes_leads_ops is
  'Ajustes de capacidad de leads ya confirmados. La clave primaria impide aplicar dos veces el mismo UUID.';

comment on column public.macbot_ajustes_leads_ops.operacion_id is
  'UUID de la confirmación. El mismo UUID y el mismo delta devuelven esta fila sin volver a escribir max_contactos.';

alter table public.macbot_ajustes_leads_ops enable row level security;

-- Supabase otorga ALL a service_role al crear la tabla. Se revoca todo y quedan solo SELECT e INSERT.
revoke all on table public.macbot_ajustes_leads_ops from public, anon, authenticated, service_role;
grant select, insert on table public.macbot_ajustes_leads_ops to service_role;

create or replace function public.aplicar_ajuste_capacidad_leads(
  p_usuario_id uuid,
  p_operacion_id uuid,
  p_delta integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_op public.macbot_ajustes_leads_ops%rowtype;
  v_email text;
  v_nombre text;
  v_plan_raw text;
  v_estado text;
  v_vence timestamptz;
  v_wa integer;
  v_flujos integer;
  v_activo boolean;
  v_created timestamptz;
  v_updated_at timestamptz;
  v_plan text;
  v_base bigint;
  v_bloques bigint;
  v_usados bigint;
  v_nueva_base bigint;
  v_limite_anterior bigint;
  v_limite_nuevo bigint;
  v_reduccion bigint;
  v_disponibles bigint;
  v_updated integer;
  v_vigente jsonb;
  v_ajuste jsonb;
  v_usuario jsonb;
begin
  if p_operacion_id is null or p_usuario_id is null then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'parametro_invalido',
      'error', 'operacion_id y usuario son obligatorios'
    );
  end if;

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'delta_invalido',
      'error', 'delta debe ser un entero distinto de cero'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext('macbot_ajuste_capacidad_leads'),
    hashtext(p_operacion_id::text)
  );

  select *
    into v_op
  from public.macbot_ajustes_leads_ops
  where operacion_id = p_operacion_id;

  if found then
    if v_op.usuario_id is distinct from p_usuario_id
       or v_op.delta is distinct from p_delta then
      return jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'operacion_otro_parametro',
        'error', 'Este identificador ya se usó con otro usuario o con otro delta.'
      );
    end if;

    v_vigente := null;
    begin
      select max_contactos::bigint into v_base
      from public.crm_usuarios
      where id = p_usuario_id;
      select count(*)::bigint into v_usados
      from public.macbot_ctwa_leads
      where usuario_id = p_usuario_id;
      select coalesce(sum(cantidad)::bigint, 0) into v_bloques
      from public.macbot_contactos_bloques
      where usuario_id = p_usuario_id and estado = 'pagado';
      if v_base is null or v_base < 0 or v_usados is null or v_usados < 0
         or v_bloques is null or v_bloques < 0 then
        v_vigente := jsonb_build_object('disponible', false);
      else
        v_vigente := jsonb_build_object(
          'disponible', true,
          'base', v_base,
          'bloques', v_bloques,
          'limite', v_base + v_bloques,
          'usados', v_usados,
          'disponibles', greatest(0, v_base + v_bloques - v_usados)
        );
      end if;
    exception
      when others then
        v_vigente := jsonb_build_object('disponible', false);
    end;

    v_usuario := null;
    if coalesce((v_vigente->>'disponible')::boolean, false) then
      select jsonb_build_object(
        'id', u.id, 'nombre', u.nombre, 'email', u.email, 'plan', u.plan,
        'estado_plan', u.estado_plan, 'fecha_vencimiento', u.fecha_vencimiento,
        'max_whatsapp', u.max_whatsapp, 'max_contactos', u.max_contactos,
        'max_flujos', u.max_flujos, 'activo', u.activo,
        'created_plan_at', u.created_plan_at, 'updated_plan_at', u.updated_plan_at
      )
        into v_usuario
      from public.crm_usuarios u
      where u.id = p_usuario_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'repetida', true,
      'ajuste', jsonb_build_object(
        'operacion_id', v_op.operacion_id,
        'delta', v_op.delta,
        'base_anterior', v_op.base_anterior,
        'base_nueva', v_op.base_nueva,
        'bloques', v_op.bloques,
        'limite_anterior', v_op.limite_anterior,
        'limite_nuevo', v_op.limite_nuevo,
        'leads_utilizados', v_op.leads_utilizados,
        'leads_disponibles', v_op.leads_disponibles,
        'reduccion_maxima_base', v_op.reduccion_maxima_base
      ),
      'vigente', v_vigente,
      'usuario', v_usuario
    );
  end if;

  select email, nombre, plan, estado_plan, fecha_vencimiento,
         max_whatsapp, max_contactos, max_flujos, activo,
         created_plan_at, updated_plan_at
    into v_email, v_nombre, v_plan_raw, v_estado, v_vence,
         v_wa, v_base, v_flujos, v_activo, v_created, v_updated_at
  from public.crm_usuarios
  where id = p_usuario_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'usuario_no_encontrado',
      'error', 'Usuario no encontrado'
    );
  end if;

  select * into v_op
  from public.macbot_ajustes_leads_ops
  where operacion_id = p_operacion_id;

  if found then
    if v_op.usuario_id is distinct from p_usuario_id
       or v_op.delta is distinct from p_delta then
      return jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'operacion_otro_parametro',
        'error', 'Este identificador ya se usó con otro usuario o con otro delta.'
      );
    end if;

    v_vigente := jsonb_build_object('disponible', false);
    begin
      select coalesce(sum(cantidad)::bigint, 0) into v_bloques
      from public.macbot_contactos_bloques
      where usuario_id = p_usuario_id and estado = 'pagado';
      select count(*)::bigint into v_usados
      from public.macbot_ctwa_leads
      where usuario_id = p_usuario_id;
      if v_base is null or v_base < 0 or v_usados is null or v_bloques is null then
        v_vigente := jsonb_build_object('disponible', false);
      else
        v_vigente := jsonb_build_object(
          'disponible', true,
          'base', v_base,
          'bloques', v_bloques,
          'limite', v_base + v_bloques,
          'usados', v_usados,
          'disponibles', greatest(0, v_base + v_bloques - v_usados)
        );
      end if;
    exception
      when others then
        v_vigente := jsonb_build_object('disponible', false);
    end;

    v_usuario := null;
    if coalesce((v_vigente->>'disponible')::boolean, false) then
      v_usuario := jsonb_build_object(
        'id', p_usuario_id,
        'nombre', v_nombre,
        'email', v_email,
        'plan', v_plan_raw,
        'estado_plan', v_estado,
        'fecha_vencimiento', v_vence,
        'max_whatsapp', v_wa,
        'max_contactos', v_base,
        'max_flujos', v_flujos,
        'activo', v_activo,
        'created_plan_at', v_created,
        'updated_plan_at', v_updated_at
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'repetida', true,
      'ajuste', jsonb_build_object(
        'operacion_id', v_op.operacion_id,
        'delta', v_op.delta,
        'base_anterior', v_op.base_anterior,
        'base_nueva', v_op.base_nueva,
        'bloques', v_op.bloques,
        'limite_anterior', v_op.limite_anterior,
        'limite_nuevo', v_op.limite_nuevo,
        'leads_utilizados', v_op.leads_utilizados,
        'leads_disponibles', v_op.leads_disponibles,
        'reduccion_maxima_base', v_op.reduccion_maxima_base
      ),
      'vigente', v_vigente,
      'usuario', v_usuario
    );
  end if;

  v_plan := lower(btrim(coalesce(v_plan_raw, '')));
  if v_plan = 'agency' then
    return jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'plan_agency', 'plan', 'agency',
      'error', 'Los ajustes de leads no están disponibles para Agency.'
    );
  end if;
  if v_plan not in ('starter', 'pro', 'macbot') then
    return jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'plan_no_macbot', 'plan', 'free',
      'error', 'Los ajustes de leads solo están disponibles para usuarios MacBot.'
    );
  end if;

  if v_base is null or v_base < 0 then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'base_no_numerica',
      'error', 'La capacidad base no admite un ajuste numérico.'
    );
  end if;

  begin
    select count(*)::bigint into v_usados
    from public.macbot_ctwa_leads
    where usuario_id = p_usuario_id;
  exception
    when others then
      return jsonb_build_object(
        'ok', false, 'status', 503, 'code', 'conteo_no_disponible',
        'error', 'No se pudo verificar el consumo de leads. No se modificó la capacidad.'
      );
  end;

  if v_usados is null or v_usados < 0 then
    return jsonb_build_object(
      'ok', false, 'status', 503, 'code', 'conteo_no_disponible',
      'error', 'No se pudo verificar el consumo de leads. No se modificó la capacidad.'
    );
  end if;

  begin
    select coalesce(sum(cantidad)::bigint, 0) into v_bloques
    from public.macbot_contactos_bloques
    where usuario_id = p_usuario_id
      and estado = 'pagado';
  exception
    when others then
      return jsonb_build_object(
        'ok', false, 'status', 503, 'code', 'bloques_no_disponibles',
        'error', 'No se pudieron leer los bloques pagados. No se modificó la capacidad.'
      );
  end;

  if v_bloques is null or v_bloques < 0 then
    return jsonb_build_object(
      'ok', false, 'status', 503, 'code', 'bloques_no_disponibles',
      'error', 'No se pudieron leer los bloques pagados. No se modificó la capacidad.'
    );
  end if;

  v_nueva_base := v_base + p_delta::bigint;
  v_limite_anterior := v_base + v_bloques;
  v_limite_nuevo := v_nueva_base + v_bloques;
  v_reduccion := least(v_base, greatest(0, v_limite_anterior - v_usados));

  if v_nueva_base < 0 or v_nueva_base > 2147483647 then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'base_negativa',
      'reduccion_maxima_base', v_reduccion,
      'error', 'La capacidad base no puede quedar negativa. Reducción máxima aplicable por la base: '
        || v_reduccion || '.'
    );
  end if;

  if p_delta < 0 and v_usados > v_limite_anterior then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'ya_supera',
      'reduccion_maxima_base', 0,
      'error', 'El usuario ya supera su límite actual ('
        || v_usados || ' utilizados, límite ' || v_limite_anterior
        || '). Solo se permiten aumentos.'
    );
  end if;

  if p_delta < 0 and v_limite_nuevo < v_usados then
    return jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'por_debajo_consumo',
      'reduccion_maxima_base', v_reduccion,
      'error', 'La reducción dejaría el límite en '
        || v_limite_nuevo || ', por debajo de los ' || v_usados
        || ' leads utilizados. Reducción máxima aplicable por la base: '
        || v_reduccion || '.'
    );
  end if;

  v_disponibles := greatest(0, v_limite_nuevo - v_usados);

  update public.crm_usuarios
     set max_contactos = v_nueva_base::integer,
         updated_plan_at = now()
   where id = p_usuario_id
     and max_contactos = v_base::integer;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'La capacidad base cambió durante el ajuste'
      using errcode = 'P0001';
  end if;

  insert into public.macbot_ajustes_leads_ops (
    operacion_id, usuario_id, delta, base_anterior, base_nueva, bloques,
    limite_anterior, limite_nuevo, leads_utilizados, leads_disponibles,
    reduccion_maxima_base
  ) values (
    p_operacion_id, p_usuario_id, p_delta, v_base::integer, v_nueva_base::integer,
    v_bloques, v_limite_anterior, v_limite_nuevo, v_usados, v_disponibles, v_reduccion
  );

  v_ajuste := jsonb_build_object(
    'operacion_id', p_operacion_id,
    'delta', p_delta,
    'base_anterior', v_base,
    'base_nueva', v_nueva_base,
    'bloques', v_bloques,
    'limite_anterior', v_limite_anterior,
    'limite_nuevo', v_limite_nuevo,
    'leads_utilizados', v_usados,
    'leads_disponibles', v_disponibles,
    'reduccion_maxima_base', v_reduccion
  );
  v_vigente := jsonb_build_object(
    'disponible', true,
    'base', v_nueva_base,
    'bloques', v_bloques,
    'limite', v_limite_nuevo,
    'usados', v_usados,
    'disponibles', v_disponibles
  );
  v_usuario := jsonb_build_object(
    'id', p_usuario_id,
    'nombre', v_nombre,
    'email', v_email,
    'plan', v_plan_raw,
    'estado_plan', v_estado,
    'fecha_vencimiento', v_vence,
    'max_whatsapp', v_wa,
    'max_contactos', v_nueva_base,
    'max_flujos', v_flujos,
    'activo', v_activo,
    'created_plan_at', v_created,
    'updated_plan_at', now()
  );

  return jsonb_build_object(
    'ok', true,
    'repetida', false,
    'ajuste', v_ajuste,
    'vigente', v_vigente,
    'usuario', v_usuario
  );
end;
$fn$;

comment on function public.aplicar_ajuste_capacidad_leads(uuid, uuid, integer) is
  'Aplica una sola vez un delta de max_contactos. El mismo UUID devuelve el resultado guardado y no vuelve a escribir.';

revoke all on function public.aplicar_ajuste_capacidad_leads(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_ajuste_capacidad_leads(uuid, uuid, integer)
  to service_role;
