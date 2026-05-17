import { FLOW_FOLDERS, FLOW_STATES } from "./constants";

export function folderLabel(id) {
  return FLOW_FOLDERS.find((f) => f.id === id)?.label || "Sin carpeta";
}

export function stateMeta(id) {
  return FLOW_STATES.find((s) => s.id === id) || FLOW_STATES[2];
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export function loadLocalMeta() {
  try {
    const raw = localStorage.getItem("macbot_flujos_meta_local");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalMeta(map) {
  localStorage.setItem("macbot_flujos_meta_local", JSON.stringify(map));
}

export function mergeLocalMeta(flows) {
  const local = loadLocalMeta();
  return flows.map((f) => {
    const extra = local[f.id];
    if (!extra) return f;
    return {
      ...f,
      meta: { ...f.meta, ...extra },
    };
  });
}

export function sortFlows(flows, sortBy) {
  const list = [...flows];
  switch (sortBy) {
    case "alfabetico":
      return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    case "leads":
      return list.sort((a, b) => (b.metricas?.leadsHoy || 0) - (a.metricas?.leadsHoy || 0));
    case "conversiones":
      return list.sort(
        (a, b) => (b.metricas?.conversiones || 0) - (a.metricas?.conversiones || 0)
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
