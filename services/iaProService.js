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

function fraseIncluyeNatural(includes, bonuses) {
  const partes = [];
  if (includes?.trim()) partes.push(`incluye ${includes.trim().replace(/\.$/, "")}`);
  if (bonuses?.trim()) {
    partes.push(
      partes.length ? `además ${bonuses.trim().replace(/\.$/, "")}` : `trae ${bonuses.trim().replace(/\.$/, "")}`
    );
  }
  return partes.join(" e ");
}

function naturalizarPago(metodos) {
  const m = String(metodos || "").toLowerCase();
  if (!m.trim()) return "";
  if (m.includes("qr") && m.includes("deposito")) {
    return "puedes pagar por QR o depósito bancario sin problema";
  }
  if (m.includes("qr")) return "puedes pagar por QR sin problema";
  if (m.includes("deposito") || m.includes("transferencia")) {
    return "puedes pagar por depósito o transferencia";
  }
  return `puedes pagar así: ${metodos.trim()}`;
}

function beneficioCorto(desc) {
  if (!desc?.trim()) return "";
  const corto = desc.trim().split(".")[0];
  if (!corto) return "";
  return corto.length > 100 ? `La verdad ${corto.slice(0, 97)}...` : `La verdad ${corto.charAt(0).toLowerCase() + corto.slice(1)}`;
}

function generarReplyFallbackLocal(config, mensaje) {
  const p = config.productData || {};
  const m = String(mensaje || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const nombre = p.name || "este pack";
  const fb =
    config.mensajeFallback?.trim() ||
    "Cuéntame un poquito más 😊 ¿Te interesa el precio, qué incluye o cómo pagar?";

  if (/estafa|fraude|engano|confianza|seguro|legitimo|real es/.test(m)) {
    let msg =
      "Te entiendo 😊 hoy en día uno duda bastante, y es normal. Es un producto digital y apenas se confirma el pago te enviamos acceso inmediato";
    if (p.access) msg += ` (${p.access.replace(/\.$/, "")})`;
    msg += ".";
    if (p.guarantee) msg += ` Además ${p.guarantee.replace(/\.$/, "")}.`;
    else msg += " Si necesitas ayuda para descargarlo, te guiamos paso a paso.";
    return `${msg} ¿Te cuento cómo es el acceso después del pago?`;
  }

  if (/sirve|funciona|vale la pena|bueno para|me conviene/.test(m)) {
    const desc = p.description?.trim();
    if (desc) {
      const corto = desc.length > 180 ? desc.split(".")[0] + "." : desc;
      return `Claro 😊 Sí, ${nombre} encaja muy bien para lo que buscas. ${corto} ¿Para quién lo estás pensando?`;
    }
    return `Claro 😊 Sí, muchos lo usan con ${nombre}. ¿Para quién lo estás pensando?`;
  }

  if (/precio|cuanto|cuesta|sale|valor|costo/.test(m)) {
    if (!p.price) return fb;
    const inc = fraseIncluyeNatural(p.includes, p.bonuses);
    const benef = beneficioCorto(p.description);
    let msg = `😊 Cuesta solo ${p.price}`;
    if (inc) msg += ` e ${inc}`;
    if (benef) msg += `. ${benef}`;
    return `${msg}. ¿Es para ti o para regalar?`;
  }

  if (/incluye|inclusiones|que trae|bono|bonos|viene con/.test(m)) {
    const inc = fraseIncluyeNatural(p.includes, p.bonuses);
    if (!inc) return fb;
    const benef = beneficioCorto(p.description);
    let msg = `Te cuento 😊 Va bastante completo: ${inc.charAt(0).toUpperCase() + inc.slice(1)}`;
    if (benef && !/verdad/i.test(benef)) msg += `. ${benef}`;
    return `${msg}. ¿Quieres que te cuente cómo recibirlo?`;
  }

  if (/garantia|devolucion|reembolso/.test(m)) {
    if (!p.guarantee) return fb;
    return `Tranquilo 😊 Sobre la garantía: ${p.guarantee.replace(/\.$/, "")}. ¿Te ayudo con el pago o el acceso?`;
  }

  if (/acceso|accedo|entrega|descarga|ingreso|como recibo/.test(m)) {
    if (!p.access) return fb;
    return `Perfecto 😊 El acceso es súper simple: ${p.access.replace(/\.$/, "")}. ¿Ya tienes claro cómo descargarlo o te guío?`;
  }

  if (/pago|pagar|metodo|transferencia|deposito|forma de pago/.test(m) && !/quiero\s+qr|^qr$/.test(m)) {
    const met = naturalizarPago(p.paymentMethods);
    if (!met) return fb;
    let msg = `Sí 😊 ${met.charAt(0).toUpperCase() + met.slice(1)}`;
    if (p.access) msg += `. Apenas confirmes el pago ${p.access.replace(/\.$/, "").toLowerCase()}`;
    else msg += ". Apenas confirmes el pago te enviamos acceso al toque 🚀";
    return `${msg}. ¿Con cuál método te queda más cómodo?`;
  }

  if (/mas info|informacion|detalle|que es|cuentame/.test(m)) {
    if (!p.description) return fb;
    const corto =
      p.description.length > 160 ? p.description.split(".")[0] + "." : p.description;
    return `Mira 😊 ${nombre}: ${corto} ¿Qué te gustaría saber de ${nombre}?`;
  }

  if (/hola|buenas|hey|saludos/.test(m)) {
    if (p.description) {
      const corto = p.description.includes(".")
        ? p.description.split(".")[0] + "."
        : p.description;
      return `Hola 😊 qué gusto que escribas. Te cuento: ${corto} ¿Qué te gustaría saber primero?`;
    }
    return "Hola 😊 qué gusto que escribas. ¿Te cuento precio, qué incluye o cómo pagar?";
  }

  if (p.description) {
    const corto = p.description.includes(".")
      ? p.description.split(".")[0] + "."
      : p.description;
    return `Claro 😊 ${corto} ¿En qué más te ayudo?`;
  }

  return fb;
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
