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
const TONOS_VALIDOS = new Set(["amable", "vendedor", "premium", "tecnico", "agresivo"]);

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

function clasificarConsultaIntent(mensaje) {
  const m = normMsg(mensaje);
  if (/estafa|fraude|engano|confianza|seguro|legitimo|real es|no es estafa/.test(m)) {
    return "estafa";
  }
  if (/goku|vegeta|buu|personaje|personajes|muestra|muestras|dragon|figura|papel/.test(m)) {
    return "personajes";
  }
  if (/bono/.test(m) && !esIncluyeCompleto(m)) return "bonos";
  if (/hijo|hija|nino|nina|edad|peque|chico|chica|sirve para/.test(m)) return "ninos";
  if (/acceso|accedo|entrega|descarga|ingreso|como recibo|como es el acceso/.test(m)) {
    return "acceso";
  }
  if (/precio|cuanto|cuesta|sale|valor|costo/.test(m)) return "precio";
  if (/garantia|devolucion|reembolso/.test(m)) return "garantia";
  if (/pago|pagar|metodo|transferencia|deposito|forma de pago|como pago/.test(m)) {
    return "pago";
  }
  if (esIncluyeCompleto(m) || (/incluye/.test(m) && /todo|pack|completo/.test(m))) {
    return "incluye";
  }
  if (/hola|buenas|hey|saludos/.test(m)) return "saludo";
  if (/sirve|funciona|vale la pena|me conviene|bueno para/.test(m)) return "ninos";
  return "general";
}

function recortar(texto, maxLen = 140) {
  const t = String(texto || "").trim().replace(/\.$/, "");
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 3).replace(/\s+\S*$/, "") + "...";
}

function personajesDetectados(m, p) {
  const corpus = [p.includes, p.faq, p.description, p.bonuses].join(" ").toLowerCase();
  const mapa = [
    ["goku", "Goku"],
    ["vegeta", "Vegeta"],
    ["kid buu", "Kid Buu"],
    ["buu", "Kid Buu"],
  ];
  const out = [];
  const vistos = new Set();
  for (const [key, label] of mapa) {
    if ((m.includes(key) || corpus.includes(key)) && !vistos.has(label)) {
      out.push(label);
      vistos.add(label);
    }
  }
  return out;
}

function resumenPrecioIncluye(includes, bonuses) {
  const inc = String(includes || "").toLowerCase();
  const partes = [];
  const matchPlant = inc.match(/\d[\d.]*\s*plantillas?/);
  if (matchPlant) partes.push(`las ${matchPlant[0]}`);
  else if (inc.includes("plantilla")) partes.push("las plantillas");
  if (bonuses || inc.includes("bono")) {
    partes.push(/6/.test(bonuses || inc) ? "los 6 bonos gratis" : "los bonos incluidos");
  }
  if (!partes.length) return "";
  if (partes.length === 1) return `Incluye ${partes[0]}.`;
  return `Incluye ${partes[0]} y ${partes[1]}.`;
}

function naturalizarPago(metodos) {
  const m = String(metodos || "").toLowerCase();
  if (!m.trim()) return "";
  if (m.includes("qr") && m.includes("deposito")) return "puedes pagar por QR o depósito";
  if (m.includes("qr")) return "puedes pagar por QR";
  if (m.includes("deposito") || m.includes("transferencia")) {
    return "puedes pagar por depósito o transferencia";
  }
  return recortar(`puedes pagar con ${metodos}`, 60);
}

function fallbackCorto(fallback) {
  const fb = String(fallback || "").trim();
  if (fb && fb.length < 120 && !/pack digital ideal/i.test(fb)) return fb;
  return "Te ayudo 😊 ¿quieres saber precio, qué incluye o cómo recibirlo?";
}

function generarReplyPorIntent(consultaIntent, config, mensaje) {
  const p = config.productData || {};
  const m = normMsg(mensaje);
  const fb = fallbackCorto(config.mensajeFallback);

  if (consultaIntent === "personajes") {
    const chars = personajesDetectados(m, p);
    if (chars.length) {
      const lista =
        chars.length > 1 ? `${chars.slice(0, -1).join(", ")} y ${chars[chars.length - 1]}` : chars[0];
      return `Sí 😊 trae personajes como ${lista} para armar en papel. Están muy buenos para niños fans de Dragon Ball ✂️`;
    }
    return "Sí 😊 trae varios personajes en papel para imprimir y armar. ¿Buscas alguno en particular?";
  }

  if (consultaIntent === "bonos") {
    if (p.bonuses && p.bonuses.length < 100) {
      return `Sí 😊 ${p.bonuses.replace(/\.$/, "")}. Vienen incluidos sin costo extra con el acceso.`;
    }
    return "Sí 😊 los bonos vienen incluidos sin costo extra. Apenas recibes el acceso, también puedes descargarlos.";
  }

  if (consultaIntent === "ninos") {
    return "Sí 😊 es ideal para niños porque los mantiene entretenidos y estimula su creatividad con actividades de papel.";
  }

  if (consultaIntent === "acceso") {
    if (p.access && p.access.length < 100) {
      return `Es digital e inmediato 😊 ${recortar(p.access, 100)}`;
    }
    return "Es digital e inmediato 😊 Apenas confirmas el pago te enviamos el acceso para descargarlo desde tu celular o computadora.";
  }

  if (consultaIntent === "precio") {
    if (!p.price) return fb;
    const resumen = resumenPrecioIncluye(p.includes, p.bonuses);
    return resumen ? `Está en ${p.price} 😊 ${resumen}` : `Está en ${p.price} 😊`;
  }

  if (consultaIntent === "estafa") {
    return "Te entiendo 😊 Es normal desconfiar. Es un producto digital y te enviamos el acceso apenas confirmas el pago.";
  }

  if (consultaIntent === "garantia") {
    return p.guarantee ? `Tranquilo 😊 ${recortar(p.guarantee, 120)}` : fb;
  }

  if (consultaIntent === "pago") {
    const met = naturalizarPago(p.paymentMethods);
    return met ? `Sí 😊 ${met.charAt(0).toUpperCase() + met.slice(1)}.` : fb;
  }

  if (consultaIntent === "incluye") {
    if (!p.includes) return fb;
    let cuerpo = recortar(p.includes, 160);
    if (p.bonuses) cuerpo += ` y ${recortar(p.bonuses, 60)}`;
    return `Incluye ${cuerpo} 🎁`;
  }

  if (consultaIntent === "saludo") {
    return "Hola 😊 qué gusto que escribas. ¿Te cuento precio, qué incluye o cómo recibirlo?";
  }

  return fb;
}

function generarReplyFallbackLocal(config, mensaje) {
  const consultaIntent = clasificarConsultaIntent(mensaje);
  console.log("🧠 IA PRO intención consulta:", consultaIntent);
  const reply = generarReplyPorIntent(consultaIntent, config, mensaje);
  console.log("💬 IA PRO reply corto:", reply);
  return reply;
}

async function resolverAnalisisPro(config, mensajeLead, chatHistory) {
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
    reply: generarReplyFallbackLocal(config, mensajeLead),
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

  const resultado = await resolverAnalisisPro(config, mensajeLead, chatHistory);

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

  const reply = String(resultado.reply || "").trim();
  if (reply && numero) {
    await enviarTextoWhatsApp(numero, reply, { usuarioId });
    contexto.ultimaRespuestaIA = reply;
    chatHistory = appendChatHistory(chatHistory, "assistant", reply);
    console.log("💬 IA PRO reply corto:", reply);
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
