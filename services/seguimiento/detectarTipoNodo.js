const { esNodoSeguimiento } = require("./parseSeguimientoNode");

function resolverTipoRaw(nodo) {
  return String(
    nodo?.type ||
      nodo?.tipo ||
      nodo?.dataset?.tipo ||
      nodo?.data?.type ||
      nodo?.data?.nodeType ||
      ""
  ).toLowerCase();
}

function esTipoIA(nodo) {
  if (!nodo) return false;

  const tipo = resolverTipoRaw(nodo);
  const html = nodo.html || "";
  const className = String(nodo.className || "");

  if (
    tipo === "ia" ||
    tipo === "ai" ||
    tipo === "nodoia" ||
    tipo === "local_ai" ||
    tipo === "ia_local" ||
    tipo.includes("ia") ||
    tipo.includes("ai")
  ) {
    return true;
  }

  return (
    className.includes("ia-node") ||
    html.includes("ia-data") ||
    html.includes("🤖 IA") ||
    html.includes("ia-header")
  );
}

function detectarTipoNodo(nodo) {
  if (!nodo) return "desconocido";

  const html = nodo.html || "";
  const className = String(nodo.className || "");

  if (nodo.id === "nodo_inicio" || className.includes("node-start")) {
    return "inicio";
  }

  if (esTipoIA(nodo)) {
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
  esTipoIA,
  resolverTipoRaw,
};
