const { HORAS_INACTIVIDAD } = require("./constants");

function crearConfigPorDefecto() {
  return {
    version: 1,
    activo: false,
    horasInactividad: HORAS_INACTIVIDAD,
    detenerSiResponde: false,
    reiniciarAlResponder: true,
    detenerEnConversion: true,
    mensajeRemarketing: "",
    modoContextual: false,
  };
}

function esNodoRemarketingGlobal(nodo) {
  if (!nodo) return false;
  const tipo = String(
    nodo.tipo || nodo.dataset?.tipo || nodo.data?.type || ""
  ).toLowerCase();
  const className = String(nodo.className || "");
  const html = nodo.html || "";
  return (
    tipo === "remarketing_global" ||
    className.includes("remarketing-global-node") ||
    className.includes("node-remarketing-global") ||
    html.includes("remarketing-global-data") ||
    html.includes("Remarketing Global")
  );
}

function extraerJsonDesdeHtml(html) {
  if (!html) return null;
  const match = html.match(
    /<textarea[^>]*class="remarketing-global-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function leerConfigDeNodo(nodo) {
  const base = crearConfigPorDefecto();
  if (!nodo) return base;

  let raw = null;
  if (nodo.querySelector) {
    const ta = nodo.querySelector(".remarketing-global-data");
    if (ta?.value) {
      try {
        raw = JSON.parse(ta.value);
      } catch {
        raw = null;
      }
    }
  }

  if (!raw && nodo.html) {
    raw = extraerJsonDesdeHtml(nodo.html);
  }

  if (!raw || typeof raw !== "object") return base;

  return {
    ...base,
    ...raw,
    horasInactividad: HORAS_INACTIVIDAD,
    detenerSiResponde: false,
    reiniciarAlResponder: raw.reiniciarAlResponder !== false,
    detenerEnConversion: raw.detenerEnConversion !== false,
  };
}

function buscarNodoRemarketingGlobal(flujoData) {
  const nodos = flujoData?.nodos;
  if (!Array.isArray(nodos)) return null;
  return nodos.find((n) => esNodoRemarketingGlobal(n)) || null;
}

function obtenerConfigRemarketingGlobal(flujoData) {
  const nodo = buscarNodoRemarketingGlobal(flujoData);
  if (!nodo) return null;

  const config = leerConfigDeNodo(nodo);
  if (!config.activo) return null;

  console.log("[RM24H] config detectada en flujo", {
    nodoId: nodo.id,
    activo: config.activo,
    horas: config.horasInactividad,
  });

  return { nodo, config };
}

module.exports = {
  crearConfigPorDefecto,
  esNodoRemarketingGlobal,
  leerConfigDeNodo,
  buscarNodoRemarketingGlobal,
  obtenerConfigRemarketingGlobal,
};
