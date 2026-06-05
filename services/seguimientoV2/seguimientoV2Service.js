const crypto = require("crypto");
const { parseSeguimientoV2Node } = require("./seguimientoV2Parser");
const {
  insertarPasos,
  insertarLog,
  obtenerCampanaActiva,
  normalizarConexionId,
} = require("./seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2 } = require("./constants");
const {
  esNodoSeguimientoV2Test,
  aplicarVariantePasosTest,
} = require("./seguimientoV2TestNode");
const { logSegV2Test, logSegV2TestVariant } = require("./seguimientoV2TestLog");

function toTimestamptzUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function checkpointAlProgramar() {
  return toTimestamptzUtc(Date.now() + 2000);
}

async function programarSeguimientoV2EnFlujo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  nodo,
  conexionWhatsappId,
}) {
  const conexionId = normalizarConexionId(conexionWhatsappId);

  if (!conexionId) {
    console.log("[SEG_V2_NO_CONEXION]", {
      cliente_numero: numero,
      usuario_id: usuarioId ?? null,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId ?? null,
    });
    return { campanaId: null, programados: 0 };
  }

  const campanaActiva = await obtenerCampanaActiva({
    usuarioId,
    numero,
    conexionWhatsappId: conexionId,
    flujoId,
    nodoId,
  });

  if (campanaActiva?.campana_id) {
    console.log("[SEG_V2_DUPLICADO]", {
      campana_id: campanaActiva.campana_id,
      estado: campanaActiva.estado,
      conexion_whatsapp_id: campanaActiva.conexion_whatsapp_id,
      usuario_id: usuarioId,
      cliente_numero: numero,
      flujo_id: flujoId ?? null,
      nodo_id: nodoId,
    });
    return {
      campanaId: campanaActiva.campana_id,
      programados: 0,
      omitido: true,
    };
  }

  const config = parseSeguimientoV2Node(nodo);
  const pasosProgramar = esNodoSeguimientoV2Test(nodo)
    ? aplicarVariantePasosTest(config.pasos, conexionId)
    : config.pasos;

  if (!pasosProgramar.length) {
    console.log("[SEG_V2_SIN_PASOS]", {
      nodo_id: nodoId,
      flujo_id: flujoId ?? null,
      cliente_numero: numero,
      error: config.error || "pasos_vacios",
    });
    return { campanaId: null, programados: 0 };
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt = checkpointAlProgramar();
  let acumuladoSegundos = 0;
  const rows = [];

  for (let index = 0; index < pasosProgramar.length; index++) {
    const paso = pasosProgramar[index];
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    rows.push({
      campana_id: campanaId,
      usuario_id: usuarioId,
      conexion_whatsapp_id: conexionId,
      cliente_numero: numero,
      flujo_id: flujoId || null,
      nodo_id: nodoId,
      paso_index: index,
      paso_id: paso.pasoId,
      tipo: paso.tipo,
      contenido: paso.contenido,
      media_url: paso.media_url,
      media_type: paso.media_type,
      media_filename: paso.media_filename || paso.filename || null,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: runAt,
      checkpoint_at: checkpointAt,
      cancelar_si_responde: true,
    });
  }

  const insertados = await insertarPasos(rows);

  for (const fila of insertados) {
    await insertarLog({
      seguimientoId: fila.id,
      usuarioId,
      conexionWhatsappId: conexionId,
      numero,
      evento: "programado",
      detalle: {
        campana_id: campanaId,
        paso_index: fila.paso_index,
        paso_id: fila.paso_id,
        run_at: fila.run_at,
        conexion_whatsapp_id: conexionId,
      },
    });
  }

  console.log("[SEG_V2_PROGRAMADO]", {
    campana_id: campanaId,
    programados: insertados.length,
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: conexionId,
    flujo_id: flujoId ?? null,
    nodo_id: nodoId,
    checkpoint_at: checkpointAt,
  });

  for (const fila of insertados) {
    logSegV2Test({
      campana_id: campanaId,
      seguimiento_v2_id: fila.id,
      conexion_whatsapp_id: conexionId,
      estado: fila.estado,
      paso_index: fila.paso_index,
      cliente_numero: numero,
      prueba: "programado",
    });

    if (esNodoSeguimientoV2Test(nodo)) {
      logSegV2TestVariant({
        conexion_whatsapp_id: conexionId,
        contenido: fila.contenido,
        campana_id: campanaId,
        paso_index: fila.paso_index,
      });
    }
  }

  return {
    campanaId,
    programados: insertados.length,
    items: insertados,
  };
}

module.exports = {
  programarSeguimientoV2EnFlujo,
};
