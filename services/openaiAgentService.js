/**
 * MacBot — Agente OpenAI (nodo separado openai_agent).
 * No modifica Agente Rápido ni Agente IA Pro.
 */

const axios = require("axios");
const { enviarTextoWhatsApp } = require("./whatsappService");
const { analizarRutaLocal, normalizarConfigRouter } = require("./iaLocalRouter");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MAX_CHAT_HISTORY = 5;
const MAX_LAST_REPLIES = 3;
const OPENAI_TIMEOUT_MS = 6000;

const PROMPT_SISTEMA_FIJO =
  "Eres un asesor humano de WhatsApp. Responde corto, natural, con máximo 1 emoji de carita. No uses puntos suspensivos. No inventes datos.";

const CARITAS_PERMITIDOS = ["🙂", "😊", "😌", "🤔", "😅", "😍", "🥹", "😉", "😎", "🙌", "😇"];

const EMOJI_PROHIBIDOS =
  /[🎁✨💥🚀🔥❗✂️📦⭐🌟💎🎯📲💬👍👏🤩😄💯]|❗❗/g;

const lastRepliesPorChat = new Map();

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
  const router = normalizarConfigRouter(base);
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

function chatKey(usuarioId, numero) {
  return `${usuarioId || "0"}:${numero || ""}`;
}

function getLastReplies(usuarioId, numero) {
  const list = lastRepliesPorChat.get(chatKey(usuarioId, numero));
  return Array.isArray(list) ? list.slice(-MAX_LAST_REPLIES) : [];
}

