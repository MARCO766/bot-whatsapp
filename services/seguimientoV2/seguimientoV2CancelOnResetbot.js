const {
  listarPendientesPorClaveTriple,
  cancelarCampana,
  normalizarConexionId,
} = require("./seguimientoV2Repository");

async function cancelarSeguimientosV2PorResetbot({
  usuarioId,
  numero,
  conexionWhatsappId,
  motivo = "resetbot",
}) {
  const conexionId = normalizarConexionId(conexionWhatsappId);
  const clienteNumero = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";
  const motivoCancel = motivo != null && String(motivo).trim() !== ""
    ? String(motivo).trim()
    : "resetbot";

  console.log("[RESETBOT_CANCEL_V2_START]", {
    usuario_id: usuario || null,
    cliente_numero: clienteNumero || null,
    conexion_whatsapp_id: conexionId,
    motivo: motivoCancel,
  });

  if (!usuario || !clienteNumero || !conexionId) {
    console.log("[RESETBOT_CANCEL_V2_NONE]", {
      usuario_id: usuario || null,
      cliente_numero: clienteNumero || null,
      conexion_whatsapp_id: conexionId,
      motivo: "parametros_incompletos",
    });
    return { cancelados: 0 };
  }

  const pendientes = await listarPendientesPorClaveTriple({
    usuarioId: usuario,
    numero: clienteNumero,
    conexionWhatsappId: conexionId,
  });

  if (!pendientes.length) {
    console.log("[RESETBOT_CANCEL_V2_NONE]", {
      usuario_id: usuario,
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexionId,
      motivo: "sin_pasos_activos",
    });
    return { cancelados: 0 };
  }

  const campanaIds = [
    ...new Set(pendientes.map((p) => p.campana_id).filter(Boolean)),
  ];

  console.log("[RESETBOT_CANCEL_V2_MATCH]", {
    usuario_id: usuario,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionId,
    count: pendientes.length,
    ids: pendientes.map((p) => p.id),
    campana_ids: campanaIds,
    estados: [...new Set(pendientes.map((p) => p.estado))],
    motivo: motivoCancel,
  });

  let cancelados = 0;
  for (const campanaId of campanaIds) {
    cancelados += await cancelarCampana(campanaId, {
      usuarioId: usuario,
      numero: clienteNumero,
      conexionWhatsappId: conexionId,
      motivo: motivoCancel,
    });
  }

  console.log("[RESETBOT_CANCEL_V2_DONE]", {
    usuario_id: usuario,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionId,
    cancelados,
    motivo: motivoCancel,
  });

  return { cancelados, items: pendientes };
}

module.exports = {
  cancelarSeguimientosV2PorResetbot,
};
