/**
 * MacBot — IA local ultra: normalización, corrección, scoring y rutas.
 */

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

function tokensDeRuta(route) {
  const lista = [];
  const nombre = normalizeText(route.nombre || route.text || route.name || "");
  if (nombre) lista.push(nombre);
  const syns = Array.isArray(route.synonyms) ? route.synonyms : [];
  syns.forEach((s) => {
    const t = normalizeText(s);
    if (t) lista.push(t);
  });
  return [...new Set(lista)];
}

function scoreFraseEnTexto(texto, frase) {
  if (!frase || !texto) return 0;
  if (texto === frase) return 50;
  if (texto.includes(frase)) {
    if (frase.includes(" ")) return 40;
    return 30;
  }
  const palabras = frase.split(" ").filter(Boolean);
  if (palabras.length > 1) {
    const hits = palabras.filter((p) => texto.includes(p)).length;
    if (hits === palabras.length) return 25;
    if (hits > 0) return Math.round((hits / palabras.length) * 18);
  }
  return 0;
}

function scoreContexto(texto, memoria) {
  let bonus = 0;
  const pregunta = normalizeText(memoria?.ultimaPregunta || memoria?.ultimoMensajeBot || "");
  if (!pregunta) return 0;

  const esPago =
    CONTEXT_HINTS.metodo_pago.some((h) => pregunta.includes(h)) ||
    pregunta.includes("metodo") ||
    pregunta.includes("pago");

  if (esPago) {
    if (CONTEXT_HINTS.banco.some((h) => texto.includes(h))) bonus += 20;
    if (CONTEXT_HINTS.qr.some((h) => texto.includes(h))) bonus += 20;
    if (CONTEXT_HINTS.tigo.some((h) => texto.includes(h))) bonus += 20;
    if (texto.includes("banco") && pregunta.includes("banco")) bonus += 15;
  }

  return bonus;
}

function scoreRuta(texto, route, memoria) {
  if (route.enabled === false) return 0;

  let score = 0;
  const frases = tokensDeRuta(route);

  frases.forEach((frase) => {
    score += scoreFraseEnTexto(texto, frase);
  });

  score += scoreContexto(texto, memoria);

  const prioridad = Math.min(100, Math.max(0, parseInt(route.priority, 10) || 0));
  score += Math.round(prioridad * 0.1);

  return Math.min(100, score);
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
  console.log("🧠 CAMINOS:", cfg.caminos);

  const ranking = cfg.caminos
    .map((route) => ({
      id: route.id,
      nombre: route.nombre,
      score: scoreRuta(corregido, route, memoria),
      priority: route.priority,
    }))
    .sort((a, b) => b.score - a.score || b.priority - a.priority);

  console.log("🎯 SCORE:", ranking);

  const winner = ranking[0] && ranking[0].score >= cfg.scoreMinimo ? ranking[0] : null;

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
