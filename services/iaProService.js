/**
 * MacBot — Agente IA Pro (nodo separado ia_pro).
 * No modifica Agente Rápido (nodo ia).
 */

const { enviarTextoWhatsApp } = require("./whatsappService");
const { analizarRutaLocal, normalizarConfigRouter } = require("./iaLocalRouter");
const {
  usePythonAi,
  buildRoutesFromConfig,
  detectarIntentProPython,
  mapPythonProToResult,
} = require("./pythonAiClient");

const MAX_CHAT_HISTORY = 8;
const MAX_LAST_REPLIES = 3;
const TONOS_VALIDOS = new Set(["amable", "vendedor", "premium", "tecnico", "agresivo"]);
const lastRepliesPorChat = new Map();

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function crearConfigProPorDefecto() {
  return {
    version: 1,
    nombreNodo: "Agente IA Pro",
    scoreMinimo: 40,
    enabledConversation: true,
    tone: "amable",
    mensajeFallback:
      "No entendí bien 😊 ¿Te ayudo con precio, qué incluye o formas de pago?",
    productData: {
      name: "",
      description: "",
      price: "",
      includes: "",
      bonuses: "",
      guarantee: "",
      access: "",
      paymentMethods: "",
      faq: "",
    },
    caminos: [],
    routes: [],
  };
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

function normalizarConfigPro(cfg) {
  const base = { ...crearConfigProPorDefecto(), ...(cfg || {}) };
  const router = normalizarConfigRouter(base);
  const tone = String(base.tone || "amable").toLowerCase().trim();

  return {
    version: 1,
    nombreNodo: String(base.nombreNodo || "Agente IA Pro").trim(),
    scoreMinimo: router.scoreMinimo,
    enabledConversation: base.enabledConversation !== false,
    tone: TONOS_VALIDOS.has(tone) ? tone : "amable",
    mensajeFallback: String(
      base.mensajeFallback ||
        base.comportamiento?.mensajeFallback ||
        crearConfigProPorDefecto().mensajeFallback
    ).trim(),
    productData: normalizarProductData(base.productData),
    caminos: router.caminos,
    routes: router.caminos,
  };
}

function parseIAProFromNodo(nodo) {
  const cfg = crearConfigProPorDefecto();
  if (!nodo) return normalizarConfigPro(cfg);

  const html = nodo.html || "";
  const match = html.match(
    /<textarea[^>]*class="ia-pro-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );

  if (match) {
    try {
      const raw = decodeHtmlEntities(match[1].trim());
      if (raw) Object.assign(cfg, JSON.parse(raw));
    } catch (e) {
      console.warn("[IA Pro] JSON inválido en nodo:", e.message);
    }
  }

  return normalizarConfigPro(cfg);
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

function normMsg(mensaje) {
  return String(mensaje || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function chatKey(usuarioId, numero) {
  return `${usuarioId || "0"}:${numero || ""}`;
}

function getLastReplies(usuarioId, numero) {
  const key = chatKey(usuarioId, numero);
  const list = lastRepliesPorChat.get(key);
  return Array.isArray(list) ? list.slice(-MAX_LAST_REPLIES) : [];
}

function pushLastReply(usuarioId, numero, reply) {
  const key = chatKey(usuarioId, numero);
  const prev = getLastReplies(usuarioId, numero);
  const next = [...prev, String(reply || "").trim()].filter(Boolean).slice(-MAX_LAST_REPLIES);
  lastRepliesPorChat.set(key, next);
  return next;
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
  if (/goku|vegeta|buu|personaje|personajes|muestra|muestras|dragon|figura|papel/.test(m)) {
    return "personajes";
  }
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
  if (esIncluyeCompleto(m) || (/incluye/.test(m) && /todo|pack|completo/.test(m))) {
    return "incluye";
  }
  if (/hola|buenas|hey|saludos/.test(m)) return "saludo";
  if (/sirve|funciona|vale la pena|me conviene|bueno para/.test(m)) return "ninos";
  return "general";
}

function acortarSinPuntos(texto, maxLen = 120) {
  const t = String(texto || "").trim().replace(/\.$/, "");
  if (t.length <= maxLen) return t;
  const parte = t.slice(0, maxLen).replace(/\s+\S*$/, "");
  return parte || t.slice(0, maxLen);
}

function limpiarReply(reply) {
  return String(reply || "")
    .replace(/\.{2,}/g, "")
    .replace(/\betc\.?\b/gi, "")
    .replace(/\sy más\b/gi, "")
    .replace(/\bmás información\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CARITAS_SOLO = ["🙂", "😊", "😄", "😌", "🤩", "🥹", "😅"];

const VARIACIONES = {
  confianza_general: [
    "Te entiendo 🥹 hoy en día uno desconfía mucho. Por eso te guiamos paso a paso.",
    "Es normal tener dudas 🙂 especialmente en compras online. Si quieres te explico cómo funciona todo.",
    "Te entiendo 😌 nadie quiere perder dinero. Apenas confirmas el pago te enviamos acceso inmediato.",
    "Sí te entiendo 🥹 por eso intentamos hacer todo claro y sencillo para darte confianza.",
    "Tranqui 🙂 si quieres primero te explico cómo recibes el producto antes de pagar.",
  ],
  confianza_empatia: [
    "Uf te entiendo 🥹 cuando ya pasó algo malo uno desconfía más. Por eso te guiamos en todo el proceso.",
    "Lo siento si te pasó eso 😌 aquí el acceso se envía apenas confirmas el pago y te ayudamos si algo falla.",
    "Te entiendo total 🥹 por eso el proceso es claro: pagas, recibes acceso y te acompañamos si necesitas.",
    "Es válido que dudes 🙂 si quieres te explico paso a paso antes de que decidas pagar.",
  ],
  confianza_estafa: [
    "No es estafa 🙂 es un producto digital y apenas confirmas el pago te enviamos acceso.",
    "Tranquilo 😌 no pedimos datos raros: pagas y recibes acceso inmediato con soporte si lo necesitas.",
    "Entiendo la duda 🙂 es 100% digital y el acceso llega apenas se confirma tu pago.",
    "Te aseguro que es legítimo 🙂 si quieres te explico cómo recibes todo antes de pagar.",
  ],
  precio: [
    "Cuesta {precio} 🙂 y ya vienen incluidas las plantillas junto con los bonos.",
    "Está en {precio} 😊 con plantillas y bonos incluidos en el mismo pack.",
    "El valor es {precio} 🙂 incluye plantillas y bonos sin pagar extra por eso.",
    "Por {precio} 😌 te llevas las plantillas y los bonos incluidos.",
  ],
  metodos_pago: [
    "Puedes pagar por {metodos} 😊 elige el método que te quede más cómodo.",
    "Aceptamos {metodos} 🙂 dime cuál prefieres y te guío.",
    "El pago puede ser por {metodos} 😌 como te sea más fácil.",
    "Sí 🙂 puedes usar {metodos} sin problema.",
  ],
  metodos_pago_formas: [
    "Tenemos {metodos} 😊 ¿cuál te queda mejor: QR o depósito?",
    "Puedes pagar con {metodos} 🙂 ¿con cuál te sientes más cómodo?",
    "Las opciones son {metodos} 😌 ¿cuál prefieres usar?",
  ],
  bonos_lista: [
    "Trae varios bonos 😄 como abecedario 3D, lámparas origami y personajes como Goku y Vegeta.",
    "Los bonos incluyen guías, abecedario 3D, lámparas y personajes gigantes 😄 todo sin costo extra.",
    "Sí 😄 vienen bonos como guía, abecedario 3D, lámparas y personajes de Dragon Ball.",
    "Trae 6 bonos 😄 entre ellos guías, lámparas origami y personajes para armar.",
  ],
  bonos_confirmacion: [
    "Sí 😄 los bonos vienen incluidos sin costo extra y llegan con el acceso.",
    "Claro 🙂 los bonos van incluidos, no pagas aparte por ellos.",
    "Sí 😄 llegan juntos al pack apenas recibes el acceso.",
    "Exacto 🙂 bonos incluidos sin costo adicional.",
  ],
  personajes: [
    "Sí 🤩 incluye Goku, Vegeta y Kid Buu para armar en papel.",
    "Sí 🤩 trae personajes como Goku y Vegeta en figuras para imprimir.",
    "Claro 🤩 hay personajes de Dragon Ball y más figuras para armar.",
  ],
  ninos: [
    "Sí 😊 es ideal para niños porque los mantiene entretenidos y usando su creatividad.",
    "Perfecto para niños 🙂 actividades de papel que entretienen y estimulan creatividad.",
    "Sí 😊 a los niños les encanta armar e imprimir las figuras.",
  ],
  acceso: [
    "El acceso es inmediato 😌 apenas confirmas el pago te enviamos todo.",
    "Es digital 🙂 al confirmar el pago recibes el acceso al toque.",
    "Apenas pagas 😌 te enviamos el acceso para descargar en celular o PC.",
  ],
  incluye: [
    "Incluye plantillas, figuras y bonos 😄 todo en un solo pack.",
    "Trae plantillas para imprimir, decoración y bonos 😄 bastante completo.",
    "Viene con plantillas, personajes y bonos incluidos 😄",
  ],
  saludo: [
    "Hola 😄 dime, ¿quieres saber precio, bonos o formas de pago?",
    "Hola 🙂 cuéntame, ¿te interesa el precio o cómo pagar?",
    "Buenas 😄 ¿te ayudo con precio, contenido o formas de pago?",
  ],
  contenido_si: [
    "Sí 🤩 incluye animales, personajes y muchas figuras para armar.",
    "Sí 🤩 trae ese tipo de contenido dentro del pack de figuras.",
    "Claro 🤩 sí está incluido en las plantillas y personajes del pack.",
  ],
  contenido_no: [
    "No vi ese contenido específico 🙂 pero sí incluye muchas figuras y personajes.",
    "Ese tema no lo vi listado 🙂 aunque el pack trae muchas figuras y actividades.",
    "No estoy seguro de ese detalle 🙂 pero sí trae bastantes personajes y plantillas.",
  ],
  fallback: [
    "No te entendí muy bien 🙂 ¿quieres saber precio, bonos o formas de pago?",
    "Perdón 🙂 no capté bien. ¿Precio, bonos o cómo pagar?",
    "¿Me repites 🙂? ¿Buscas precio, formas de pago o qué incluye?",
  ],
};

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

function firmaReply(texto) {
  let s = normMsg(texto);
  for (const e of CARITAS_SOLO) s = s.split(e).join("");
  return s.replace(/\s+/g, " ").trim().slice(0, 90);
}

function esRepetida(variacion, usadas) {
  const firmaV = firmaReply(variacion);
  for (const u of usadas) {
    const firmaU = firmaReply(u);
    if (!firmaU) continue;
    if (firmaV === firmaU || firmaV.slice(0, 45) === firmaU.slice(0, 45)) return true;
  }
  return false;
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

function textoProductoCompleto(p) {
  return [p.description, p.includes, p.bonuses, p.faq].join(" ").toLowerCase();
}

function contenidoEnProducto(m, p) {
  const corpus = textoProductoCompleto(p);
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

function metodosPagoLiteral(paymentMethods) {
  const raw = String(paymentMethods || "").toLowerCase();
  const partes = [];
  if (raw.includes("qr")) partes.push("QR");
  if (raw.includes("deposito") || raw.includes("banco")) partes.push("depósito bancario");
  if (raw.includes("transferencia")) partes.push("transferencia");
  if (raw.includes("tigo")) partes.push("Tigo Money");
  if (partes.length >= 2) return `${partes[0]} o ${partes[1]}`;
  if (partes.length === 1) return partes[0];
  return "QR o depósito bancario";
}

function construirReply(consultaIntent, config, mensaje, usadas) {
  const p = config.productData || {};
  const m = normMsg(mensaje);
  const intentFino = refinarIntent(consultaIntent, m);
  const fb = String(config.mensajeFallback || "").trim();

  if (intentFino === "contenido_producto") {
    const pool = contenidoEnProducto(m, p) ? VARIACIONES.contenido_si : VARIACIONES.contenido_no;
    return limpiarReply(elegirVariacion(pool, usadas, m));
  }

  if (intentFino.startsWith("confianza")) {
    const pool = VARIACIONES[intentFino] || VARIACIONES.confianza_general;
    return limpiarReply(elegirVariacion(pool, usadas, m));
  }

  if (intentFino === "precio") {
    if (!p.price) return limpiarReply(elegirVariacion(VARIACIONES.fallback, usadas, m));
    const plantilla = elegirVariacion(VARIACIONES.precio, usadas, m);
    return limpiarReply(plantilla.replace("{precio}", p.price));
  }

  if (intentFino === "metodos_pago" || intentFino === "metodos_pago_formas") {
    const met = metodosPagoLiteral(p.paymentMethods);
    const plantilla = elegirVariacion(VARIACIONES[intentFino], usadas, m);
    return limpiarReply(plantilla.replace("{metodos}", met));
  }

  if (intentFino === "bonos_lista") {
    if (p.bonuses?.trim()) {
      const limpio = p.bonuses.replace(/\n/g, ", ").trim();
      if (limpio.length < 140 && limpio.includes(",")) {
        const custom = `Trae bonos 😄 como ${limpio}`;
        if (!esRepetida(custom, usadas)) return limpiarReply(custom);
      }
    }
    return limpiarReply(elegirVariacion(VARIACIONES.bonos_lista, usadas, m));
  }

  const poolKey = VARIACIONES[intentFino] ? intentFino : consultaIntent;
  if (VARIACIONES[poolKey]) {
    return limpiarReply(elegirVariacion(VARIACIONES[poolKey], usadas, m));
  }

  if (consultaIntent === "garantia" && p.guarantee) {
    return limpiarReply(`Tranquilo 🙂 ${acortarSinPuntos(p.guarantee, 100)}`);
  }

  if (fb && fb.length < 100 && !/pack digital ideal/i.test(fb) && !esRepetida(fb, usadas)) {
    return limpiarReply(fb);
  }

  return limpiarReply(elegirVariacion(VARIACIONES.fallback, usadas, m));
}

function generarReplyPorIntent(consultaIntent, config, mensaje, chatHistory, lastReplies) {
  const usadas = historialUsadas(chatHistory, lastReplies);
  console.log("🧠 anti repetición:", usadas);
  const intentFino = refinarIntent(consultaIntent, normMsg(mensaje));
  console.log("🧠 intención:", intentFino);
  const reply = construirReply(consultaIntent, config, mensaje, usadas);
  console.log("💬 respuesta elegida:", reply);
  return reply;
}

function generarReplyFallbackLocal(config, mensaje, chatHistory, lastReplies) {
  const consultaIntent = clasificarConsultaIntent(mensaje);
  return generarReplyPorIntent(consultaIntent, config, mensaje, chatHistory || [], lastReplies);
}

async function resolverAnalisisPro(config, mensajeLead, chatHistory, lastReplies) {
  const routes = buildRoutesFromConfig(config);
  const threshold = config.scoreMinimo || 40;

  if (usePythonAi() && routes.length) {
    try {
      const py = await detectarIntentProPython({
        message: mensajeLead,
        threshold,
        routes,
        productData: config.productData,
        tone: config.tone,
        chat_history: chatHistory,
        last_replies: lastReplies || [],
        fallbackMessage: config.mensajeFallback,
        enabledConversation: config.enabledConversation,
      });
      return mapPythonProToResult(py);
    } catch (err) {
      console.log("🐍 Python Pro falló, fallback JS:", err.message);
    }
  }

  const analisis = analizarRutaLocal(config, mensajeLead, {});
  if (analisis.matched && analisis.routeId) {
    return {
      ok: true,
      action: "route",
      intent: analisis.intent,
      score: analisis.score,
      routeId: analisis.routeId,
      reply: "",
      source: "js-router",
    };
  }

  if (!config.enabledConversation) {
    return {
      ok: true,
      action: "reply",
      intent: "router",
      score: analisis.score || 0,
      routeId: null,
      reply: config.mensajeFallback,
      source: "js-fallback",
    };
  }

  return {
    ok: true,
    action: "reply",
    intent: "consulta",
    score: analisis.score || 0,
    routeId: null,
    reply: generarReplyFallbackLocal(config, mensajeLead, chatHistory, lastReplies),
    source: "js-local",
  };
}

async function ejecutarNodoIAPro(nodo, contexto, opts = {}) {
  const numero = contexto?.numero || contexto?.from || contexto?.telefono;
  const usuarioId = contexto?.usuarioId || null;
  const config = parseIAProFromNodo(nodo);

  if (!opts.resume) {
    console.log("🤖 AGENTE IA PRO iniciado");
    return {
      ...contexto,
      iaProPausar: true,
      iaPausar: true,
      iaProEjecutada: false,
      chat_history: trimChatHistory(contexto.chat_history),
    };
  }

  const mensajeLead = String(
    contexto?.mensaje ||
      contexto?.texto ||
      contexto?.body ||
      contexto?.ultimo_mensaje ||
      contexto?.ultimoMensaje ||
      ""
  ).trim();

  let chatHistory = trimChatHistory(contexto.chat_history);
  if (mensajeLead) {
    chatHistory = appendChatHistory(chatHistory, "user", mensajeLead);
  }

  const lastReplies = getLastReplies(usuarioId, numero);
  const resultado = await resolverAnalisisPro(config, mensajeLead, chatHistory, lastReplies);

  contexto.intent = resultado.intent || "";
  contexto.score = resultado.score ?? "";
  contexto.ultimo_mensaje = mensajeLead;

  if (resultado.action === "route" && resultado.routeId) {
    console.log("➡️ IA PRO sale por ruta:", resultado.routeId);
    return {
      ...contexto,
      iaProPausar: false,
      iaPausar: false,
      iaProRouteId: resultado.routeId,
      iaRouteId: resultado.routeId,
      route: resultado.routeId,
      iaProEjecutada: true,
      chat_history: chatHistory,
      intent: resultado.intent,
      score: resultado.score,
    };
  }

  let reply = limpiarReply(String(resultado.reply || "").trim());
  if (reply && numero) {
    await enviarTextoWhatsApp(numero, reply, { usuarioId });
    contexto.ultimaRespuestaIA = reply;
    chatHistory = appendChatHistory(chatHistory, "assistant", reply);
    pushLastReply(usuarioId, numero, reply);
  }

  console.log("⏸️ IA PRO sigue esperando");
  return {
    ...contexto,
    iaProPausar: true,
    iaPausar: true,
    iaProReply: true,
    iaProEjecutada: true,
    chat_history: chatHistory,
    intent: resultado.intent || "consulta",
    score: resultado.score,
  };
}

module.exports = {
  crearConfigProPorDefecto,
  normalizarConfigPro,
  parseIAProFromNodo,
  ejecutarNodoIAPro,
  trimChatHistory,
  appendChatHistory,
};
