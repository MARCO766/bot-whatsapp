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

async function cancelarSeguimientosPorRespuesta(numero, usuarioId, io, opts = {}) {
  if (!numero || !usuarioId) return;

  const mensajeAt = opts.mensajeAt || new Date().toISOString();
  const conexionWhatsappId = normalizarConexionId(opts.conexionWhatsappId);

  console.log(
    `[SEGUIMIENTO_MULTI] cancelar inicio cliente_numero=${numero} usuario_id=${usuarioId} conexion_whatsapp_id=${conexionWhatsappId ?? null} mensajeAt=${mensajeAt}`
  );

  if (!conexionWhatsappId) {
    console.log(
      `[SEGUIMIENTO_MULTI] cancelar omitido — mensaje sin conexion_whatsapp_id (multi-número requiere línea)`
    );
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
    console.log(
      `[SEGUIMIENTO_MULTI] cancelar sin pendientes cliente_numero=${numero} conexion_whatsapp_id=${conexionWhatsappId} listados=${pendientes.length}`
    );
    return;
  }

  const campanasCanceladas = new Set();

  for (const seg of pendientesFiltrados) {
    const conexionSeg = normalizarConexionId(seg.conexion_whatsapp_id);

    if (!conexionSeg || conexionSeg !== conexionWhatsappId) {
      console.log(
        `[SEGUIMIENTO_MULTI] cancelar omitido seguimiento_id=${seg.id} seg_conexion=${seg.conexion_whatsapp_id ?? null} mensaje_conexion=${conexionWhatsappId}`
      );
      continue;
    }

    const respondio = await leadRespondioParaSeguimiento(seg, conexionWhatsappId);

    console.log(
      `[SEGUIMIENTO_MULTI] cancelar eval respondio=${respondio} seguimiento_id=${seg.id} conexion_whatsapp_id=${conexionSeg} checkpoint_at=${seg.checkpoint_at ?? null}`
    );

    if (!respondio) {
      continue;
    }

    console.log(
      `[SEGUIMIENTO_MULTI] cancelar aplicando seguimiento_id=${seg.id} conexion_whatsapp_id=${conexionSeg}`
    );

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
