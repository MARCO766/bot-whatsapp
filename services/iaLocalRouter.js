/**
 * MacBot — IA local ultra: normalización, corrección, scoring y rutas.
 */

const {
  esCaminoPaymentReader,
  normalizarPaymentCamino,
  normalizarTipoCamino,
} = require("./openaiCaminoMatcher");

const CORRECCIONES = {
  presio: "precio",
  presios: "precios",
  kiero: "quiero",
  qiero: "quiero",
  quiero: "quiero",
  cuantoo: "cuanto",
  cuanto: "cuanto",
  depositoo: "deposito",
  deposito: "deposito",
  triger: "tigo",
  tigo: "tigo",
  tranferencia: "transferencia",
  transferecia: "transferencia",
  banco: "banco",
  qr: "qr",
};

const CONTEXT_HINTS = {
  metodo_pago: ["pago", "pagar", "metodo", "metodo de pago", "forma de pago", "como pago"],
  banco: ["banco", "cuenta", "deposito", "transferencia"],
  qr: ["qr", "codigo", "escanear"],
  tigo: ["tigo", "billetera", "wallet"],
};

/** Sinónimos extra por tipo de camino (pago / QR / depósito). */
const SINONIMOS_CAMINO_AUTO = {
  qr: [
    "qr",
    "codigo qr",
    "codigo",
    "quiero qr",
    "mandame qr",
    "manda qr",
    "pagar qr",
    "pago qr",
    "qr pago",
    "escanear qr",
    "cuadrito",
    "cuadro",
  ],
  deposito: [
    "deposito",
    "depositar",
    "quiero deposito",
    "hacer deposito",
    "deposito bancario",
    "por deposito",
    "por transferencia",
    "numero de cuenta",
    "cuenta bancaria",
    "datos bancarios",
    "banco",
    "bancario",
    "transferencia",
    "transferir",
  ],
  transferencia: [
    "transferencia",
    "transferir",
    "quiero transferir",
    "por transferencia",
    "numero de cuenta",
    "banco",
    "bancario",
  ],
  pago: ["pago", "pagar", "quiero pagar", "como pago", "formas de pago", "metodo de pago"],
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function corregirTexto(textoNorm) {
  if (!textoNorm) return "";
  return textoNorm
    .split(" ")
    .map((palabra) => CORRECCIONES[palabra] || palabra)
    .join(" ");
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KEYWORDS_FAMILIA_DEPOSITO = [
  "deposito",
  "transferencia",
  "banco",
  "bancario",
  "cuenta",
];
const KEYWORDS_FAMILIA_QR = ["qr", "codigo", "escanear"];

function familiaCamino(route) {
  const blob = `${normalizeText(route.nombre || route.text || route.name || "")} ${normalizeText(route.id || "")}`;
  if (/deposito|banco|transferencia|cuenta|bancario/.test(blob)) return "deposito";
  if (/qr|codigo|escanear/.test(blob)) return "qr";
  if (/tigo|wallet|billetera/.test(blob)) return "tigo";
  return "other";
}

function detectarFamiliaPagoMensaje(texto) {
  if (!texto) return null;

  const tieneDeposito = KEYWORDS_FAMILIA_DEPOSITO.some((k) => {
    if (k === "cuenta") {
      return /\b(cuenta|cuenta bancaria|numero de cuenta)\b/.test(texto);
    }
    return textoContieneFrase(texto, k) || texto.includes(k);
  });

  const tieneQr =
    textoContieneFrase(texto, "qr") ||
    texto.includes("qr") ||
    /\bcodigo qr\b/.test(texto) ||
    /\bqr pago\b/.test(texto) ||
    (/\bcodigo\b/.test(texto) && !tieneDeposito);

  if (tieneDeposito) return "deposito";
  if (tieneQr) return "qr";
  return null;
}

function sinonimosAutomaticosCamino(route) {
  const extras = [];
  const nombre = normalizeText(route.nombre || route.text || route.name || "");
  const id = normalizeText(route.id || "");
  const blob = `${nombre} ${id}`;
  const fam = familiaCamino(route);

  if (fam === "deposito" || /deposito|banco|transferencia|cuenta|bancario/.test(blob)) {
    extras.push(...SINONIMOS_CAMINO_AUTO.deposito, ...SINONIMOS_CAMINO_AUTO.transferencia);
  }
  if (fam === "qr" || /qr|codigo/.test(blob)) {
    extras.push(...SINONIMOS_CAMINO_AUTO.qr);
  }

  Object.keys(SINONIMOS_CAMINO_AUTO).forEach((clave) => {
    if (blob.includes(clave)) {
      extras.push(...SINONIMOS_CAMINO_AUTO[clave]);
    }
  });

  return extras;
}

function tokensDeRuta(route) {
  const lista = [];
  const nombre = normalizeText(route.nombre || route.text || route.name || "");
  if (nombre) lista.push(nombre);
  const syns = Array.isArray(route.synonyms) ? route.synonyms : [];
  syns.forEach((s) => {
    const t = normalizeText(s);
    if (t) lista.push(t);
  });
  sinonimosAutomaticosCamino(route).forEach((s) => {
    const t = normalizeText(s);
    if (t) lista.push(t);
  });
  return [...new Set(lista)];
}

function textoContieneFrase(texto, frase) {
  if (!frase || !texto) return false;
  if (texto === frase) return true;
  if (frase.includes(" ")) return texto.includes(frase);
  const re = new RegExp(`(^|\\s)${escapeRegExp(frase)}(\\s|$)`);
  return re.test(texto);
}

function scoreFraseEnTexto(texto, frase) {
  if (!frase || !texto) return 0;
  if (texto === frase) return 50;
  if (textoContieneFrase(texto, frase)) {
    if (frase.includes(" ")) return 45;
    return 42;
  }
  if (texto.includes(frase)) {
    if (frase.includes(" ")) return 38;
    return 35;
  }
  const palabras = frase.split(" ").filter(Boolean);
  if (palabras.length > 1) {
    const hits = palabras.filter((p) => textoContieneFrase(texto, p) || texto.includes(p)).length;
    if (hits === palabras.length) return 32;
    if (hits > 0) return Math.round((hits / palabras.length) * 22);
  }
  return 0;
}

function scoreContexto(texto, memoria, route) {
  let bonus = 0;
  const pregunta = normalizeText(memoria?.ultimaPregunta || memoria?.ultimoMensajeBot || "");
  if (!pregunta) return 0;

  const famRuta = familiaCamino(route);
  const esPago =
    CONTEXT_HINTS.metodo_pago.some((h) => pregunta.includes(h)) ||
    pregunta.includes("metodo") ||
    pregunta.includes("pago");

  if (esPago) {
    if (CONTEXT_HINTS.banco.some((h) => texto.includes(h)) && famRuta === "deposito") {
      bonus += 20;
    }
    if (CONTEXT_HINTS.qr.some((h) => texto.includes(h)) && famRuta === "qr") {
      bonus += 20;
    }
    if (CONTEXT_HINTS.tigo.some((h) => texto.includes(h)) && famRuta === "tigo") {
      bonus += 20;
    }
    if (texto.includes("banco") && pregunta.includes("banco") && famRuta === "deposito") {
      bonus += 15;
    }
  }

  return bonus;
}

function scoreRuta(texto, route, memoria, familiaMsg) {
  if (route.enabled === false) return 0;

  let score = 0;
  const frases = tokensDeRuta(route);
  const famRuta = familiaCamino(route);

  frases.forEach((frase) => {
    score += scoreFraseEnTexto(texto, frase);
  });

  score += scoreContexto(texto, memoria, route);

  if (familiaMsg) {
    if (famRuta === familiaMsg) score += 40;
    else if (famRuta === "qr" && familiaMsg === "deposito") score -= 30;
    else if (famRuta === "deposito" && familiaMsg === "qr") score -= 30;
  }

  const prioridad = Math.min(100, Math.max(0, parseInt(route.priority, 10) || 0));
  score += Math.round(prioridad * 0.1);

  return Math.min(100, Math.max(0, score));
}

function normalizarConfigRouter(cfg) {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const caminos = Array.isArray(base.caminos) ? base.caminos : [];

  return {
    version: base.version || 3,
    nombreNodo: base.nombreNodo || "🤖 IA",
    scoreMinimo: Math.min(100, Math.max(0, parseInt(base.scoreMinimo, 10) || 40)),
    caminos: caminos
      .map((r) => ({
        id: String(r.id || "").trim(),
        nombre: String(r.nombre || r.text || r.name || "").trim(),
        type: normalizarTipoCamino(r.type),
        payment: normalizarPaymentCamino(r),
        synonyms: Array.isArray(r.synonyms)
          ? r.synonyms.map((s) => String(s || "").trim()).filter(Boolean)
          : String(r.synonyms || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
        priority: parseInt(r.priority, 10) || 50,
        mediaId: String(r.mediaId || "").trim(),
        enabled: r.enabled !== false,
      }))
      .filter((r) => r.id && r.nombre),
    comportamiento: {
      responderSiNoCoincide: base.comportamiento?.responderSiNoCoincide !== false,
      mensajeFallback:
        String(
          base.comportamiento?.mensajeFallback ||
            base.mensajeFallback ||
            "No entendí bien 😊\n¿Podrías decirme con más detalle qué opción prefieres?"
        ).trim(),
      activarOtrosFlujos: !!base.comportamiento?.activarOtrosFlujos,
      responderConAudio: !!base.comportamiento?.responderConAudio,
    },
  };
}

function analizarRutaLocal(config, mensaje, memoria = {}) {
  console.log("🤖 IA LOCAL ULTRA START");

  const cfg = normalizarConfigRouter(config);
  const raw = String(mensaje || "");
  const normalizado = normalizeText(raw);
  const corregido = corregirTexto(normalizado);

  console.log("🧹 TEXTO NORMALIZADO:", normalizado);
  console.log("🪄 TEXTO CORREGIDO:", corregido);
  const familiaMsg = detectarFamiliaPagoMensaje(corregido);

  console.log("[IA PATH DEBUG] mensaje:", raw);
  console.log("[IA PATH DEBUG] caminos disponibles:", cfg.caminos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    familia: familiaCamino(c),
  })));
  console.log("[IA PATH DEBUG] familia pago detectada:", familiaMsg || "(ninguna)");

  const caminosTexto = cfg.caminos.filter(
    (c) => c.enabled !== false && !esCaminoPaymentReader(c)
  );

  const ranking = caminosTexto
    .map((route) => ({
      id: route.id,
      nombre: route.nombre,
      familia: familiaCamino(route),
      score: scoreRuta(corregido, route, memoria, familiaMsg),
      priority: route.priority,
    }))
    .sort((a, b) => {
      if (familiaMsg) {
        const aMatch = a.familia === familiaMsg ? 1 : 0;
        const bMatch = b.familia === familiaMsg ? 1 : 0;
        if (bMatch !== aMatch) return bMatch - aMatch;
      }
      return b.score - a.score || b.priority - a.priority;
    });

  console.log("🎯 SCORE:", ranking);

  const winner = ranking[0] && ranking[0].score >= cfg.scoreMinimo ? ranking[0] : null;

  console.log("[IA PATH DEBUG] camino detectado:", winner?.id || null, "|", winner?.nombre || null);
  console.log("[IA PATH DEBUG] score:", winner?.score ?? ranking[0]?.score ?? 0);

  console.log("[IA PATH MATCH]", {
    mensaje: raw,
    textoCorregido: corregido,
    caminoDetectado: winner?.id || null,
    nombreCamino: winner?.nombre || null,
    score: winner?.score ?? ranking[0]?.score ?? 0,
    scoreMinimo: cfg.scoreMinimo,
    matched: !!winner,
    ranking: ranking.slice(0, 5),
  });

  if (winner) {
    console.log("🏆 GANADOR:", winner);
    console.log("📊 SCORE FINAL:", winner.score);
    console.log("🔀 ROUTE HANDLE:", winner.id);
    console.log("▶️ CONTINUANDO FLUJO");

    return {
      ok: true,
      matched: true,
      intent: winner.nombre,
      score: winner.score,
      route: winner.id,
      routeId: winner.id,
      ranking,
      textoNormalizado: normalizado,
      textoCorregido: corregido,
    };
  }

  console.log("🏆 GANADOR:", null);
  console.log("📊 SCORE FINAL:", ranking[0]?.score || 0);

  return {
    ok: true,
    matched: false,
    intent: "",
    score: ranking[0]?.score || 0,
    route: "",
    routeId: null,
    ranking,
    textoNormalizado: normalizado,
    textoCorregido: corregido,
  };
}

module.exports = {
  normalizeText,
  corregirTexto,
  normalizarConfigRouter,
  analizarRutaLocal,
  scoreRuta,
};
