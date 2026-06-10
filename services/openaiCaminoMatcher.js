/**
 * MacBot — Detección dinámica de caminos solo para nodo OpenAI.
 * Lee keywords/sinónimos del JSON del builder; sin rutas hardcodeadas.
 */

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarTextoMensaje(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoContienePalabra(texto, palabra) {
  if (!palabra || !texto) return false;
  if (texto === palabra) return true;
  if (palabra.includes(" ")) return texto.includes(palabra);
  const re = new RegExp(`(^|\\s)${escapeRegExp(palabra)}(\\s|$)`);
  return re.test(texto);
}

function splitListaKeywords(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || "").trim()).filter(Boolean);
  }
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function palabrasDesdeNombre(nombre) {
  const norm = normalizarTextoMensaje(nombre);
  if (!norm) return [];
  const partes = norm.split(" ").filter((p) => p.length >= 2);
  const set = new Set([norm, ...partes]);
  return [...set];
}

function keywordsDeCamino(route) {
  const nombre = String(route.nombre || route.text || route.name || "").trim();
  const lista = [];

  splitListaKeywords(route.keywords).forEach((k) => lista.push(k));
  splitListaKeywords(route.palabras).forEach((k) => lista.push(k));
  splitListaKeywords(route.etiquetas).forEach((k) => lista.push(k));
  splitListaKeywords(route.synonyms).forEach((k) => lista.push(k));

  if (nombre) {
    lista.push(nombre);
    palabrasDesdeNombre(nombre).forEach((p) => lista.push(p));
  }

  const vistos = new Set();
  const out = [];
  lista.forEach((k) => {
    const n = normalizarTextoMensaje(k);
    if (!n || n.length < 2) return;
    if (vistos.has(n)) return;
    vistos.add(n);
    out.push({ raw: k, norm: n });
  });
  return out;
}

const ROUTE_TYPE_TEXTO = "texto";
const ROUTE_TYPE_PAYMENT_READER = "payment_reader";

function normalizarTipoCamino(raw) {
  const t = String(raw || ROUTE_TYPE_TEXTO).trim();
  return t === ROUTE_TYPE_PAYMENT_READER ? ROUTE_TYPE_PAYMENT_READER : ROUTE_TYPE_TEXTO;
}

function normalizarPaymentCamino(raw) {
  const p = raw && typeof raw.payment === "object" ? raw.payment : raw || {};
  return {
    montoEsperado: parseFloat(p.montoEsperado ?? p.monto_esperado) || 0,
    monedaEsperada: String(p.monedaEsperada ?? p.moneda_esperada ?? "").trim(),
    nombreEsperado: String(p.nombreEsperado ?? p.nombre_esperado ?? "").trim(),
  };
}

function esCaminoPaymentReader(route) {
  return normalizarTipoCamino(route?.type) === ROUTE_TYPE_PAYMENT_READER;
}

function logPaymentReaderRoutes(caminos) {
  const paymentReaders = (caminos || []).filter(esCaminoPaymentReader);
  if (!paymentReaders.length) return;

  console.log(
    "[OPENAI_PAYMENT_READER_ROUTES]",
    JSON.stringify({
      totalPaymentReaders: paymentReaders.length,
      routes: paymentReaders.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        type: r.type,
        payment: r.payment,
        enabled: r.enabled !== false,
      })),
    })
  );
}

function puntuarCamino(textoNorm, keywords) {
  let mejorFraseExacta = 0;
  let keywordsEncontradas = 0;
  const hits = [];

  keywords.forEach(({ raw, norm }) => {
    if (textoNorm === norm) {
      mejorFraseExacta = Math.max(mejorFraseExacta, 100);
      keywordsEncontradas++;
      hits.push({ keyword: raw, tipo: "exacto_total" });
      return;
    }

    if (norm.includes(" ") && textoNorm.includes(norm)) {
      mejorFraseExacta = Math.max(mejorFraseExacta, 85);
      keywordsEncontradas++;
      hits.push({ keyword: raw, tipo: "frase" });
      return;
    }

    if (textoContienePalabra(textoNorm, norm)) {
      keywordsEncontradas++;
      hits.push({ keyword: raw, tipo: "palabra" });
      if (textoNorm === norm) {
        mejorFraseExacta = Math.max(mejorFraseExacta, 100);
      }
    }
  });

  return {
    mejorFraseExacta,
    keywordsEncontradas,
    hits,
    fuerza: mejorFraseExacta + keywordsEncontradas * 12,
  };
}