function pushLastReply(usuarioId, numero, reply) {
  const key = chatKey(usuarioId, numero);
  const next = [...getLastReplies(usuarioId, numero), String(reply || "").trim()]
    .filter(Boolean)
    .slice(-MAX_LAST_REPLIES);
  lastRepliesPorChat.set(key, next);
  return next;
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

function limpiarReply(reply) {
  let s = String(reply || "")
    .replace(/\.{2,}/g, "")
    .replace(/\betc\.?\b/gi, "")
    .replace(/\sy más\b/gi, "")
    .replace(/en qué más te ayudo/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  s = s.replace(EMOJI_PROHIBIDOS, "");

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

  if (!CARITAS_PERMITIDOS.some((e) => s.includes(e)) && encontrados.length === 0) {
    return s.trim();
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

  if (intentFino === "precio") {
    if (!p.price) return limpiarReply(elegirVariacion(VARIACIONES.general, usadas, m));
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

  return limpiarReply(elegirVariacion(VARIACIONES.general, usadas, m));
}

function generarReplyLocalInteligente(config, mensajeLead, chatHistory, lastReplies) {
  const usadas = historialUsadas(chatHistory, lastReplies);
  const intent = clasificarConsultaIntent(mensajeLead);
  return construirReplyLocal(intent, config, mensajeLead, usadas);
}

function reformularLigeramente(reply, config, mensaje, usadas) {
  const extra = [...usadas, reply];
  const alt = generarReplyLocalInteligente(config, mensaje, [], extra);
  if (alt && firmaReply(alt) !== firmaReply(reply)) return alt;

  const prefijos = ["Mira, ", "Bueno, ", "Claro, "];
  const idx = reply.length % prefijos.length;
  let r = prefijos[idx] + reply.replace(/^(Mira, |Bueno, |Claro, )/, "");
  return limpiarReply(r);
}

function aplicarAntiRepeticion(reply, config, mensaje, chatHistory, lastReplies) {
  let r = limpiarReply(reply);
  if (!r) return generarReplyLocalInteligente(config, mensaje, chatHistory, lastReplies);

  const usadas = historialUsadas(chatHistory, lastReplies);
  if (esIgualAUltima(r, usadas)) {
    r = reformularLigeramente(r, config, mensaje, usadas);
  }
  return r;
}

function construirMensajesOpenAI(config, mensajeLead, chatHistory, lastReplies, reescribir) {
  const openaiPrompt = resolverOpenaiPrompt(config);
  let system = PROMPT_SISTEMA_FIJO;
  if (lastReplies.length) {
    system += `\nNo repitas estas respuestas recientes: ${lastReplies.join(" | ")}`;
  }
  if (reescribir) {
    system += "\nReformula con otras palabras. No repitas la frase anterior.";
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

async function llamarOpenAI(config, mensajeLead, chatHistory, lastReplies, reescribir) {
  const client = getOpenAIClient();
  if (!client) return null;

  const model = config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages = construirMensajesOpenAI(config, mensajeLead, chatHistory, lastReplies, reescribir);

  const completion = await client.chat.completions.create({
    model,
    temperature: config.temperature ?? 0.7,
    max_tokens: 200,
    messages,
  });

  return completion.choices?.[0]?.message?.content?.trim() || "";
}

function llamarOpenAIConTimeout(config, mensajeLead, chatHistory, lastReplies, reescribir) {
  const trabajo = llamarOpenAI(config, mensajeLead, chatHistory, lastReplies, reescribir);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("OPENAI_TIMEOUT")), OPENAI_TIMEOUT_MS);
  });
  return Promise.race([trabajo, timeout]);
}

async function generarReply(config, mensajeLead, chatHistory, lastReplies) {
  const usadas = historialUsadas(chatHistory, lastReplies);

  if (tieneOpenAIKey()) {
    try {
      let reply = await llamarOpenAIConTimeout(config, mensajeLead, chatHistory, lastReplies, false);
      reply = limpiarReply(reply);
      if (reply) {
        return aplicarAntiRepeticion(reply, config, mensajeLead, chatHistory, lastReplies);
      }
    } catch (err) {
      console.log("[OpenAI Agent]", err.message === "OPENAI_TIMEOUT" ? "timeout 6s" : err.message);
    }
  }

  let local = generarReplyLocalInteligente(config, mensajeLead, chatHistory, lastReplies);
  local = aplicarAntiRepeticion(local, config, mensajeLead, chatHistory, lastReplies);
  return local;
}

/**
 * Mismo pipeline que bandeja manual: routes/flows.js POST /inbox/responder
 * → enviarTextoWhatsApp(numero, texto, { usuarioId }) + patch conversaciones.
 */
async function enviarOpenAIConPipelineManual(numero, reply, usuarioId) {
  const texto = String(reply || "").trim();
  console.log("🤖 OPENAI reply:", texto);

  if (!texto || !numero) return null;
  if (!usuarioId) {
    console.error("⚠️ OpenAI sin usuarioId — no puede usar pipeline manual de bandeja");
    return null;
  }

  console.log("💾 OPENAI usando pipeline manual de inbox");

  let row = null;
  try {
    row = await enviarTextoWhatsApp(numero, texto, { usuarioId });
  } catch (err) {
    console.error(
      "⚠️ OpenAI envió WhatsApp pero no pudo pintar bandeja:",
      err.response?.data || err.message || err
    );
    return null;
  }

  const wamid = row?.whatsapp_message_id || null;
  console.log("✅ OPENAI Meta OK:", wamid);

  if (!row) {
    console.error(
      "⚠️ OpenAI envió WhatsApp pero no pudo pintar bandeja: enviarTextoWhatsApp sin resultado"
    );
    return wamid;
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
        {
          ultimo_mensaje: texto,
          ultimo_mensaje_en: new Date().toISOString(),
        },
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (patchErr) {
      console.log("[OpenAI] patch conversaciones (como manual):", patchErr.message);
    }
  }

  console.log("✅ OPENAI mensaje pintado en bandeja");
  console.log("📤 OPENAI enviado al lead", wamid || "");
  return wamid;
}

async function resolverAnalisisOpenAI(config, mensajeLead, chatHistory, memoria, lastReplies) {
  const analisis = analizarRutaLocal(config, mensajeLead, memoria);

  if (analisis.matched && analisis.routeId) {
    console.log("➡️ OPENAI ruta detectada", analisis.routeId);
    return {
      ok: true,
      action: "route",
      intent: analisis.intent,
      score: analisis.score,
      routeId: analisis.routeId,
      reply: "",
      source: "openai-router",
    };
  }

  const reply = await generarReply(config, mensajeLead, chatHistory, lastReplies);
  return {
    ok: true,
    action: "reply",
    intent: clasificarConsultaIntent(mensajeLead),
    score: analisis.score || 0,
    routeId: null,
    reply,
    source: tieneOpenAIKey() ? "openai" : "local",
  };
}

async function ejecutarNodoOpenAIAgent(nodo, contexto, opts = {}) {
  const nodoId = opts?.nodoId || nodo?.id || null;
  const numero = contexto?.numero || contexto?.from || contexto?.telefono;
  const usuarioId = contexto?.usuarioId || opts?.usuarioId || null;

  const mensajeLead = String(
    contexto?.mensaje ||
      contexto?.texto ||
      contexto?.body ||
      contexto?.ultimo_mensaje ||
      contexto?.ultimoMensaje ||
      ""
  ).trim();

  console.log("🤖 OPENAI_AGENT iniciado", {
    nodoId,
    numero,
    resume: !!opts.resume,
  });

  try {
    const config = parseOpenAIAgentFromNodo(nodo);

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

    const lastReplies = getLastReplies(usuarioId, numero);
    const memoria = contexto.memoriaIA || {};

    const resultado = await resolverAnalisisOpenAI(
      config,
      mensajeLead,
      chatHistory,
      memoria,
      lastReplies
    );

    contexto.intent = resultado.intent || "";
    contexto.score = resultado.score ?? "";

    if (resultado.action === "route" && resultado.routeId) {
      return {
        ...contexto,
        openaiAgentPausar: false,
        iaPausar: false,
        openaiAgentRouteId: resultado.routeId,
        iaRouteId: resultado.routeId,
        route: resultado.routeId,
        openaiAgentEjecutada: true,
        chat_history: chatHistory,
        intent: resultado.intent,
        score: resultado.score,
      };
    }

    let reply = limpiarReply(String(resultado.reply || "").trim());
    console.log("🧠 OPENAI respuesta:", reply);

    if (reply && numero) {
      await enviarOpenAIConPipelineManual(numero, reply, usuarioId);
      contexto.ultimaRespuestaIA = reply;
      chatHistory = appendChatHistory(chatHistory, "assistant", reply);
      pushLastReply(usuarioId, numero, reply);
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

    let reply = "";
    try {
      const config = parseOpenAIAgentFromNodo(nodo);
      reply = generarReplyLocalInteligente(
        config,
        mensajeLead,
        trimChatHistory(contexto.chat_history),
        getLastReplies(usuarioId, numero)
      );
      reply = limpiarReply(reply);
      if (reply && numero) {
        console.log("🧠 OPENAI respuesta:", reply, "(fallback)");
        await enviarOpenAIConPipelineManual(numero, reply, usuarioId);
      }
    } catch (fbErr) {
      console.error("❌ OPENAI fallback envío:", fbErr.message || fbErr);
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
};
