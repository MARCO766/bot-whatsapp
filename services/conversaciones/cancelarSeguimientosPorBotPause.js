/**
 * Cancela Seguimiento V2 al apagar el flujo.
 * Clave: usuario_id + cliente_numero + conexion_whatsapp_id.
 * Estados: pendiente + procesando (vía helper V2 / ESTADOS_ACTIVOS_V2).
 *
 * No es atómico con pausarBotConversacion: la pausa y la cancelación
 * son operaciones independientes contra Supabase.
 */
const {
  cancelarSeguimientosV2PorResetbot,
} = require("../seguimientoV2/seguimientoV2CancelOnResetbot");

const MOTIVO_BOT_PAUSADO_MANUAL = "bot_pausado_manual";

async function cancelarSeguimientosPorBotPause({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  deps = {},
} = {}) {
  const cancelarV2 = deps.cancelarV2 || cancelarSeguimientosV2PorResetbot;

  const uid = usuarioId != null ? String(usuarioId).trim() : "";
  const num = clienteNumero != null ? String(clienteNumero).trim() : "";
  const conn =
    conexionWhatsappId != null ? String(conexionWhatsappId).trim() : "";

  if (!uid || !num || !conn) {
    return { ok: false, error: "datos_incompletos" };
  }

  let canceladosV2 = 0;
  try {
    const resV2 = await cancelarV2({
      usuarioId: uid,
      numero: num,
      conexionWhatsappId: conn,
      motivo: MOTIVO_BOT_PAUSADO_MANUAL,
    });
    canceladosV2 = Number(resV2?.cancelados) || 0;
  } catch (err) {
    console.log(
      "[BOT_PAUSE] cancelacion V2 fallida:",
      err.response?.data || err.message
    );
    return {
      ok: false,
      error: "cancelacion_v2_fallida",
      detalle: err.message || "cancelacion_v2_fallida",
      cancelados_v2: 0,
    };
  }

  console.log("[BOT_PAUSE] seguimientos V2 cancelados", {
    usuario_id: uid,
    cliente_numero: num,
    conexion_whatsapp_id: conn,
    cancelados_v2: canceladosV2,
    motivo: MOTIVO_BOT_PAUSADO_MANUAL,
  });

  return {
    ok: true,
    cancelados_v2: canceladosV2,
    motivo: MOTIVO_BOT_PAUSADO_MANUAL,
  };
}

module.exports = {
  MOTIVO_BOT_PAUSADO_MANUAL,
  cancelarSeguimientosPorBotPause,
};
