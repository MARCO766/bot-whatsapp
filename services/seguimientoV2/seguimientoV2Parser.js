const UNIDADES_VALIDAS = [
  "segundos",
  "segundo",
  "sec",
  "s",
  "minutos",
  "minuto",
  "horas",
  "hora",
  "dias",
  "dia",
  "día",
  "días",
];

const TIPOS_ALIASES = {
  texto: "texto",
  imagen: "imagen",
  image: "imagen",
  audio: "audio",
  video: "video",
  documento: "documento",
  document: "documento",
  pdf: "documento",
  doc: "documento",
};

const MEDIA_TYPE_MAP = {
  imagen: "image",
  audio: "audio",
  video: "video",
  documento: "document",
};

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
  if (u === "segundo" || u === "segundos" || u === "sec" || u === "s") return "segundos";
  if (u === "dia" || u === "día" || u === "dias" || u === "días") return "dias";
  if (u === "hora" || u === "horas") return "horas";
  return "minutos";
}

function normalizarTipo(tipo) {
  const t = String(tipo || "texto").toLowerCase();
  return TIPOS_ALIASES[t] || "texto";
}

function tipoToMediaType(tipo) {
  return MEDIA_TYPE_MAP[normalizarTipo(tipo)] || null;
}

function delayToSeconds(valor, unidad) {
  const n = parseInt(valor, 10);
  if (isNaN(n) || n <= 0) return 0;

  const u = normalizarUnidad(unidad);
  if (u === "segundos") return n;
  if (u === "horas") return n * 3600;
  if (u === "dias") return n * 86400;
  return n * 60;
}

function extraerJsonV2DesdeHtml(html) {
  if (!html) return null;

  const patrones = [
    /<textarea[^>]*class="[^"]*seguimiento-v2-data[^"]*"[^>]*>([\s\S]*?)<\/textarea>/i,
    /<textarea[^>]*class="[^"]*seguimiento-v2-data[^"]*"[^>]*value="([^"]*)"[^>]*>/i,
    /<textarea[^>]*value="([^"]*)"[^>]*class="[^"]*seguimiento-v2-data[^"]*"[^>]*>/i,
  ];

  for (const patron of patrones) {
    const match = html.match(patron);
    if (match && match[1] && match[1].trim()) {
      return decodeHtmlJson(match[1]);
    }
  }

  return null;
}

function extraerDataCruda(nodo) {
  if (!nodo || typeof nodo !== "object") return null;

  if (nodo.version === 1 && Array.isArray(nodo.pasos)) {
    return nodo;
  }

  if (nodo.data?.version === 1 && Array.isArray(nodo.data.pasos)) {
    return nodo.data;
  }

  if (nodo.data?.seguimientoV2) {
    return nodo.data.seguimientoV2;
  }

  const rawHtml = extraerJsonV2DesdeHtml(nodo.html || "");
  if (rawHtml) {
    try {
      return JSON.parse(rawHtml);
    } catch (_err) {
      return null;
    }
  }

  return null;
}

function validarDelay(delay, index) {
  if (!delay || typeof delay !== "object") {
    throw new Error(`Paso ${index + 1}: delay obligatorio`);
  }

  const valor = delay.valor;
  if (valor == null || isNaN(parseInt(valor, 10)) || parseInt(valor, 10) <= 0) {
    throw new Error(`Paso ${index + 1}: delay.valor inválido`);
  }

  const unidad = String(delay.unidad || "minutos").toLowerCase();
  if (!UNIDADES_VALIDAS.includes(unidad)) {
    throw new Error(`Paso ${index + 1}: delay.unidad inválida (${unidad})`);
  }

  const segundos = delayToSeconds(valor, unidad);
  if (segundos <= 0) {
    throw new Error(`Paso ${index + 1}: delay debe ser mayor a cero`);
  }

  return {
    valor: parseInt(valor, 10),
    unidad: normalizarUnidad(unidad),
    segundos,
  };
}

function validarPaso(paso, index) {
  if (!paso || typeof paso !== "object") {
    throw new Error(`Paso ${index + 1}: estructura inválida`);
  }

  const delay = validarDelay(paso.delay, index);
  const tipoFinal = normalizarTipo(paso.tipo);
  const contenido = paso.contenido != null ? String(paso.contenido).trim() : "";
  const mediaUrl = paso.media_url != null ? String(paso.media_url).trim() : "";
  const filename =
    paso.media_filename != null
      ? String(paso.media_filename).trim()
      : paso.filename != null
        ? String(paso.filename).trim()
        : "";
  const pasoId = paso.pasoId != null ? String(paso.pasoId).trim() : `paso_${index + 1}`;

  if (tipoFinal === "texto") {
    if (!contenido) {
      throw new Error(`Paso ${index + 1}: contenido obligatorio para tipo texto`);
    }

    return {
      pasoId,
      delay,
      segundos: delay.segundos,
      tipo: "texto",
      contenido,
      media_url: null,
      media_type: null,
      filename: null,
    };
  }

  if (!mediaUrl) {
    throw new Error(`Paso ${index + 1}: media_url obligatorio para tipo ${tipoFinal}`);
  }

  const mediaType = paso.media_type != null ? String(paso.media_type).trim() : tipoToMediaType(tipoFinal);

  return {
    pasoId,
    delay,
    segundos: delay.segundos,
    tipo: tipoFinal,
    contenido,
    media_url: mediaUrl,
    media_type: mediaType || tipoToMediaType(tipoFinal),
    filename: tipoFinal === "documento" && filename ? filename : null,
  };
}

function parseSeguimientoV2Node(nodo) {
  const data = extraerDataCruda(nodo);

  if (!data) {
    return { version: 1, pasos: [], error: "sin_datos_v2" };
  }

  if (data.version !== 1) {
    throw new Error(`Seguimiento V2: version inválida (${data.version}), se espera 1`);
  }

  if (!Array.isArray(data.pasos) || data.pasos.length === 0) {
    throw new Error("Seguimiento V2: pasos[] obligatorio y no vacío");
  }

  const pasos = data.pasos.map((paso, index) => validarPaso(paso, index));

  return {
    version: 1,
    cancelarSiResponde: data.cancelarSiResponde !== false,
    pasos,
  };
}

function esNodoSeguimientoV2(nodo) {
  if (!nodo) return false;

  const html = nodo.html || "";
  const className = String(nodo.className || "");
  const tipo = String(
    nodo.type || nodo.tipo || nodo.dataset?.tipo || nodo.data?.type || nodo.data?.nodeType || ""
  ).toLowerCase();

  if (tipo === "seguimiento_crm_v2") return true;
  if (className.includes("follow-node-v2") || className.includes("seguimiento-v2-node")) {
    return true;
  }
  if (html.includes("seguimiento-v2-data")) return true;
  if (html.includes("Seguimiento CRM V2")) return true;
  if (html.includes('data-tipo="seguimiento_crm_v2"')) return true;
  if (nodo.data?.version === 1 && Array.isArray(nodo.data?.pasos)) return true;

  try {
    const data = extraerDataCruda(nodo);
    if (data?.version === 1 && Array.isArray(data.pasos) && data.pasos.length > 0) {
      return true;
    }
  } catch (_err) {
    return false;
  }

  return false;
}

module.exports = {
  parseSeguimientoV2Node,
  esNodoSeguimientoV2,
  delayToSeconds,
  normalizarUnidad,
  normalizarTipo,
  tipoToMediaType,
};
