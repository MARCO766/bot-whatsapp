/**
 * MacBot — Agente OpenAI (nodo separado openai_agent).
 * No modifica Agente Rápido ni Agente IA Pro.
 */

const axios = require("axios");
const { enviarTextoWhatsApp, enviarMediaWhatsApp } = require("./whatsappService");
const {
  analizarCaminosOpenAI,
  normalizarCaminosOpenAI,
} = require("./openaiCaminoMatcher");
const {
  sanitizarUnicodeRoto,
  logEmojiDebug,
} = require("./textoSeguro");
const {
  crearMediaLibraryPorDefecto,
  normalizarMediaLibrary,
  construirPromptBibliotecas,
  resolverAccionBibliotecaDesdeRespuesta,
  textoFallbackSinAccionBiblioteca,
  seleccionarItemsBiblioteca,
  resolverCaptionBiblioteca,
  debeLoggearMediaLibraryRuntime,
  logMediaLibraryRuntimeDiagnostico,
} = require("./openaiMediaLibrary");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MAX_CHAT_HISTORY = 5;
const MAX_LAST_REPLIES = 3;
const OPENAI_TIMEOUT_MS = 20000;

/** Desactivado temporalmente: no usar plantillas saludo/general como fallback. */
const FALLBACK_SALUDO_GENERAL_ACTIVO = false;

const MSG_IA_NO_DISPONIBLE = "⚠️ OPENAI FALLÓ";

const PROMPT_SISTEMA_FIJO =
  "Eres un asesor humano de WhatsApp. Responde corto, natural, con máximo 1 emoji de carita. No uses puntos suspensivos. No inventes datos.";

const CARITAS_PERMITIDOS = ["🙂", "😊", "😌", "🤔", "😅", "😍", "🥹", "😉", "😎", "🙌", "😇"];

const lastRepliesPorChat = new Map();
const respuestasBotContadorPorChat = new Map();

let openaiClient = null;

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function crearConfigOpenAIPorDefecto() {
  return {
    version: 1,
    nombreNodo: "Agente OpenAI",
    scoreMinimo: 40,
    temperature: 0.7,
    model: "gpt-4o-mini",
    openaiPrompt: "",
    mediaLibrary: crearMediaLibraryPorDefecto(),
    caminos: [],
    routes: [],
  };
}

function productDataATexto(pd) {
  const p = pd || {};
  const lineas = [];
  if (p.name) lineas.push(`Producto: ${p.name}`);
  if (p.description) lineas.push(`Descripción: ${p.description}`);
  if (p.price) lineas.push(`Precio: ${p.price}`);
  if (p.includes) lineas.push(`Incluye: ${p.includes}`);
  if (p.bonuses) lineas.push(`Bonos: ${p.bonuses}`);
  if (p.guarantee) lineas.push(`Garantía: ${p.guarantee}`);
  if (p.access) lineas.push(`Acceso/entrega: ${p.access}`);
  if (p.paymentMethods) lineas.push(`Métodos de pago: ${p.paymentMethods}`);
  if (p.faq) lineas.push(`FAQ: ${p.faq}`);
  return lineas.join("\n");
}

function resolverOpenaiPrompt(cfg) {
  let prompt = String(cfg?.openaiPrompt || "").trim();
  if (prompt) return prompt;
  prompt = productDataATexto(cfg?.productData);
  if (prompt) return prompt;
  if (cfg?.promptExtra) return String(cfg.promptExtra).trim();
  return "";
}

function normalizarProductData(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    name: String(p.name || "").trim(),
    description: String(p.description || "").trim(),
    price: String(p.price || "").trim(),
    includes: String(p.includes || "").trim(),
    bonuses: String(p.bonuses || "").trim(),
    guarantee: String(p.guarantee || "").trim(),
    access: String(p.access || "").trim(),
    paymentMethods: String(p.paymentMethods || "").trim(),
    faq: String(p.faq || "").trim(),
  };
}

function extraerProductDataDesdePrompt(texto) {
  const t = String(texto || "");
  const pd = normalizarProductData({});
  const mp = t.match(/precio[:\s]*([^\n]+)/i);
  if (mp) pd.price = mp[1].trim();
  const mi = t.match(/incluye[:\s]*([^\n]+)/i);
  if (mi) pd.includes = mi[1].trim();
  const mb = t.match(/bonos?[:\s]*([^\n]+)/i);
  if (mb) pd.bonuses = mb[1].trim();
  const mm = t.match(/m[eé]todos? de pago[:\s]*([^\n]+)/i);
  if (mm) pd.paymentMethods = mm[1].trim();
  else if (/qr/i.test(t) && /dep[oó]sito|transferencia/i.test(t)) {
    pd.paymentMethods = "QR y depósito bancario";
  } else if (/qr/i.test(t)) pd.paymentMethods = "QR";
  const mn = t.match(/producto[:\s]*([^\n]+)/i);
  if (mn) pd.name = mn[1].trim();
  return pd;
}

function productDataEfectivo(config) {
  const pd = normalizarProductData(config?.productData);
  const tieneDatos = Object.values(pd).some((v) => v);
  if (tieneDatos) return pd;
  return extraerProductDataDesdePrompt(resolverOpenaiPrompt(config));
}

