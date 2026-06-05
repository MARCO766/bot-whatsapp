const {
  listarPendientesRespondibles,
  actualizarEstado,
  cancelarCampana,
  leadRespondioParaSeguimiento,
  seguimientoMismaConexion,
  normalizarConexionId,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const rt = require("../realtimeService");

function logCancelOnReplyTrace(fields) {
  console.log("[CANCEL_ON_REPLY_TRACE]", {
    mensaje_entrante: fields.mensaje_entrante ?? null,
    cliente_numero: fields.cliente_numero ?? null,
    conexionWhatsappIdEntrante: fields.conexionWhatsappIdEntrante ?? null,
    seguimiento_id: fields.seguimiento_id ?? null,
    seguimiento_conexion_whatsapp_id: fields.seguimiento_conexion_whatsapp_id ?? null,
    accion: fields.accion,
    motivo: fields.motivo ?? null,
  });
}

async function cancelarSeguimientosPorRespuesta(numero, usuarioId, io, opts = {}) {
  if (!numero || !usuarioId) return;

  const mensajeAt = opts.mensajeAt || new Date().toISOString();
  const mensajeEntrante =
    opts.mensajeEntrante != null ? String(opts.mensajeEntrante).trim() : null;
  const conexionWhatsappId = normalizarConexionId(opts.conexionWhatsappId);
  const traceBase = {
    mensaje_entrante: mensajeEntrante,
    cliente_numero: numero,
    conexionWhatsappIdEntrante: conexionWhatsappId,
  };

  if (!conexionWhatsappId) {
    logCancelOnReplyTrace({
      ...traceBase,
      seguimiento_id: null,
      seguimiento_conexion_whatsapp_id: null,
      accion: "omitido",
      motivo: "mensaje_entrante_sin_conexion_whatsapp_id",
    });
    return;
  }

  const pendientes = await listarPendientesRespondibles(
    numero,
    usuarioId,
    100,
    conexionWhatsappId
  );

  const pendientesFiltrados = pendientes.filter((seg) =>
    seguimientoMismaConexion(seg, conexionWhatsappId)
  );

  if (!pendientesFiltrados.length) {
    logCancelOnReplyTrace({
      ...traceBase,
      seguimiento_id: null,
      seguimiento_conexion_whatsapp_id: null,
      accion: "omitido",
      motivo: "sin_pendientes_misma_linea",
    });
    return;
  }

  const campanasCanceladas = new Set();

  for (const seg of pendientesFiltrados) {
    const conexionSeg = normalizarConexionId(seg.conexion_whatsapp_id);
    const traceSeg = {
      ...traceBase,
      seguimiento_id: seg.id ?? null,
      seguimiento_conexion_whatsapp_id: conexionSeg,
    };

    if (!conexionSeg || conexionSeg !== conexionWhatsappId) {
      logCancelOnReplyTrace({
        ...traceSeg,
        accion: "omitido",
        motivo: "cruzado_linea_AB",
      });
      continue;
    }

    if (!mensajeEsRespuestaValida(mensajeAt, seg)) {
      logCancelOnReplyTrace({
        ...traceSeg,
        accion: "omitido",
        motivo: "activador_antes_checkpoint",
      });
      continue;
    }

    const respondio = await leadRespondioParaSeguimiento(seg, conexionWhatsappId);

    if (!respondio) {
      logCancelOnReplyTrace({
        ...traceSeg,
        accion: "omitido",
        motivo: "sin_respuesta_misma_linea_despues_checkpoint",
      });
      continue;
    }

    logCancelOnReplyTrace({
      ...traceSeg,
      accion: "cancelado",
      motivo: "lead_respondio_misma_linea",
    });

    await actualizarEstado(seg.id, ESTADOS_SEGUIMIENTO.RESPONDIDO, {
      error_detalle: "Lead respondió",
    });

    emitirCancelacion(io, seg, usuarioId);

    if (seg.detener_si_responde && seg.campana_id && !campanasCanceladas.has(seg.campana_id)) {
      campanasCanceladas.add(seg.campana_id);
      await cancelarCampana(seg.campana_id, ESTADOS_SEGUIMIENTO.RESPONDIDO, "Lead respondió", {
        conexionWhatsappId: conexionSeg,
        usuarioId,
        clienteNumero: numero,
      });
    }
  }
}

/** Pruebas: ignora mensajes anteriores al checkpoint del seguimiento. */
function mensajeEsRespuestaValida(mensajeAt, seguimiento) {
  const umbral = seguimiento?.checkpoint_at || seguimiento?.creado_en;
  if (!mensajeAt || !umbral) return true;
  return new Date(mensajeAt) > new Date(umbral);
}

function emitirCancelacion(io, seg, usuarioId) {
  const conexionId =
    seg?.conexion_whatsapp_id != null ? String(seg.conexion_whatsapp_id).trim() : "";
  const clienteNumero =
    seg?.cliente_numero != null ? String(seg.cliente_numero).trim() : "";

  const payload = {
    id: seg.id,
    campana_id: seg.campana_id,
    cliente_numero: seg.cliente_numero,
    estado: ESTADOS_SEGUIMIENTO.RESPONDIDO,
    motivo: "respuesta_cliente",
  };

  if (seg?.paso_index != null) payload.paso_index = seg.paso_index;

  if (conexionId) {
    payload.conexion_whatsapp_id = conexionId;
    if (clienteNumero) {
      payload.chatKey = `${clienteNumero}::${conexionId}`;
    }
  }

  rt.seguimientoActualizado(io, usuarioId || seg.usuario_id, payload);
}

module.exports = {
  cancelarSeguimientosPorRespuesta,
  mensajeEsRespuestaValida,
  logCancelOnReplyTrace,
};
