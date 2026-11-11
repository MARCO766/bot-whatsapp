import { CONEXION_TODAS, sameConexionId } from "../utils/conexionesInbox.js";

const ORDEN_MONEDAS = ["BOB", "USD", "ARS", "CLP"];

export function esTodasLasLineas(conexionId) {
  return conexionId === CONEXION_TODAS;
}

/** Flujos de una línea. En "Todas las líneas" el selector no ofrece flujos. */
export function flujosDeConexion(flujos, conexionId) {
  if (!conexionId || conexionId === CONEXION_TODAS) return [];
  return (Array.isArray(flujos) ? flujos : []).filter((flujo) =>
    sameConexionId(flujo?.conexion_whatsapp_id, conexionId)
  );
}

/**
 * Conserva el flujo solo si pertenece a la conexión elegida.
 * "Todas las líneas" y un flujo de otra línea devuelven vacío.
 */
export function flujoPermitido(flujos, conexionId, flujoId) {
  const id = flujoId == null ? "" : String(flujoId).trim();
  if (!id || !conexionId || conexionId === CONEXION_TODAS) return "";
  const pertenece = flujosDeConexion(flujos, conexionId).some(
    (flujo) => String(flujo?.id) === id
  );
  return pertenece ? id : "";
}

/**
 * Totales ya agregados por moneda. No suma monedas distintas ni asigna
 * un importe sin moneda a otra moneda.
 */
export function ingresosAgrupadosPorMoneda(desglose) {
  if (!desglose || typeof desglose !== "object" || Array.isArray(desglose)) return [];

  const totales = new Map();
  Object.entries(desglose).forEach(([raw, monto]) => {
    const moneda = String(raw ?? "").trim().toUpperCase();
    if (!moneda) return;
    const valor = Number(monto);
    if (!Number.isFinite(valor)) return;
    totales.set(moneda, (totales.get(moneda) || 0) + valor);
  });

  return [...totales.entries()]
    .map(([moneda, monto]) => ({
      moneda,
      monto: Math.round(monto * 100) / 100,
    }))
    .sort((a, b) => {
      const ia = ORDEN_MONEDAS.indexOf(a.moneda);
      const ib = ORDEN_MONEDAS.indexOf(b.moneda);
      if (ia === -1 && ib === -1) return a.moneda.localeCompare(b.moneda);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
}
