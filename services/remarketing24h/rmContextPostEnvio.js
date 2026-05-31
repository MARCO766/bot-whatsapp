const {
  ESTADOS_RM24H,
  MOTIVOS_RM24H,
} = require("./constants");
const repo = require("./remarketing24hRepository");
const {
  leerRmContextPolicyDesdeSnapshot,
  debeBloquearActivadoresNormales,
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
  const bloquearActivadores = debeBloquearActivadoresNormales(
    policy,
    fila.disparado_en
  );

  return {
    bloquearActivadores,
    fila,
    policy,
    disparado_en: fila.disparado_en,
    flujo_id: fila.flujo_id,
  };
}

module.exports = {
  obtenerContextoRemarketingPostEnvio,
};