function normalizarCaminosOpenAI(cfg) {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const raw = base.caminos ?? base.routes;
  const caminos = Array.isArray(raw) ? raw : [];

  return {
    scoreMinimo: Math.min(100, Math.max(0, parseInt(base.scoreMinimo, 10) || 40)),
    caminos: caminos
      .map((r) => {
        const type = normalizarTipoCamino(r.type);
        const camino = {
          id: String(r.id || "").trim(),
          nombre: String(r.nombre || r.text || r.name || "").trim(),
          type,
          synonyms: splitListaKeywords(r.synonyms),
          keywords: splitListaKeywords(r.keywords),
          palabras: splitListaKeywords(r.palabras),
          etiquetas: splitListaKeywords(r.etiquetas),
          priority: parseInt(r.priority, 10) || 50,
          mediaId: String(r.mediaId || "").trim(),
          enabled: r.enabled !== false,
        };
        if (type === ROUTE_TYPE_PAYMENT_READER) {
          camino.payment = normalizarPaymentCamino(r);
        }
        return camino;
      })
      .filter((r) => r.id && (r.nombre || r.synonyms.length > 0)),
  };
}

/**
 * @returns { matched, routeId, intent, score, ranking, textoNormalizado, empate }
 */
function analizarCaminosOpenAI(config, mensaje) {
  const cfg = normalizarCaminosOpenAI(config);
  logPaymentReaderRoutes(cfg.caminos);

  const raw = String(mensaje || "");
  const textoNormalizado = normalizarTextoMensaje(raw);

  const caminosActivos = cfg.caminos.filter(
    (c) => c.enabled !== false && !esCaminoPaymentReader(c)
  );

  const detalleCaminos = caminosActivos.map((route) => {
    const keywords = keywordsDeCamino(route);
    const score = puntuarCamino(textoNormalizado, keywords);
    return {
      id: route.id,
      nombre: route.nombre,
      keywords: keywords.map((k) => k.raw),
      ...score,
      priority: route.priority,
    };
  });

  console.log("[OPENAI PATH DEBUG] mensaje normalizado:", textoNormalizado);
  console.log(
    "[OPENAI PATH DEBUG] caminos disponibles:",
    caminosActivos.map((c) => ({ id: c.id, nombre: c.nombre }))
  );
  console.log(
    "[OPENAI PATH DEBUG] keywords por camino:",
    detalleCaminos.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      keywords: d.keywords,
    }))
  );

  const candidatos = detalleCaminos
    .filter((d) => d.keywordsEncontradas > 0 || d.mejorFraseExacta > 0)
    .sort((a, b) => {
      if (b.mejorFraseExacta !== a.mejorFraseExacta) {
        return b.mejorFraseExacta - a.mejorFraseExacta;
      }
      if (b.keywordsEncontradas !== a.keywordsEncontradas) {
        return b.keywordsEncontradas - a.keywordsEncontradas;
      }
      return b.priority - a.priority;
    });

  if (!candidatos.length) {
    console.log("[OPENAI PATH DEBUG] camino elegido: (ninguno)");
    return {
      ok: true,
      matched: false,
      routeId: null,
      intent: "",
      score: 0,
      empate: false,
      ranking: detalleCaminos,
      textoNormalizado,
    };
  }

  const top = candidatos[0];
  const segundo = candidatos[1];

  const empate =
    !!segundo &&
    top.mejorFraseExacta === segundo.mejorFraseExacta &&
    top.keywordsEncontradas === segundo.keywordsEncontradas;

  if (empate) {
    console.log("[OPENAI PATH DEBUG] camino elegido: (empate)", {
      a: top.id,
      b: segundo.id,
      score: top.keywordsEncontradas,
    });
    return {
      ok: true,
      matched: false,
      routeId: null,
      intent: "",
      score: top.keywordsEncontradas,
      empate: true,
      ranking: candidatos,
      textoNormalizado,
    };
  }

  const minHits = top.mejorFraseExacta >= 85 ? 1 : 1;
  if (top.keywordsEncontradas < minHits && top.mejorFraseExacta < 85) {
    console.log("[OPENAI PATH DEBUG] camino elegido: (sin fuerza suficiente)");
    return {
      ok: true,
      matched: false,
      routeId: null,
      intent: "",
      score: 0,
      empate: false,
      ranking: candidatos,
      textoNormalizado,
    };
  }

  console.log("[OPENAI PATH DEBUG] camino elegido:", top.id, "|", top.nombre);
  console.log("[OPENAI PATH DEBUG] nodo destino (handle):", top.id);

  return {
    ok: true,
    matched: true,
    intent: top.nombre,
    score: top.fuerza,
    routeId: top.id,
    route: top.id,
    empate: false,
    ranking: candidatos,
    textoNormalizado,
    hits: top.hits,
  };
}

module.exports = {
  normalizarTextoMensaje,
  normalizarCaminosOpenAI,
  keywordsDeCamino,
  analizarCaminosOpenAI,
  esCaminoPaymentReader,
  normalizarPaymentCamino,
  normalizarTipoCamino,
};
