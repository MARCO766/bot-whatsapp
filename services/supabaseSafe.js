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

function codigoError(err) {
  const data = err?.response?.data;
  if (!data || typeof data !== "object") return "";
  return String(data.code || "");
}

function esTimeoutError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  return /timeout/i.test(String(err.message || ""));
}

function esErrorDeRed(err) {
  if (!err || err.response) return false;
  const code = String(err.code || "");
  if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "EPIPE"].includes(code)) {
    return true;
  }
  return /socket hang up|network error|econnreset/i.test(String(err.message || ""));
}

function esPermisoDenegadoError(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) return true;
  const code = codigoError(err);
  if (code === "42501" || code === "PGRST301") return true;
  const texto = errorMessage(err).toLowerCase();
  return texto.includes("permission denied") || texto.includes("insufficient privilege");
}

function esFuncionAusenteError(err) {
  const code = codigoError(err);
  if (code === "PGRST202" || code === "42883") return true;
  const texto = errorMessage(err).toLowerCase();
  if (texto.includes("could not find the function") || texto.includes("could not find function")) return true;
  return /function\s+\S+\s+does not exist/.test(texto);
}

function esTablaAusenteError(err) {
  const code = codigoError(err);
  if (code === "PGRST205" || code === "42P01") return true;
  const texto = errorMessage(err).toLowerCase();
  if (texto.includes("could not find the table")) return true;
  return texto.includes("does not exist") && texto.includes("relation");
}

function esColumnaAusenteError(err) {
  const code = codigoError(err);
  if (code === "PGRST204" || code === "42703") return true;
  const texto = errorMessage(err).toLowerCase();
  if (texto.includes("could not find the") && texto.includes("column")) return true;
  return texto.includes("does not exist") && texto.includes("column");
}

function esHttp404Generico(err) {
  if (err?.response?.status !== 404) return false;
  return !esFuncionAusenteError(err) && !esTablaAusenteError(err) && !esColumnaAusenteError(err);
}

function clasificarErrorPostgrest(err) {
  if (esFuncionAusenteError(err)) return "funcion_ausente";
  if (esTablaAusenteError(err)) return "tabla_ausente";
  if (esColumnaAusenteError(err)) return "columna_ausente";
  if (esPermisoDenegadoError(err)) return "permiso_denegado";
  if (esTimeoutError(err)) return "timeout";
  if (esErrorDeRed(err)) return "error_de_red";
  if (esHttp404Generico(err)) return "http_404";
  return "desconocido";
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
  clasificarErrorPostgrest,
  errorMessage,
  withSchemaFallback,
  logSchemaFallback,
};
