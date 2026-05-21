const crypto = require("crypto");
const { parseRemarketingFromNodo } = require("./parseRemarketingGlobalNode");
const { insertarProgramados, cancelarPendientesCliente } = require("./remarketingRepository");
const { aplicarEtiquetaCliente } = require("./aplicarEtiqueta");
const { ESTADOS_REMARKETING } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

async function programarRemarketingGlobal({
  numero,
  usuarioId,
  flujoId,
  nodo,
  cancelarAnteriores = true,
}) {
  const config = parseRemarketingFromNodo(nodo);

  if (!config.activo) {
    console.log("[REMARKETING] Nodo pausado — no se programa");
    return { campanaId: null, programados: 0, omitido: true };
  }

  if (!config.steps.length) {
    console.log("[REMARKETING] Sin pasos válidos configurados");
    return { campanaId: null, programados: 0, omitido: true };
  }

  if (cancelarAnteriores && flujoId) {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.CANCELADO,
      "Nueva campaña remarketing",
      flujoId
    );
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = nowUtc();
  let acumuladoSegundos = 0;
  const rows = [];

  config.steps.forEach((paso, index) => {
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    rows.push({
      campana_id: campanaId,
      usuario_id: usuarioId || null,
      cliente_numero: numero,
      flujo_id: flujoId || null,
      nodo_id: nodo.id,
      paso_index: index,
      paso_id: paso.id,
      paso_nombre: paso.nombre,
      run_at: runAt,
      mensaje_tipo: paso.mensaje.tipo,
      mensaje_payload: {
        tipo: paso.mensaje.tipo,
        texto: paso.mensaje.texto,
        url: paso.mensaje.url,
        caption: paso.mensaje.caption,
      },
      config_snapshot: config,
      checkpoint_at: checkpointAt,
      estado: ESTADOS_REMARKETING.PENDIENTE,
    });
  });

  const insertados = await insertarProgramados(rows);

  if (config.etiquetas?.activo) {
    await aplicarEtiquetaCliente(
      numero,
      config.etiquetas.activo,
      usuarioId
    );
  }

  console.log(
    "[REMARKETING] Programados:",
    insertados.length,
    "paso(s) | cliente:",
    numero,
    "| campaña:",
    campanaId
  );

  return { campanaId, programados: insertados.length, config };
}

module.exports = {
  programarRemarketingGlobal,
};
