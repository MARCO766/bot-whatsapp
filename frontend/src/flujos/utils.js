import { FLOW_FOLDERS, FLOW_STATES } from "./constants";

export const FLOW_DRAG_MIME = "application/x-macbot-flow";

export const CARPETA_THEME_MAP = {
  ventas_automaticas: {
    icon: "🪙",
    accent: "#22c55e",
    glow: "rgba(34, 197, 94, 0.28)",
    bg: "rgba(34, 197, 94, 0.1)",
  },
  lanzamientos: {
    icon: "🚀",
    accent: "#a855f7",
    glow: "rgba(168, 85, 247, 0.26)",
    bg: "rgba(168, 85, 247, 0.1)",
  },
  recuperacion: {
    icon: "🛒",
    accent: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.28)",
    bg: "rgba(245, 158, 11, 0.1)",
  },
  atencion: {
    icon: "🎧",
    accent: "#22d3ee",
    glow: "rgba(34, 211, 238, 0.26)",
    bg: "rgba(34, 211, 238, 0.09)",
  },
  retargeting: {
    icon: "🎯",
    accent: "#f43f5e",
    glow: "rgba(244, 63, 94, 0.26)",
    bg: "rgba(244, 63, 94, 0.09)",
  },
  evergreen: {
    icon: "∞",
    accent: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.26)",
    bg: "rgba(59, 130, 246, 0.09)",
  },
  sin_carpeta: {
    icon: "📂",
    accent: "#94a3b8",
    glow: "rgba(148, 163, 184, 0.22)",
    bg: "rgba(148, 163, 184, 0.08)",
  },
};

export const CARPETA_THEME_CUSTOM = {
  icon: "✦",
  accent: "#cbd5e1",
  glow: "rgba(203, 213, 225, 0.2)",
  bg: "rgba(148, 163, 184, 0.1)",
  esCustom: true,
};

export function getCarpetaTheme(categoria, { esSistema = false, esCustom = false } = {}) {
  if (esCustom || (!esSistema && categoria && categoria !== "sin_carpeta")) {
    const tint = CARPETA_THEME_MAP[categoria];
    return {
      ...CARPETA_THEME_CUSTOM,
      ...(tint
        ? { glow: tint.glow, bg: "rgba(148, 163, 184, 0.12)" }
        : {}),
      esCustom: true,
    };
  }
  return CARPETA_THEME_MAP[categoria] || CARPETA_THEME_MAP.sin_carpeta;
}

export function resolveFlowCarpetaTheme(flow, carpetas = []) {
  const meta = flow?.meta || {};
  if (meta.carpeta_id) {
    const row = carpetas.find((c) => c.id === meta.carpeta_id);
    if (row) {
      return getCarpetaTheme(row.categoria || row.slug, {
        esSistema: row.es_sistema,
        esCustom: !row.es_sistema,
      });
    }
  }
  const slug = meta.carpeta || "sin_carpeta";
  return getCarpetaTheme(slug, { esSistema: true });
}

export function parseFlowDragPayload(dataTransfer) {
  if (!dataTransfer) return null;
  try {
    const raw = dataTransfer.getData(FLOW_DRAG_MIME);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

/** Ingresos compactos para card de flujo. */
export function formatFlowIngresos(total, moneda) {
  const v = Number(total) || 0;
  if (v <= 0) return "0";
  const sym = monedaSimbolo(moneda);
  if (v >= 1000000) return `${sym} ${(v / 1000000).toFixed(1)}M`;
  if (v >= 10000) return `${sym} ${Math.round(v / 1000)}k`;
  return `${sym} ${v.toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;
}

/** Tasa de cierre % para card de flujo. */
export function formatTasaCierre(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return `${n % 1 === 0 ? n : n.toFixed(1)}%`;
}

/** Timestamp relativo compacto para fila secondary. */
export function formatMetricTimestamp(iso) {
  const rel = formatRelativeTime(iso);
  return rel || "—";
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
        (a, b) =>
          (b.metricas?.ventas ?? b.metricas?.conversiones ?? 0) -
          (a.metricas?.ventas ?? a.metricas?.conversiones ?? 0)
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFolderUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Clave de carpeta para UI (menú mover, etc.): uuid, sin_carpeta o slug legacy. */
export function flowFolderKey(flow) {
  if (flow?.meta?.carpeta_id) return flow.meta.carpeta_id;
  const slug = flow?.meta?.carpeta;
  if (!slug || slug === "sin_carpeta") return "sin_carpeta";
  return slug;
}

function extractFlowCarpetaMeta(flow) {
  const meta = flow?.meta || {};
  const carpeta_id =
    typeof meta.carpeta_id === "string" && meta.carpeta_id.trim() ? meta.carpeta_id.trim() : null;
  const carpeta =
    typeof meta.carpeta === "string" && meta.carpeta.trim() ? meta.carpeta.trim() : null;
  return { carpeta_id, carpeta };
}

/**
 * Filtro de cards por carpeta seleccionada en el panel.
 * @param {string} selectedFolder - "all"|"todos"|"sin_carpeta"|slug sistema|uuid carpeta
 */
export function flowMatchesFolder(flow, selectedFolder, carpetas = []) {
  const sel =
    selectedFolder === "todos" || selectedFolder === "all" || !selectedFolder
      ? "all"
      : selectedFolder;

  if (sel === "all") return true;

  const { carpeta_id, carpeta } = extractFlowCarpetaMeta(flow);

  if (sel === "sin_carpeta") {
    if (carpeta_id) return false;
    return !carpeta || carpeta === "sin_carpeta";
  }

  if (isFolderUuid(sel)) {
    if (carpeta_id) return carpeta_id === sel;

    const carpetaRow = carpetas.find((c) => c.id === sel);
    if (!carpetaRow) return false;

    if (carpetaRow.es_sistema && carpetaRow.slug) {
      return carpeta === carpetaRow.slug;
    }

    return false;
  }

  if (carpeta_id) {
    const row = carpetas.find((c) => c.id === carpeta_id);
    if (row?.slug === sel || row?.categoria === sel) return true;
    return false;
  }

  return carpeta === sel;
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
