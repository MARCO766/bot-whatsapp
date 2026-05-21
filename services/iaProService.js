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

function generarReplyFallbackLocal(config, mensaje) {
  const p = config.productData || {};
  const m = String(mensaje || "").toLowerCase();
  const fb = config.mensajeFallback;

  if (/precio|cuanto|cuesta|sale|valor/.test(m)) {
    return p.price ? `El precio es ${p.price}.` : fb;
  }
  if (/incluye|bono/.test(m)) {
    const parts = [p.includes, p.bonuses && `Bonos: ${p.bonuses}`].filter(Boolean);
    return parts.length ? parts.join(" ") : fb;
  }
  if (/garantia|devolucion/.test(m)) {
    return p.guarantee || fb;
  }
  if (/acceso|entrega|descarga/.test(m)) {
    return p.access || fb;
  }
  if (/pago|pagar|deposito|qr|transferencia/.test(m)) {
    return p.paymentMethods || fb;
  }
  if (/mas info|informacion|detalle/.test(m)) {
    return p.description || fb;
  }
  return p.description || fb;
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
    console.log("💬 IA PRO responde:", reply);
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
