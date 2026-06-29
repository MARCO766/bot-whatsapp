-- Columnas opcionales para activadores (ejecutar en Supabase SQL Editor).
-- No rompe filas existentes; valores por defecto seguros.

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS prioridad integer NOT NULL DEFAULT 0;

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS coincidencia text NOT NULL DEFAULT 'contiene';

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS veces_usado integer NOT NULL DEFAULT 0;

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS ultima_ejecucion timestamptz;

COMMENT ON COLUMN activadores.prioridad IS 'Mayor prioridad gana si varias frases coinciden';
COMMENT ON COLUMN activadores.coincidencia IS 'exacta | contiene';
COMMENT ON COLUMN activadores.veces_usado IS 'Contador de ejecuciones por webhook';
COMMENT ON COLUMN activadores.ultima_ejecucion IS 'Última vez que disparó un flujo';

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS tipo_activador text NOT NULL DEFAULT 'palabra_unica';

ALTER TABLE activadores
  ADD COLUMN IF NOT EXISTS palabras_clave_array text[] DEFAULT '{}';

COMMENT ON COLUMN activadores.tipo_activador IS 'palabra_unica | multiples_palabras | cualquier_mensaje | primer_mensaje';
COMMENT ON COLUMN activadores.palabras_clave_array IS 'Lista de palabras para tipo multiples_palabras';
