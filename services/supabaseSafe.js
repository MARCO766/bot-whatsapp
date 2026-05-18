/**
 * Utilidades para tolerar tablas/columnas ausentes en Supabase (PostgREST).
 * Evita romper Clientes / Métricas si crm_conversiones aún no está migrada.
 */

function errorMessage(err) {
  const data = err?.response?.data;
  if (typeof data === "string") return data;
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);
  return String(err?.message || "");
}

function isSchemaMissingError(err) {
  const status = err?.response?.status;
  const code = String(err?.response?.data?.code || "");
  const msg = errorMessage(err).toLowerCase();

  if (code === "PGRST205" || code === "42P01") return true;
  if (status === 404) return true;
  if (msg.includes("could not find the table")) return true;
  if (msg.includes("does not exist") && (msg.includes("column") || msg.includes("relation"))) {
    return true;
  }
  return false;
}

function logSchemaFallback(tableOrPath, err) {
  console.log(
    `[supabaseSafe] ${tableOrPath} no disponible, usando valores por defecto:`,
    errorMessage(err).slice(0, 120)
  );
}

/**
 * @param {Function} fn async () => result
 * @param {{ emptyArray?: boolean, zero?: boolean, label?: string }} opts
 */
async function withSchemaFallback(fn, opts = {}) {
  const { emptyArray = true, zero = false, label = "query" } = opts;
  try {
    return await fn();
  } catch (err) {
    if (isSchemaMissingError(err)) {
      logSchemaFallback(label, err);
      if (zero) return 0;
      return emptyArray ? [] : null;
    }
    throw err;
  }
}

module.exports = {
  isSchemaMissingError,
  errorMessage,
  withSchemaFallback,
  logSchemaFallback,
};
