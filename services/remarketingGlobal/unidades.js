/**
 * Normaliza unidades de delay para remarketing global.
 * @returns {'minutes'|'hours'|'days'}
 */
function normalizarUnidad(unidad) {
  const u = String(unidad || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["minuto", "minutos", "m", "min", "minute", "minutes"].includes(u)) {
    return "minutes";
  }
  if (["hora", "horas", "h", "hour", "hours"].includes(u)) {
    return "hours";
  }
  if (["dia", "dias", "d", "day", "days"].includes(u)) {
    return "days";
  }

  return "minutes";
}

function delayToSeconds(valor, unidad) {
  const n = parseInt(valor, 10);
  if (isNaN(n) || n <= 0) return 0;

  const u = normalizarUnidad(unidad);
  if (u === "hours") return n * 3600;
  if (u === "days") return n * 86400;
  return n * 60;
}

/** Etiqueta legible para logs (español). */
function unidadParaLog(unidadNormalizada) {
  if (unidadNormalizada === "hours") return "horas";
  if (unidadNormalizada === "days") return "dias";
  return "minutos";
}

module.exports = {
  normalizarUnidad,
  delayToSeconds,
  unidadParaLog,
};
