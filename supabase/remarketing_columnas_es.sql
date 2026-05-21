-- Columnas ES para remarketing_global_programados (producción Supabase)
-- Ejecutar si la tabla aún usa run_at / mensaje_payload

alter table public.remarketing_global_programados
  rename column run_at to correr_en;

alter table public.remarketing_global_programados
  rename column mensaje_payload to "carga_útil_del_mensaje";

alter table public.remarketing_global_programados
  rename column config_snapshot to "instantánea_de_configuración";

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
      'cancelado_por_respuesta',
      'error'
    )
  );

create index if not exists idx_remarketing_pendientes_correr_en
  on public.remarketing_global_programados (estado, correr_en)
  where estado = 'pendiente';
