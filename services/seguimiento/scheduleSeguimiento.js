const crypto = require("crypto");
const { parseSeguimientoFromHtml } = require("./parseSeguimientoNode");
const { insertarProgramados } = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

async function programarSeguimientoNodo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  html,
}) {
  const config = parseSeguimientoFromHtml(html);

  if (!config.pasos.length) {
    console.log("[SEGUIMIENTO] Sin pasos válidos para programar | nodo:", nodoId);
    return { campanaId: null, programados: 0 };
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = nowUtc();
  let acumuladoSegundos = 0;
  const rows = [];

  config.pasos.forEach((paso, index) => {
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    rows.push({
      campana_id: campanaId,
      usuario_id: usuarioId || null,
      cliente_numero: numero,
      flujo_id: flujoId || null,
      nodo_id: nodoId,
      paso_index: index,
      paso_id: paso.id,
      run_at: runAt,
      mensaje_tipo: paso.mensaje.tipo,
      mensaje_payload: {
        ...paso.mensaje,
        botones: paso.botones || [],
      },
      solo_si_no_respondio: config.soloSiNoRespondio,
      detener_si_responde: config.detenerSiResponde,
      checkpoint_at: checkpointAt,
      estado: ESTADOS_SEGUIMIENTO.PENDIENTE,
    });
  });

  const insertados = await insertarProgramados(rows);

  console.log(
    "[SEGUIMIENTO] Programados:",
    insertados.length,
    "paso(s) | cliente:",
    numero,
    "| campaña:",
    campanaId
  );

  return { campanaId, programados: insertados.length, items: insertados };
}

module.exports = {
  programarSeguimientoNodo,
};
