-- Estados defensivos FASE 7: mismatch de conexión e idempotencia dura.
-- Ejecutar en Supabase → SQL Editor antes de desplegar el blindaje.

alter table public.seguimientos_programados
  drop constraint if exists seguimientos_estado_valido;

alter table public.seguimientos_programados
  add constraint seguimientos_estado_valido check (
    estado in (
      'pendiente',
      'procesando',
      'enviado',
      'cancelado',
      'respondido',
      'fallido_conexion_mismatch',
      'enviado_idempotente'
    )
  );
