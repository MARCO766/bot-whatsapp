const axios = require("axios");
const { enviarTextoWhatsApp } = require("./whatsappService");
const { claveSesion } = require("./iaFlowSession");
const {
  normalizarConfigRouter,
  analizarRutaLocal,
} = require("./iaLocalRouter");
const { esCaminoPaymentReader } = require("./openaiCaminoMatcher");
const {
  extraerLecturaComprobanteOpenAI,
  evaluarRutasPaymentReaderContraLectura,
} = require("./openaiPaymentReaderService");
const {
  usePythonAi,
  resolveDetectIntentEndpoint,
  buildRoutesFromConfig,
  detectarIntentPython,
  mapPythonToAnalisis,
} = require("./pythonAiClient");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 25000;
const MAX_INPUT_CHARS = 4000;

const MODOS_FASE1 = new Set([
  "detectar_intencion",
  "clasificar_lead",
  "responder_automatico",
]);

const PROVEEDORES = new Set(["automatico", "local", "openai"]);

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

const INTENT_PRIORITY = [
  "comprobante",
  "no_interesado",
  "reclamo",
  "precio",
  "compra",
  "soporte",
  "saludo",
];

const SCORES_VALIDOS = new Set(["caliente", "medio", "frio"]);

const FALLBACK_LIMITE_MIN = 1;
const FALLBACK_LIMITE_MAX = 100;

function crearFallbackLimitePorDefecto() {
  return {
    ilimitado: true,
    maximo: 3,
    alSuperarLimite: "nada",
    soporteNombre: "",
    soporteNumero: "",
  };
}

function crearFallbackPaymentReaderPorDefecto() {
  return {
    ...crearFallbackLimitePorDefecto(),
    responderSiNoCoincide: true,
    mensajeFallback: "",
  };
}

function clampFallbackMaximo(valor) {
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(FALLBACK_LIMITE_MAX, Math.max(FALLBACK_LIMITE_MIN, n));
}

function normalizarFallbackLimite(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const ilimitado =
    base.ilimitado === false || base.ilimitado === "false" || base.ilimitado === 0
      ? false
      : base.ilimitado === true || base.ilimitado === "true"
        ? true
        : base.ilimitado !== false;
  return {
    ilimitado,
    maximo: clampFallbackMaximo(base.maximo),
    alSuperarLimite: base.alSuperarLimite === "soporte" ? "soporte" : "nada",
    soporteNombre: String(base.soporteNombre || "")
      .trim()
      .slice(0, 120),
    soporteNumero: String(base.soporteNumero || "")
      .trim()
      .slice(0, 32),
  };
}

function normalizarFallbackPaymentReader(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    ...normalizarFallbackLimite(base),
    responderSiNoCoincide: base.responderSiNoCoincide !== false,
    mensajeFallback: sanitizeInput(base.mensajeFallback, 500),
  };
}

function resolverMensajeFallbackPaymentReaderIA({
  configPayment,
  mensajeSistema,
  contexto,
}) {
  const cfg = normalizarFallbackPaymentReader(configPayment);
  if (!cfg.responderSiNoCoincide) {
    return { activo: false, mensaje: "" };
  }
  const custom = String(cfg.mensajeFallback || "").trim();
  const mensaje = custom
    ? interpolarVariables(custom, contexto || {}).trim()
    : String(mensajeSistema || "").trim();
  return { activo: true, mensaje };
}

function normalizarFallbacksIA(cfg) {
  const src = cfg && typeof cfg === "object" ? cfg : {};
  const tieneFallbackTexto = Object.prototype.hasOwnProperty.call(src, "fallbackTexto");
  const tieneFallbackPayment = Object.prototype.hasOwnProperty.call(
    src,
    "fallbackPaymentReader"
  );

  return {
    fallbackTexto: normalizarFallbackLimite(
      tieneFallbackTexto ? src.fallbackTexto : crearFallbackLimitePorDefecto()
    ),
    fallbackPaymentReader: normalizarFallbackPaymentReader(
      tieneFallbackPayment ? src.fallbackPaymentReader : crearFallbackPaymentReaderPorDefecto()
    ),
  };
}

function crearEstadoFallbackContadores() {
  return {
    texto: { usados: 0, soporteEnviado: false },
    paymentReader: { usados: 0, soporteEnviado: false },
  };
}

function leerEstadoFallbackContadores(flowContext) {
  const estado = crearEstadoFallbackContadores();
  const raw = flowContext?.iaFallbackContadores;
  if (!raw || typeof raw !== "object") return estado;

  for (const key of ["texto", "paymentReader"]) {
    const parcial = raw[key];
    if (!parcial || typeof parcial !== "object") continue;
    estado[key].usados = Math.max(0, parseInt(parcial.usados, 10) || 0);
    estado[key].soporteEnviado = !!parcial.soporteEnviado;
  }
  return estado;
}

function reiniciarContadorFallbackTexto(estado) {
  estado.texto.usados = 0;
  estado.texto.soporteEnviado = false;
}

function reiniciarContadorFallbackPayment(estado) {
  estado.paymentReader.usados = 0;
  estado.paymentReader.soporteEnviado = false;
}

function construirMensajeSoporteFallback(nombre, numero) {
  const nombreSoporte = String(nombre || "").trim() || "Soporte";
  const numeroSoporte = String(numero || "").trim();
  return (
    "No estoy pudiendo ayudarte.\n" +
    "Por favor comunícate con nuestro asesor.\n" +
    `👤 ${nombreSoporte}\n` +
    `📲 ${numeroSoporte}`
  );
}

function resolverAccionFallbackLimite({ configLimite, estadoParcial, mensajeNormal }) {
  const cfg = normalizarFallbackLimite(configLimite);
  const mensaje = String(mensajeNormal || "").trim();
  const estado = {
    usados: Math.max(0, parseInt(estadoParcial?.usados, 10) || 0),
    soporteEnviado: !!estadoParcial?.soporteEnviado,
  };

  if (cfg.ilimitado) {
    return {
      enviar: !!mensaje,
      mensaje,
      nuevoEstado: estado,
    };
  }

  if (estado.usados < cfg.maximo) {
    return {
      enviar: !!mensaje,
      mensaje,
      nuevoEstado: {
        ...estado,
        usados: estado.usados + (mensaje ? 1 : 0),
      },
    };
  }

  if (cfg.alSuperarLimite === "soporte" && !estado.soporteEnviado) {
    return {
      enviar: true,
      mensaje: construirMensajeSoporteFallback(cfg.soporteNombre, cfg.soporteNumero),
      nuevoEstado: {
        ...estado,
        soporteEnviado: true,
      },
    };
  }

  return {
    enviar: false,
    mensaje: "",
    nuevoEstado: estado,
  };
}