function normalizarConfigOpenAI(cfg) {
  const base = { ...crearConfigOpenAIPorDefecto(), ...(cfg || {}) };
  const router = normalizarCaminosOpenAI(base);
  const temp = parseFloat(base.temperature);
  const model = String(base.model || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const openaiPrompt = resolverOpenaiPrompt(base);

  return {
    version: 1,
    nombreNodo: String(base.nombreNodo || "Agente OpenAI").trim(),
    scoreMinimo: router.scoreMinimo,
    temperature: Number.isFinite(temp) ? Math.min(1, Math.max(0, temp)) : 0.7,
    model: model || "gpt-4o-mini",
    openaiPrompt,
    productData: normalizarProductData(base.productData),
    mediaLibrary: normalizarMediaLibrary(base.mediaLibrary),
    caminos: router.caminos,
    routes: router.caminos,
  };
}

function parseOpenAIAgentFromNodo(nodo) {
  const cfg = crearConfigOpenAIPorDefecto();
  if (!nodo) return normalizarConfigOpenAI(cfg);

  const html = nodo.html || "";
  const match = html.match(
    /<textarea[^>]*class="openai-agent-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );

  if (match) {
    try {
      const raw = decodeHtmlEntities(match[1].trim());
      if (raw) Object.assign(cfg, JSON.parse(raw));
    } catch (e) {
      console.warn("[OpenAI Agent] JSON inválido en nodo:", e.message);
    }
  }

  return normalizarConfigOpenAI(cfg);
}

function extraerMediaLibraryRawDeNodo(nodo) {
  const html = nodo?.html || "";
  const match = html.match(
    /<textarea[^>]*class="openai-agent-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  if (!match) return null;
  try {
    const raw = decodeHtmlEntities(match[1].trim());
    const parsed = JSON.parse(raw);
    return parsed?.mediaLibrary ?? null;
  } catch {
    return null;
  }
}

function trimChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((t) => t && (t.text || t.content))
    .map((t) => ({
      role: t.role === "assistant" || t.role === "bot" ? "assistant" : "user",
      text: String(t.text || t.content || "").trim(),
    }))
    .filter((t) => t.text)
    .slice(-MAX_CHAT_HISTORY);
}

function appendChatHistory(history, role, text) {
  const next = trimChatHistory(history);
  next.push({ role, text: String(text || "").trim() });
  return next.slice(-MAX_CHAT_HISTORY);
}

function chatKey(usuarioId, conexionWhatsappId, numero) {
  return `${usuarioId || "0"}:${conexionWhatsappId || ""}:${numero || ""}`;
}

function getLastReplies(usuarioId, conexionWhatsappId, numero) {
  const list = lastRepliesPorChat.get(chatKey(usuarioId, conexionWhatsappId, numero));
  return Array.isArray(list) ? list.slice(-MAX_LAST_REPLIES) : [];
}

function getContadorRespuestasBot(usuarioId, conexionWhatsappId, numero) {
  return respuestasBotContadorPorChat.get(chatKey(usuarioId, conexionWhatsappId, numero)) || 0;
}

function incrementarContadorRespuestasBot(usuarioId, conexionWhatsappId, numero) {
  const key = chatKey(usuarioId, conexionWhatsappId, numero);
  const next = getContadorRespuestasBot(usuarioId, conexionWhatsappId, numero) + 1;
  respuestasBotContadorPorChat.set(key, next);
  return next;
}

function pushLastReply(usuarioId, conexionWhatsappId, numero, reply) {
  const key = chatKey(usuarioId, conexionWhatsappId, numero);
  const next = [
    ...getLastReplies(usuarioId, conexionWhatsappId, numero),
    String(reply || "").trim(),
  ]
    .filter(Boolean)
    .slice(-MAX_LAST_REPLIES);
  lastRepliesPorChat.set(key, next);
  incrementarContadorRespuestasBot(usuarioId, conexionWhatsappId, numero);
  return next;
}

function limpiarLastReplies(usuarioId, conexionWhatsappId, numero) {
  if (
    conexionWhatsappId == null ||
    String(conexionWhatsappId).trim() === "" ||
    !numero
  ) {
    return;
  }
  const key = chatKey(usuarioId, String(conexionWhatsappId).trim(), numero);
  lastRepliesPorChat.delete(key);
  respuestasBotContadorPorChat.delete(key);
}

function normMsg(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function acortarSinPuntos(texto, maxLen = 140) {
  const t = String(texto || "").trim().replace(/\.$/, "");
  if (t.length <= maxLen) return t;
  const parte = t.slice(0, maxLen).replace(/\s+\S*$/, "");
  return parte || t.slice(0, maxLen);
}

function firmaReply(texto) {
  let s = normMsg(texto);
  for (const e of CARITAS_PERMITIDOS) s = s.split(e).join("");
  return s.replace(/\s+/g, " ").trim().slice(0, 90);
}

function esRepetida(variacion, usadas) {
  const firmaV = firmaReply(variacion);
  return usadas.some((u) => {
    const firmaU = firmaReply(u);
    return firmaU && (firmaV === firmaU || firmaV.slice(0, 45) === firmaU.slice(0, 45));
  });
}

function esIgualAUltima(reply, usadas) {
  if (!usadas.length) return false;
  const ultima = usadas[usadas.length - 1];
  return firmaReply(reply) === firmaReply(ultima);
}

function historialUsadas(chatHistory, lastReplies) {
  const usadas = (lastReplies || []).slice(-MAX_LAST_REPLIES);
  const hist = Array.isArray(chatHistory) ? chatHistory : [];
  for (let i = hist.length - 1; i >= 0 && usadas.length < MAX_LAST_REPLIES; i--) {
    const role = String(hist[i].role || "").toLowerCase();
    if (role === "assistant" || role === "bot" || role === "ia") {
      const t = String(hist[i].text || "").trim();
      if (t && !usadas.includes(t)) usadas.push(t);
    }
  }
  return usadas.slice(0, MAX_LAST_REPLIES);
}

function elegirVariacion(pool, usadas, texto) {
  let disponibles = pool.filter((v) => !esRepetida(v, usadas));
  if (!disponibles.length) disponibles = [...pool];
  const idx =
    disponibles.length > 1
      ? [...texto, String(usadas.length)].reduce((a, c) => a + [...c].reduce((s, ch) => s + ch.charCodeAt(0), 0), 0) %
        disponibles.length
      : 0;
  return disponibles[idx];
}

function limpiarReply(reply, opts = {}) {
  const preservarEmojis = opts.preservarEmojis !== false;
  let s = sanitizarUnicodeRoto(String(reply || ""))
    .replace(/\.{2,}/g, "")
    .replace(/\betc\.?\b/gi, "")
    .replace(/\sy más\b/gi, "")
    .replace(/en qué más te ayudo/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!preservarEmojis) {
    const EMOJI_DECORATIVOS = /[🎁✨💥🚀🔥✂️📦⭐🌟💎🎯📲💯]|❗❗/g;
    s = s.replace(EMOJI_DECORATIVOS, "");
    const encontrados = CARITAS_PERMITIDOS.filter((e) => s.includes(e));
    if (encontrados.length > 1) {
      let first = true;
      for (const e of CARITAS_PERMITIDOS) {
        if (s.includes(e)) {
          if (first) first = false;
          else s = s.split(e).join("");
        }
      }
    }
  }

  return s.trim();
}

function esIncluyeCompleto(m) {
  return /que incluye|que trae|todo incluye|todo trae|que viene|listado|todo el pack|que contiene|incluye todo/.test(
    m
  );
}

function esConfianza(m) {
  return /estafa|fraude|engano|desconfianza|desconfio|miedo|confiable|no confio|duda en pagar|duda al pagar|desconfiar|es seguro|seguro pagar|confianza en pagar|miedo a pagar/.test(
    m
  );
}

function esMetodosPago(m) {
  if (
    /como se paga|como pago|formas de pago|forma de pago|medios de pago|medio de pago|metodo de pago|metodos de pago|puedo pagar|como pagar|como puedo pagar/.test(
      m
    )
  ) {
    return true;
  }
  if (/quiero/.test(m) && (/qr/.test(m) || /deposito/.test(m))) return false;
  return m.trim() === "pago" || m.trim() === "pagos" || (/\bpago\b/.test(m) && !/precio|bono|acceso/.test(m));
}

function esBonosLista(m) {
  return /cuales son los bonos|cuales son los bono|que bonos trae|que bonos incluye|lista de bonos|cuales bonos|nombres de los bonos|que bonos son|cuales bono/.test(
    m
  );
}

function esBonosConfirmacion(m) {
  if (esBonosLista(m)) return false;
  return (
    /bonos llegan|llegan igual|vienen los bonos|bonos incluidos|incluye bonos|incluyen bonos|que bonos llega|viene con bonos|trae bonos|bonos vienen/.test(
      m
    ) ||
    (/bono/.test(m) && /llegan|vienen|igual|incluido|incluye|viene/.test(m))
  );
}

function esPreguntaContenido(m) {
  const temas =
    /animal|animales|granja|videojuego|videojuegos|goku|vegeta|dragon|minecraft|personaje|figura|dinosaurio|princesa/;
  if (temas.test(m)) return true;
  return /tiene |trae |incluye |hay |viene |cuenta con /.test(m) && temas.test(m);
}

function clasificarConsultaIntent(mensaje) {
  const m = normMsg(mensaje);
  if (esConfianza(m)) return "confianza";
  if (esPreguntaContenido(m)) return "contenido_producto";
  if (/goku|vegeta|buu|personaje|personajes|dragon|figura|papel/.test(m)) return "personajes";
  if (esBonosLista(m)) return "bonos_lista";
  if (esBonosConfirmacion(m)) return "bonos_confirmacion";
  if (esMetodosPago(m)) return "metodos_pago";
  if (/hijo|hija|nino|nina|edad|peque|chico|chica|sirve para|para ninos/.test(m)) return "ninos";
  if (/acceso|accedo|entrega|descarga|descargar|ingreso|como recibo|como es el acceso|como llega|cuando llega/.test(m)) {
    return "acceso";
  }
  if (/precio|cuanto vale|cuanto cuesta|cuesta|sale|valor|costo/.test(m) || /^(precio|costo|valor)$/.test(m.trim())) {
    return "precio";
  }
  if (/garantia|devolucion|reembolso/.test(m)) return "garantia";
  if (esIncluyeCompleto(m) || (/incluye/.test(m) && /todo|pack|completo/.test(m))) return "incluye";
  if (/hola|buenas|hey|saludos/.test(m)) return "saludo";
  return "general";
}

function refinarIntent(intent, m) {
  if (intent === "confianza") {
    if (/ya me estafaron|me estafaron|estafaron antes|me timaron/.test(m)) return "confianza_empatia";
    if (/no es estafa|es estafa|estafa/.test(m)) return "confianza_estafa";
    return "confianza_general";
  }
  if (intent === "metodos_pago") {
    if (/formas de pago|medios de pago|metodos de pago/.test(m) || m.trim() === "pago" || m.trim() === "pagos") {
      return "metodos_pago_formas";
    }
    return "metodos_pago";
  }
  return intent;
}

const VARIACIONES = {
  confianza_general: [
    "Es normal tener dudas 🙂 sobre todo en compras online. Si quieres te explico cómo funciona.",
    "Tranqui 🙂 el acceso llega apenas confirmas el pago y te acompañamos si algo falla.",
    "Por eso lo hacemos paso a paso 🙂 pagas, recibes acceso y listo.",
  ],
  confianza_empatia: [
    "Uf, cuando ya pasó algo malo uno desconfía más 🥹 aquí el proceso es claro y con soporte.",
    "Lo siento si te pasó eso 🙂 apenas confirmas el pago te enviamos acceso.",
    "Es válido que dudes 🙂 si quieres te explico todo antes de pagar.",
  ],
  confianza_estafa: [
    "Entiendo la duda 🥹 apenas confirmas el pago te enviamos acceso y si algo falla te ayudamos.",
    "No es estafa 🙂 es digital y el acceso llega al confirmar tu pago.",
    "Tranquilo 😌 pagas y recibes acceso inmediato con soporte si lo necesitas.",
  ],
  precio: [
    "Está en {precio} 😊 incluye las plantillas y los bonos.",
    "Cuesta {precio} 🙂 con plantillas y bonos en el mismo pack.",
    "El valor es {precio} 😌 incluye plantillas y bonos sin pagar extra.",
  ],
  metodos_pago: [
    "Puedes pagar por {metodos} 😊 elige el que te quede más cómodo.",
    "Aceptamos {metodos} 🙂 dime cuál prefieres.",
    "Sí 😌 puedes usar {metodos} sin problema.",
  ],
  metodos_pago_formas: [
    "Tenemos {metodos} 😊 ¿cuál prefieres: QR o depósito?",
    "Las opciones son {metodos} 🙂 ¿con cuál te sientes más cómodo?",
    "Puedes pagar con {metodos} 😌 como te sea más fácil.",
  ],
  bonos_lista: [
    "Trae varios bonos 😊 como abecedario 3D, lámparas y personajes para armar.",
    "Los bonos incluyen guías, lámparas y personajes 🙂 todo sin costo extra.",
    "Sí 😌 vienen bonos como guías, lámparas y figuras para imprimir.",
  ],
  bonos_confirmacion: [
    "Sí 😊 los bonos vienen incluidos y llegan con el acceso.",
    "Claro 🙂 no pagas aparte por los bonos.",
    "Exacto 😌 bonos incluidos sin costo adicional.",
  ],
  personajes: [
    "Sí 😊 incluye personajes como Goku y Vegeta para armar en papel.",
    "Claro 🙂 trae figuras de personajes para imprimir y armar.",
  ],
  ninos: [
    "Sí 😊 es ideal para niños, los mantiene entretenidos y creativos.",
    "Perfecto para niños 🙂 actividades de papel que entretienen bastante.",
  ],
  acceso: [
    "El acceso es inmediato 😌 apenas confirmas el pago te enviamos todo.",
    "Es digital 🙂 al confirmar el pago recibes el acceso al toque.",
  ],
  incluye: [
    "Incluye {incluye} 😊",
    "Trae {incluye} 🙂 todo en un solo pack.",
    "Viene con {incluye} 😌",
  ],
  saludo: [
    "Hola 🙂 ¿te ayudo con precio, qué incluye o formas de pago?",
    "Buenas 😊 cuéntame, ¿precio o cómo pagar?",
  ],
  contenido_si: [
    "Sí 😊 incluye ese tipo de contenido en las plantillas y figuras.",
    "Claro 🙂 sí está dentro del pack de figuras y personajes.",
  ],
  contenido_no: [
    "No vi ese detalle listado 🙂 pero sí trae muchas figuras y plantillas.",
    "Ese punto no lo vi 🙂 aunque el pack trae bastante contenido variado.",
  ],
  general: [
    "Cuéntame 🙂 ¿buscas precio, formas de pago o qué incluye?",
    "¿Te explico precio o cómo pagar? 😊",
  ],
};

function metodosPagoLiteral(paymentMethods) {
  const raw = String(paymentMethods || "").toLowerCase();
  const partes = [];
  if (raw.includes("qr")) partes.push("QR");
  if (raw.includes("deposito") || raw.includes("banco")) partes.push("depósito bancario");
  if (raw.includes("transferencia")) partes.push("transferencia");
  if (raw.includes("tigo")) partes.push("Tigo Money");
  if (partes.length >= 2) return `${partes[0]} o ${partes[1]}`;
  if (partes.length === 1) return partes[0];
  return "QR o transferencia";
}

function textoProductoCompleto(p) {
  return [p.description, p.includes, p.bonuses, p.faq].join(" ").toLowerCase();
}

function contenidoEnProducto(m, p, config) {
  const datos = p || productDataEfectivo(config || {});
  const corpus = textoProductoCompleto(datos) + " " + resolverOpenaiPrompt(config || {});
  const keys = [
    "animal",
    "animales",
    "granja",
    "goku",
    "vegeta",
    "buu",
    "videojuego",
    "videojuegos",
    "dragon",
    "minecraft",
    "dinosaurio",
    "princesa",
    "figura",
    "personaje",
  ];
  const preguntados = keys.filter((k) => m.includes(k));
  if (!preguntados.length) return /personaje|figura/.test(m);
  return preguntados.some((k) => corpus.includes(k));
}

function resumenIncluye(p) {
  if (p.includes?.trim()) return acortarSinPuntos(p.includes, 120);
  if (p.description?.trim()) return acortarSinPuntos(p.description, 100);
  return "plantillas, animales, personajes y bonos";
}

function construirReplyLocal(consultaIntent, config, mensaje, usadas) {
  console.log(
    "[OPENAI DEBUG] construirReplyLocal BLOQUEADO — intent:",
    consultaIntent,
    "mensaje:",
    mensaje
  );
  return MSG_IA_NO_DISPONIBLE;

  /* FALLBACK LOCAL DESACTIVADO PARA DEBUG
  const p = productDataEfectivo(config);
  const m = normMsg(mensaje);
  const intentFino = refinarIntent(consultaIntent, m);

  if (intentFino === "contenido_producto") {
    const pool = contenidoEnProducto(m, p, config) ? VARIACIONES.contenido_si : VARIACIONES.contenido_no;
    return limpiarReply(elegirVariacion(pool, usadas, m));
  }

  if (intentFino.startsWith("confianza")) {
    const pool = VARIACIONES[intentFino] || VARIACIONES.confianza_general;
    return limpiarReply(elegirVariacion(pool, usadas, m));
  }

  if (
    !FALLBACK_SALUDO_GENERAL_ACTIVO &&
    (intentFino === "saludo" || intentFino === "general")
  ) {
    return null;
  }

  if (intentFino === "precio") {
    if (!p.price) {
      if (!FALLBACK_SALUDO_GENERAL_ACTIVO) return null;
      return limpiarReply(elegirVariacion(VARIACIONES.general, usadas, m));
    }
    const plantilla = elegirVariacion(VARIACIONES.precio, usadas, m);
    return limpiarReply(plantilla.replace("{precio}", p.price));
  }

  if (intentFino === "metodos_pago" || intentFino === "metodos_pago_formas") {
    const met = metodosPagoLiteral(p.paymentMethods);
    const plantilla = elegirVariacion(VARIACIONES[intentFino], usadas, m);
    return limpiarReply(plantilla.replace("{metodos}", met));
  }

  if (intentFino === "incluye") {
    const inc = resumenIncluye(p);
    const plantilla = elegirVariacion(VARIACIONES.incluye, usadas, m);
    return limpiarReply(plantilla.replace("{incluye}", inc));
  }

  if (intentFino === "bonos_lista" && p.bonuses?.trim()) {
    const limpio = p.bonuses.replace(/\n/g, ", ").trim();
    if (limpio.length < 140) {
      const custom = `Trae bonos 😊 como ${limpio}`;
      if (!esRepetida(custom, usadas)) return limpiarReply(custom);
    }
  }

  const poolKey = VARIACIONES[intentFino] ? intentFino : consultaIntent;
  if (VARIACIONES[poolKey]) {
    return limpiarReply(elegirVariacion(VARIACIONES[poolKey], usadas, m));
  }

  if (consultaIntent === "garantia" && p.guarantee) {
    return limpiarReply(`Tranquilo 🙂 ${acortarSinPuntos(p.guarantee, 100)}`);
  }

  if (!FALLBACK_SALUDO_GENERAL_ACTIVO) return null;
  return limpiarReply(elegirVariacion(VARIACIONES.general, usadas, m));
  */
}

function logEstadoOpenAI({ fuente, errorExacto, tieneKey }) {
  console.log("[OpenAI Agent] existe OPENAI_API_KEY:", !!tieneKey);
  console.log("[OpenAI Agent] error exacto OpenAI:", errorExacto ?? "(ninguno)");
  console.log("[OpenAI Agent] fuente usada:", fuente);
}

function respuestaErrorOpenAI(errorExacto, promptBase, respuestaOpenAI) {
  logEstadoOpenAI({
    tieneKey: tieneOpenAIKey(),
    errorExacto,
    fuente: "error",
  });
  return {
    reply: MSG_IA_NO_DISPONIBLE,
    source: "error",
    promptFinal: promptBase || "",
    respuestaOpenAI: respuestaOpenAI ?? null,
    errorOpenAI: errorExacto,
  };
}

function generarReplyLocalInteligente(config, mensajeLead, chatHistory, lastReplies) {
  console.log(
    "[OPENAI DEBUG] generarReplyLocalInteligente BLOQUEADO — NO debería llamarse",
    new Error().stack
  );
  return MSG_IA_NO_DISPONIBLE;

  /* FALLBACK LOCAL DESACTIVADO PARA DEBUG
  const usadas = historialUsadas(chatHistory, lastReplies);
  const intent = clasificarConsultaIntent(mensajeLead);
  return construirReplyLocal(intent, config, mensajeLead, usadas);
  */
}

function reformularLigeramente(reply, config, mensaje, usadas, opts = {}) {
  if (opts.fromOpenAI) {
    const prefijos = ["Mira, ", "Bueno, ", "Claro, "];
    const idx = reply.length % prefijos.length;
    let r = prefijos[idx] + reply.replace(/^(Mira, |Bueno, |Claro, )/, "");
    return limpiarReply(r, { preservarEmojis: true });
  }

  const prefijos = ["Mira, ", "Bueno, ", "Claro, "];
  const idx = reply.length % prefijos.length;
  let r = prefijos[idx] + reply.replace(/^(Mira, |Bueno, |Claro, )/, "");
  return limpiarReply(r);
}

function aplicarAntiRepeticion(reply, config, mensaje, chatHistory, lastReplies, opts = {}) {
  const limpiarOpts = opts.fromOpenAI ? { preservarEmojis: true } : {};
  let r = limpiarReply(reply, limpiarOpts);
  if (!r) return MSG_IA_NO_DISPONIBLE;

  const usadas = historialUsadas(chatHistory, lastReplies);
  if (esIgualAUltima(r, usadas)) {
    r = reformularLigeramente(r, config, mensaje, usadas, opts);
  }
  return r;
}

function nombrePareceTelefono(nombre, numero) {
  const n = String(nombre || "").trim();
  if (!n) return true;

  const soloDigitosNombre = n.replace(/\D/g, "");
  const compacto = n.replace(/\s/g, "");
  if (soloDigitosNombre.length >= 8 && soloDigitosNombre.length / Math.max(compacto.length, 1) > 0.7) {
    return true;
  }

  const numCanon = String(numero || "").replace(/\D/g, "");
  if (numCanon && soloDigitosNombre === numCanon) return true;

  return false;
}

function resolverNombreLeadValido(nombre, numero) {
  const n = String(nombre || "").trim();
  if (!n) return null;
  if (n.toLowerCase() === "amiga") return null;
  if (nombrePareceTelefono(n, numero)) return null;
  return n;
}

function resolverUsoNombreLead(nombreLead, chatScope = null) {
  if (!nombreLead) {
    return {
      primeraRespuestaConversacion: false,
      nombrePermitido: false,
      respuestasBotPrevias: 0,
      numeroProximaRespuesta: 0,
    };
  }

  const usuarioId = chatScope?.usuarioId ?? null;
  const conexionWhatsappId = chatScope?.conexionWhatsappId ?? null;
  const numero = chatScope?.numero ?? null;
  const respuestasBotPrevias = getContadorRespuestasBot(
    usuarioId,
    conexionWhatsappId,
    numero
  );
  const numeroProximaRespuesta = respuestasBotPrevias + 1;
  const nombrePermitido = numeroProximaRespuesta % 2 === 1;

  return {
    primeraRespuestaConversacion: respuestasBotPrevias === 0,
    nombrePermitido,
    respuestasBotPrevias,
    numeroProximaRespuesta,
  };
}

function construirBloqueDatosLead(nombreLead, chatScope = null) {
  if (!nombreLead) return "";

  const {
    primeraRespuestaConversacion,
    nombrePermitido,
    respuestasBotPrevias,
    numeroProximaRespuesta,
  } = resolverUsoNombreLead(nombreLead, chatScope);

  console.log("[OPENAI_NAME_USAGE]", {
    nombreLead,
    primeraRespuestaConversacion,
    nombrePermitido,
    respuestasBotPrevias,
    numeroProximaRespuesta,
  });

  let bloque = `Datos del lead:
Nombre: ${nombreLead}

Reglas de uso del nombre:
- No inventes nombres.
- No lo repitas en mensajes consecutivos.`;

  if (nombrePermitido) {
    bloque +=
      "\n- DEBES incluir el nombre del lead una sola vez en esta respuesta, de forma natural.";
    if (primeraRespuestaConversacion) {
      bloque += "\n- Es la primera respuesta de la conversación.";
    }
  } else {
    bloque +=
      "\n- NO debes usar el nombre del lead en esta respuesta (apareció en tu mensaje anterior).";
  }

  return bloque;
}

function construirMensajesOpenAI(
  config,
  mensajeLead,
  chatHistory,
  lastReplies,
  reescribir,
  nombreLead = null,
  chatScope = null
) {
  const openaiPrompt = resolverOpenaiPrompt(config);
  let system = PROMPT_SISTEMA_FIJO;

  const bloqueLead = construirBloqueDatosLead(nombreLead, chatScope);
  if (bloqueLead) {
    system += "\n\n" + bloqueLead;
  }

  if (lastReplies.length) {
    system += `\nNo repitas estas respuestas recientes: ${lastReplies.join(" | ")}`;
  }
  if (reescribir) {
    system += "\nReformula con otras palabras. No repitas la frase anterior.";
  }

  let bloqueBiblioteca = "";
  if (debeLoggearMediaLibraryRuntime(mensajeLead, config?.mediaLibrary)) {
    const trace = logMediaLibraryRuntimeDiagnostico(
      config?.mediaLibrary,
      mensajeLead,
      { mediaLibraryDesdeNodo: config?.mediaLibraryDesdeNodo ?? null }
    );
    bloqueBiblioteca = trace.bloque;
  } else {
    bloqueBiblioteca = construirPromptBibliotecas(config?.mediaLibrary);
  }
  if (bloqueBiblioteca) {
    system += "\n\n" + bloqueBiblioteca;
  }

  const messages = [{ role: "system", content: system }];

  if (openaiPrompt) {
    messages.push({
      role: "user",
      content: `Instrucciones y datos del producto:\n${openaiPrompt}`,
    });
  }

  const hist = historialParaOpenAI(chatHistory);
  const ultimo = hist[hist.length - 1];
  const texto = String(mensajeLead || "").trim();

  messages.push(...hist);
  if (!ultimo || ultimo.role !== "user" || ultimo.content !== texto) {
    if (texto) messages.push({ role: "user", content: texto });
  }

  return messages;
}

function historialParaOpenAI(chatHistory) {
  return trimChatHistory(chatHistory).map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.text,
  }));
}

