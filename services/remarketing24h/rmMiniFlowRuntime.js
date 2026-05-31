const {
  enviarContenidosRemarketing,
  normalizarItemContenido,
} = require("./rm24hContenidos");
const { normalizarConexionId } = require("./remarketing24hRepository");

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

function splitListaKeywords(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || "").trim()).filter(Boolean);
  }
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function textoContienePalabra(texto, palabra) {
  if (!palabra || !texto) return false;
  if (texto === palabra) return true;
  if (palabra.includes(" ")) return texto.includes(palabra);
  const re = new RegExp(`(^|\\s)${escapeRegExp(palabra)}(\\s|$)`);
  return re.test(texto);
}

function leerSnapshot(fila) {
  const snap = fila?.config_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) return snap;
  return {};
}

function buscarNodoAgenteRapidoEnMiniFlujo(miniFlow) {
  if (!Array.isArray(miniFlow)) return null;
  return (
    miniFlow.find((n) => {
      const t = String(n?.type || n?.tipo || "").toLowerCase();
      return t === "agente_rapido";
    }) || null
  );
}

function normalizarComportamientoAgente(raw) {
  const fallback = String(
    raw?.comportamiento?.mensajeFallback ||
      raw?.caminoDefault?.respuestaDefault ||
      raw?.default?.respuesta ||
      ""
  ).trim();
  return {
    responderSiNoCoincide: raw?.comportamiento?.responderSiNoCoincide !== false,
    mensajeFallback: fallback,
  };
}

function normalizarCamino(item) {
  if (!item || typeof item !== "object") return null;
  const nombre = String(
    item.nombre ?? item.texto ?? item.nombreCamino ?? ""
  ).trim();
  const palabrasArr = splitListaKeywords(
    item.palabrasClave ?? item.sinonimos ?? item.synonyms ?? item.keywords
  );
  const next = [];
  if (Array.isArray(item.next)) {
    for (const n of item.next) {
      const norm = normalizarNodoNext(n);
      if (norm) next.push(norm);
    }
  }
  return {
    id: String(item.id || "").trim() || null,
    nombre,
    texto: nombre,
    palabrasClave: palabrasArr,
    sinonimos: palabrasArr,
    activo: item.activo !== false && item.enabled !== false,
    next,
  };
}

function normalizarNodoNext(item) {
  if (!item || typeof item !== "object") return null;
  const tipo = String(item.type || item.tipo || "").toLowerCase();
  if (!tipo) return null;
  return {
    type: tipo,
    tipo,
    id: String(item.id || "").trim() || null,
    config: item.config && typeof item.config === "object" ? item.config : {},
  };
}

function normalizarAgenteRapido(raw) {
  const caminos = [];
  if (Array.isArray(raw?.caminos)) {
    for (const item of raw.caminos) {
      const m = normalizarCamino(item);
      if (m) caminos.push(m);
    }
  }
  const comportamiento = normalizarComportamientoAgente(raw);
  const defaultRespuesta = String(
    raw?.default?.respuesta ?? comportamiento.mensajeFallback ?? ""
  ).trim();
  return {
    caminos,
    comportamiento,
    default: { respuesta: defaultRespuesta },
  };
}

function keywordsDeCaminoRm(camino) {
  const nombre = String(camino.nombre || camino.texto || "").trim();
  const lista = [];

  splitListaKeywords(camino.palabrasClave).forEach((k) => lista.push(k));
  splitListaKeywords(camino.sinonimos).forEach((k) => lista.push(k));

  if (nombre) {
    lista.push(nombre);
    const normNombre = normalizarTextoMensaje(nombre);
    if (normNombre) {
      normNombre
        .split(" ")
        .filter((p) => p.length >= 2)
        .forEach((p) => lista.push(p));
    }
  }

  const vistos = new Set();
  const out = [];
  for (const k of lista) {
    const n = normalizarTextoMensaje(k);
    if (!n || n.length < 1) continue;
    if (vistos.has(n)) continue;
    vistos.add(n);
    out.push(n);
  }
  return out;
}

function puntuarCaminoRm(textoNorm, keywords) {
  let mejorFraseExacta = 0;
  let keywordsEncontradas = 0;

  for (const norm of keywords) {
    if (textoNorm === norm) {
      mejorFraseExacta = Math.max(mejorFraseExacta, 100);
      keywordsEncontradas++;
      continue;
    }
    if (norm.includes(" ") && textoNorm.includes(norm)) {
      mejorFraseExacta = Math.max(mejorFraseExacta, 85);
      keywordsEncontradas++;
      continue;
    }
    if (textoContienePalabra(textoNorm, norm)) {
      keywordsEncontradas++;
    }
  }

  return {
    mejorFraseExacta,
    keywordsEncontradas,
    fuerza: mejorFraseExacta + keywordsEncontradas * 12,
  };
}

