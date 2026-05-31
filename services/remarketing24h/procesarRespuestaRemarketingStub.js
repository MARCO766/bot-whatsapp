const repo = require("./remarketing24hRepository");
const { nowUtc } = require("../seguimiento/timestamps");

/**
 * Motor 1A: respuesta post-envío RM sin ejecutar mini nodos todavía.
 */
async function procesarRespuestaRemarketingStub({
  numero,
  texto,
  usuarioId,
  conexionWhatsappId,
  fila,
  policy,
}) {
  const preview = String(texto || "").slice(0, 120);

  console.log("[RM_CONTEXT] procesarRespuestaRemarketingStub", {
    lead: numero,
    usuario: usuarioId,
    conexion_whatsapp_id: conexionWhatsappId || null,
    rm24h_id: fila?.id || null,
    flujo_id: fila?.flujo_id || null,
    policy_mode: policy?.mode || null,
    texto_preview: preview,
  });

  if (fila?.id) {
    try {
      await repo.actualizarPorId(
        fila.id,
        { ultimo_mensaje_lead_at: nowUtc() },
        fila
      );
    } catch (err) {
      console.log(
        "[RM_CONTEXT] no se actualizó ultimo_mensaje_lead_at:",
        err.response?.data || err.message
      );
    }
  }

  return { ok: true, handled: true };
}

module.exports = {
  procesarRespuestaRemarketingStub,
};
