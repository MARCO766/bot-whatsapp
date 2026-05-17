const { UNIDADES_DELAY, TIPOS_MENSAJE } = require("./constants");

function decodeHtmlJson(raw) {
  return (raw || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

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

function normalizarMensaje(mensaje, legacyTexto) {
  if (mensaje && typeof mensaje === "object") {
    const tipo = String(mensaje.tipo || "texto").toLowerCase();
    const tipoFinal = tipo === "document" || tipo === "doc" ? "pdf" : tipo;

    return {
      tipo: TIPOS_MENSAJE.includes(tipoFinal) ? tipoFinal : "texto",
      texto: (mensaje.texto || mensaje.valor || "").trim(),
      url: (mensaje.url || "").trim(),
      caption: (mensaje.caption || mensaje.descripcion || "").trim(),
    };
  }

  const texto = (legacyTexto || "").trim();
  return { tipo: "texto", texto, url: "", caption: "" };
}

function normalizarPaso(paso, index) {
  if (!paso || typeof paso !== "object") return null;

  const delay = paso.delay || {};
  const unidad = normalizarUnidad(delay.unidad || "minutos");
  const valor = delay.valor != null ? delay.valor : paso.minutos;

  const mensajeRaw =
    typeof paso.mensaje === "string"
      ? { tipo: "texto", texto: paso.mensaje }
      : paso.mensaje;

  const mensaje = normalizarMensaje(mensajeRaw, paso.texto);

  if (!mensaje.texto && !mensaje.url) {
    return null;
  }

  const segundos = delayToSeconds(valor, unidad);
  if (segundos <= 0) return null;

  return {
    id: paso.id || "paso_" + (index + 1),
    delay: { valor: parseInt(valor, 10) || 0, unidad },
    segundos,
    mensaje,
    estado: paso.estado || "pendiente",
  };
}

function normalizarConfig(data) {
  if (!data) {
    return crearConfigVacia();
  }

  if (Array.isArray(data)) {
    const pasos = data
      .map((item, index) =>
        normalizarPaso(
          {
            id: "paso_" + (index + 1),
            delay: { valor: item.minutos, unidad: "minutos" },
            mensaje: { tipo: "texto", texto: item.mensaje || "" },
          },
          index
        )
      )
      .filter(Boolean);

    return {
      version: 2,
      soloSiNoRespondio: true,
      detenerSiResponde: true,
      pasos,
    };
  }

  if (data.version === 2 || Array.isArray(data.pasos)) {
    const pasos = (data.pasos || [])
      .map((paso, index) => normalizarPaso(paso, index))
      .filter(Boolean);

    return {
      version: 2,
      soloSiNoRespondio: data.soloSiNoRespondio !== false,
      detenerSiResponde: data.detenerSiResponde !== false,
      pasos,
    };
  }

  return crearConfigVacia();
}

function crearConfigVacia() {
  return {
    version: 2,
    soloSiNoRespondio: true,
    detenerSiResponde: true,
    pasos: [],
  };
}

function extraerJsonSeguimiento(html) {
  if (!html) return null;

  const matchCuerpo = html.match(
    /<textarea[^>]*class="[^"]*seguimiento-data[^"]*"[^>]*>([\s\S]*?)<\/textarea>/i
  );

  if (matchCuerpo && matchCuerpo[1].trim()) {
    return decodeHtmlJson(matchCuerpo[1]);
  }

  const matchValor = html.match(
    /<textarea[^>]*class="[^"]*seguimiento-data[^"]*"[^>]*value="([^"]*)"[^>]*>/i
  );

  if (matchValor && matchValor[1].trim()) {
    return decodeHtmlJson(matchValor[1]);
  }

  const matchValor2 = html.match(
    /<textarea[^>]*value="([^"]*)"[^>]*class="[^"]*seguimiento-data[^"]*"[^>]*>/i
  );

  if (matchValor2 && matchValor2[1].trim()) {
    return decodeHtmlJson(matchValor2[1]);
  }

  return null;
}

function parseSeguimientoFromHtml(html) {
  if (!html) return crearConfigVacia();

  if (!html.includes("seguimiento-data")) {
    return crearConfigVacia();
  }

  try {
    const raw = extraerJsonSeguimiento(html);
    if (!raw) {
      console.log("[SEGUIMIENTO] parse: textarea seguimiento-data vacío o no legible");
      return crearConfigVacia();
    }

    const parsed = JSON.parse(raw);
    return normalizarConfig(parsed);
  } catch (e) {
    console.log("[SEGUIMIENTO] ERROR parseSeguimientoFromHtml:", e.message);
    return crearConfigVacia();
  }
}

function esNodoSeguimiento(nodoOrHtml) {
  if (!nodoOrHtml) return false;

  if (typeof nodoOrHtml === "object") {
    const html = nodoOrHtml.html || "";
    const className = String(nodoOrHtml.className || "");

    return (
      className.includes("follow-node") ||
      html.includes("seguimiento-data") ||
      html.includes("⏱️ Seguimiento") ||
      html.includes("🔔 Seguimiento") ||
      html.includes("Seguimiento CRM") ||
      html.includes('data-tipo="seguimiento"')
    );
  }

  const html = String(nodoOrHtml);
  return (
    html.includes("seguimiento-data") ||
    html.includes("⏱️ Seguimiento") ||
    html.includes("🔔 Seguimiento") ||
    html.includes("Seguimiento CRM")
  );
}

function formatearDelay(delay) {
  if (!delay) return "";
  const valor = delay.valor;
  const unidad = normalizarUnidad(delay.unidad);
  const etiquetas = { minutos: "min", horas: "h", dias: "d" };
  return valor + " " + (etiquetas[unidad] || unidad);
}

module.exports = {
  crearConfigVacia,
  normalizarConfig,
  parseSeguimientoFromHtml,
  esNodoSeguimiento,
  delayToSeconds,
  formatearDelay,
  decodeHtmlJson,
};
