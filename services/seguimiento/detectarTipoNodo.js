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

function esTipoOpenAIAgent(nodo) {
  if (!nodo) return false;
  const tipo = resolverTipoRaw(nodo);
  const html = nodo.html || "";
  const className = String(nodo.className || "");
  return (
    tipo === "openai_agent" ||
    className.includes("openai-agent-node") ||
    html.includes("openai-agent-data")
  );
}

function esTipoIAPro(nodo) {
  if (!nodo) return false;
  if (esTipoOpenAIAgent(nodo)) return false;
  const tipo = resolverTipoRaw(nodo);
  const html = nodo.html || "";
  const className = String(nodo.className || "");
  return (
    tipo === "ia_pro" ||
    className.includes("ia-pro-node") ||
    html.includes("ia-pro-data")
  );
}

function esTipoIA(nodo) {
  if (!nodo) return false;
  if (esTipoOpenAIAgent(nodo)) return false;
  if (esTipoIAPro(nodo)) return false;

  const tipo = resolverTipoRaw(nodo);
  const html = nodo.html || "";
  const className = String(nodo.className || "");

  if (
    tipo === "ia" ||
    tipo === "ai" ||
    tipo === "nodoia" ||
    tipo === "local_ai" ||
    tipo === "ia_local" ||
    (tipo.includes("ia") && tipo !== "ia_pro") ||
    (tipo.includes("ai") && !tipo.includes("ia_pro"))
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

  if (esTipoOpenAIAgent(nodo)) {
    console.log("🧩 Tipo nodo detectado: openai_agent (detectarTipoNodo)", {
      id: nodo.id,
      tipoRaw: resolverTipoRaw(nodo),
      className: String(nodo.className || "").slice(0, 80),
    });
    return "openai_agent";
  }

  if (esTipoIAPro(nodo)) {
    return "ia_pro";
  }

  if (esTipoIA(nodo)) {
    return "ia";
  }

  if (esNodoSeguimiento(nodo)) {
    return "seguimiento";
  }

  if (
    nodo.dataset?.tipo === "remarketing_global" ||
    className.includes("remarketing-global-node") ||
    className.includes("node-remarketing-global") ||
    html.includes("remarketing-global-data")
  ) {
    return "remarketing_global";
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
    resolverTipoRaw(nodo) === "conversion" ||
    nodo.dataset?.tipo === "conversion" ||
    className.includes("conversion-node") ||
    className.includes("node-conversion") ||
    html.includes("conversion-data") ||
    html.includes("conversion-valor") ||
    html.includes("💰 Conversión") ||
    html.includes("💰 Conversion") ||
    html.includes('class="conversion-title"')
  ) {
    return "conversion";
  }

  if (
    resolverTipoRaw(nodo) === "lector_pago" ||
    nodo.dataset?.tipo === "lector_pago" ||
    className.includes("lector-pago-node") ||
    className.includes("node-lector-pago") ||
    html.includes("lector-pago-data") ||
    html.includes("lector_pago-data")
  ) {
    return "lector_pago";
  }

  if (html.includes("🔗 Conectar flujo")) {
    return "conectar";
  }

  return "generico";
}

module.exports = {
  detectarTipoNodo,
  esTipoIA,
  esTipoIAPro,
  esTipoOpenAIAgent,
  resolverTipoRaw,
};
