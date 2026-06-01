import { monedaSimbolo } from "../flujos/utils";

export function formatNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return new Intl.NumberFormat("es-BO").format(v);
}

export function formatMoney(monto, moneda = "BOB") {
  const v = Number(monto);
  if (!Number.isFinite(v) || v === 0) return `Bs 0`;
  return `Bs ${formatNum(Math.round(v * 100) / 100)}`;
}

/** Ingresos con símbolo por moneda (revenue-breakdown). */
export function formatRevenueMoney(monto, moneda = "BOB") {
  const v = Number(monto);
  const sym = monedaSimbolo(moneda);
  if (!Number.isFinite(v) || v === 0) return `${sym} 0`;
  const rounded = Math.round(v * 100) / 100;
  return `${sym} ${formatNum(rounded)}`;
}

export function formatPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "0%";
  return `${v}%`;
}

export function formatRevenuePct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${v.toLocaleString("es-BO", { maximumFractionDigits: 2 })}%`;
}

export function formatTendencia(t) {
  if (t === null || t === undefined) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}%`;
}

export function periodoToApi(label) {
  if (label === "Hoy") return "hoy";
  if (label === "30 días") return "30d";
  return "7d";
}

export function periodoLabel(api) {
  if (api === "hoy") return "Hoy";
  if (api === "30d") return "30 días";
  return "7 días";
}

export const REVENUE_PERIODOS = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

const MONEDA_TAB_ORDER = ["BOB", "CLP", "USD"];

export function sortMonedasRevenue(keys = []) {
  const set = new Set(keys.map((k) => String(k).toUpperCase()));
  const ordered = MONEDA_TAB_ORDER.filter((m) => set.has(m));
  keys.forEach((k) => {
    const u = String(k).toUpperCase();
    if (!ordered.includes(u)) ordered.push(u);
  });
  return ordered;
}

export function pickDefaultMoneda(porMoneda = {}) {
  const keys = sortMonedasRevenue(Object.keys(porMoneda));
  if (!keys.length) return "BOB";
  const withSales = keys.find((m) => (porMoneda[m]?.kpis?.totalCantidad || 0) > 0);
  return withSales || keys[0];
}

/** Params para GET /api/metricas/revenue-breakdown (90d vía desde). */
export function buildRevenueBreakdownParams(periodoApi, flujoId, conexionWhatsappId) {
  const params = { periodo: periodoApi };
  if (periodoApi === "90d") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 89);
    params.desde = d.toISOString();
  }
  if (flujoId) params.flujo_id = flujoId;
  if (conexionWhatsappId != null && conexionWhatsappId !== "") {
    params.conexion_whatsapp_id = conexionWhatsappId;
  }
  return params;
}

export const REVENUE_TIPOS = ["venta", "upsell", "downsell", "recuperacion"];

export const REVENUE_TIPO_LABELS = {
  venta: "Venta",
  upsell: "Upsell",
  downsell: "Downsell",
  recuperacion: "Recuperación",
};
