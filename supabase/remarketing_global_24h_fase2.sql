-- =============================================================================
-- MacBot — Remarketing Global 24h · Fase 2 (envío WhatsApp)
-- Ejecutar en Supabase SQL Editor si ya tienes la tabla de Fase 1
-- =============================================================================

alter table public.remarketing_global_24h
  add column if not exists intentos int not null default 0;

alter table public.remarketing_global_24h
  add column if not exists ultimo_disparo_en timestamptz null;

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
      'expirado_ventana',
      'cerrado_sin_respuesta'
    )
  );

drop index if exists public.idx_rm24h_unique_activo_pendiente;

create unique index if not exists idx_rm24h_unique_activo_pendiente
  on public.remarketing_global_24h (usuario_id, cliente_numero, flujo_id)
  where estado in ('activo', 'pendiente_disparo', 'procesando');

create index if not exists idx_rm24h_pendiente_disparo
  on public.remarketing_global_24h (estado, activo)
  where estado = 'pendiente_disparo' and activo = true;
