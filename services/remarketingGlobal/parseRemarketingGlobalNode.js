const UNIDADES = ["minutos", "horas", "dias"];
const TIPOS = ["texto", "imagen", "audio", "pdf", "video"];

function normalizarUnidad(unidad) {
  const u = String(unidad || "minutos").toLowerCase();
  if (u === "dia" || u === "día" || u === "dias" || u === "días") return "dias";
  if (u === "hora" || u === "horas") return "horas";
  return "minutos";
}

function delayToSeconds(valor, unidad) {
  const n = parseInt(valor, 10);
  if (isNaN(n) || n <= 0) return 0;
  const u = normalizarUnidad(unidad);
  if (u === "horas") return n * 3600;
  if (u === "dias") return n * 86400;
  return n * 60;
}

function crearConfigPorDefecto() {
  return {
    type: "remarketing_global",
    activo: true,
    fixed: true,
    noEdges: true,
    steps: [
      {
        id: "r1",
        nombre: "R1",
        delay: 1,
        unidad: "minutos",
        tipo: "texto",
        texto: "¿Sigues interesado? 😊",
        media_url: null,
        activo: true,
      },
      {
        id: "r2",
        nombre: "R2",
        delay: 16,
        unidad: "horas",
        tipo: "texto",
        texto: "",
        media_url: null,
        activo: true,
      },
      {
        id: "r3",
        nombre: "R3",
        delay: 23,
        unidad: "horas",
        tipo: "texto",
        texto: "",
        media_url: null,
        activo: true,
      },
      {
        id: "r4",
        nombre: "R4",
        delay: 2,
        unidad: "dias",
        tipo: "texto",
        texto: "",
        media_url: null,
        activo: true,
      },
    ],
    condiciones: {
      detenerSiResponde: true,
      reiniciarSiResponde: true,
      detenerSiCompra: true,
      detenerEtiqueta: "PAGADO",
      detenerSiHumano: true,
      detenerSiOtroFlujo: true,
    },
    etiquetas: {
      alEntrar: "REMARKETING ACTIVO",
      siResponde: "INTERESADO",
      siNoResponde: "NO RESPONDIÓ",
      siCompra: "PAGADO",
    },
    inteligente: {
      noRepetirMensaje: true,
      respetarVentana24h: true,
      minMinutosEntreBot: 5,
    },
  };
}

/** Convierte config UI → formato runtime (snake interno) */
function toRuntimeConfig(data) {
  const cfg = normalizarConfig(data);
  const c = cfg.condiciones || {};
  const e = cfg.etiquetas || {};
  const i = cfg.inteligente || {};

  return {
    ...cfg,
    condiciones: {
      detener_si_responde: !!c.detenerSiResponde,
      reiniciar_si_responde: !!c.reiniciarSiResponde,
      detener_si_compra: !!c.detenerSiCompra,
      detener_si_etiqueta_pagado: !!c.detenerEtiqueta,
      detener_etiqueta_nombre: c.detenerEtiqueta || "PAGADO",
      detener_si_humano_toma_chat: !!c.detenerSiHumano,
      detener_si_otro_flujo: !!c.detenerSiOtroFlujo,
    },
    etiquetas: {
      activo: e.alEntrar,
      interesado: e.siResponde,
      no_respondio: e.siNoResponde,
      pagado: e.siCompra,
    },
    modo_inteligente: {
      no_repetir_mensaje_seguido: !!i.noRepetirMensaje,
      respetar_ventana_24h: !!i.respetarVentana24h,
      min_minutos_entre_envios: parseInt(i.minMinutosEntreBot, 10) || 0,
    },
  };
}

function normalizarPaso(paso, index) {
  if (!paso || typeof paso !== "object" || paso.activo === false) return null;

  const valor = paso.delay != null ? paso.delay : paso.tiempo;
  const unidad = normalizarUnidad(paso.unidad);
  const segundos = delayToSeconds(valor, unidad);
  if (segundos <= 0) return null;

  const tipo = String(paso.tipo || "texto").toLowerCase();
  const texto = (paso.texto || "").trim();
  const url = (paso.media_url || paso.url || "").trim();

  if (tipo === "texto" && !texto) return null;
  if (tipo !== "texto" && !url && !texto) return null;

  return {
    id: paso.id || "r" + (index + 1),
    nombre: paso.nombre || "R" + (index + 1),
    delay: { valor: parseInt(valor, 10) || 1, unidad },
    segundos,
    mensaje: {
      tipo: TIPOS.includes(tipo) ? tipo : "texto",
      texto,
      url,
      caption: (paso.caption || "").trim(),
    },
  };
}

