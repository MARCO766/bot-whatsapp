const {
  enviarContenidosRemarketing,
  normalizarItemContenido,
} = require("./rm24hContenidos");
const { iniciarLectorPagoRemarketing } = require("./rmLectorPagoHelper");
const repo = require("./remarketing24hRepository");
const { normalizarConexionId } = repo;
const { ESTADOS_RM24H, MOTIVOS_RM24H } = require("./constants");
const { nowUtc } = require("../seguimiento/timestamps");

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
    const score = keywords.length
      ? puntuarCaminoRm(textoNorm, keywords)
      : { mejorFraseExacta: 0, keywordsEncontradas: 0, fuerza: 0 };
    console.log("[RM_RUNTIME_DEBUG] evaluando_camino", {
      id: camino.id || null,
      nombre: camino.nombre || camino.texto || null,
      activo: camino.activo !== false,
      keywords_count: keywords.length,
      keywords: keywords.slice(0, 20),
      score,
      candidato:
        score.keywordsEncontradas > 0 || score.mejorFraseExacta > 0,
    });
    if (!keywords.length) continue;
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

/**
 * Fin RM: invalida la fila post-envío para que obtenerContextoRemarketingPostEnvio deje de matchear.
 */
async function cerrarContextoRmPorFin(ctx) {
  const fila = ctx?.fila;
  if (!fila?.id) {
    console.log("[RM_RUNTIME] fin_rm omitido — sin fila RM en contexto");
    return null;
  }

  const actualizado = await repo.actualizarPorId(
    fila.id,
    {
      estado: ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
      activo: false,
      motivo_cancelacion: MOTIVOS_RM24H.FIN_RM,
      cancelado_en: nowUtc(),
    },
    fila
  );

  console.log("[RM_RUNTIME] fin_rm", {
    rm24h_id: actualizado?.id || fila.id,
    lead: ctx.numero || fila.cliente_numero || null,
    usuario: ctx.usuarioId || fila.usuario_id || null,
    conexion_whatsapp_id:
      normalizarConexionId(ctx.conexionWhatsappId) ||
      normalizarConexionId(fila.conexion_whatsapp_id),
    estado: actualizado?.estado || ESTADOS_RM24H.CERRADO_SIN_RESPUESTA,
    motivo_cancelacion: actualizado?.motivo_cancelacion || MOTIVOS_RM24H.FIN_RM,
  });

  if (actualizado && ctx.fila) {
    ctx.fila = actualizado;
  }

  return actualizado;
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

  console.log("[RM_RUNTIME_DEBUG] ejecutar_next", {
    count: nodos.length,
    nodos: nodos.map((n) => ({
      type: String(n?.type || n?.tipo || "").toLowerCase() || null,
      id: n?.id || null,
    })),
  });

  for (let i = 0; i < nodos.length; i++) {
    const nodo = nodos[i];
    const tipo = String(nodo?.type || nodo?.tipo || "").toLowerCase();
    console.log("[RM_RUNTIME_DEBUG] ejecutar_next_nodo", {
      type: tipo || "(sin tipo)",
      id: nodo?.id || null,
      config: nodo?.config || null,
    });
    if (tipo === "contenido") {
      const contenidos = obtenerContenidosDeNodoContenido(nodo);
      if (contenidos.length) {
        console.log("[RM_RUNTIME_DEBUG] contenido_send", {
          id: nodo?.id || null,
          count: contenidos.length,
          tipos: contenidos.map((c) => c.tipo),
        });
        await enviarContenidosRm(ctx, contenidos);
      } else {
        console.log("[RM_RUNTIME] nodo contenido vacío", { id: nodo?.id || null });
      }
      continue;
    }
    if (tipo === "lector_pagos" || tipo === "lector_pago") {
      console.log("[RM_RUNTIME_DEBUG] lector_pago_detectado", {
        id: nodo?.id || null,
        config: nodo?.config || null,
      });
      await iniciarLectorPagoRemarketing(ctx, nodo, {
        pendingNext: nodos.slice(i + 1),
      });
      return;
    }
    if (tipo === "conversion") {
      console.log("[RM_RUNTIME_DEBUG] conversion_detectada", {
        id: nodo?.id || null,
        config: nodo?.config || null,
      });
      console.log("[RM_RUNTIME] nodo no implementado todavía", {
        type: tipo || "(sin tipo)",
        id: nodo?.id || null,
      });
      continue;
    }
    if (tipo === "fin_rm" || tipo === "fin") {
      console.log("[RM_RUNTIME_DEBUG] fin_rm_detectado", {
        type: tipo,
        id: nodo?.id || null,
        config: nodo?.config || null,
      });
      await cerrarContextoRmPorFin(ctx);
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
    console.log("[RM_RUNTIME_DEBUG] fallback_send", {
      enviado: false,
      motivo: "responderSiNoCoincide=false",
    });
    console.log("[RM_RUNTIME] fallback desactivado (responderSiNoCoincide=false)");
    return;
  }

  const msg = String(
    comp.mensajeFallback || agente?.default?.respuesta || ""
  ).trim();
  if (!msg) {
    console.log("[RM_RUNTIME_DEBUG] fallback_send", {
      enviado: false,
      motivo: "mensaje_vacio",
    });
    console.log("[RM_RUNTIME] fallback vacío, no se envía");
    return;
  }

  console.log("[RM_RUNTIME_DEBUG] fallback_send", {
    enviado: true,
    preview: msg.slice(0, 120),
  });
  await enviarContenidosRm(ctx, [{ tipo: "texto", texto: msg }]);
}

/**
 * Runtime Fase 1: agente rápido + nodos contenido en caminos[].next.
 */
async function ejecutarMiniFlujoRm(ctx) {
  console.log("[RM_RUNTIME_DEBUG] runtime_start", {
    lead: ctx.numero || null,
    usuario: ctx.usuarioId || null,
    conexion_whatsapp_id: ctx.conexionWhatsappId || ctx.fila?.conexion_whatsapp_id || null,
    rm24h_id: ctx.fila?.id || null,
    texto_preview: String(ctx.texto || "").slice(0, 120),
  });

  const snapshot = leerSnapshot(ctx.fila);
  const miniFlow = snapshot.rm24h_mini_flujo;
  const agenteRaw = snapshot.rm24h_agente_rapido;

  console.log("[RM_RUNTIME_DEBUG] snapshot_info", {
    rm24h_id: ctx.fila?.id || null,
    existe_rm24h_mini_flujo: Array.isArray(miniFlow) && miniFlow.length > 0,
    rm24h_mini_flujo_count: Array.isArray(miniFlow) ? miniFlow.length : 0,
    rm24h_mini_flujo_types: Array.isArray(miniFlow)
      ? miniFlow.map((n) => String(n?.type || n?.tipo || "").toLowerCase())
      : [],
    existe_rm24h_agente_rapido: !!(agenteRaw && typeof agenteRaw === "object"),
    rm24h_agente_rapido_caminos_count: Array.isArray(agenteRaw?.caminos)
      ? agenteRaw.caminos.length
      : 0,
  });

  const refAgente = buscarNodoAgenteRapidoEnMiniFlujo(miniFlow);

  console.log("[RM_RUNTIME_DEBUG] agente_detectado", {
    detectado: !!refAgente,
    ref_uid: refAgente?.uid || null,
    ref_type: refAgente?.type || refAgente?.tipo || null,
  });

  const textoNorm = normalizarTextoMensaje(ctx.texto);
  console.log("[RM_RUNTIME_DEBUG] texto_normalizado", {
    original: String(ctx.texto || "").slice(0, 120),
    normalizado: textoNorm,
  });

  if (!refAgente) {
    console.log("[RM_RUNTIME] sin agente");
    return { handled: true, sinAgente: true };
  }

  const agente = normalizarAgenteRapido(agenteRaw);
  const camino = detectarCamino(agente, ctx.texto);

  if (camino) {
    const etiqueta = String(camino.nombre || camino.texto || camino.id || "").trim();
    console.log("[RM_RUNTIME_DEBUG] camino_match", {
      id: camino.id || null,
      nombre: etiqueta || null,
      next_count: Array.isArray(camino.next) ? camino.next.length : 0,
    });
    console.log("[RM_RUNTIME] camino match", etiqueta || camino.id);
    await ejecutarNext(camino.next, ctx);
  } else {
    console.log("[RM_RUNTIME_DEBUG] no_match", {
      caminos_evaluados: (agente?.caminos || []).filter((c) => c.activo !== false)
        .length,
    });
    console.log("[RM_RUNTIME] fallback");
    await enviarFallbackAgente(agente, ctx);
  }

  return { handled: true };
}

/**
 * Tras pago válido en lector RM: continúa nodos pendientes del mini flujo.
 */
async function continuarMiniFlujoRmTrasPagoValido({
  rm24hId,
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const {
    obtenerFilaRmPorId,
    limpiarPendingNextLectorRm,
    leerSnapshot: leerSnapRm,
  } = require("./rmLectorPagoHelper");

  if (!rm24hId || !usuarioId || !clienteNumero) {
    console.log("[RM_RUNTIME] lector_pagos_continuar_omitido", {
      motivo: "faltan_datos",
      rm24h_id: rm24hId || null,
    });
    return { ok: false, motivo: "faltan_datos" };
  }

  let fila = await obtenerFilaRmPorId(rm24hId);
  if (!fila?.id) {
    console.log("[RM_RUNTIME] lector_pagos_continuar_omitido", {
      motivo: "fila_no_encontrada",
      rm24h_id: rm24hId,
    });
    return { ok: false, motivo: "fila_no_encontrada" };
  }

  const snap = leerSnapRm(fila);
  const pending = Array.isArray(snap?.rm_lector_runtime?.pending_next)
    ? snap.rm_lector_runtime.pending_next
    : [];

  fila = (await limpiarPendingNextLectorRm(fila)) || fila;

  if (!pending.length) {
    console.log("[RM_RUNTIME] lector_pagos_valido_sin_pending_next", {
      rm24h_id: rm24hId,
      lead: clienteNumero,
    });
    return { ok: true, sinPending: true };
  }

  const ctx = {
    numero: clienteNumero,
    usuarioId,
    conexionWhatsappId:
      normalizarConexionId(conexionWhatsappId) ||
      normalizarConexionId(fila.conexion_whatsapp_id),
    fila,
  };

  console.log("[RM_RUNTIME] lector_pagos_continuar_next", {
    rm24h_id: rm24hId,
    lead: clienteNumero,
    pending_count: pending.length,
    pending_types: pending.map((n) => String(n?.type || n?.tipo || "")),
  });

  await ejecutarNext(pending, ctx);
  return { ok: true, pendingCount: pending.length };
}

module.exports = {
  leerSnapshot,
  buscarNodoAgenteRapidoEnMiniFlujo,
  normalizarAgenteRapido,
  detectarCamino,
  obtenerContenidosDeNodoContenido,
  ejecutarNext,
  enviarFallbackAgente,
  cerrarContextoRmPorFin,
  continuarMiniFlujoRmTrasPagoValido,
  ejecutarMiniFlujoRm,
};