function detectarCamino(agente, texto) {
  const textoNorm = normalizarTextoMensaje(texto);
  if (!textoNorm) return null;

  const caminos = (agente?.caminos || []).filter((c) => c.activo !== false);
  let mejor = null;
  let mejorScore = 0;

  for (const camino of caminos) {
    const keywords = keywordsDeCaminoRm(camino);
    if (!keywords.length) continue;
    const score = puntuarCaminoRm(textoNorm, keywords);
    if (score.keywordsEncontradas <= 0 && score.mejorFraseExacta <= 0) continue;
    if (
      !mejor ||
      score.fuerza > mejorScore ||
      (score.fuerza === mejorScore && score.mejorFraseExacta > mejor.mejorFraseExacta)
    ) {
      mejor = { camino, ...score };
      mejorScore = score.fuerza;
    }
  }

  return mejor?.camino || null;
}

function obtenerContenidosDeNodoContenido(nodo) {
  const cfg = nodo?.config;
  if (!cfg || typeof cfg !== "object") return [];

  if (Array.isArray(cfg.contenidos) && cfg.contenidos.length) {
    return cfg.contenidos.map(normalizarItemContenido).filter(Boolean);
  }

  const legacy = String(cfg.mensajeRemarketing || "").trim();
  if (legacy) return [{ tipo: "texto", texto: legacy }];
  return [];
}

function buildOpcionesEnvio(ctx) {
  const conexionWhatsappId =
    normalizarConexionId(ctx.conexionWhatsappId) ||
    normalizarConexionId(ctx.fila?.conexion_whatsapp_id);

  return {
    usuarioId: ctx.usuarioId,
    conexionWhatsappId,
    strictConexionWhatsappId: true,
    origin: "remarketing_mini_flow",
  };
}

async function enviarContenidosRm(ctx, contenidos) {
  const lista = (contenidos || []).map(normalizarItemContenido).filter(Boolean);
  if (!lista.length) {
    console.log("[RM_RUNTIME] sin contenidos para enviar");
    return;
  }

  const opciones = buildOpcionesEnvio(ctx);
  if (!opciones.conexionWhatsappId) {
    console.log("[RM_RUNTIME] envío omitido — sin conexion_whatsapp_id");
    return;
  }

  await enviarContenidosRemarketing(ctx.numero, lista, opciones);
}

async function ejecutarNext(nextNodes, ctx) {
  const nodos = Array.isArray(nextNodes) ? nextNodes : [];

  for (const nodo of nodos) {
    const tipo = String(nodo?.type || nodo?.tipo || "").toLowerCase();
    if (tipo === "contenido") {
      const contenidos = obtenerContenidosDeNodoContenido(nodo);
      if (contenidos.length) {
        await enviarContenidosRm(ctx, contenidos);
      } else {
        console.log("[RM_RUNTIME] nodo contenido vacío", { id: nodo?.id || null });
      }
      continue;
    }
    console.log("[RM_RUNTIME] nodo no implementado todavía", {
      type: tipo || "(sin tipo)",
      id: nodo?.id || null,
    });
  }
}

async function enviarFallbackAgente(agente, ctx) {
  const comp = agente?.comportamiento || {};
  if (comp.responderSiNoCoincide === false) {
    console.log("[RM_RUNTIME] fallback desactivado (responderSiNoCoincide=false)");
    return;
  }

  const msg = String(
    comp.mensajeFallback || agente?.default?.respuesta || ""
  ).trim();
  if (!msg) {
    console.log("[RM_RUNTIME] fallback vacío, no se envía");
    return;
  }

  await enviarContenidosRm(ctx, [{ tipo: "texto", texto: msg }]);
}

/**
 * Runtime Fase 1: agente rápido + nodos contenido en caminos[].next.
 */
async function ejecutarMiniFlujoRm(ctx) {
  const snapshot = leerSnapshot(ctx.fila);
  const miniFlow = snapshot.rm24h_mini_flujo;
  const refAgente = buscarNodoAgenteRapidoEnMiniFlujo(miniFlow);

  if (!refAgente) {
    console.log("[RM_RUNTIME] sin agente");
    return { handled: true, sinAgente: true };
  }

  const agente = normalizarAgenteRapido(snapshot.rm24h_agente_rapido);
  const camino = detectarCamino(agente, ctx.texto);

  if (camino) {
    const etiqueta = String(camino.nombre || camino.texto || camino.id || "").trim();
    console.log("[RM_RUNTIME] camino match", etiqueta || camino.id);
    await ejecutarNext(camino.next, ctx);
  } else {
    console.log("[RM_RUNTIME] fallback");
    await enviarFallbackAgente(agente, ctx);
  }

  return { handled: true };
}

module.exports = {
  leerSnapshot,
  buscarNodoAgenteRapidoEnMiniFlujo,
  normalizarAgenteRapido,
  detectarCamino,
  obtenerContenidosDeNodoContenido,
  ejecutarNext,
  enviarFallbackAgente,
  ejecutarMiniFlujoRm,
};
