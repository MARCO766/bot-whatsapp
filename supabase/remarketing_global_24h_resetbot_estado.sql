-- RM24H: estado terminal para comando resetbot
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
      'cerrado_sin_respuesta',
      'cancelado_resetbot'
    )
  );
