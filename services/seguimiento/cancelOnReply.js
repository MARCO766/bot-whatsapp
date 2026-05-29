const {
  listarPendientesRespondibles,
  actualizarEstado,
  cancelarCampana,
  clienteRespondioDespues,
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
  if (!numero || !usuarioId) return;

  const mensajeAt = opts.mensajeAt || new Date().toISOString();
  const conexionWhatsappId =
    opts.conexionWhatsappId != null && String(opts.conexionWhatsappId).trim() !== ""
      ? String(opts.conexionWhatsappId).trim()
      : null;

  console.log(
    `[SEGUIMIENTO_MULTI] cancelar inicio cliente_numero=${numero} usuario_id=${usuarioId} conexion_whatsapp_id=${conexionWhatsappId ?? null} mensajeAt=${mensajeAt}`
  );

  const pendientes = await listarPendientesRespondibles(
    numero,
    usuarioId,
    100,
    conexionWhatsappId
  );

  const pendientesFiltrados = pendientes.filter((seg) =>
    mismaConexionWhatsapp(seg.conexion_whatsapp_id, conexionWhatsappId)
  );
  if (!pendientesFiltrados.length) {
    console.log(
      `[SEGUIMIENTO_MULTI] cancelar sin pendientes cliente_numero=${numero} conexion_whatsapp_id=${conexionWhatsappId ?? null} listados=${pendientes.length}`
    );
    return;
  }

  const campanasCanceladas = new Set();

  for (const seg of pendientesFiltrados) {
    const conexionSeg = seg.conexion_whatsapp_id ?? conexionWhatsappId ?? null;

    const respondio = await clienteRespondioDespues(
      numero,
      usuarioId,
      seg.checkpoint_at,
      seg.creado_en,
      conexionSeg
    );

    console.log(
      `[SEGUIMIENTO_MULTI] cancelar eval respondio=${respondio} seguimiento_id=${seg.id} conexion_whatsapp_id=${conexionSeg ?? null} checkpoint_at=${seg.checkpoint_at ?? null} mensaje_webhook_at=${mensajeAt}`
    );

    if (!respondio) {
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
      const conexionCampana = seg.conexion_whatsapp_id ?? conexionWhatsappId ?? null;
      await cancelarCampana(seg.campana_id, ESTADOS_SEGUIMIENTO.RESPONDIDO, "Lead respondió", {
        conexionWhatsappId: conexionCampana,
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
