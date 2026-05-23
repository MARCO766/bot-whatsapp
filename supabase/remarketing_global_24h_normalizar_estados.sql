-- =============================================================================
-- MacBot — RM24H · Normalización de estados (solo UPDATE, no borra filas)
-- Ejecutar en Supabase → SQL Editor
-- =============================================================================

-- 0) Vista previa (ejecutar primero y revisar conteos)
select
  estado,
  activo,
  motivo_cancelacion,
  count(*) as filas
from public.remarketing_global_24h
where
  (estado = 'activo' and activo = false)
  or estado = 'convertido'
  or (estado = 'cancelado' and activo = false)
group by 1, 2, 3
order by filas desc;

-- 1) Ampliar constraint (mantiene valores legacy durante migración)
alter table public.remarketing_global_24h
  drop constraint if exists remarketing_global_24h_estado_check;

alter table public.remarketing_global_24h
  add constraint remarketing_global_24h_estado_check check (
    estado in (
      'activo',
      'pendiente_disparo',
      'procesando',
      'disparado',
      'cancelado',
      'convertido',
      'cancelado_conversion',
      'cancelado_respuesta',
      'expirado_ventana',
      'cerrado_sin_respuesta'
    )
  );

-- 2) Inconsistencia: activo + activo=false + conversión
update public.remarketing_global_24h
set
  estado = 'cancelado_conversion',
  actualizado_en = now()
where
  estado = 'activo'
  and activo = false
  and motivo_cancelacion = 'conversion';

-- 3) Legacy convertido → cancelado_conversion (mismo motivo)
update public.remarketing_global_24h
set
  estado = 'cancelado_conversion',
  actualizado_en = now()
where
  estado = 'convertido'
  and coalesce(motivo_cancelacion, '') = 'conversion';

-- 4) Inconsistencia: activo + activo=false + ya disparó remarketing
update public.remarketing_global_24h
set
  estado = 'cerrado_sin_respuesta',
  motivo_cancelacion = coalesce(
    nullif(trim(motivo_cancelacion), ''),
    'max_intentos_tras_envio'
  ),
  actualizado_en = now()
where
  estado = 'activo'
  and activo = false
  and ultimo_disparo_en is not null
  and coalesce(motivo_cancelacion, '') <> 'conversion';

-- 5) Resto activo + activo=false → cancelado_respuesta (genérico)
update public.remarketing_global_24h
set
  estado = 'cancelado_respuesta',
  actualizado_en = now()
where
  estado = 'activo'
  and activo = false;

-- 6) Legacy cancelado (sin activo coherente) → cancelado_respuesta
update public.remarketing_global_24h
set
  estado = 'cancelado_respuesta',
  activo = false,
  actualizado_en = now()
where
  estado = 'cancelado'
  and activo = true;

-- 7) Verificación final
select
  estado,
  activo,
  count(*) as filas
from public.remarketing_global_24h
group by 1, 2
order by filas desc;

select count(*) as inconsistentes_activo_apagado
from public.remarketing_global_24h
where estado = 'activo' and activo = false;
