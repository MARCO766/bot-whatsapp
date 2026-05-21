const {
  clienteRespondioDespues,
  tieneEtiqueta,
  obtenerEtiquetasCliente,
  cancelarCampana,
} = require("./remarketingRepository");
const { verificarCompraWorkerRemarketing } = require("./verificarCompraWorker");
const { ESTADOS_REMARKETING } = require("./constants");
const { logAntesDeCancelarRemarketing } = require("./cancelacionDebug");

const ARCHIVO = "stopConditions.js";

async function evaluarParadaAntesDeEnviar(item) {
  const config = item.config_snapshot || {};
  const cond = config.condiciones || {};
  const etiquetas = config.etiquetas || {};
  const numero = item.cliente_numero;

  if (cond.detener_si_compra) {
    const compraRes = await verificarCompraWorkerRemarketing({
      cliente_numero: numero,
      usuario_id: item.usuario_id,
      flujo_id: item.flujo_id,
      config,
    });

    if (compraRes.compraDetectada === true) {
      const motivo = "Lead compró";

      try {
        const { marcarLeadCompradoEnFlujo } = require("./embudoMode");
        await marcarLeadCompradoEnFlujo({
          usuario_id: item.usuario_id,
          cliente_numero: numero,
          flujo_id: item.flujo_id,
          config,
          motivo,
        });
      } catch (_) {
        /* ignore */
      }

      logAntesDeCancelarRemarketing(ARCHIVO, "evaluarParadaAntesDeEnviar", motivo, {
        cliente_numero: numero,
        flujo_id: item.flujo_id,
        row: item,
        etiquetas: compraRes.etiquetas,
        compraDetectada: true,
        detalle: compraRes.razon,
      });

      await cancelarCampana(
        item.campana_id,
        ESTADOS_REMARKETING.CANCELADO,
        motivo,
        {
          cliente_numero: numero,
          flujo_id: item.flujo_id,
          etiquetas: compraRes.etiquetas,
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
    const etiquetasCliente = await obtenerEtiquetasCliente(
      numero,
      item.usuario_id
    );
    const pagado = await tieneEtiqueta(numero, item.usuario_id, tagPagado);

    console.log("[RM WORKER COMPRA DEBUG] cliente=", numero);
    console.log("[RM WORKER COMPRA DEBUG] etiquetas=", etiquetasCliente);
    console.log("[RM WORKER COMPRA DEBUG] conversiones=", []);
    console.log("[RM WORKER COMPRA DEBUG] compraDetectada=", !!pagado);
    console.log(
      "[RM WORKER COMPRA DEBUG] cancelandoPorCompra=" + (pagado ? "SI" : "NO")
    );

    if (pagado === true) {
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
      return { detener: true, motivo: "respondio", soloEstePaso: true };
    }
  }

  return { detener: false };
}

module.exports = {
  evaluarParadaAntesDeEnviar,
};
