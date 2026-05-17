const { esNodoSeguimiento } = require("./parseSeguimientoNode");

function detectarTipoNodo(nodo) {
  if (!nodo) return "desconocido";

  const html = nodo.html || "";
  const className = String(nodo.className || "");

  if (nodo.id === "nodo_inicio" || className.includes("node-start")) {
    return "inicio";
  }

  if (esNodoSeguimiento(nodo)) {
    return "seguimiento";
  }

  if (
    html.includes("contenido-variantes-data") ||
    className.includes("blue") ||
    html.includes("💬 Contenido")
  ) {
    return "contenido";
  }

  if (html.includes("⏳ Espera")) {
    return "espera";
  }

  if (html.includes("🏷️ Etiqueta")) {
    return "etiqueta";
  }

  if (html.includes("🔗 Conectar flujo")) {
    return "conectar";
  }

  return "generico";
}

module.exports = {
  detectarTipoNodo,
};
