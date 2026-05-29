const {
  listarPendientesRespondibles,
  actualizarEstado,
  cancelarCampana,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const rt = require("../realtimeService");

function parseTs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function mismaConexionWhatsapp(segConexion, mensajeConexion) {
  const seg = segConexion ? String(segConexion).trim() : null;
  const msg = mensajeConexion ? String(mensajeConexion).trim() : null;
  if (msg) return seg === msg;
  return !seg;
}

/** Respuesta válida solo si el mensaje entrante es estrictamente posterior al checkpoint. */
function mensajeEsRespuestaValida(mensajeAt, seguimiento) {
  const mensajeTs = parseTs(mensajeAt);
  if (mensajeTs == null) return false;

  const umbral = seguimiento.checkpoint_at || seguimiento.creado_en;
  const umbralTs = parseTs(umbral);
  if (umbralTs == null) return false;

  return mensajeTs > umbralTs;
}

async function cancelarSeguimientosPorRespuesta(numero, usuarioId, io, opts = {}) {
  if (!numero) return;

  const mensajeAt = opts.mensajeAt || new Date().toISOString();
  const conexionWhatsappId = opts.conexionWhatsappId || null;

  console.log("[SEGUIMIENTO_MULTI] cancelar por respuesta — inicio", {
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: conexionWhatsappId,
    mensajeAt,
  });

  const pendientes = await listarPendientesRespondibles(
    numero,
    usuarioId,
    100,
    conexionWhatsappId
  );
  if (!pendientes.length) {
    console.log("[SEGUIMIENTO_MULTI] cancelar por respuesta — sin pendientes en esta conexión", {
      usuario_id: usuarioId,
      cliente_numero: numero,
      conexion_whatsapp_id: conexionWhatsappId,
    });
    return;
  }

  const campanasCanceladas = new Set();

  for (const seg of pendientes) {
    if (!mismaConexionWhatsapp(seg.conexion_whatsapp_id, conexionWhatsappId)) {
      console.log("[SEGUIMIENTO_MULTI] cancelar omitido — otra conexión", {
        seguimiento_id: seg.id,
        seguimiento_conexion: seg.conexion_whatsapp_id || null,
        mensaje_conexion: conexionWhatsappId || null,
      });
      continue;
    }

    const checkpoint = seg.checkpoint_at || seg.creado_en;
    const esRespuesta = mensajeEsRespuestaValida(mensajeAt, seg);

    console.log("[SEGUIMIENTO_FIX] mensaje > checkpoint_at ?", {
      mensajeAt,
      checkpoint_at: checkpoint,
      lote_id: seg.campana_id,
      seguimiento_id: seg.id,
      resultado: esRespuesta,
    });

    if (!esRespuesta) {
      console.log("[SEGUIMIENTO_FIX] activador ignorado como respuesta", {
        seguimiento_id: seg.id,
        lote_id: seg.campana_id,
      });
      continue;
    }

    console.log("[SEGUIMIENTO_MULTI] cancelar por respuesta — aplicando", {
      seguimiento_id: seg.id,
      campana_id: seg.campana_id,
      usuario_id: usuarioId,
      cliente_numero: numero,
      conexion_whatsapp_id: seg.conexion_whatsapp_id || conexionWhatsappId || null,
    });

    await actualizarEstado(seg.id, ESTADOS_SEGUIMIENTO.RESPONDIDO, {
      error_detalle: "Lead respondió",
    });

    emitirCancelacion(io, seg, usuarioId);

    if (seg.detener_si_responde && seg.campana_id && !campanasCanceladas.has(seg.campana_id)) {
      campanasCanceladas.add(seg.campana_id);
      await cancelarCampana(seg.campana_id, ESTADOS_SEGUIMIENTO.RESPONDIDO, "Lead respondió", {
        conexionWhatsappId: seg.conexion_whatsapp_id || conexionWhatsappId || null,
      });
    }
  }
}

function emitirCancelacion(io, seg, usuarioId) {
  rt.seguimientoActualizado(io, usuarioId || seg.usuario_id, {
    id: seg.id,
    campana_id: seg.campana_id,
    cliente_numero: seg.cliente_numero,
    estado: ESTADOS_SEGUIMIENTO.RESPONDIDO,
    motivo: "respuesta_cliente",
  });
}

module.exports = {
  cancelarSeguimientosPorRespuesta,
  mensajeEsRespuestaValida,
};
