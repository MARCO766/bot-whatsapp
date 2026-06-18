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

const PERIODO_ALIASES = {
  hoy: "hoy",
  ayer: "ayer",
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  custom: "custom",
  Hoy: "hoy",
  Ayer: "ayer",
  "7 días": "7d",
  "30 días": "30d",
};

export function periodoToApi(label) {
  const key = String(label ?? "").trim();
  if (PERIODO_ALIASES[key]) return PERIODO_ALIASES[key];
  const lower = key.toLowerCase();
  if (PERIODO_ALIASES[lower]) return PERIODO_ALIASES[lower];
  return "7d";
}

/** Periodo Meta Ads Insights (7d / 30d / 90d). */
export function periodoToMetaAdsApi(periodo) {
  const api = periodoToApi(periodo);
  if (api === "30d") return "30d";
  if (api === "90d") return "90d";
  return "7d";
}

export const METRICAS_PERIODOS = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "custom", label: "📅" },
];

export function periodoLabel(periodo) {
  const id = periodoToApi(periodo);
  const found = METRICAS_PERIODOS.find((p) => p.id === id);
  return found?.label ?? id;
}

export const CUSTOM_RANGE_MAX_DAYS = 365;

/** YYYY-MM-DD → ISO inicio del día (hora local). */
export function dateInputToDesdeIso(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** YYYY-MM-DD → ISO fin del día 23:59:59.999 (hora local). */
export function dateInputToHastaIso(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function toDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultCustomRangeDraft(customRange = null) {
  if (customRange?.desde && customRange?.hasta) {
    return { desde: customRange.desde, hasta: customRange.hasta };
  }
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 6);
  return { desde: toDateInputValue(desde), hasta: toDateInputValue(hasta) };
}

export function validateCustomRange(desde, hasta) {
  if (!desde || !hasta) {
    return { ok: false, error: "Completa las fechas desde y hasta" };
  }
  if (desde > hasta) {
    return { ok: false, error: "La fecha «desde» no puede ser posterior a «hasta»" };
  }
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > CUSTOM_RANGE_MAX_DAYS) {
    return {
      ok: false,
      error: `El rango máximo es ${CUSTOM_RANGE_MAX_DAYS} días`,
    };
  }
  return { ok: true, days };
}

export function formatCustomRangeDisplay(customRange) {
  if (!customRange?.desde || !customRange?.hasta) return "";
  const fmt = new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const parse = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  return `${fmt.format(parse(customRange.desde))} → ${fmt.format(parse(customRange.hasta))}`;
}

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

/** Params compartidos para GET /api/metricas/* */
export function buildMetricasParams(
  periodo,
  flujoId,
  conexionWhatsappId,
  customRange = null
) {
  const periodoApi = periodoToApi(periodo);
  const params = { periodo: periodoApi };

  if (periodoApi === "custom") {
    if (customRange?.desde && customRange?.hasta) {
      params.desde = dateInputToDesdeIso(customRange.desde);
      params.hasta = dateInputToHastaIso(customRange.hasta);
    }
  }

  if (flujoId) params.flujo_id = flujoId;
  if (conexionWhatsappId != null && conexionWhatsappId !== "") {
    params.conexion_whatsapp_id = conexionWhatsappId;
  }

  return params;
}

/** @deprecated Usar buildMetricasParams — alias para revenue-breakdown. */
export function buildRevenueBreakdownParams(
  periodo,
  flujoId,
  conexionWhatsappId,
  customRange = null
) {
  return buildMetricasParams(periodo, flujoId, conexionWhatsappId, customRange);
}

export const REVENUE_TIPOS = ["venta", "upsell", "downsell", "recuperacion"];

export const REVENUE_TIPO_LABELS = {
  venta: "Venta",
  upsell: "Upsell",
  downsell: "Downsell",
  recuperacion: "Recuperación",
};
