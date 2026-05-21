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

function clasificarConsultaIntent(mensaje) {
  const m = normMsg(mensaje);
  if (esConfianza(m)) return "confianza";
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

const CARITAS_ROTACION = ["🙂", "😊", "😄", "😌", "🤩", "🥹"];

const EMOJI_OPCIONES_INTENT = {
  precio: ["🙂"],
  metodos_pago: ["😊"],
  bonos_lista: ["😄"],
  bonos_confirmacion: ["😄"],
  confianza: ["🥹", "🙂", "😌"],
  personajes: ["🤩"],
  ninos: ["😊"],
  acceso: ["😌"],
  saludo: ["😄"],
  incluye: ["😄"],
  garantia: ["🙂", "😌"],
  general: ["🙂"],
};

function emojiEnHistorial(chatHistory) {
  const hist = Array.isArray(chatHistory) ? chatHistory : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const role = String(hist[i].role || "").toLowerCase();
    if (role === "assistant" || role === "bot" || role === "ia") {
      const text = String(hist[i].text || "");
      for (const e of CARITAS_ROTACION) {
        if (text.includes(e)) return e;
      }
    }
  }
  return "";
}

function seleccionarEmoji(intent, chatHistory) {
  const opciones = EMOJI_OPCIONES_INTENT[intent] || ["🙂"];
  const prev = emojiEnHistorial(chatHistory);
  for (const e of opciones) {
    if (e !== prev) return e;
  }
  if (CARITAS_ROTACION.includes(prev)) {
    return CARITAS_ROTACION[(CARITAS_ROTACION.indexOf(prev) + 1) % CARITAS_ROTACION.length];
  }
  return opciones[0];
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

function bonosListaTexto(p, emoji) {
  if (p.bonuses?.trim()) {
    const limpio = p.bonuses.replace(/\n/g, ", ").trim().replace(/\.$/, "");
    if (limpio.length <= 160) {
      return limpiarReply(`Trae varios bonos ${emoji} como ${limpio}`);
    }
  }
  return limpiarReply(
    `Trae varios bonos ${emoji} como abecedario 3D, lámparas origami y personajes gigantes como Goku y Vegeta`
  );
}

function resumenPrecioCorto(includes, bonuses) {
  const inc = String(includes || "").toLowerCase();
  const matchPlant = inc.match(/\d[\d.]*\s*plantillas?/);
  const plantillas = matchPlant ? matchPlant[0] : "las plantillas";
  const bonos = /6/.test(bonuses || inc) ? "los 6 bonos gratis" : "los bonos";
  return `incluye ${plantillas} y ${bonos}`;
}

function fallbackCorto(fallback, emoji) {
  const fb = String(fallback || "").trim();
  if (fb && fb.length < 100 && !/pack digital ideal/i.test(fb)) return limpiarReply(fb);
  return limpiarReply(`No te entendí muy bien ${emoji} ¿quieres saber precio, bonos o formas de pago?`);
}

function generarReplyPorIntent(consultaIntent, config, mensaje, chatHistory) {
  const p = config.productData || {};
  const m = normMsg(mensaje);
  const emoji = seleccionarEmoji(consultaIntent, chatHistory);
  console.log("😀 emoji seleccionado:", emoji);
  const fb = fallbackCorto(config.mensajeFallback, emoji);
  let reply = fb;

  if (consultaIntent === "confianza") {
    reply = limpiarReply(
      `Te entiendo ${emoji} hoy en día uno tiene dudas. Apenas confirmas el pago te enviamos acceso y si necesitas ayuda te guiamos`
    );
  } else if (consultaIntent === "personajes") {
    const chars = personajesDetectados(m, p);
    reply = chars.length
      ? limpiarReply(
          `Sí ${emoji} incluye ${chars.length > 1 ? `${chars.slice(0, -1).join(", ")} y ${chars[chars.length - 1]}` : chars[0]} para armar en papel`
        )
      : limpiarReply(`Sí ${emoji} incluye Goku, Vegeta y Kid Buu para armar en papel`);
  } else if (consultaIntent === "bonos_lista") {
    reply = bonosListaTexto(p, emoji);
  } else if (consultaIntent === "bonos_confirmacion") {
    reply = limpiarReply(
      `Sí ${emoji} los bonos vienen incluidos sin costo extra. Llegan junto con el acceso al pack`
    );
  } else if (consultaIntent === "metodos_pago") {
    const met = metodosPagoLiteral(p.paymentMethods);
    reply =
      /formas de pago/.test(m) || m.trim() === "pago" || m.trim() === "pagos"
        ? limpiarReply(`Tenemos pago por ${met} ${emoji} ¿cuál prefieres usar?`)
        : limpiarReply(`Puedes pagar por ${met} ${emoji} eliges el método que te quede más cómodo`);
  } else if (consultaIntent === "ninos") {
    reply = limpiarReply(
      `Sí ${emoji} es ideal para niños porque los mantiene entretenidos y usando su creatividad`
    );
  } else if (consultaIntent === "acceso") {
    reply =
      p.access && p.access.length <= 100
        ? limpiarReply(
            `El acceso es inmediato ${emoji} apenas confirmas el pago ${acortarSinPuntos(p.access, 80)}`
          )
        : limpiarReply(`El acceso es inmediato ${emoji} apenas confirmas el pago te enviamos todo`);
  } else if (consultaIntent === "precio") {
    if (p.price) {
      reply = limpiarReply(`Está en ${p.price} ${emoji} ${resumenPrecioCorto(p.includes, p.bonuses)}`);
    }
  } else if (consultaIntent === "garantia") {
    if (p.guarantee) reply = limpiarReply(`Tranquilo ${emoji} ${acortarSinPuntos(p.guarantee, 100)}`);
  } else if (consultaIntent === "incluye") {
    if (p.includes) {
      let cuerpo = acortarSinPuntos(p.includes, 120);
      if (p.bonuses) cuerpo += ` y ${acortarSinPuntos(p.bonuses, 60)}`;
      reply = limpiarReply(`Incluye ${cuerpo} ${emoji}`);
    }
  } else if (consultaIntent === "saludo") {
    reply = limpiarReply(`Hola ${emoji} dime ¿quieres saber precio, bonos o formas de pago?`);
  }

  console.log("💬 reply limpio:", reply);
  return reply;
}

function generarReplyFallbackLocal(config, mensaje, chatHistory) {
  const consultaIntent = clasificarConsultaIntent(mensaje);
  console.log("🧠 IA PRO intención detectada:", consultaIntent);
  return generarReplyPorIntent(consultaIntent, config, mensaje, chatHistory || []);
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
    reply: generarReplyFallbackLocal(config, mensajeLead, chatHistory),
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

  let reply = limpiarReply(String(resultado.reply || "").trim());
  if (reply && numero) {
    await enviarTextoWhatsApp(numero, reply, { usuarioId });
    contexto.ultimaRespuestaIA = reply;
    chatHistory = appendChatHistory(chatHistory, "assistant", reply);
    console.log("💬 reply limpio:", reply);
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
