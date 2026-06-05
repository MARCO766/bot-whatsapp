const {
  cancelarPendientesPorRespuestaLead,
  insertarLog,
  normalizarConexionId,
} = require("./seguimientoV2Repository");

async function cancelarSeguimientosV2PorRespuesta({
  usuarioId,
  numero,
  conexionWhatsappId,
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

  const cancelados = await cancelarPendientesPorRespuestaLead({
    usuarioId: usuario,
    numero: clienteNumero,
    conexionWhatsappId: conexionId,
  });

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
      },
    });
  }

  console.log("[SEG_V2_CANCEL_ON_REPLY]", {
    usuario_id: usuario,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionId,
    cancelados: cancelados.length,
  });

  return { cancelados: cancelados.length, items: cancelados };
}

module.exports = {
  cancelarSeguimientosV2PorRespuesta,
};
