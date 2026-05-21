const {
  buscarNodoRemarketingEnFlujo,
} = require("./parseRemarketingGlobalNode");
const { programarRemarketingGlobal } = require("./scheduleRemarketingGlobal");
const { cancelarPendientesCliente } = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");

/**
 * Se ejecuta cuando un lead ENTRA al flujo (inicio / activador).
 * INICIO → buscar remarketing_global → programar pasos → insert Supabase
 */
async function activarRemarketingSiAplica({
  numero,
  flujoData,
  usuarioId,
  flujoId,
}) {
  console.log("[REMARKETING] activar al entrar flujo | cliente:", numero, "| flujo:", flujoId);

  if (!numero) {
    console.log("[REMARKETING] omitido: sin numero");
    return null;
  }

  if (!flujoData?.nodos?.length) {
    console.log("[REMARKETING] omitido: flujo sin nodos");
    return null;
  }

  const nodo = buscarNodoRemarketingEnFlujo(flujoData);
  if (!nodo) {
    return null;
  }

  if (!nodo.config?.activo) {
    console.log("[REMARKETING] nodo encontrado pero activo=false");
    return { omitido: true, motivo: "pausado" };
  }

  try {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.CANCELADO,
      "Lead entró al flujo",
      null
    );

    const resultado = await programarRemarketingGlobal({
      numero,
      usuarioId,
      flujoId,
      nodo: {
        id: nodo.id || "remarketing_global_fixed",
        html: nodo.html,
        config: nodo.config,
      },
      cancelarAnteriores: false,
    });

    console.log(
      "[REMARKETING] activación completa | programados:",
      resultado.programados
    );

    return resultado;
  } catch (err) {
    console.error(
      "[REMARKETING] ERROR activando motor:",
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = {
  activarRemarketingSiAplica,
};
