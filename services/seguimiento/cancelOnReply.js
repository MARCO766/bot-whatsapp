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

  console.log("[SEGUIMIENTO_FIX] cancelOnReply evaluando", {
    numero,
    usuarioId,
    mensajeAt,
  });

  const pendientes = await listarPendientesRespondibles(numero, usuarioId);
  if (!pendientes.length) return;

  const campanasCanceladas = new Set();

  for (const seg of pendientes) {
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

    await actualizarEstado(seg.id, ESTADOS_SEGUIMIENTO.RESPONDIDO, {
      error_detalle: "Lead respondió",
    });

    emitirCancelacion(io, seg, usuarioId);

    if (seg.detener_si_responde && seg.campana_id && !campanasCanceladas.has(seg.campana_id)) {
      campanasCanceladas.add(seg.campana_id);
      await cancelarCampana(seg.campana_id, ESTADOS_SEGUIMIENTO.RESPONDIDO, "Lead respondió");
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
