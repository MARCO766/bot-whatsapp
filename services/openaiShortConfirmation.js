/**
 * MacBot — Detector de afirmaciones cortas sin costo OpenAI.
 * Si el lead responde "sí", "ok", etc. a una pregunta cerrada del bot,
 * dispara la ruta conectada sin llamar a OpenAI.
 */

const { esCaminoPaymentReader } = require("./openaiCaminoMatcher");

const AFIRMATIVOS_CORTOS = new Set([
  "si",
  "ok",
  "dale",
  "claro",
  "perfecto",
  "esta bien",
  "de acuerdo",
  "envialo",
  "pasamelo",
  "mandamelo",
  "enviamelo",
]);

const NEGATIVOS = [
  "no quiero",
  "mas tarde",
  "despues",
  "luego",
  "no",
];

const OFERTA_PATRONES = [
  {
    tipo: "qr",
    re: /qr|codigo qr|pago por qr|enviarte el qr|envio el qr|te envio el qr/,
  },
  {
    tipo: "deposito",
    re: /deposito|transferencia|cuenta bancaria/,
  },
  {
    tipo: "testimonios",
    re: /testimonios|resenas|referencias|opiniones/,
  },
  {
    tipo: "muestras",
    re: /muestras|ejemplos|fotos/,
  },
];

const RUTA_PATRONES = {
  qr: /qr|codigo qr/,
  deposito: /deposito|transferencia|banco|cuenta bancaria/,
  testimonios: /testimonio|resena|referencia|opinion/,
  muestras: /muestra|ejemplo|foto/,
};

function normalizarMensaje(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esMensajeAfirmativoCorto(mensaje) {
  const norm = normalizarMensaje(mensaje);
  if (!norm || norm.length > 30) return false;
  return AFIRMATIVOS_CORTOS.has(norm);
}

function esMensajeNegativo(mensaje) {
  const norm = normalizarMensaje(mensaje);
  if (!norm) return false;
  return NEGATIVOS.some((neg) => norm === neg || norm.startsWith(`${neg} `));
}

function obtenerUltimoMensajeBot(chatHistory) {
  const hist = Array.isArray(chatHistory) ? chatHistory : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const entry = hist[i];
    if (!entry) continue;
    const role = String(entry.role || "").toLowerCase();
    if (role === "user") continue;
    if (role === "assistant" || role === "bot" || role === "ia") {
      const text = String(entry.text || entry.content || "").trim();
      if (text) return text;
    }
  }
  return "";
}

function detectarOfertaBot(ultimoBotMsg) {
  const norm = normalizarMensaje(ultimoBotMsg);
  if (!norm) return null;

  const coincidencias = OFERTA_PATRONES.filter((p) => p.re.test(norm)).map((p) => p.tipo);
  if (coincidencias.length !== 1) return null;
  return coincidencias[0];
}

function textoCamino(camino) {
  const partes = [
    camino.id,
    camino.nombre,
    ...(camino.keywords || []),
    ...(camino.synonyms || []),
    ...(camino.palabras || []),
    ...(camino.etiquetas || []),
  ];
  return normalizarMensaje(partes.join(" "));
}

function resolverRutaPorOferta(tipoOferta, config) {
  const patron = RUTA_PATRONES[tipoOferta];
  if (!patron) return null;

  const caminos = (config?.caminos || config?.routes || []).filter(
    (c) => c && c.enabled !== false && c.id && !esCaminoPaymentReader(c)
  );

  const encontrado = caminos.find((c) => patron.test(textoCamino(c)));
  return encontrado?.id || null;
}

/**
 * @returns {null | { ok, action, intent, score, routeId, reply, source }}
 */
function resolverShortConfirmation(config, mensajeLead, chatHistory) {
  const mensaje = String(mensajeLead || "").trim();
  if (!mensaje) return null;

  if (esMensajeNegativo(mensaje)) {
    console.log("[OPENAI_SHORT_CONFIRMATION_SKIPPED_NEGATIVE]", {
      mensaje,
    });
    return null;
  }

  if (!esMensajeAfirmativoCorto(mensaje)) {
    return null;
  }

  console.log("[OPENAI_SHORT_CONFIRMATION_DETECTED]", { mensaje });

  const ultimoBot = obtenerUltimoMensajeBot(chatHistory);
  if (!ultimoBot) {
    console.log("[OPENAI_SHORT_CONFIRMATION_NO_ROUTE]", {
      razon: "sin_ultimo_mensaje_bot",
      mensaje,
    });
    return null;
  }

  const tipoOferta = detectarOfertaBot(ultimoBot);
  if (!tipoOferta) {
    console.log("[OPENAI_SHORT_CONFIRMATION_NO_ROUTE]", {
      razon: "oferta_no_identificada_o_ambigua",
      mensaje,
      ultimoBot: ultimoBot.slice(0, 120),
    });
    return null;
  }

  const routeId = resolverRutaPorOferta(tipoOferta, config);
  if (!routeId) {
    console.log("[OPENAI_SHORT_CONFIRMATION_NO_ROUTE]", {
      razon: "sin_ruta_conectada",
      tipoOferta,
      mensaje,
      ultimoBot: ultimoBot.slice(0, 120),
    });
    return null;
  }

  console.log("[OPENAI_SHORT_CONFIRMATION_ROUTE]", {
    tipoOferta,
    routeId,
    mensaje,
    ultimoBot: ultimoBot.slice(0, 120),
  });

  return {
    ok: true,
    action: "route",
    intent: tipoOferta,
    score: 100,
    routeId,
    reply: "",
    source: "openai-short-confirmation",
  };
}

module.exports = {
  normalizarMensaje,
  esMensajeAfirmativoCorto,
  esMensajeNegativo,
  obtenerUltimoMensajeBot,
  detectarOfertaBot,
  resolverRutaPorOferta,
  resolverShortConfirmation,
};