function aplicarEstadoFallbackAContexto(contexto, estado) {
  return {
    ...contexto,
    iaFallbackContadores: {
      texto: { ...estado.texto },
      paymentReader: { ...estado.paymentReader },
    },
  };
}

const MSG_COMPROBANTE_INVALIDO =
  "No pude validar el comprobante. Por favor envía una captura clara donde se vea el monto, moneda y nombre.";
const MSG_ARCHIVO_NO_LEGIBLE =
  "No pude leer ese archivo. Por favor envíame captura o imagen del comprobante.";

/** validating | waiting | null — OCR payment_reader por chatKey (Agente Rápido) */
const iaPaymentReaderStatusPorChat = new Map();

function getIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero) {
  if (!conexionWhatsappId) return null;
  return (
    iaPaymentReaderStatusPorChat.get(claveSesion(usuarioId, conexionWhatsappId, numero)) ??
    null
  );
}

function setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, status) {
  if (!conexionWhatsappId) return;
  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  if (status == null) {
    iaPaymentReaderStatusPorChat.delete(key);
  } else {
    iaPaymentReaderStatusPorChat.set(key, status);
  }
}

function limpiarIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero) {
  setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, null);
}

function absorberMensajeIAPaymentReaderValidating({
  usuarioId,
  conexionWhatsappId,
  numero,
  messageType = null,
  texto = "",
} = {}) {
  if (!conexionWhatsappId) return false;
  if (getIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero) !== "validating") {
    return false;
  }

  console.log(
    "[IA_PAYMENT_READER_MESSAGE_ABSORBED]",
    JSON.stringify({
      numero,
      messageType: messageType || null,
      texto: String(texto || "").slice(0, 300),
    })
  );
  return true;
}

function rutasPaymentReaderActivas(config) {
  return (config?.caminos || []).filter(
    (r) => r.enabled !== false && esCaminoPaymentReader(r)
  );
}

function esMediaComprobantePaymentReader(opts = {}) {
  const type = opts.messageType ? String(opts.messageType).trim() : null;
  return (type === "image" || type === "document") && !!opts.imageUrl;
}

function limpiarMediaEntranteContextoIA(ctx) {
  const out = { ...(ctx || {}) };
  delete out.messageType;
  delete out.imageUrl;
  delete out.imageMetaId;
  delete out.documentMetaId;
  delete out.metaToken;
  delete out.mimeType;
  delete out.filename;
  return out;
}

function limpiarStalePaymentReaderReplyIA(ctx) {
  const out = { ...(ctx || {}) };
  delete out.iaPaymentReaderReply;
  return out;
}

function respuestaPaymentReaderInvalidoIA(validacion, lectura = null) {
  const replyInvalido =
    validacion.motivo === "formato_no_soportado"
      ? MSG_ARCHIVO_NO_LEGIBLE
      : MSG_COMPROBANTE_INVALIDO;

  return {
    ok: true,
    action: "reply",
    intent: "payment_reader_invalido",
    score: 0,
    routeId: null,
    reply: replyInvalido,
    source: "ia-payment-reader",
    paymentReaderEsperando: true,
    paymentReaderMotivo: validacion.motivo || null,
    paymentReaderLectura: lectura,
  };
}

async function resolverPaymentReaderIA(config, opts = {}, chatScope = {}) {
  if (!esMediaComprobantePaymentReader(opts)) return null;

  const rutasPaymentReader = rutasPaymentReaderActivas(config);
  if (!rutasPaymentReader.length) return null;

  const { usuarioId, conexionWhatsappId, numero } = chatScope;

  console.log(
    "[IA_PAYMENT_READER_MEDIA]",
    JSON.stringify({
      messageType: opts.messageType || null,
      mimeType: opts.mimeType || null,
      filename: opts.filename || null,
      imageUrlExists: !!opts.imageUrl,
    })
  );

  console.log(
    "[IA_PAYMENT_READER_ROUTES]",
    JSON.stringify({
      total: rutasPaymentReader.length,
      routes: rutasPaymentReader.map((r) => ({
        id: r.id,
        nombre: r.nombre || null,
        payment: r.payment || null,
      })),
    })
  );

  console.log(
    "[IA_PAYMENT_READER_START]",
    JSON.stringify({
      totalRutas: rutasPaymentReader.length,
      messageType: opts.messageType || null,
      imageUrl: String(opts.imageUrl).slice(0, 120),
    })
  );

  let ocrResult;
  try {
    ocrResult = await extraerLecturaComprobanteOpenAI({
      imageUrl: opts.imageUrl,
      mimeType: opts.mimeType || null,
      filename: opts.filename || null,
      messageType: opts.messageType || null,
    });
  } catch (error) {
    setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, "waiting");
    throw error;
  }

  if (!ocrResult.valido || !ocrResult.lectura) {
    console.log(
      "[IA_PAYMENT_READER_NO_MATCH]",
      JSON.stringify({
        motivo: ocrResult.motivo || "ocr_invalido",
        lectura: ocrResult.lectura || null,
        rutasEvaluadas: 0,
      })
    );
    setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, "waiting");
    return respuestaPaymentReaderInvalidoIA(ocrResult, ocrResult.lectura || null);
  }

  const ganadora = evaluarRutasPaymentReaderContraLectura(
    rutasPaymentReader,
    ocrResult.lectura
  );

  if (ganadora) {
    const route = ganadora.route;
    setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, null);
    console.log(
      "[IA_PAYMENT_READER_MATCH]",
      JSON.stringify({
        routeId: route.id,
        routeNombre: route.nombre || null,
        orden: ganadora.orden,
        especificidad: ganadora.especificidad,
        lectura: ocrResult.lectura,
        candidatos: rutasPaymentReader.length,
      })
    );
    return {
      ok: true,
      action: "route",
      intent: route.nombre || "payment_reader",
      score: 100,
      routeId: route.id,
      reply: "",
      source: "ia-payment-reader",
      paymentReaderLectura: ocrResult.lectura,
    };
  }

  console.log(
    "[IA_PAYMENT_READER_NO_MATCH]",
    JSON.stringify({
      lectura: ocrResult.lectura,
      rutasEvaluadas: rutasPaymentReader.length,
      motivo: "ninguna_ruta_coincide",
    })
  );

  setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, "waiting");

  return respuestaPaymentReaderInvalidoIA(
    { motivo: "ninguna_ruta_coincide" },
    ocrResult.lectura
  );
}

