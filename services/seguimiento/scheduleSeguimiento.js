const crypto = require("crypto");
const { parseSeguimientoFromHtml } = require("./parseSeguimientoNode");
const {
  insertarProgramados,
  obtenerCampanaActivaProgramacion,
  listarMismoPasoOtraConexion,
  cancelarActivosOtrasConexiones,
} = require("./seguimientoRepository");
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

async function logearDupCrossLineAlProgramar({
  numero,
  usuarioId,
  conexionWhatsappId,
  flujoId,
  nodoId,
  pasoIndex,
  origen,
}) {
  const existentes = await listarMismoPasoOtraConexion({
    numero,
    usuarioId,
    conexionWhatsappId,
    flujoId,
    nodoId,
    pasoIndex,
  });

  for (const row of existentes) {
    console.log("[SEG_DUP_CROSS_LINE_DETECTED]", {
      cliente_numero: numero,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId,
      paso_index: pasoIndex,
      conexion_existente: row.conexion_whatsapp_id ?? null,
      conexion_nueva: conexionWhatsappId,
      estado_existente: row.estado ?? null,
      seguimiento_existente_id: row.id ?? null,
      campana_existente_id: row.campana_id ?? null,
      run_at_existente: row.run_at ?? null,
      origen: origen || null,
    });
  }
}

async function programarSeguimientoNodo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  html,
  conexionWhatsappId = null,
  origen = "programarSeguimientoNodo",
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

  const campanaActiva = await obtenerCampanaActivaProgramacion({
    numero,
    usuarioId,
    conexionWhatsappId: conexionId,
    flujoId,
    nodoId,
  });

  if (campanaActiva?.campana_id) {
    console.log("[SEGUIMIENTO_DEDUP_PROGRAMACION] campaña activa existente", {
      campana_id: campanaActiva.campana_id,
      estado: campanaActiva.estado,
      usuario_id: usuarioId,
      cliente_numero: numero,
      conexion_whatsapp_id: conexionId,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId,
    });
    return {
      campanaId: campanaActiva.campana_id,
      programados: 0,
      omitido: true,
    };
  }

  const { cancelados: canceladosCrossLine, filas: filasCanceladasCrossLine } =
    await cancelarActivosOtrasConexiones({
      usuarioId,
      numero,
      flujoId,
      nodoId,
      conexionWhatsappId: conexionId,
      motivo: "cross_line_replaced",
    });

  console.log("[SEG_CROSS_LINE_CANCEL]", {
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: flujoId ?? null,
    nodo_id: nodoId,
    conexion_nueva: conexionId,
    cancelados: canceladosCrossLine,
    ids: (filasCanceladasCrossLine || []).map((r) => r.id),
    conexiones_canceladas: [
      ...new Set(
        (filasCanceladasCrossLine || [])
          .map((r) => r.conexion_whatsapp_id)
          .filter(Boolean)
      ),
    ],
  });

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

  for (let index = 0; index < config.pasos.length; index++) {
    const paso = config.pasos[index];
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    await logearDupCrossLineAlProgramar({
      numero,
      usuarioId,
      conexionWhatsappId: conexionId,
      flujoId,
      nodoId,
      pasoIndex: index,
      origen,
    });

    console.log("[SEG_SCHEDULE_TRACE]", {
      cliente_numero: numero,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId,
      conexion_whatsapp_id: conexionId,
      paso_index: index,
      run_at: runAt,
      origen,
      campana_id: campanaId,
    });

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
  }

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
