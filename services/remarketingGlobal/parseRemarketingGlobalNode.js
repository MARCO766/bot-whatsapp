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
      detener_si_responde: true,
      reiniciar_si_responde: true,
      detener_si_compra: true,
      detener_si_etiqueta_pagado: true,
      detener_si_humano_toma_chat: true,
      detener_si_otro_flujo: true,
    },
    etiquetas: {
      activo: "REMARKETING ACTIVO",
      interesado: "INTERESADO",
      no_respondio: "NO RESPONDIÓ",
      pagado: "PAGADO",
    },
    modo_inteligente: {
      no_repetir_mensaje_seguido: true,
      min_minutos_entre_envios: 0,
      respetar_ventana_24h: true,
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
  if (!data || typeof data !== "object") return base;

  const steps = Array.isArray(data.steps)
    ? data.steps.map(normalizarPaso).filter(Boolean)
    : base.steps.map(normalizarPaso).filter(Boolean);

  return {
    type: "remarketing_global",
    activo: data.activo !== false,
    steps,
    condiciones: { ...base.condiciones, ...(data.condiciones || {}) },
    etiquetas: { ...base.etiquetas, ...(data.etiquetas || {}) },
    modo_inteligente: { ...base.modo_inteligente, ...(data.modo_inteligente || {}) },
  };
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
  const html = nodo?.html || "";
  const raw = leerJsonDeHtml(html);
  return normalizarConfig(raw);
}

function esNodoRemarketingGlobal(nodo) {
  if (!nodo) return false;
  const tipo = String(nodo.tipo || nodo.dataset?.tipo || "").toLowerCase();
  const className = String(nodo.className || "");
  const html = nodo.html || "";
  return (
    tipo === "remarketing_global" ||
    className.includes("remarketing-global-node") ||
    html.includes("remarketing-global-data")
  );
}

function buscarNodoRemarketingEnFlujo(flujoData) {
  if (!flujoData?.nodos?.length) return null;
  return flujoData.nodos.find(esNodoRemarketingGlobal) || null;
}

module.exports = {
  crearConfigPorDefecto,
  normalizarConfig,
  normalizarPaso,
  parseRemarketingFromNodo,
  esNodoRemarketingGlobal,
  buscarNodoRemarketingEnFlujo,
  delayToSeconds,
};
