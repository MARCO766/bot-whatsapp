const {
  ESTADOS_RM24H,
  MOTIVOS_RM24H,
} = require("./constants");
const repo = require("./remarketing24hRepository");
const {
  leerRmContextPolicyDesdeSnapshot,
  debeBloquearActivadoresNormales,
  dentroVentanaTimeWindow,
  finVentanaTimeWindowIso,
} = require("./rmContextPolicy");

/**
 * Contexto lógico post-envío RM24H (fila cerrada tras disparo, sin cambiar estados).
 */
async function obtenerContextoRemarketingPostEnvio({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;
  const num =
    clienteNumero != null && String(clienteNumero).trim() !== ""
      ? String(clienteNumero).trim()
      : null;
  const conexionId = repo.normalizarConexionId(conexionWhatsappId);

  if (!uid || !num || !conexionId) {
    return null;
  }

  const fila = await repo.buscarUltimaPostEnvio({
    usuario_id: uid,
    cliente_numero: num,
    conexion_whatsapp_id: conexionId,
  });

  if (!fila?.id || !fila.disparado_en) {
    return null;
  }

  if (fila.estado !== ESTADOS_RM24H.CERRADO_SIN_RESPUESTA) {
    return null;
  }

  if (fila.motivo_cancelacion !== MOTIVOS_RM24H.MAX_INTENTOS_TRAS_ENVIO) {
    return null;
  }

  const policy = leerRmContextPolicyDesdeSnapshot(fila.config_snapshot);
  const disparadoEn = fila.disparado_en;
  const bloquearActivadores = debeBloquearActivadoresNormales(
    policy,
    disparadoEn
  );

  if (policy.mode === "time_window") {
    const ventanaActiva = dentroVentanaTimeWindow(disparadoEn, policy);
    const logBase = {
      rm24h_id: fila.id,
      lead: num,
      usuario: uid,
      conexion_whatsapp_id: conexionId,
      disparado_en: disparadoEn,
      duration: policy.duration,
      ventana_fin: finVentanaTimeWindowIso(disparadoEn, policy),
      bloquear_activadores: bloquearActivadores,
    };
    if (ventanaActiva) {
      console.log("[RM_CONTEXT] time_window active", logBase);
    } else {
      console.log("[RM_CONTEXT] time_window expired", logBase);
    }
  }

  return {
    bloquearActivadores,
    fila,
    policy,
    disparado_en: disparadoEn,
    flujo_id: fila.flujo_id,
  };
}

module.exports = {
  obtenerContextoRemarketingPostEnvio,
};
