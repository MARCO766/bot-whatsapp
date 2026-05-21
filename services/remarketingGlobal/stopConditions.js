const {
  clienteRespondioDespues,
  tieneEtiqueta,
  leadTieneCompraExplicita,
  obtenerEtiquetasCliente,
  cancelarCampana,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");
const { logCancelacionRemarketing } = require("./cancelacionDebug");

async function evaluarParadaAntesDeEnviar(item) {
  const config = item.config_snapshot || {};
  const cond = config.condiciones || {};
  const etiquetas = config.etiquetas || {};
  const numero = item.cliente_numero;

  const etiquetasCliente = await obtenerEtiquetasCliente(
    numero,
    item.usuario_id
  );

  if (cond.detener_si_compra) {
    const compraRes = await leadTieneCompraExplicita(numero, item.usuario_id);

    console.log("[RM CANCEL DEBUG] evaluando detener_si_compra");
    console.log("[RM CANCEL DEBUG] cliente=", numero);
    console.log("[RM CANCEL DEBUG] etiquetas=", etiquetasCliente);
    console.log("[RM CANCEL DEBUG] compraDetectada=", compraRes.compra);
    console.log("[RM CANCEL DEBUG] payload=", compraRes.fila || null);
    console.log("[RM CANCEL DEBUG] detalle compra=", compraRes.razon);

    if (compraRes.compra) {
      const motivo = "Lead compró";
      logCancelacionRemarketing(motivo, numero, {
        etiquetas: etiquetasCliente,
        compraDetectada: true,
        payload: compraRes.fila,
        detalle: compraRes.razon,
      });

      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        motivo,
        {
          log: false,
          cliente_numero: numero,
          etiquetas: etiquetasCliente,
          compraDetectada: true,
          detalle: compraRes.razon,
          fila_conversion: compraRes.fila,
        }
      );
      return { detener: true, motivo: "compra" };
    }
  }

  const tagPagado =
    cond.detener_etiqueta_nombre || etiquetas.pagado || "PAGADO";

  if (cond.detener_si_etiqueta_pagado && tagPagado) {
    const pagado = await tieneEtiqueta(numero, item.usuario_id, tagPagado);

    console.log("[RM CANCEL DEBUG] evaluando etiqueta PAGADO");
    console.log("[RM CANCEL DEBUG] cliente=", numero);
    console.log("[RM CANCEL DEBUG] etiquetas=", etiquetasCliente);
    console.log("[RM CANCEL DEBUG] compraDetectada=", false);
    console.log("[RM CANCEL DEBUG] etiqueta_buscada=", tagPagado);
    console.log("[RM CANCEL DEBUG] etiqueta_encontrada=", pagado);

    if (pagado) {
      const motivo = "Etiqueta " + tagPagado;
      logCancelacionRemarketing(motivo, numero, {
        etiquetas: etiquetasCliente,
        compraDetectada: false,
        payload: { etiqueta: tagPagado },
      });

      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        motivo,
        {
          log: false,
          cliente_numero: numero,
          etiquetas: etiquetasCliente,
          compraDetectada: false,
        }
      );
      return { detener: true, motivo: "etiqueta_pagado" };
    }
  }

  if (cond.detener_si_responde) {
    const respondio = await clienteRespondioDespues(
      numero,
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