const REGLAS_POR_DEFECTO = {
  saludo: [
    "hola",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "buen dia",
    "hey",
    "que tal",
    "qué tal",
    "saludos",
  ],
  precio: [
    "precio",
    "cuanto cuesta",
    "cuánto cuesta",
    "cuanto sale",
    "cuánto sale",
    "costo",
    "valor",
    "tarifa",
    "cotizar",
    "cotizacion",
  ],
  compra: [
    "comprar",
    "quiero comprar",
    "me interesa",
    "adquirir",
    "quiero el",
    "pagar",
    "orden",
    "pedido",
  ],
  comprobante: [
    "comprobante",
    "recibo",
    "transferencia",
    "pago hecho",
    "ya pague",
    "ya pagué",
    "voucher",
    "captura",
  ],
  soporte: [
    "ayuda",
    "soporte",
    "problema",
    "no funciona",
    "error",
    "duda",
    "asistencia",
  ],
  no_interesado: [
    "no me interesa",
    "no gracias",
    "dejen de escribir",
    "no quiero",
    "basta",
    "spam",
    "cancelar",
  ],
  reclamo: [
    "reclamo",
    "queja",
    "devolucion",
    "devolución",
    "estafa",
    "molesto",
  ],
};

const REGLAS_SCORE_DEFECTO = {
  caliente: [
    "quiero comprar",
    "compro ya",
    "urgente",
    "hoy",
    "ahora",
    "cuanto cuesta",
    "precio",
  ],
  frio: [
    "solo mirando",
    "despues",
    "después",
    "no me interesa",
    "tal vez",
    "luego",
  ],
};

const RESPUESTAS_LOCALES_DEFECTO = {
  saludo: "¡Hola{{nombre}}! Gracias por escribirnos. ¿En qué te podemos ayudar?",
  precio:
    "Gracias por tu interés. Te compartimos información de precios en breve.",
  compra: "¡Genial! Un asesor te ayudará con tu compra muy pronto.",
  soporte: "Entendemos tu consulta. Te atendemos en breve.",
  comprobante:
    "Recibimos tu mensaje. Revisaremos el comprobante y te confirmamos.",
  reclamo: "Lamentamos lo ocurrido. Un asesor revisará tu caso pronto.",
  no_interesado: "Entendido. Si cambias de opinión, aquí estamos.",
  desconocido: "",
};

function tieneOpenAI() {
  return !!OPENAI_API_KEY;
}

const CAMPOS_ROUTER_TOP_CONOCIDOS = new Set([
  "version",
  "nombreNodo",
  "scoreMinimo",
  "caminos",
  "routes",
  "comportamiento",
  "esperarRespuesta",
  "correccionOrtografica",
  "ttlHoras",
  "session",
  "fallbackTexto",
  "fallbackPaymentReader",
]);

