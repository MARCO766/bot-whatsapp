const axios = require("axios");
const { enviarTextoWhatsApp } = require("./whatsappService");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 25000;
const MAX_INPUT_CHARS = 4000;

const MODOS_FASE1 = new Set([
  "detectar_intencion",
  "clasificar_lead",
  "responder_automatico",
]);

const INTENCIONES_VALIDAS = new Set([
  "compra",
  "precio",
  "soporte",
  "saludo",
  "reclamo",
  "comprobante",
  "no_interesado",
  "desconocido",
]);

const SCORES_VALIDOS = new Set(["caliente", "medio", "frio"]);

function crearConfigPorDefecto() {
  return {
    nombreNodo: "🤖 IA",
    modo: "detectar_intencion",
    promptSistema: "",
    instruccionesNegocio: "",
    maxCaracteres: 400,
    temperatura: 0.3,
    modelo: DEFAULT_MODEL,
    variableResultado: "",
    siFalla: "continuar",
    mensajeFallback: "Gracias por escribirnos. En breve un asesor te atiende.",
  };
}

function sanitizeInput(text, maxLen = MAX_INPUT_CHARS) {
  if (text == null) return "";
  let s = String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseIAFromNodo(nodo) {
  const cfg = crearConfigPorDefecto();
  if (!nodo) return cfg;

  const html = nodo.html || "";
  const match = html.match(
    /<textarea[^>]*class="ia-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );

  if (match) {
    try {
      const raw = decodeHtmlEntities(match[1].trim());
      if (raw) Object.assign(cfg, JSON.parse(raw));
    } catch (e) {
      console.warn("[IA] JSON inválido en nodo:", e.message);
    }
  }

  cfg.nombreNodo = sanitizeInput(cfg.nombreNodo || "🤖 IA", 120);
  cfg.modo = MODOS_FASE1.has(cfg.modo) ? cfg.modo : "detectar_intencion";
  cfg.promptSistema = sanitizeInput(cfg.promptSistema, 2000);
  cfg.instruccionesNegocio = sanitizeInput(cfg.instruccionesNegocio, 2000);
  cfg.maxCaracteres = Math.min(
    400,
    Math.max(50, parseInt(cfg.maxCaracteres, 10) || 400)
  );
  cfg.temperatura = Math.min(
    1,
    Math.max(0, parseFloat(cfg.temperatura) || 0.3)
  );
  cfg.modelo = sanitizeInput(cfg.modelo || DEFAULT_MODEL, 64) || DEFAULT_MODEL;
  cfg.variableResultado = sanitizeInput(cfg.variableResultado, 64);
  cfg.siFalla = cfg.siFalla === "detener" ? "detener" : "continuar";
  cfg.mensajeFallback = sanitizeInput(cfg.mensajeFallback, 500);

  return cfg;
}

function interpolarVariables(template, ctx) {
  if (!template) return "";
  const map = {
    nombre: ctx.nombre || "",
    telefono: ctx.telefono || ctx.numero || "",
    ultimo_mensaje: ctx.ultimo_mensaje || "",
    intent: ctx.intent || ctx.ai?.intent || "",
    score: ctx.score || ctx.ai?.score || "",
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? "");
}

function normalizarIntencion(valor) {
  const v = String(valor || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (INTENCIONES_VALIDAS.has(v)) return v;
  if (v.includes("compra")) return "compra";
  if (v.includes("precio")) return "precio";
  if (v.includes("soporte")) return "soporte";
  if (v.includes("saludo")) return "saludo";
  if (v.includes("reclamo")) return "reclamo";
  if (v.includes("comprobante")) return "comprobante";
  if (v.includes("no_interes") || v.includes("no interes")) return "no_interesado";
  return "desconocido";
}

function normalizarScore(valor) {
  const v = String(valor || "")
    .toLowerCase()
    .trim();
  if (SCORES_VALIDOS.has(v)) return v;
  if (v.includes("caliente") || v.includes("hot")) return "caliente";
  if (v.includes("medio") || v.includes("warm")) return "medio";
  if (v.includes("frio") || v.includes("frío") || v.includes("cold")) return "frio";
  return "medio";
}

async function callOpenAI({ messages, model, temperature, maxTokens }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: temperature ?? 0.3,
        max_tokens: maxTokens || 256,
        messages,
      }),
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg =
        data?.error?.message || `OpenAI HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Respuesta vacía de OpenAI");
    return String(content).trim();
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(config, ctx) {
  const base = [
    config.promptSistema ||
      "Eres un asistente de automatización WhatsApp para un negocio. Responde solo con el formato solicitado, sin markdown ni explicaciones extra.",
    config.instruccionesNegocio
      ? `Instrucciones del negocio:\n${interpolarVariables(config.instruccionesNegocio, ctx)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return interpolarVariables(base, ctx);
}

function buildUserPromptForMode(config, ctx) {
  const mensaje = sanitizeInput(ctx.ultimo_mensaje, 2000);
  const contextoLead = [
    ctx.nombre ? `Nombre: ${ctx.nombre}` : "",
    ctx.telefono ? `Teléfono: ${ctx.telefono}` : "",
    ctx.intent ? `Intención previa: ${ctx.intent}` : "",
    ctx.score ? `Score previo: ${ctx.score}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (config.modo === "detectar_intencion") {
    return `Clasifica la intención del último mensaje del cliente en UNA sola categoría exacta:
compra, precio, soporte, saludo, reclamo, comprobante, no_interesado, desconocido

Responde SOLO con la palabra de la categoría, en minúsculas, sin puntos ni texto extra.

${contextoLead ? contextoLead + "\n" : ""}Mensaje del cliente:
${mensaje || "(sin mensaje)"}`;
  }

  if (config.modo === "clasificar_lead") {
    return `Clasifica el lead en UNA categoría exacta: caliente, medio, frio
Según interés de compra, urgencia y tono del mensaje.

Responde SOLO con: caliente, medio o frio (minúsculas).

${contextoLead ? contextoLead + "\n" : ""}Mensaje del cliente:
${mensaje || "(sin mensaje)"}`;
  }

  return `Genera una respuesta corta para WhatsApp (máximo ${config.maxCaracteres} caracteres).
Tono amable y profesional. Español.
NO inventes precios, promociones, descuentos ni plazos de entrega.
NO prometas cosas que no estén en el contexto.
Si no tienes información suficiente, responde brevemente que un asesor ayudará pronto.

${contextoLead ? contextoLead + "\n" : ""}Mensaje del cliente:
${mensaje || "(sin mensaje)"}`;
}

async function runAIMode(config, ctx) {
  const system = buildSystemPrompt(config, ctx);
  const user = buildUserPromptForMode(config, ctx);

  const raw = await callOpenAI({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: config.modelo,
    temperature: config.temperatura,
    maxTokens: config.modo === "responder_automatico" ? 300 : 32,
  });

  if (config.modo === "detectar_intencion") {
    return { tipo: "intent", valor: normalizarIntencion(raw) };
  }
  if (config.modo === "clasificar_lead") {
    return { tipo: "score", valor: normalizarScore(raw) };
  }

  let respuesta = sanitizeInput(raw, config.maxCaracteres);
  if (respuesta.length > config.maxCaracteres) {
    respuesta = respuesta.slice(0, config.maxCaracteres);
  }
  return { tipo: "reply", valor: respuesta };
}

function guardarResultadoEnContexto(flowContext, config, resultado) {
  if (!flowContext.ai) flowContext.ai = {};

  if (resultado.tipo === "intent") {
    flowContext.ai.intent = resultado.valor;
    flowContext.intent = resultado.valor;
  } else if (resultado.tipo === "score") {
    flowContext.ai.score = resultado.valor;
    flowContext.score = resultado.valor;
  } else if (resultado.tipo === "reply") {
    flowContext.ai.reply = resultado.valor;
    const varName = config.variableResultado || "respuesta_ia";
    flowContext.ai[varName] = resultado.valor;
  }

  if (config.variableResultado && resultado.valor != null) {
    flowContext.ai[config.variableResultado] = resultado.valor;
  }
}

async function ejecutarIANodo({ numero, nodo, usuarioId, flowContext }) {
  const config = parseIAFromNodo(nodo);
  const ctx = flowContext || {
    numero,
    telefono: numero,
    nombre: "",
    ultimo_mensaje: "",
    ai: {},
  };

  console.log("[IA] modo:", config.modo);

  if (!ctx.ultimo_mensaje && config.modo !== "responder_automatico") {
    console.log("[IA] sin último mensaje — usando desconocido/medio");
  }

  try {
    const resultado = await runAIMode(config, ctx);
    console.log("[IA] resultado:", resultado.valor);

    guardarResultadoEnContexto(ctx, config, resultado);

    if (config.modo === "responder_automatico" && resultado.valor) {
      await enviarTextoWhatsApp(numero, resultado.valor, { usuarioId });
    }

    return { ok: true, continuar: true, resultado };
  } catch (err) {
    console.log("[IA] error:", err.message);

    const fallback = interpolarVariables(config.mensajeFallback, ctx);

    if (config.modo === "responder_automatico" && fallback) {
      try {
        const texto = sanitizeInput(fallback, config.maxCaracteres);
        await enviarTextoWhatsApp(numero, texto, { usuarioId });
        guardarResultadoEnContexto(ctx, config, {
          tipo: "reply",
          valor: texto,
        });
      } catch (sendErr) {
        console.log("[IA] error enviando fallback:", sendErr.message);
      }
    } else if (config.modo === "detectar_intencion") {
      guardarResultadoEnContexto(ctx, config, {
        tipo: "intent",
        valor: "desconocido",
      });
    } else if (config.modo === "clasificar_lead") {
      guardarResultadoEnContexto(ctx, config, {
        tipo: "score",
        valor: "medio",
      });
    }

    if (config.siFalla === "detener") {
      return { ok: false, continuar: false, error: err.message };
    }

    return { ok: false, continuar: true, error: err.message };
  }
}

async function runAI(body = {}) {
  const config = crearConfigPorDefecto();
  Object.assign(config, body.config || body);

  config.modo = MODOS_FASE1.has(config.modo) ? config.modo : "detectar_intencion";
  config.promptSistema = sanitizeInput(config.promptSistema, 2000);
  config.instruccionesNegocio = sanitizeInput(config.instruccionesNegocio, 2000);

  const ctx = {
    nombre: sanitizeInput(body.nombre, 200),
    telefono: sanitizeInput(body.telefono, 32),
    ultimo_mensaje: sanitizeInput(body.ultimo_mensaje || body.mensaje, 2000),
    intent: sanitizeInput(body.intent, 64),
    score: sanitizeInput(body.score, 32),
    ai: {},
  };

  const resultado = await runAIMode(config, ctx);
  guardarResultadoEnContexto(ctx, config, resultado);

  return {
    ok: true,
    modo: config.modo,
    resultado: resultado.valor,
    context: ctx.ai,
  };
}

async function enriquecerContextoFlujo(flowContext, numero, usuarioId) {
  if (!usuarioId || !numero) return flowContext;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return flowContext;

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  try {
    if (!flowContext.nombre) {
      const resCliente = await axios.get(
        `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${usuarioId}&numero=eq.${encodeURIComponent(numero)}&select=nombre&limit=1`,
        { headers, timeout: 8000 }
      );
      const row = resCliente.data?.[0];
      if (row?.nombre) flowContext.nombre = row.nombre;
    }
  } catch (e) {
    /* ignore */
  }

  try {
    if (!flowContext.ultimo_mensaje) {
      const resMsg = await axios.get(
        `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(numero)}&direccion=eq.entrante&select=contenido&order=creado_en.desc&limit=1`,
        { headers, timeout: 8000 }
      );
      const msg = resMsg.data?.[0];
      if (msg?.contenido) flowContext.ultimo_mensaje = msg.contenido;
    }
  } catch (e) {
    /* ignore */
  }

  if (!flowContext.nombre) flowContext.nombre = numero;
  return flowContext;
}

module.exports = {
  crearConfigPorDefecto,
  parseIAFromNodo,
  ejecutarIANodo,
  runAI,
  enriquecerContextoFlujo,
  interpolarVariables,
  sanitizeInput,
  MODOS_FASE1,
};