function tieneOpenAIKey() {
  return !!String(process.env.OPENAI_API_KEY || "").trim();
}

function getOpenAIClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!openaiClient) {
    const OpenAI = require("openai");
    openaiClient = new OpenAI({
      apiKey,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return openaiClient;
}

async function llamarOpenAI(
  config,
  mensajeLead,
  chatHistory,
  lastReplies,
  reescribir,
  nombreLead = null,
  chatScope = null
) {
  const client = getOpenAIClient();
  if (!client) {
    console.log("[OPENAI DEBUG] getOpenAIClient() = null (sin API key)");
    return null;
  }

  const model = config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages = construirMensajesOpenAI(
    config,
    mensajeLead,
    chatHistory,
    lastReplies,
    reescribir,
    nombreLead,
    chatScope
  );
  const promptFinal = JSON.stringify({ model, temperature: config.temperature ?? 0.7, messages });

  console.log("[OPENAI DEBUG] API KEY EXISTE:", !!process.env.OPENAI_API_KEY);
  console.log("[OPENAI DEBUG] modelo:", model);
  console.log("[OPENAI DEBUG] timeout ms:", OPENAI_TIMEOUT_MS);
  console.log("[OPENAI DEBUG] mensaje:", mensajeLead);
  console.log("[OPENAI DEBUG] prompt:", promptFinal);

  const t0 = Date.now();
  console.log("[OPENAI REQUEST START]");

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: config.temperature ?? 0.7,
      max_tokens: 200,
      messages,
    });

    const tiempoMs = Date.now() - t0;
    console.log("[OPENAI REQUEST END]", tiempoMs);

    console.log("[OPENAI DEBUG] respuesta raw:", completion);

    const texto = completion.choices?.[0]?.message?.content?.trim() || "";
    console.log("[OPENAI DEBUG] texto extraído:", texto || "(vacío)");
    return texto;
  } catch (error) {
    console.log("[OPENAI REQUEST END]", Date.now() - t0, "(error)");
    console.log("[OPENAI ERROR]", error);
    throw error;
  }
}

