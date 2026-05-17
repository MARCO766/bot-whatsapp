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

export function formatPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "0%";
  return `${v}%`;
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
