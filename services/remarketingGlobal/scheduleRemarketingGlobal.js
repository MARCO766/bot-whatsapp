const crypto = require("crypto");
const {
  parseRemarketingFromNodo,
  obtenerPasosActivosValidos,
} = require("./parseRemarketingGlobalNode");
const { normalizarUnidad, unidadParaLog } = require("./unidades");
const { insertarProgramados, cancelarPendientesCliente } = require("./remarketingRepository");
const { aplicarEtiquetaCliente } = require("./aplicarEtiqueta");
const { ESTADOS_REMARKETING } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");
const { buildRemarketingProgramadoRow } = require("./dbRow");

function formatearDelayLog(paso) {
  const v = paso.delay?.valor ?? paso.delay;
  const raw = paso.delay?.unidad || paso.unidad || "minutos";
  const u = normalizarUnidad(raw);
  return v + " unidad=" + raw + " normalizada=" + u + " (" + unidadParaLog(u) + ")";
}

async function programarRemarketingGlobal({
  numero,
  usuarioId,
  flujoId,
  nodo,
  cancelarAnteriores = true,
}) {
  const config =
    nodo?.config && nodo.config.steps
      ? nodo.config
      : parseRemarketingFromNodo(nodo);

  if (!config.activo) {
    console.log("[REMARKETING] motor pausado (activo=false) — no se programa");
    return { campanaId: null, programados: 0, omitido: true };
  }

  const pasos = obtenerPasosActivosValidos(config.steps);

  if (!pasos.length) {
    console.log(
      "[REMARKETING] sin pasos válidos (revisa mensaje en R1 y guarda el flujo)"
    );
    return { campanaId: null, programados: 0, omitido: true };
  }

  const primerPaso = pasos[0];
  console.log(
    "[REMARKETING] R1 encontrado delay=" + formatearDelayLog(primerPaso)
  );

  if (cancelarAnteriores) {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.CANCELADO,
      "Nueva campaña remarketing",
      flujoId || null
    );
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = nowUtc();
  let acumuladoSegundos = 0;
  const rows = [];

  pasos.forEach((paso, index) => {
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    if (index === 0) {
      console.log(
        "[REMARKETING] programando R1 para " +
          numero +
          " | run_at +" +
          paso.segundos +
          "s (" +
          formatearDelayLog(paso) +
          ")"
      );
    }

    rows.push(
      buildRemarketingProgramadoRow({
        campanaId,
        usuarioId,
        numero,
        flujoId,
        nodoId: nodo.id || "remarketing_global_fixed",
        paso,
        pasoIndex: index,
        config,
        checkpointAt,
        runAt,
      })
    );
  });

  let insertados = [];

  try {
    insertados = await insertarProgramados(rows);
    console.log(
      "[REMARKETING] insert OK | filas:",
      insertados.length,
      "| cliente:",
      numero,
      "| campaña:",
      campanaId
    );
  } catch (error) {
    console.error(
      "[REMARKETING] ERROR insertando programación:",
      error.response?.data || error.message
    );
    throw error;
  }

  if (config.etiquetas?.activo) {
    await aplicarEtiquetaCliente(numero, config.etiquetas.activo, usuarioId);
  }

  return { campanaId, programados: insertados.length, config, pasos };
}

module.exports = {
  programarRemarketingGlobal,
};