function llamarOpenAIConTimeout(
  config,
  mensajeLead,
  chatHistory,
  lastReplies,
  reescribir,
  nombreLead = null,
  chatScope = null
) {
  const trabajo = llamarOpenAI(
    config,
    mensajeLead,
    chatHistory,
    lastReplies,
    reescribir,
    nombreLead,
    chatScope
  );
  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      console.log("[OPENAI ERROR] OPENAI_TIMEOUT después de", OPENAI_TIMEOUT_MS, "ms");
      reject(new Error("OPENAI_TIMEOUT"));
    }, OPENAI_TIMEOUT_MS);
  });
  return Promise.race([trabajo, timeout]);
}

function formatoErrorOpenAI(err) {
  if (!err) return "error desconocido";
  if (err.message === "OPENAI_TIMEOUT") return `OPENAI_TIMEOUT (${OPENAI_TIMEOUT_MS / 1000}s)`;
  const data = err.response?.data;
  if (data) {
    try {
      return JSON.stringify(data);
    } catch (e) {
      return String(data);
    }
  }
  return err.message || String(err);
}

async function generarReply(
  config,
  mensajeLead,
  chatHistory,
  lastReplies,
  nombreLead = null,
  chatScope = null
) {
  console.log("[OPENAI SERVICE ENTRANTE]", {
    mensaje: String(mensajeLead || "").slice(0, 80),
    tieneKey: !!String(process.env.OPENAI_API_KEY || "").trim(),
    model: config?.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
  const promptBase = resolverOpenaiPrompt(config);
  const tieneKey = tieneOpenAIKey();
  const model = config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  console.log("[OPENAI DEBUG] generarReply() inicio");
  console.log("[OPENAI DEBUG] API KEY EXISTE:", !!process.env.OPENAI_API_KEY);
  console.log("[OPENAI DEBUG] modelo:", model);

  if (!tieneKey) {
    console.log("[OPENAI ERROR] OPENAI_API_KEY vacía o no definida");
    return respuestaErrorOpenAI("OPENAI_API_KEY no configurada", promptBase, null);
  }

  let respuestaOpenAI = null;
  let promptFinal = "";

  try {
    const messages = construirMensajesOpenAI(
      config,
      mensajeLead,
      chatHistory,
      lastReplies,
      false,
      nombreLead,
      chatScope
    );
    promptFinal = JSON.stringify({
      system: PROMPT_SISTEMA_FIJO,
      openaiPrompt: promptBase,
      model,
      messages,
    });

    console.log("[OPENAI DEBUG] API KEY EXISTE:", !!process.env.OPENAI_API_KEY);
    console.log("[OPENAI DEBUG] mensaje:", mensajeLead);
    console.log("[OPENAI DEBUG] prompt:", promptFinal);

    respuestaOpenAI = await llamarOpenAIConTimeout(
      config,
      mensajeLead,
      chatHistory,
      lastReplies,
      false,
      nombreLead,
      chatScope
    );

    console.log("[OPENAI DEBUG] respuesta raw:", respuestaOpenAI);
    if (debeLoggearMediaLibraryRuntime(mensajeLead, config?.mediaLibrary)) {
      console.log("[OPENAI_RAW_RESPONSE]", {
        mensajeLead: String(mensajeLead || "").trim(),
        respuestaOpenAI: respuestaOpenAI,
      });
    }
    logEmojiDebug("respuesta openai original", respuestaOpenAI);

    const reply = limpiarReply(respuestaOpenAI, { preservarEmojis: true });
    logEmojiDebug("despues limpiarReply", reply);

    if (reply) {
      const final = aplicarAntiRepeticion(
        reply,
        config,
        mensajeLead,
        chatHistory,
        lastReplies,
        { fromOpenAI: true }
      );
      logEmojiDebug("despues antiRepeticion (final)", final);
      logEstadoOpenAI({
        tieneKey: true,
        errorExacto: "(ninguno)",
        fuente: "openai",
      });
      console.log("[OPENAI DEBUG] fuente final: openai | reply:", final);
      return {
        reply: final,
        source: "openai",
        promptFinal,
        respuestaOpenAI,
        errorOpenAI: null,
      };
    }

    console.log("[OPENAI ERROR] respuesta vacía después de limpiarReply");
    return respuestaErrorOpenAI("respuesta vacía de OpenAI", promptFinal, respuestaOpenAI);
  } catch (err) {
    console.log("[OPENAI ERROR]", err);
    return respuestaErrorOpenAI(formatoErrorOpenAI(err), promptFinal, respuestaOpenAI);
  }
}

function opcionesEnvioOpenAI(usuarioId, conexionWhatsappId) {
  const op = { usuarioId };
  const conexion =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : null;
  if (conexion) {
    op.conexionWhatsappId = conexion;
    op.strictConexionWhatsappId = true;
  }
  return op;
}

async function enviarFotosBibliotecaOpenAI(
  numero,
  lista,
  mediaLibrary,
  opts = {}
) {
  const numeroCanon = String(numero || "").trim();
  const uid =
    opts.usuarioId != null && opts.usuarioId !== ""
      ? String(opts.usuarioId).trim()
      : null;
  const conexion =
    opts.conexionWhatsappId != null && String(opts.conexionWhatsappId).trim() !== ""
      ? String(opts.conexionWhatsappId).trim()
      : null;
  const textoAccion = String(opts.textoAccion || "").trim();

  if (!numeroCanon || !uid || !conexion) {
    console.log("[OPENAI_MEDIA_LIBRARY_SEND_DONE]", {
      listId: lista?.id || null,
      enviadas: 0,
      errores: 0,
      omitido: "sin_numero_usuario_o_conexion",
    });
    return { enviadas: 0, errores: 0 };
  }

  const items = seleccionarItemsBiblioteca(lista, mediaLibrary);
  if (!items.length) {
    console.log("[OPENAI_MEDIA_LIBRARY_SEND_DONE]", {
      listId: lista?.id || null,
      enviadas: 0,
      errores: 0,
      omitido: "sin_items",
    });
    return { enviadas: 0, errores: 0 };
  }

  const opEnvio = opcionesEnvioOpenAI(uid, conexion);

  console.log("[OPENAI_MEDIA_LIBRARY_SEND_START]", {
    listId: lista.id,
    sendMode: lista.sendMode,
    sendCount: lista.sendCount,
    seleccionadas: items.length,
    captionMode: lista.captionMode,
  });

  let enviadas = 0;
  let errores = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const caption = resolverCaptionBiblioteca(lista, item, textoAccion);

    try {
      const res = await enviarMediaWhatsApp(
        numeroCanon,
        "image",
        item.url,
        caption,
        opEnvio
      );

      if (res) {
        enviadas++;
        console.log("[OPENAI_MEDIA_LIBRARY_SEND_ITEM]", {
          index: i + 1,
          total: items.length,
          itemId: item.id,
          url: item.url,
          caption: caption || "",
          whatsapp_message_id: res.whatsapp_message_id || res.id || null,
        });
      } else {
        errores++;
        console.log("[OPENAI_MEDIA_LIBRARY_SEND_ERROR]", {
          index: i + 1,
          total: items.length,
          itemId: item.id,
          url: item.url,
          error: "envio_sin_confirmar",
        });
      }
    } catch (err) {
      errores++;
      console.log("[OPENAI_MEDIA_LIBRARY_SEND_ERROR]", {
        index: i + 1,
        total: items.length,
        itemId: item.id,
        url: item.url,
        error: err.message || String(err),
      });
    }
  }

  console.log("[OPENAI_MEDIA_LIBRARY_SEND_DONE]", {
    listId: lista.id,
    enviadas,
    errores,
    total: items.length,
  });

  return { enviadas, errores };
}

/** Mismo pipeline que IA Pro: envío Meta + guardado en bandeja en un solo paso. */
async function enviarOpenAIConPipelineManual(
  numero,
  reply,
  usuarioId,
  conexionWhatsappId
) {
  const texto =
    reply != null && typeof reply !== "string" ? String(reply) : String(reply || "").trim();
  const numeroCanon = String(numero || "").trim();
  const uid =
    usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null;
  const conexion =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : null;

  logEmojiDebug("antes enviar whatsapp (openai pipeline)", texto);
  console.log("[SEND DEBUG] enviarOpenAI — numero:", numeroCanon, "| usuarioId:", uid);

  if (!texto || !numeroCanon) {
    console.log("[SEND DEBUG] omitido: texto o numero vacío");
    return null;
  }

  if (!uid) {
    console.error("⚠️ OpenAI sin usuarioId — envío sin bandeja");
    const meta = await enviarTextoWhatsApp(numeroCanon, texto, {
      _soloEnvioMeta: true,
    });
    return meta?.messages?.[0]?.id || null;
  }

  if (!conexion) {
    console.log("[IA_MULTI] envío OpenAI omitido sin conexionWhatsappId", {
      numero: numeroCanon,
      usuarioId: uid,
    });
    return null;
  }

  const row = await enviarTextoWhatsApp(numeroCanon, texto, {
    usuarioId: uid,
    conexionWhatsappId: conexion,
    strictConexionWhatsappId: true,
  });
  return row?.whatsapp_message_id || null;
}

async function resolverAnalisisOpenAI(
  config,
  mensajeLead,
  chatHistory,
  memoria,
  lastReplies,
  nombreLead = null,
  chatScope = null
) {
  const analisis = analizarCaminosOpenAI(config, mensajeLead);

  if (analisis.matched && analisis.routeId) {
    console.log("➡️ OPENAI ruta detectada (dinámica):", analisis.routeId);
    return {
      ok: true,
      action: "route",
      intent: analisis.intent,
      score: analisis.score,
      routeId: analisis.routeId,
      reply: "",
      source: "openai-camino-dinamico",
      openaiPathRanking: analisis.ranking,
    };
  }

  if (analisis.empate) {
    console.log("[OPENAI PATH DEBUG] empate entre caminos — sigue conversación GPT");
  }

  const generado = await generarReply(
    config,
    mensajeLead,
    chatHistory,
    lastReplies,
    nombreLead,
    chatScope
  );

  const accionBiblioteca = resolverAccionBibliotecaDesdeRespuesta(
    generado.respuestaOpenAI,
    config.mediaLibrary
  );

  if (accionBiblioteca) {
    return {
      ok: true,
      action: "media_library",
      intent: clasificarConsultaIntent(mensajeLead),
      score: analisis.score || 0,
      routeId: null,
      listId: accionBiblioteca.listId,
      lista: accionBiblioteca.lista,
      texto: accionBiblioteca.texto,
      reply: accionBiblioteca.texto || "",
      source: "openai-media-library",
      promptFinal: generado.promptFinal,
      respuestaOpenAI: generado.respuestaOpenAI,
    };
  }

  let replyFinal = generado.reply;
  if (/ACCION_BIBLIOTECA\s*:/i.test(String(generado.respuestaOpenAI || ""))) {
    const fallback = textoFallbackSinAccionBiblioteca(generado.respuestaOpenAI);
    if (fallback) {
      replyFinal = limpiarReply(fallback, { preservarEmojis: true });
      replyFinal = aplicarAntiRepeticion(
        replyFinal,
        config,
        mensajeLead,
        chatHistory,
        lastReplies,
        { fromOpenAI: true }
      );
    }
  }

  return {
    ok: true,
    action: "reply",
    intent: clasificarConsultaIntent(mensajeLead),
    score: analisis.score || 0,
    routeId: null,
    reply: replyFinal,
    source: generado.source,
    promptFinal: generado.promptFinal,
    respuestaOpenAI: generado.respuestaOpenAI,
  };
}

async function ejecutarNodoOpenAIAgent(nodo, contexto, opts = {}) {
  const nodoId = opts?.nodoId || nodo?.id || null;
  const numero = contexto?.numero || contexto?.from || contexto?.telefono;
  const usuarioId = contexto?.usuarioId || opts?.usuarioId || null;
  const conexionWhatsappId = contexto?.conexionWhatsappId || null;

  const mensajeLead = String(
    contexto?.mensaje ||
      contexto?.texto ||
      contexto?.body ||
      contexto?.ultimo_mensaje ||
      contexto?.ultimoMensaje ||
      ""
  ).trim();

  const nombreLead = resolverNombreLeadValido(contexto?.nombre, numero);
  console.log("[OPENAI_LEAD_CONTEXT]", { nombreLead: nombreLead || null });

  console.log("🤖 OPENAI_AGENT iniciado", {
    nodoId,
    numero,
    resume: !!opts.resume,
  });

  try {
    const config = parseOpenAIAgentFromNodo(nodo);
    const mediaLibraryDesdeNodo = extraerMediaLibraryRawDeNodo(nodo);
    config.mediaLibraryDesdeNodo = mediaLibraryDesdeNodo;

    if (
      debeLoggearMediaLibraryRuntime(mensajeLead, config.mediaLibrary) &&
      opts.resume
    ) {
      console.log("[MEDIA_LIBRARY_RUNTIME] nodo → config parseado", {
        mensajeLead,
        nodoId,
        mediaLibraryDesdeNodo,
        configMediaLibrary: config.mediaLibrary,
      });
    }

    if (!opts.resume) {
      return {
        ...contexto,
        openaiAgentPausar: true,
        iaPausar: true,
        openaiAgentEjecutada: false,
        chat_history: trimChatHistory(contexto.chat_history),
      };
    }

    console.log("💬 OPENAI pregunta:", mensajeLead);

    let chatHistory = trimChatHistory(contexto.chat_history);
    if (mensajeLead) {
      chatHistory = appendChatHistory(chatHistory, "user", mensajeLead);
    }

    const lastReplies = getLastReplies(usuarioId, conexionWhatsappId, numero);
    const memoria = contexto.memoriaIA || {};

    const chatScope = { usuarioId, conexionWhatsappId, numero };

    const resultado = await resolverAnalisisOpenAI(
      config,
      mensajeLead,
      chatHistory,
      memoria,
      lastReplies,
      nombreLead,
      chatScope
    );

    contexto.intent = resultado.intent || "";
    contexto.score = resultado.score ?? "";

    if (resultado.action === "route" && resultado.routeId) {
      console.log(
        "[OPENAI PATH DEBUG] activando camino — handle:",
        resultado.routeId,
        "| sin respuesta GPT"
      );
      return {
        ...contexto,
        openaiAgentPausar: false,
        iaPausar: false,
        openaiAgentRouteId: resultado.routeId,
        iaRouteId: resultado.routeId,
        route: resultado.routeId,
        openaiAgentReply: false,
        openaiAgentEjecutada: true,
        chat_history: chatHistory,
        intent: resultado.intent,
        score: resultado.score,
      };
    }

    if (resultado.action === "media_library" && resultado.listId) {
      const textoBiblioteca = limpiarReply(String(resultado.texto || "").trim());
      const listaBiblioteca = resultado.lista || null;
      const uidEnvio =
        contexto?.usuarioId ?? opts?.usuarioId ?? usuarioId ?? null;

      console.log("[IA DEBUG] acción biblioteca detectada:", {
        listId: resultado.listId,
        texto: textoBiblioteca || "(sin texto)",
        fotosEnLista: listaBiblioteca?.items?.length || 0,
      });

      if (textoBiblioteca && numero) {
        logEmojiDebug("antes enviar texto biblioteca", textoBiblioteca);
        await enviarOpenAIConPipelineManual(
          numero,
          textoBiblioteca,
          uidEnvio,
          conexionWhatsappId
        );
        contexto.ultimaRespuestaIA = textoBiblioteca;
        chatHistory = appendChatHistory(chatHistory, "assistant", textoBiblioteca);
        pushLastReply(usuarioId, conexionWhatsappId, numero, textoBiblioteca);
      }

      let fotosEnviadas = 0;
      if (listaBiblioteca && numero) {
        const envioFotos = await enviarFotosBibliotecaOpenAI(
          numero,
          listaBiblioteca,
          config.mediaLibrary,
          {
            usuarioId: uidEnvio,
            conexionWhatsappId,
            textoAccion: textoBiblioteca,
          }
        );
        fotosEnviadas = envioFotos.enviadas || 0;
      }

      return {
        ...contexto,
        openaiAgentPausar: true,
        iaPausar: true,
        openaiAgentReply: !!(textoBiblioteca || fotosEnviadas),
        openaiAgentEjecutada: true,
        openaiAgentMediaLibrary: true,
        openaiAgentMediaLibraryListId: resultado.listId,
        openaiAgentMediaLibraryTexto: textoBiblioteca,
        openaiAgentMediaLibraryFotosEnviadas: fotosEnviadas,
        chat_history: chatHistory,
        intent: resultado.intent || "media_library",
        score: resultado.score,
      };
    }

    let reply = limpiarReply(String(resultado.reply || "").trim());

    console.log("[IA DEBUG] mensaje lead:", mensajeLead);
    console.log("[IA DEBUG] prompt usado:", resultado.promptFinal || "(n/a)");
    console.log(
      "[IA DEBUG] respuesta openai:",
      resultado.respuestaOpenAI ?? "(no llamó o vacío)"
    );
    console.log("[IA DEBUG] fuente:", resultado.source || "?");
    console.log("[IA DEBUG] respuesta enviada:", reply);
    console.log("🧠 OPENAI respuesta:", reply);

    if (reply && numero) {
      logEmojiDebug("antes enviar (ejecutarNodoOpenAI)", reply);
      const uidEnvio =
        contexto?.usuarioId ?? opts?.usuarioId ?? usuarioId ?? null;
      await enviarOpenAIConPipelineManual(
        numero,
        reply,
        uidEnvio,
        conexionWhatsappId
      );
      contexto.ultimaRespuestaIA = reply;
      chatHistory = appendChatHistory(chatHistory, "assistant", reply);
      pushLastReply(usuarioId, conexionWhatsappId, numero, reply);
    }

    return {
      ...contexto,
      openaiAgentPausar: true,
      iaPausar: true,
      openaiAgentReply: true,
      openaiAgentEjecutada: true,
      chat_history: chatHistory,
      intent: resultado.intent || "consulta",
      score: resultado.score,
    };
  } catch (error) {
    console.error("❌ OPENAI_AGENT ERROR", error.message || error);
    logEstadoOpenAI({
      tieneKey: tieneOpenAIKey(),
      errorExacto: formatoErrorOpenAI(error),
      fuente: "error",
    });

    const reply = MSG_IA_NO_DISPONIBLE;
    if (numero) {
      const uidEnvioFb =
        contexto?.usuarioId ?? opts?.usuarioId ?? usuarioId ?? null;
      await enviarOpenAIConPipelineManual(
        numero,
        reply,
        uidEnvioFb,
        conexionWhatsappId
      );
    }

    return {
      ...contexto,
      openaiAgentPausar: true,
      iaPausar: true,
      openaiAgentEjecutada: true,
      chat_history: contexto.chat_history || [],
    };
  }
}

module.exports = {
  crearConfigOpenAIPorDefecto,
  normalizarConfigOpenAI,
  parseOpenAIAgentFromNodo,
  ejecutarNodoOpenAIAgent,
  trimChatHistory,
  appendChatHistory,
  limpiarLastReplies,
};
