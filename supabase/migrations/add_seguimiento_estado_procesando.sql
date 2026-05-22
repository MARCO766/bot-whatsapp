-- Permite estado intermedio "procesando" para reserva atómica del worker (anti-duplicados).
-- Ejecutar en Supabase → SQL Editor si el worker falla al marcar procesando.

alter table public.seguimientos_programados
  drop constraint if exists seguimientos_estado_valido;

alter table public.seguimientos_programados
  add constraint seguimientos_estado_valido check (
    estado in ('pendiente', 'procesando', 'enviado', 'cancelado', 'respondido')
  );
