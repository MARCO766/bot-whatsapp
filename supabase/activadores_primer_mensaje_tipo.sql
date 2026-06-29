-- Fase B — documentar tipo primer_mensaje en activadores (sin CHECK; columna text libre).
-- Ejecutar en Supabase SQL Editor si se desea actualizar el comentario en BD existente.

comment on column public.activadores.tipo_activador is
  'palabra_unica | multiples_palabras | cualquier_mensaje | primer_mensaje';
