const {
  listarPendientesPorClaveTriple,
  cancelarPasosPorIds,
  insertarLog,
  normalizarConexionId,
} = require("./seguimientoV2Repository");

function mensajeEsRespuestaValida(mensajeAt, seguimiento) {
  const umbral = seguimiento?.checkpoint_at || seguimiento?.created_at;
  if (!mensajeAt || !umbral) return true;
  return new Date(mensajeAt) > new Date(umbral);
}

async function cancelarSeguimientosV2PorRespuesta({
  usuarioId,
  numero,
  conexionWhatsappId,
  mensajeAt,
}) {
  const conexionId = normalizarConexionId(conexionWhatsappId);
  const clienteNumero = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!usuario || !clienteNumero || !conexionId) {
    console.log("[SEG_V2_CANCEL_ON_REPLY]", {
      usuario_id: usuario || null,
      cliente_numero: clienteNumero || null,
      conexion_whatsapp_id: conexionId,
      cancelados: 0,
      motivo: "parametros_incompletos",
    });
    return { cancelados: 0 };
  }

  const pendientes = await listarPendientesPorClaveTriple({
    usuarioId: usuario,
    numero: clienteNumero,
    conexionWhatsappId: conexionId,
  });

  const respondibles = pendientes.filter((fila) => fila.cancelar_si_responde !== false);
  const idsCancelar = [];

  for (const fila of respondibles) {
    if (!mensajeEsRespuestaValida(mensajeAt, fila)) {
      console.log("[SEG_V2_CANCEL_SKIP_CHECKPOINT]", {
        seguimiento_v2_id: fila.id,
        campana_id: fila.campana_id,
        paso_index: fila.paso_index,
        mensaje_at: mensajeAt || null,
        checkpoint_at: fila.checkpoint_at || null,
        conexion_whatsapp_id: conexionId,
      });
      continue;
    }
    idsCancelar.push(fila.id);
  }

  const cancelados = await cancelarPasosPorIds(idsCancelar);

  for (const fila of cancelados) {
    await insertarLog({
      seguimientoId: fila.id,
      usuarioId: usuario,
      conexionWhatsappId: conexionId,
      numero: clienteNumero,
      evento: "cancelado_por_respuesta",
      detalle: {
        campana_id: fila.campana_id,
        paso_index: fila.paso_index,
        conexion_whatsapp_id: conexionId,
        mensaje_at: mensajeAt || null,
      },
    });
  }

  console.log("[SEG_V2_CANCEL_ON_REPLY]", {
    usuario_id: usuario,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionId,
    cancelados: cancelados.length,
    omitidos_checkpoint: respondibles.length - idsCancelar.length,
  });

  return { cancelados: cancelados.length, items: cancelados };
}

module.exports = {
  cancelarSeguimientosV2PorRespuesta,
  mensajeEsRespuestaValida,
};
