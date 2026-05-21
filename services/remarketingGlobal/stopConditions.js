const {
  clienteRespondioDespues,
  tieneEtiqueta,
  leadTieneCompraExplicita,
  obtenerEtiquetasCliente,
  cancelarCampana,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");
const { logAntesDeCancelarRemarketing } = require("./cancelacionDebug");

const ARCHIVO = "stopConditions.js";

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
    const compraRes = await leadTieneCompraExplicita(numero, item.usuario_id, {
      checkpointAt: item.checkpoint_at,
    });

    console.log("[RM CANCEL DEBUG] archivo=", ARCHIVO);
    console.log("[RM CANCEL DEBUG] funcion= evaluarParadaAntesDeEnviar > detener_si_compra");
    console.log("[RM CANCEL DEBUG] evaluando detener_si_compra");
    console.log("[RM CANCEL DEBUG] cliente=", numero);
    console.log("[RM CANCEL DEBUG] flujo=", item.flujo_id);
    console.log("[RM CANCEL DEBUG] checkpoint_at=", item.checkpoint_at);
    console.log("[RM CANCEL DEBUG] etiquetas=", etiquetasCliente);
    console.log("[RM CANCEL DEBUG] compraDetectada=", compraRes.compra);
    console.log("[RM CANCEL DEBUG] row=", compraRes.fila || null);
    console.log("[RM CANCEL DEBUG] detalle compra=", compraRes.razon);

    if (compraRes.compra) {
      const motivo = "Lead compró";

      logAntesDeCancelarRemarketing(ARCHIVO, "evaluarParadaAntesDeEnviar", motivo, {
        cliente_numero: numero,
        flujo_id: item.flujo_id,
        row: item,
        etiquetas: etiquetasCliente,
        compraDetectada: true,
        detalle:
          compraRes.razon +
          " | conversion_id=" +
          (compraRes.fila?.id || "?"),
      });

      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        motivo,
        {
          cliente_numero: numero,
          flujo_id: item.flujo_id,
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

    console.log("[RM CANCEL DEBUG] archivo=", ARCHIVO);
    console.log("[RM CANCEL DEBUG] evaluando etiqueta PAGADO");
    console.log("[RM CANCEL DEBUG] cliente=", numero);
    console.log("[RM CANCEL DEBUG] flujo=", item.flujo_id);
    console.log("[RM CANCEL DEBUG] etiquetas=", etiquetasCliente);
    console.log("[RM CANCEL DEBUG] compraDetectada=", false);
    console.log("[RM CANCEL DEBUG] etiqueta_buscada=", tagPagado);
    console.log("[RM CANCEL DEBUG] etiqueta_encontrada=", pagado);

    if (pagado) {
      const motivo = "Etiqueta " + tagPagado;

      logAntesDeCancelarRemarketing(ARCHIVO, "evaluarParadaAntesDeEnviar", motivo, {
        cliente_numero: numero,
        flujo_id: item.flujo_id,
        row: item,
        etiquetas: etiquetasCliente,
        compraDetectada: false,
        detalle: "etiqueta_encontrada=" + tagPagado,
      });

      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        motivo,
        {
          cliente_numero: numero,
          flujo_id: item.flujo_id,
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
      console.log(
        "[RM CANCEL DEBUG] archivo=",
        ARCHIVO,
        "| lead respondió (no cancela campaña completa aquí)"
      );
      return { detener: true, motivo: "respondio", soloEstePaso: true };
    }
  }

  return { detener: false };
}

module.exports = {
  evaluarParadaAntesDeEnviar,
};
