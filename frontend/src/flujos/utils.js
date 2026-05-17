import { FLOW_FOLDERS, FLOW_STATES } from "./constants";

export function folderLabel(id) {
  return FLOW_FOLDERS.find((f) => f.id === id)?.label || "Sin carpeta";
}

export function stateMeta(id) {
  return FLOW_STATES.find((s) => s.id === id) || FLOW_STATES[2];
}

export function formatDate(iso) {
  if (!iso) return "Sin datos";
  try {
    return new Date(iso).toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Sin datos";
  }
}

export function formatNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export function monedaSimbolo(code) {
  const c = String(code || "BOB").toUpperCase();
  if (c === "BOB" || c === "BS") return "Bs";
  return c;
}

export function formatHeaderVentas(total, moneda) {
  const v = Number(total) || 0;
  const sym = monedaSimbolo(moneda);
  return `${sym} ${v.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
}

/** Tendencia % vs ayer; null si no hay dato comparable. */
export function formatHeaderTrend(pct) {
  if (pct === null || pct === undefined) return null;
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? "+" : "";
  return { text: `${sign}${n}%`, positive: n >= 0 };
}

/** Muestra número real, 0, o etiqueta cuando no hay fuente de datos. */
export function formatMetric(value, { pendiente, emptyLabel = "Sin datos" } = {}) {
  if (pendiente) return emptyLabel;
  if (value === null || value === undefined) return "0";
  return formatNumber(value);
}

export function sortFlows(flows, sortBy) {
  const list = [...flows];
  switch (sortBy) {
    case "alfabetico":
      return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    case "leads":
      return list.sort(
        (a, b) => (b.metricas?.clientesEnFlujo || 0) - (a.metricas?.clientesEnFlujo || 0)
      );
    case "conversiones":
      return list.sort(
        (a, b) => (b.metricas?.conversiones ?? 0) - (a.metricas?.conversiones ?? 0)
      );
    case "usados":
      return list.sort((a, b) => (b.nodosCount || 0) - (a.nodosCount || 0));
    case "modificacion":
      return list.sort(
        (a, b) =>
          new Date(b.meta?.actualizado_en || b.creado_en) -
          new Date(a.meta?.actualizado_en || a.creado_en)
      );
    case "recientes":
    default:
      return list.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
  }
}

export function filterFlows(flows, { query, folder, estado, activador, nodeType }) {
  const q = (query || "").trim().toLowerCase();
  return flows.filter((f) => {
    if (folder && folder !== "all" && f.meta?.carpeta !== folder) return false;
    if (estado && estado !== "all" && f.meta?.estado !== estado) return false;
    if (activador && activador !== "all") {
      const has = f.activadores?.some((a) =>
        activador === "activo" ? a.activo : activador === "inactivo" ? !a.activo : true
      );
      if (!has) return false;
    }
    if (nodeType && nodeType !== "all") {
      const hasNode = f.preview?.nodos?.some((n) => n.tipo === nodeType);
      if (!hasNode) return false;
    }
    if (!q) return true;
    const haystack = (f.searchText || `${f.nombre} ${f.meta?.carpeta}`).toLowerCase();
    return haystack.includes(q);
  });
}

export function countByFolder(flows) {
  const counts = { all: flows.length };
  flows.forEach((f) => {
    const c = f.meta?.carpeta || "sin_carpeta";
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
}

export function countByEstado(flows) {
  const counts = { all: flows.length };
  flows.forEach((f) => {
    const e = f.meta?.estado || "borrador";
    counts[e] = (counts[e] || 0) + 1;
  });
  return counts;
}
