-- Añade estado cancelado_por_respuesta (reinicio por mensaje entrante del lead)
alter table public.remarketing_global_programados
  drop constraint if exists remarketing_estado_valido;

alter table public.remarketing_global_programados
  add constraint remarketing_estado_valido check (
    estado in (
      'pendiente',
      'enviado',
      'cancelado',
      'respondido',
      'fuera_ventana_24h',
      'cancelado_por_respuesta'
    )
  );
