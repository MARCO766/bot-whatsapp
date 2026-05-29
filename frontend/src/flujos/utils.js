import { FLOW_FOLDERS, FLOW_STATES } from "./constants";

export function folderLabel(carpetaSlugOrFlow, carpetas = []) {
  let slug = carpetaSlugOrFlow;
  let carpetaId = null;

  if (carpetaSlugOrFlow && typeof carpetaSlugOrFlow === "object") {
    const meta = carpetaSlugOrFlow.meta || carpetaSlugOrFlow;
    carpetaId = meta?.carpeta_id || null;
    slug = meta?.carpeta;
  }

  if (carpetaId && Array.isArray(carpetas)) {
    const found = carpetas.find((c) => c.id === carpetaId);
    if (found?.nombre) return found.nombre;
    if (found?.label) return found.label;
  }

  return FLOW_FOLDERS.find((f) => f.id === slug)?.label || "Sin carpeta";
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

export function formatRelativeTime(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "Ahora";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export function formatUltimoLead(numero) {
  if (!numero) return null;
  const n = String(numero).trim();
  if (!n) return null;
  if (n.startsWith("+")) return n;
  return `+${n}`;
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

/** Clave de carpeta para filtro: id uuid, sin_carpeta o slug legacy. */
export function flowFolderKey(flow) {
  if (flow?.meta?.carpeta_id) return flow.meta.carpeta_id;
  const slug = flow?.meta?.carpeta;
  if (!slug || slug === "sin_carpeta") return "sin_carpeta";
  return slug;
}

export function flowMatchesFolder(flow, folder, carpetas = []) {
  if (!folder || folder === "all") return true;
  const key = flowFolderKey(flow);
  if (key === folder) return true;
  if (folder === "sin_carpeta") return key === "sin_carpeta";

  const carpeta = carpetas.find((c) => c.id === folder || c.slug === folder);
  if (carpeta) {
    if (flow.meta?.carpeta_id === carpeta.id) return true;
    if (flow.meta?.carpeta === carpeta.slug || flow.meta?.carpeta === carpeta.categoria) {
      return true;
    }
    if (key === carpeta.slug || key === carpeta.categoria) return true;
  }

  return false;
}

export function filterFlows(flows, { query, folder, estado, activador, nodeType, carpetas }) {
  const q = (query || "").trim().toLowerCase();
  return flows.filter((f) => {
    if (folder && folder !== "all" && !flowMatchesFolder(f, folder, carpetas)) return false;
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
  const counts = { all: flows.length, sin_carpeta: 0 };
  flows.forEach((f) => {
    const key = flowFolderKey(f);
    counts[key] = (counts[key] || 0) + 1;
    const slug = f.meta?.carpeta;
    if (slug && slug !== "sin_carpeta") counts[slug] = (counts[slug] || 0) + 1;
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
