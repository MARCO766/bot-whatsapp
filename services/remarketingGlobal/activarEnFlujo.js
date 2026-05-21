const {
  buscarNodoRemarketingEnFlujo,
} = require("./parseRemarketingGlobalNode");
const { programarRemarketingGlobal } = require("./scheduleRemarketingGlobal");
const { cancelarPendientesCliente } = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");

async function activarRemarketingSiAplica({
  numero,
  flujoData,
  usuarioId,
  flujoId,
}) {
  if (!numero || !flujoData?.nodos?.length) return null;

  const nodo = buscarNodoRemarketingEnFlujo(flujoData);
  if (!nodo) return null;

  try {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.CANCELADO,
      "Lead entró a otro flujo / nueva activación",
      null
    );

    const resultado = await programarRemarketingGlobal({
      numero,
      usuarioId,
      flujoId,
      nodo,
      cancelarAnteriores: true,
    });

    console.log(
      "[REMARKETING] Motor activado al entrar al flujo | flujo:",
      flujoId,
      "| cliente:",
      numero,
      "| pasos:",
      resultado.programados
    );

    return resultado;
  } catch (err) {
    console.error(
      "[REMARKETING] Error activando motor:",
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = {
  activarRemarketingSiAplica,
};
