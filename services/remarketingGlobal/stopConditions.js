const {
  clienteRespondioDespues,
  tieneEtiqueta,
  tieneConversion,
  cancelarCampana,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");

async function evaluarParadaAntesDeEnviar(item) {
  const config = item.config_snapshot || {};
  const cond = config.condiciones || {};
  const etiquetas = config.etiquetas || {};

  if (cond.detener_si_compra) {
    const compro = await tieneConversion(
      item.cliente_numero,
      item.usuario_id
    );
    if (compro) {
      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        "Lead compró"
      );
      return { detener: true, motivo: "compra" };
    }
  }

  if (cond.detener_si_etiqueta_pagado) {
    const tagPagado =
      cond.detener_etiqueta_nombre || etiquetas.pagado || "PAGADO";
    const pagado = await tieneEtiqueta(
      item.cliente_numero,
      item.usuario_id,
      tagPagado
    );
    if (pagado) {
      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        "Etiqueta PAGADO"
      );
      return { detener: true, motivo: "etiqueta_pagado" };
    }
  }

  if (cond.detener_si_responde) {
    const respondio = await clienteRespondioDespues(
      item.cliente_numero,
      item.usuario_id,
      item.checkpoint_at
    );
    if (respondio) {
      return { detener: true, motivo: "respondio", soloEstePaso: true };
    }
  }

  return { detener: false };
}

module.exports = {
  evaluarParadaAntesDeEnviar,
};
