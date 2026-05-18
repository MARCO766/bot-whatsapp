const { esNodoSeguimiento } = require("./parseSeguimientoNode");

function detectarTipoNodo(nodo) {
  if (!nodo) return "desconocido";

  const html = nodo.html || "";
  const className = String(nodo.className || "");

  if (nodo.id === "nodo_inicio" || className.includes("node-start")) {
    return "inicio";
  }

  const tipoGuardado = nodo.tipo || nodo.dataset?.tipo;
  if (tipoGuardado === "ia") {
    return "ia";
  }

  if (esNodoSeguimiento(nodo)) {
    return "seguimiento";
  }

  if (
    html.includes("contenido-variantes-data") ||
    className.includes("content-node") ||
    className.includes("blue") ||
    html.includes("💬 Contenido") ||
    html.includes("content-header-title")
  ) {
    return "contenido";
  }

  if (html.includes("⏳ Espera")) {
    return "espera";
  }

  if (
    nodo.dataset?.tipo === "ia" ||
    className.includes("ia-node") ||
    html.includes("ia-data") ||
    html.includes("🤖 IA")
  ) {
    return "ia";
  }

  if (html.includes("🏷️ Etiqueta")) {
    return "etiqueta";
  }

  if (
    html.includes("💰 Conversión") ||
    html.includes("💰 Conversion") ||
    nodo.dataset?.tipo === "conversion"
  ) {
    return "conversion";
  }

  if (html.includes("🔗 Conectar flujo")) {
    return "conectar";
  }

  return "generico";
}

module.exports = {
  detectarTipoNodo,
};