function normalizarConfig(data) {
  const base = crearConfigPorDefecto();
  if (!data || typeof data !== "object") return toRuntimeConfig(base);

  const rawC = data.condiciones || {};
  const rawE = data.etiquetas || {};
  const rawI = data.inteligente || data.modo_inteligente || {};

  const merged = {
    type: "remarketing_global",
    activo: data.activo !== false,
    fixed: true,
    noEdges: true,
    steps: Array.isArray(data.steps) ? data.steps : base.steps,
    condiciones: {
      detenerSiResponde:
        rawC.detenerSiResponde ?? rawC.detener_si_responde ?? base.condiciones.detenerSiResponde,
      reiniciarSiResponde:
        rawC.reiniciarSiResponde ?? rawC.reiniciar_si_responde ?? base.condiciones.reiniciarSiResponde,
      detenerSiCompra:
        rawC.detenerSiCompra ?? rawC.detener_si_compra ?? base.condiciones.detenerSiCompra,
      detenerEtiqueta:
        rawC.detenerEtiqueta ||
        rawC.detener_etiqueta_nombre ||
        rawE.pagado ||
        base.condiciones.detenerEtiqueta,
      detenerSiHumano:
        rawC.detenerSiHumano ?? rawC.detener_si_humano_toma_chat ?? base.condiciones.detenerSiHumano,
      detenerSiOtroFlujo:
        rawC.detenerSiOtroFlujo ?? rawC.detener_si_otro_flujo ?? base.condiciones.detenerSiOtroFlujo,
    },
    etiquetas: {
      alEntrar: rawE.alEntrar || rawE.activo || base.etiquetas.alEntrar,
      siResponde: rawE.siResponde || rawE.interesado || base.etiquetas.siResponde,
      siNoResponde: rawE.siNoResponde || rawE.no_respondio || base.etiquetas.siNoResponde,
      siCompra: rawE.siCompra || rawE.pagado || base.etiquetas.siCompra,
    },
    inteligente: {
      noRepetirMensaje:
        rawI.noRepetirMensaje ?? rawI.no_repetir_mensaje_seguido ?? base.inteligente.noRepetirMensaje,
      respetarVentana24h:
        rawI.respetarVentana24h ?? rawI.respetar_ventana_24h ?? base.inteligente.respetarVentana24h,
      minMinutosEntreBot:
        rawI.minMinutosEntreBot ??
        rawI.min_minutos_entre_envios ??
        base.inteligente.minMinutosEntreBot,
    },
  };

  return toRuntimeConfig(merged);
}

function leerJsonDeHtml(html) {
  if (!html) return null;
  const match = html.match(
    /class="remarketing-global-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function parseRemarketingFromNodo(nodo) {
  if (!nodo) return normalizarConfig(null);
  const raw = nodo.config || leerJsonDeHtml(nodo.html);
  return normalizarConfig(raw);
}

function esNodoRemarketingGlobal(nodo) {
  if (!nodo) return false;
  const tipo = String(nodo.tipo || nodo.dataset?.tipo || "").toLowerCase();
  const className = String(nodo.className || "");
  const html = nodo.html || "";
  const id = nodo.id || "";
  return (
    id === "remarketing_global_fixed" ||
    tipo === "remarketing_global" ||
    className.includes("remarketing-global") ||
    html.includes("remarketing-global-data")
  );
}

function buscarNodoRemarketingEnFlujo(flujoData) {
  if (!flujoData?.nodos?.length) return null;
  const found = flujoData.nodos.find(esNodoRemarketingGlobal);
  if (!found) return null;
  return {
    ...found,
    id: found.id || "remarketing_global_fixed",
    config: parseRemarketingFromNodo(found),
  };
}

module.exports = {
  crearConfigPorDefecto,
  normalizarConfig,
  toRuntimeConfig,
  normalizarPaso,
  parseRemarketingFromNodo,
  esNodoRemarketingGlobal,
  buscarNodoRemarketingEnFlujo,
  delayToSeconds,
};