function normalizarOpcionesSesionRouter(src) {
  const base = src && typeof src === "object" ? src : {};
  const session =
    base.session && typeof base.session === "object" ? { ...base.session } : {};
  const esperarRespuesta = base.esperarRespuesta ?? session.esperarRespuesta;
  const ttlRaw = base.ttlHoras ?? session.ttlHoras;
  let ttlHoras = null;
  if (ttlRaw != null && String(ttlRaw).trim() !== "") {
    const parsed = parseInt(ttlRaw, 10);
    ttlHoras = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return {
    esperarRespuesta: esperarRespuesta !== false,
    correccionOrtografica: base.correccionOrtografica !== false,
    ttlHoras,
    session: {
      ...session,
      esperarRespuesta: esperarRespuesta !== false,
      ttlHoras,
    },
  };
}

function preservarCamposRouterExtra(cfg) {
  const src = cfg && typeof cfg === "object" ? cfg : {};
  const extras = {};
  Object.keys(src).forEach((key) => {
    if (!CAMPOS_ROUTER_TOP_CONOCIDOS.has(key)) extras[key] = src[key];
  });
  return { ...normalizarOpcionesSesionRouter(src), ...extras };
}

function preservarCaminosExtra(cfg, normalizado) {
  const srcRoutes = Array.isArray(cfg?.caminos)
    ? cfg.caminos
    : Array.isArray(cfg?.routes)
      ? cfg.routes
      : [];
  if (!srcRoutes.length) return normalizado;

  const caminos = (normalizado.caminos || []).map((ruta) => {
    const origen =
      srcRoutes.find((r) => String(r?.id || "").trim() === String(ruta.id || "").trim()) ||
      {};
    const conocidos = new Set([
      "id",
      "nombre",
      "text",
      "name",
      "synonyms",
      "priority",
      "mediaId",
      "enabled",
    ]);
    const extras = {};
    Object.keys(origen).forEach((key) => {
      if (!conocidos.has(key)) extras[key] = origen[key];
    });
    return { ...extras, ...ruta };
  });

  return {
    ...normalizado,
    caminos,
    routes: caminos,
  };
}

function crearConfigPorDefecto() {
  return {
    version: 3,
    nombreNodo: "🤖 IA",
    scoreMinimo: 40,
    esperarRespuesta: true,
    correccionOrtografica: true,
    ttlHoras: null,
    session: {
      esperarRespuesta: true,
      ttlHoras: null,
    },
    caminos: [],
    comportamiento: {
      responderSiNoCoincide: true,
      mensajeFallback:
        "No entendí bien 😊\n¿Buscas QR, depósito o Tigo Money?",
      activarOtrosFlujos: false,
      responderConAudio: false,
    },
    fallbackTexto: crearFallbackLimitePorDefecto(),
    fallbackPaymentReader: crearFallbackPaymentReaderPorDefecto(),
    modo: "detectar_intencion",
    proveedorIA: "local",
    reglas: { ...REGLAS_POR_DEFECTO },
    reglasScore: { ...REGLAS_SCORE_DEFECTO },
    respuestasLocales: { ...RESPUESTAS_LOCALES_DEFECTO },
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

function esConfigRouterLocal(config) {
  if (!config) return false;
  if (config.version >= 3) return true;
  return Array.isArray(config.caminos);
}

function sanitizeInput(text, maxLen = MAX_INPUT_CHARS) {
  if (text == null) return "";
  let s = String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizarListaKeywords(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((k) => normalizeText(sanitizeInput(k, 120)))
    .filter(Boolean);
}

function mergeReglas(custom) {
  const base = {};
  for (const key of Object.keys(REGLAS_POR_DEFECTO)) {
    const customList = custom?.[key];
    base[key] = normalizarListaKeywords(
      Array.isArray(customList) && customList.length
        ? customList
        : REGLAS_POR_DEFECTO[key]
    );
  }
  if (custom?.reclamo) {
    base.reclamo = normalizarListaKeywords(custom.reclamo);
  }
  return base;
}

function mergeReglasScore(custom) {
  const base = {};
  for (const key of Object.keys(REGLAS_SCORE_DEFECTO)) {
    const customList = custom?.[key];
    base[key] = normalizarListaKeywords(
      Array.isArray(customList) && customList.length
        ? customList
        : REGLAS_SCORE_DEFECTO[key]
    );
  }
  return base;
}

function parseIAFromNodo(nodo) {
  const cfg = crearConfigPorDefecto();
  if (!nodo) return normalizarConfig(cfg);

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

  return normalizarConfig(cfg);
}

function normalizarConfig(cfg) {
  const config = { ...crearConfigPorDefecto(), ...(cfg || {}) };

  if (esConfigRouterLocal(config)) {
    const preservados = preservarCamposRouterExtra(config);
    const normalizado = normalizarConfigRouter(config);
    const fallbacks = normalizarFallbacksIA(cfg || {});
    return preservarCaminosExtra(config, {
      ...normalizado,
      ...preservados,
      ...fallbacks,
    });
  }

  config.nombreNodo = sanitizeInput(config.nombreNodo || "🤖 IA", 120);
  config.modo = MODOS_FASE1.has(config.modo) ? config.modo : "detectar_intencion";
  config.proveedorIA = PROVEEDORES.has(config.proveedorIA)
    ? config.proveedorIA
    : "automatico";
  config.reglas = mergeReglas(config.reglas);
  config.reglasScore = mergeReglasScore(config.reglasScore);
  config.respuestasLocales = {
    ...RESPUESTAS_LOCALES_DEFECTO,
    ...(config.respuestasLocales || {}),
  };
  config.promptSistema = sanitizeInput(config.promptSistema, 2000);
  config.instruccionesNegocio = sanitizeInput(config.instruccionesNegocio, 2000);
  config.maxCaracteres = Math.min(
    400,
    Math.max(50, parseInt(config.maxCaracteres, 10) || 400)
  );
  config.temperatura = Math.min(
    1,
    Math.max(0, parseFloat(config.temperatura) || 0.3)
  );
  config.modelo =
    sanitizeInput(config.modelo || DEFAULT_MODEL, 64) || DEFAULT_MODEL;
  config.variableResultado = sanitizeInput(config.variableResultado, 64);
  config.siFalla = config.siFalla === "detener" ? "detener" : "continuar";
  config.mensajeFallback = sanitizeInput(config.mensajeFallback, 500);

  return config;
}

function resolverProveedor(config) {
  const pref = config.proveedorIA || "automatico";
  if (pref === "local") return "local";
  if (pref === "openai") return tieneOpenAI() ? "openai" : "local";
  return tieneOpenAI() ? "openai" : "local";
}

function interpolarVariables(template, ctx) {
  if (!template) return "";
  const nombre = ctx.nombre && ctx.nombre !== ctx.telefono ? ctx.nombre : "";
  const map = {
    nombre: nombre ? ` ${nombre}` : "",
    telefono: ctx.telefono || ctx.numero || "",
    ultimo_mensaje: ctx.ultimo_mensaje || "",
    intent: ctx.intent || ctx.ai?.intent || "",
    score: ctx.score || ctx.ai?.score || "",
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? "");
}

function coincideKeyword(textoNorm, keyword) {
  if (!keyword) return false;
  if (keyword.includes(" ")) return textoNorm.includes(keyword);
  const re = new RegExp(
    `(^|[\\s,.;:!?¿¡])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s,.;:!?¿¡]|$)`
  );
  return re.test(textoNorm) || textoNorm.includes(keyword);
}

function detectarIntencionLocal(mensaje, reglas) {
  const texto = normalizeText(mensaje);
  if (!texto) return "desconocido";

  for (const intent of INTENT_PRIORITY) {
    const keywords = reglas[intent] || [];
    for (const kw of keywords) {
      if (coincideKeyword(texto, kw)) {
        return intent;
      }
    }
  }

  return "desconocido";
}

function clasificarLeadLocal(mensaje, reglasScore, intentPrevio) {
  const texto = normalizeText(mensaje);

  if (intentPrevio === "no_interesado") return "frio";
  if (intentPrevio === "compra" || intentPrevio === "comprobante") return "caliente";
  if (intentPrevio === "precio") return "caliente";

  for (const score of ["caliente", "frio"]) {
    const keywords = reglasScore[score] || [];
    for (const kw of keywords) {
      if (coincideKeyword(texto, kw)) return score;
    }
  }

  if (intentPrevio === "saludo") return "medio";
  return "medio";
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
  if (v.includes("no_interes")) return "no_interesado";
  return "desconocido";
}

function normalizarScore(valor) {
  const v = String(valor || "")
    .toLowerCase()
    .trim();
  if (SCORES_VALIDOS.has(v)) return v;
  if (v.includes("caliente") || v.includes("hot")) return "caliente";
  if (v.includes("medio") || v.includes("warm")) return "medio";
  if (v.includes("frio") || v.includes("cold")) return "frio";
  return "medio";
}

function responderAutomaticoLocal(config, ctx, intent) {
  const key = intent || ctx.intent || ctx.ai?.intent || "desconocido";
  let plantilla =
    config.respuestasLocales?.[key] ||
    config.respuestasLocales?.desconocido ||
    config.mensajeFallback;

  let respuesta = interpolarVariables(plantilla, ctx).trim();
  if (!respuesta) {
    respuesta = interpolarVariables(config.mensajeFallback, ctx).trim();
  }
  respuesta = sanitizeInput(respuesta, config.maxCaracteres);
  return respuesta;
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
      const errMsg = data?.error?.message || `OpenAI HTTP ${res.status}`;
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

async function runOpenAIMode(config, ctx) {
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
    return { tipo: "intent", valor: normalizarIntencion(raw), motor: "openai" };
  }
  if (config.modo === "clasificar_lead") {
    return { tipo: "score", valor: normalizarScore(raw), motor: "openai" };
  }

  let respuesta = sanitizeInput(raw, config.maxCaracteres);
  return { tipo: "reply", valor: respuesta, motor: "openai" };
}

function runLocalMode(config, ctx) {
  const mensaje = ctx.ultimo_mensaje || "";

  if (config.modo === "detectar_intencion") {
    return {
      tipo: "intent",
      valor: detectarIntencionLocal(mensaje, config.reglas),
      motor: "local",
    };
  }

  if (config.modo === "clasificar_lead") {
    const intentPrevio =
      ctx.intent || ctx.ai?.intent || detectarIntencionLocal(mensaje, config.reglas);
    return {
      tipo: "score",
      valor: clasificarLeadLocal(mensaje, config.reglasScore, intentPrevio),
      motor: "local",
    };
  }

  const intent =
    ctx.intent ||
    ctx.ai?.intent ||
    detectarIntencionLocal(mensaje, config.reglas);
  const respuesta = responderAutomaticoLocal(config, ctx, intent);
  return { tipo: "reply", valor: respuesta, motor: "local" };
}

function fallbackResultado(config, ctx) {
  if (config.modo === "detectar_intencion") {
    const local = detectarIntencionLocal(ctx.ultimo_mensaje, config.reglas);
    return {
      tipo: "intent",
      valor: local !== "desconocido" ? local : "desconocido",
      motor: "fallback",
    };
  }
  if (config.modo === "clasificar_lead") {
    return { tipo: "score", valor: "medio", motor: "fallback" };
  }
  const texto = interpolarVariables(config.mensajeFallback, ctx).trim();
  return {
    tipo: "reply",
    valor: sanitizeInput(texto, config.maxCaracteres),
    motor: "fallback",
  };
}

async function ejecutarModoIA(config, ctx) {
  const proveedor = resolverProveedor(config);
  const intentos = [];

  const usarOpenAI =
    (config.proveedorIA === "openai" || config.proveedorIA === "automatico") &&
    tieneOpenAI();

  if (usarOpenAI) intentos.push("openai");
  intentos.push("local");

  console.log("[IA] modo:", config.modo, "| proveedor:", proveedor, "| intentos:", intentos.join("→"));

  let ultimoError = null;

  for (const motor of intentos) {
    try {
      let resultado;
      if (motor === "openai") {
        resultado = await runOpenAIMode(config, ctx);
      } else {
        resultado = runLocalMode(config, ctx);
      }

      if (resultado.tipo === "intent" && config.modo === "detectar_intencion") {
        ctx.intent = resultado.valor;
      }
      if (resultado.tipo === "score" && config.modo === "clasificar_lead") {
        ctx.score = resultado.valor;
      }

      console.log("[IA] resultado:", resultado.valor, "| motor:", resultado.motor);
      return {
        ok: true,
        resultado,
        proveedor: proveedor,
        motor: resultado.motor,
      };
    } catch (err) {
      ultimoError = err;
      console.log("[IA] error (" + motor + "):", err.message);
    }
  }

  const resultado = fallbackResultado(config, ctx);
  console.log("[IA] resultado:", resultado.valor, "| motor: fallback");
  return {
    ok: false,
    resultado,
    proveedor,
    motor: "fallback",
    error: ultimoError?.message,
  };
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

  flowContext.ai.motor = resultado.motor || "local";
  flowContext.ai.proveedor = config.proveedorIA || "automatico";
}

function respuestaIARapidaPorMensaje(mensajeLead) {
  const m = normalizeText(mensajeLead);
  if (!m) return "";
  if (
    m.includes("precio") ||
    m.includes("cuanto") ||
    m.includes("cuesta") ||
    m.includes("valor")
  ) {
    return "Claro 😊 te paso la información del precio.";
  }
  if (m.includes("hola") || m.includes("buenas") || m.includes("info")) {
    return "Hola 😊 claro, te paso más información.";
  }
  if (m.includes("comprar") || m.includes("quiero") || m.includes("me interesa")) {
    return "Perfecto 😊 te ayudo con tu compra.";
  }
  if (m.includes("pague") || m.includes("pagué") || m.includes("comprobante")) {
    return "Gracias 😊 envíame tu comprobante para verificarlo.";
  }
  return "Entiendo 😊 te ayudo con la información.";
}

function resolverTextoRespuestaIA(config, ctx, resultado) {
  if (config.modo === "responder_automatico" && resultado?.tipo === "reply") {
    return resultado.valor || "";
  }

  if (config.modo === "detectar_intencion" && resultado?.tipo === "intent") {
    const intent = resultado.valor || "desconocido";
    ctx.intent = intent;
    let texto = responderAutomaticoLocal(config, ctx, intent);
    if (!texto) {
      texto = respuestaIARapidaPorMensaje(ctx.ultimo_mensaje);
    }
    return texto;
  }

  if (config.modo === "clasificar_lead" && resultado?.tipo === "score") {
    ctx.score = resultado.valor;
    const intent =
      ctx.intent || ctx.ai?.intent || detectarIntencionLocal(ctx.ultimo_mensaje, config.reglas);
    let texto = responderAutomaticoLocal(config, ctx, intent);
    if (!texto) {
      texto = respuestaIARapidaPorMensaje(ctx.ultimo_mensaje);
    }
    return texto;
  }

  return "";
}

async function resolverAnalisisRouter(config, mensajeLead, memoria) {
  if (usePythonAi()) {
    const routes = buildRoutesFromConfig(config);
    console.log(
      "🐍 USE_PYTHON_AI activo — rutas:",
      routes.length,
      "| endpoint:",
      resolveDetectIntentEndpoint()
    );

    if (routes.length) {
      try {
        const context =
          memoria?.ultimaPregunta ||
          memoria?.ultimoMensajeBot ||
          memoria?.ultimaSalidaBot ||
          "";
        const py = await detectarIntentPython({
          message: mensajeLead,
          context,
          routes,
          threshold: config.scoreMinimo || 40,
        });
        const analisis = mapPythonToAnalisis(py);
        console.log("🐍 Detección vía Python OK:", analisis.intent, analisis.score, analisis.routeId);
        return analisis;
      } catch (error) {
        console.log("🐍 Python falló, usando fallback JS:", error.message);
      }
    } else {
      console.log("🐍 Python omitido: config sin caminos/rutas válidos");
    }
  }

  return analizarRutaLocal(config, mensajeLead, memoria);
}

function opcionesEnvioIA(contexto, usuarioId) {
  const conexionWhatsappId =
    contexto?.conexionWhatsappId != null &&
    String(contexto.conexionWhatsappId).trim() !== ""
      ? String(contexto.conexionWhatsappId).trim()
      : null;
  if (!conexionWhatsappId || !usuarioId) return null;
  return {
    usuarioId,
    conexionWhatsappId,
    strictConexionWhatsappId: true,
  };
}

async function ejecutarNodoIARouter(nodo, contexto, opts = {}) {
  const numero = contexto?.numero || contexto?.from || contexto?.telefono;
  const usuarioId = contexto?.usuarioId || null;
  const conexionWhatsappId = contexto?.conexionWhatsappId || null;
  const config = parseIAFromNodo(nodo);
  const chatScope = { usuarioId, conexionWhatsappId, numero };
  let fallbackEstado = leerEstadoFallbackContadores(contexto);

  if (!opts.resume) {
    const esperandoPaymentReader = rutasPaymentReaderActivas(config).length > 0;
    console.log("🤖 IA LOCAL — modo silencioso: esperando respuesta del lead");
    return limpiarMediaEntranteContextoIA(
      aplicarEstadoFallbackAContexto(
        limpiarStalePaymentReaderReplyIA({
          ...contexto,
          iaPausar: true,
          iaEjecutada: false,
          ...(esperandoPaymentReader ? { iaPaymentReaderEsperando: true } : {}),
        }),
        fallbackEstado
      )
    );
  }

  const mensajeLead = sanitizeInput(
    contexto?.mensaje ||
      contexto?.texto ||
      contexto?.body ||
      contexto?.ultimo_mensaje ||
      contexto?.ultimoMensaje ||
      "",
    2000
  );

  if (
    absorberMensajeIAPaymentReaderValidating({
      usuarioId,
      conexionWhatsappId,
      numero,
      messageType: opts.messageType || null,
      texto: mensajeLead,
    })
  ) {
    return limpiarMediaEntranteContextoIA(
      aplicarEstadoFallbackAContexto(
        limpiarStalePaymentReaderReplyIA({
          ...contexto,
          iaPausar: true,
          iaPaymentReaderEsperando: true,
          iaEjecutada: false,
        }),
        fallbackEstado
      )
    );
  }

  const imagenPaymentReader =
    esMediaComprobantePaymentReader(opts) && rutasPaymentReaderActivas(config).length > 0;

  if (imagenPaymentReader) {
    setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, "validating");
  }

  let resultadoPayment = null;
  try {
    resultadoPayment = await resolverPaymentReaderIA(config, opts, chatScope);
  } catch (error) {
    if (getIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero) === "validating") {
      setIAPaymentReaderStatus(usuarioId, conexionWhatsappId, numero, "waiting");
    }
    throw error;
  }

  if (resultadoPayment?.action === "route" && resultadoPayment.routeId) {
    reiniciarContadorFallbackPayment(fallbackEstado);
    return limpiarMediaEntranteContextoIA(
      aplicarEstadoFallbackAContexto(
        limpiarStalePaymentReaderReplyIA({
          ...contexto,
          iaPausar: false,
          iaRouteId: resultadoPayment.routeId,
          iaEjecutada: true,
          intent: resultadoPayment.intent,
          score: resultadoPayment.score,
          route: resultadoPayment.routeId,
          iaPaymentReaderEsperando: false,
        }),
        fallbackEstado
      )
    );
  }

  if (resultadoPayment?.action === "reply") {
    const configPayment = normalizarFallbackPaymentReader(config.fallbackPaymentReader);
    const mensajeResuelto = resolverMensajeFallbackPaymentReaderIA({
      configPayment: configPayment,
      mensajeSistema: resultadoPayment.reply,
      contexto,
    });

    if (!mensajeResuelto.activo) {
      console.log(
        "[IA_PAYMENT_READER_WAITING]",
        JSON.stringify({
          rutasEvaluadas: rutasPaymentReaderActivas(config).length,
          motivo: resultadoPayment.paymentReaderMotivo || null,
          fallbackEnviar: false,
          fallbackDesactivado: true,
          fallbackUsados: fallbackEstado.paymentReader.usados,
        })
      );

      return limpiarMediaEntranteContextoIA(
        aplicarEstadoFallbackAContexto(
          limpiarStalePaymentReaderReplyIA({
            ...contexto,
            iaPausar: true,
            iaPaymentReaderEsperando: true,
            iaEjecutada: true,
            intent: resultadoPayment.intent || "payment_reader_invalido",
            score: resultadoPayment.score,
          }),
          fallbackEstado
        )
      );
    }

    const accionPayment = resolverAccionFallbackLimite({
      configLimite: configPayment,
      estadoParcial: fallbackEstado.paymentReader,
      mensajeNormal: mensajeResuelto.mensaje,
    });
    fallbackEstado.paymentReader = accionPayment.nuevoEstado;

    console.log(
      "[IA_PAYMENT_READER_WAITING]",
      JSON.stringify({
        rutasEvaluadas: rutasPaymentReaderActivas(config).length,
        motivo: resultadoPayment.paymentReaderMotivo || null,
        fallbackEnviar: accionPayment.enviar,
        fallbackUsados: fallbackEstado.paymentReader.usados,
        fallbackIlimitado: config.fallbackPaymentReader?.ilimitado === true,
        fallbackMaximo: config.fallbackPaymentReader?.maximo ?? null,
      })
    );

    const salidaPayment = aplicarEstadoFallbackAContexto(
      limpiarStalePaymentReaderReplyIA({
        ...contexto,
        iaPausar: true,
        iaPaymentReaderEsperando: true,
        iaEjecutada: true,
        intent: resultadoPayment.intent || "payment_reader_invalido",
        score: resultadoPayment.score,
      }),
      fallbackEstado
    );

    if (accionPayment.enviar && accionPayment.mensaje) {
      salidaPayment.iaPaymentReaderReply = accionPayment.mensaje;
    }

    return limpiarMediaEntranteContextoIA(salidaPayment);
  }

  delete contexto.iaPaymentReaderReply;

  const memoria = contexto.memoriaIA || {
    ultimoMensajeBot: contexto.ultimaSalidaBot || "",
    ultimaPregunta: contexto.ultimaSalidaBot || "",
    ultimoNodo: contexto.ultimoNodoContenido || "",
  };

  const analisis = await resolverAnalisisRouter(config, mensajeLead, memoria);

  contexto.intent = analisis.intent || "";
  contexto.score = analisis.score ?? "";
  contexto.route = analisis.route || "";
  contexto.ultimo_mensaje = mensajeLead;

  if (!analisis.matched) {
    const tieneRutasTextoActivas = config.caminos.some(
      (c) => c.enabled !== false && !esCaminoPaymentReader(c)
    );

    if (contexto.iaPaymentReaderEsperando && !tieneRutasTextoActivas) {
      return limpiarMediaEntranteContextoIA(
        aplicarEstadoFallbackAContexto(
          limpiarStalePaymentReaderReplyIA({
            ...contexto,
            iaPausar: true,
            iaPaymentReaderEsperando: true,
            iaEjecutada: true,
            intent: contexto.intent,
            score: contexto.score,
          }),
          fallbackEstado
        )
      );
    }

    if (config.comportamiento.activarOtrosFlujos && contexto._buscarActivadores) {
      const activado = await contexto._buscarActivadores();
      if (activado) {
        return aplicarEstadoFallbackAContexto(
          limpiarStalePaymentReaderReplyIA({
            ...contexto,
            iaPausar: false,
            iaActivadorGlobal: true,
            iaEjecutada: true,
          }),
          fallbackEstado
        );
      }
    }

    if (config.comportamiento.responderSiNoCoincide) {
      const fb = interpolarVariables(config.comportamiento.mensajeFallback, contexto).trim();
      const accionTexto = resolverAccionFallbackLimite({
        configLimite: config.fallbackTexto,
        estadoParcial: fallbackEstado.texto,
        mensajeNormal: fb,
      });
      fallbackEstado.texto = accionTexto.nuevoEstado;

      const opEnvio = opcionesEnvioIA(contexto, usuarioId);
      if (accionTexto.enviar && accionTexto.mensaje && numero && opEnvio) {
        await enviarTextoWhatsApp(numero, accionTexto.mensaje, opEnvio);
        contexto.ultimaRespuestaIA = accionTexto.mensaje;
      } else if (accionTexto.enviar && accionTexto.mensaje && numero && !opEnvio) {
        console.log("[IA_MULTI] envío omitido sin conexionWhatsappId", {
          numero,
          usuarioId,
        });
      }

      return aplicarEstadoFallbackAContexto(
        limpiarStalePaymentReaderReplyIA({
          ...contexto,
          iaPausar: true,
          iaFallback: accionTexto.enviar,
          iaEjecutada: true,
          intent: contexto.intent,
          score: contexto.score,
        }),
        fallbackEstado
      );
    }

    // Interruptor OFF: no enviar fallback, pero seguir esperando (igual que payment).
    return aplicarEstadoFallbackAContexto(
      limpiarStalePaymentReaderReplyIA({
        ...contexto,
        iaPausar: true,
        iaSinCoincidencia: true,
        iaEjecutada: true,
      }),
      fallbackEstado
    );
  }

  reiniciarContadorFallbackTexto(fallbackEstado);
  return limpiarMediaEntranteContextoIA(
    aplicarEstadoFallbackAContexto(
      limpiarStalePaymentReaderReplyIA({
        ...contexto,
        iaPausar: false,
        iaRouteId: analisis.routeId,
        iaEjecutada: true,
        intent: analisis.intent,
        score: analisis.score,
        route: analisis.route,
        iaPaymentReaderEsperando: false,
      }),
      fallbackEstado
    )
  );
}

async function ejecutarNodoIA(nodo, contexto, opts = {}) {
  const config = parseIAFromNodo(nodo);

  if (esConfigRouterLocal(config)) {
    return ejecutarNodoIARouter(nodo, contexto, opts);
  }

  const numero = contexto?.numero || contexto?.from || contexto?.telefono;
  const usuarioId = contexto?.usuarioId || null;

  console.log("🤖✅ NODO IA EJECUTADO (legacy)");

  const mensajeLead = String(
    contexto?.mensaje ||
      contexto?.texto ||
      contexto?.body ||
      contexto?.ultimo_mensaje ||
      contexto?.ultimoMensaje ||
      ""
  )
    .toLowerCase()
    .trim();

  const result = await ejecutarIANodo({
    numero,
    nodo,
    usuarioId,
    flowContext: {
      ...contexto,
      numero,
      telefono: numero,
      ultimo_mensaje: mensajeLead || contexto?.ultimo_mensaje || "",
    },
  });

  return {
    ...contexto,
    ultimaRespuestaIA: result.respuestaEnviada || "",
    iaEjecutada: true,
    intent: result.intent || contexto?.intent,
    score: result.score || contexto?.score,
  };
}

async function ejecutarIANodo({ numero, nodo, usuarioId, flowContext }) {
  const config = parseIAFromNodo(nodo);
  const ctx = flowContext || {
    numero,
    telefono: numero,
    nombre: "",
    ultimo_mensaje: "",
    intent: "",
    score: "",
    ai: {},
  };

  if (!ctx.ultimo_mensaje && ctx.ultimoMensaje) {
    ctx.ultimo_mensaje = ctx.ultimoMensaje;
  }

  try {
    const ejec = await ejecutarModoIA(config, ctx);
    guardarResultadoEnContexto(ctx, config, ejec.resultado);

    let textoEnviar = resolverTextoRespuestaIA(config, ctx, ejec.resultado);
    if (!textoEnviar?.trim()) {
      textoEnviar = interpolarVariables(config.mensajeFallback, ctx).trim();
    }
    if (!textoEnviar?.trim()) {
      textoEnviar = respuestaIARapidaPorMensaje(ctx.ultimo_mensaje);
    }

    console.log("🤖 Respuesta IA generada:", textoEnviar);

    let respuestaEnviada = "";
    const opEnvio = opcionesEnvioIA(ctx, usuarioId);
    if (textoEnviar && numero && opEnvio) {
      await enviarTextoWhatsApp(numero, textoEnviar, opEnvio);
      respuestaEnviada = textoEnviar;
      console.log("✅ IA respondió por WhatsApp");
    } else if (textoEnviar && numero && !opEnvio) {
      console.log("[IA_MULTI] envío omitido sin conexionWhatsappId", {
        numero,
        usuarioId,
      });
    } else if (!numero) {
      console.error("❌ IA no puede responder porque no hay número:", ctx);
    }

    if (!ejec.ok && config.siFalla === "detener") {
      return {
        ok: false,
        continuar: false,
        error: ejec.error,
        respuestaEnviada,
        intent: ctx.intent,
        score: ctx.score,
      };
    }

    return {
      ok: ejec.ok,
      continuar: true,
      resultado: ejec.resultado,
      motor: ejec.motor,
      respuestaEnviada,
      intent: ctx.intent,
      score: ctx.score,
    };
  } catch (err) {
    console.log("[IA] error fatal:", err.message);
    const fb = fallbackResultado(config, ctx);
    guardarResultadoEnContexto(ctx, config, fb);

    let textoEnviar = resolverTextoRespuestaIA(config, ctx, fb);
    if (!textoEnviar?.trim()) {
      textoEnviar = interpolarVariables(config.mensajeFallback, ctx).trim();
    }
    if (!textoEnviar?.trim()) {
      textoEnviar = respuestaIARapidaPorMensaje(ctx.ultimo_mensaje);
    }

    console.log("🤖 Respuesta IA generada (fallback):", textoEnviar);

    let respuestaEnviada = "";
    const opEnvioFb = opcionesEnvioIA(ctx, usuarioId);
    if (textoEnviar && numero && opEnvioFb) {
      try {
        await enviarTextoWhatsApp(numero, textoEnviar, opEnvioFb);
        respuestaEnviada = textoEnviar;
        console.log("✅ IA respondió por WhatsApp (fallback)");
      } catch (sendErr) {
        console.log("[IA] error enviando fallback:", sendErr.message);
      }
    } else if (textoEnviar && numero && !opEnvioFb) {
      console.log("[IA_MULTI] envío omitido sin conexionWhatsappId", {
        numero,
        usuarioId,
      });
    }

    if (config.siFalla === "detener") {
      return {
        ok: false,
        continuar: false,
        error: err.message,
        respuestaEnviada,
      };
    }
    return {
      ok: false,
      continuar: true,
      error: err.message,
      respuestaEnviada,
    };
  }
}

async function runAI(body = {}) {
  const config = normalizarConfig({
    ...crearConfigPorDefecto(),
    ...(body.config || body),
  });

  const ctx = {
    nombre: sanitizeInput(body.nombre, 200),
    telefono: sanitizeInput(body.telefono, 32),
    ultimo_mensaje: sanitizeInput(body.ultimo_mensaje || body.mensaje, 2000),
    intent: sanitizeInput(body.intent, 64),
    score: sanitizeInput(body.score, 32),
    ai: {},
    memoriaIA: body.memoriaIA || body.memoria || {},
    ultimaSalidaBot: body.ultimaSalidaBot || "",
  };

  if (esConfigRouterLocal(config)) {
    const analisis = await resolverAnalisisRouter(
      config,
      ctx.ultimo_mensaje,
      ctx.memoriaIA
    );
    ctx.intent = analisis.intent;
    ctx.score = analisis.score;
    ctx.route = analisis.route;

    const motorPython = analisis.source === "python";

    return {
      ok: true,
      modo: "router_local",
      proveedor: motorPython ? "python" : "local",
      motor: motorPython ? "python" : "local",
      resultado: analisis.intent || "sin_coincidencia",
      tipo: analisis.matched ? "route" : "fallback",
      context: {
        intent: ctx.intent,
        score: ctx.score,
        route: ctx.route,
        ranking: analisis.ranking,
        ai: ctx.ai,
        source: analisis.source || "local",
      },
      error: null,
    };
  }

  const ejec = await ejecutarModoIA(config, ctx);
  guardarResultadoEnContexto(ctx, config, ejec.resultado);

  return {
    ok: ejec.ok,
    modo: config.modo,
    proveedor: resolverProveedor(config),
    motor: ejec.motor,
    resultado: ejec.resultado.valor,
    tipo: ejec.resultado.tipo,
    context: {
      intent: ctx.intent,
      score: ctx.score,
      ai: ctx.ai,
    },
    error: ejec.error || null,
  };
}

async function testIALocal(body = {}) {
  return runAI(body);
}

function getIAStatus() {
  return {
    ok: true,
    openaiDisponible: tieneOpenAI(),
    proveedorSugerido: tieneOpenAI() ? "openai" : "local",
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
      const conexionWhatsappId = flowContext?.conexionWhatsappId || null;
      if (conexionWhatsappId) {
        const msgUrl =
          `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${usuarioId}` +
          `&cliente_numero=eq.${encodeURIComponent(numero)}` +
          `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}` +
          `&direccion=eq.entrante&select=contenido&order=creado_en.desc&limit=1`;
        const resMsg = await axios.get(msgUrl, { headers, timeout: 8000 });
        const msg = resMsg.data?.[0];
        if (msg?.contenido) flowContext.ultimo_mensaje = msg.contenido;
      }
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
  normalizarConfig,
  esConfigRouterLocal,
  ejecutarIANodo,
  ejecutarNodoIA,
  ejecutarNodoIARouter,
  absorberMensajeIAPaymentReaderValidating,
  limpiarIAPaymentReaderStatus,
  getIAPaymentReaderStatus,
  normalizarFallbackLimite,
  normalizarFallbackPaymentReader,
  resolverMensajeFallbackPaymentReaderIA,
  resolverAccionFallbackLimite,
  leerEstadoFallbackContadores,
  reiniciarContadorFallbackTexto,
  reiniciarContadorFallbackPayment,
  crearFallbackLimitePorDefecto,
  crearFallbackPaymentReaderPorDefecto,
  FALLBACK_LIMITE_MIN,
  FALLBACK_LIMITE_MAX,
  runAI,
  testIALocal,
  getIAStatus,
  detectarIntencionLocal,
  enriquecerContextoFlujo,
  interpolarVariables,
  sanitizeInput,
  tieneOpenAI,
  resolverProveedor,
  MODOS_FASE1,
  REGLAS_POR_DEFECTO,
};
