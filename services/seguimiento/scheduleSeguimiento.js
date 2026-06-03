const crypto = require("crypto");
const { parseSeguimientoFromHtml } = require("./parseSeguimientoNode");
const { insertarProgramados } = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

/** Checkpoint posterior al activador: mensajes hasta aquí no cuentan como respuesta. */
function checkpointAlProgramar() {
  return toTimestamptzUtc(Date.now() + 2000);
}

function normalizarConexionProgramar(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

async function programarSeguimientoNodo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  html,
  conexionWhatsappId = null,
}) {
  const conexionId = normalizarConexionProgramar(conexionWhatsappId);
  if (!conexionId) {
    throw new Error(
      "programarSeguimientoNodo: conexion_whatsapp_id obligatorio (multi-número)"
    );
  }

  const config = parseSeguimientoFromHtml(html);

  if (!config.pasos.length) {
    console.log("[SEGUIMIENTO] Sin pasos válidos para programar | nodo:", nodoId);
    return { campanaId: null, programados: 0 };
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = checkpointAlProgramar();
  let acumuladoSegundos = 0;

  console.log("[SEGUIMIENTO_FIX] activador ignorado como respuesta");
  console.log("[SEGUIMIENTO_FIX] checkpoint_at", checkpointAt);
  console.log("[SEGUIMIENTO_FIX] lote_id", campanaId);

  console.log("[SEGUIMIENTO_MULTI] programando seguimiento", {
    nodoId,
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: conexionId,
    pasos: config.pasos.length,
    checkpoint_at: checkpointAt,
    lote_id: campanaId,
  });
  const rows = [];

  config.pasos.forEach((paso, index) => {
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    const row = {
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
    };
    row.conexion_whatsapp_id = conexionId;
    rows.push(row);

    const mensaje =
      paso.mensaje?.texto ||
      paso.mensaje?.caption ||
      paso.mensaje?.url ||
      "";
    console.log("[SCHEDULE_TRACE]", {
      cliente_numero: numero,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId,
      paso_index: index,
      mensaje: String(mensaje).trim(),
      conexionWhatsappId: conexionId,
    });
  });

  console.log(
    `[SCHEDULE SEGUIMIENTO] cliente_numero=${numero} flujo_id=${flujoId ?? null} nodo_id=${nodoId} conexion_whatsapp_id=${conexionId}`
  );

  const insertados = await insertarProgramados(rows);

  console.log("[SEGUIMIENTO_MULTI] seguimiento programado OK", {
    programados: insertados.length,
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: conexionId,
    campana_id: campanaId,
  });

  return { campanaId, programados: insertados.length, items: insertados };
}

module.exports = {
  programarSeguimientoNodo,
};
