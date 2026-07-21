/**
 * MacBot — Validación de comprobantes para rutas payment_reader del nodo OpenAI.
 * Independiente del nodo lector_pago y lectorPagoService.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const TOLERANCIA_MONTO_DEFAULT = 0.01;

const MONEDA_ALIASES = {
  bs: ["bs", "bob", "boliviano", "bolivianos", "bol", "bs."],
  usd: ["usd", "dolar", "dolares", "dólar", "dólares", "us$", "u$s"],
  eur: ["eur", "euro", "euros"],
};

function toNumber(value, fallback = 0) {
  const cleaned = String(value ?? "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNombre(str) {
  return normalizeText(str)
    .replace(/\./g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokensNombreSignificativos(tokens) {
  return tokens.filter((t) => t.length >= 2);
}

function tokenNombreCoincide(tokenLeido, tokenEsperado) {
  if (!tokenLeido || !tokenEsperado) return false;
  if (tokenLeido === tokenEsperado) return true;
  if (tokenLeido.length >= 2 && tokenEsperado.startsWith(tokenLeido)) return true;
  if (tokenEsperado.length >= 2 && tokenLeido.startsWith(tokenEsperado)) return true;
  if (tokenLeido.length === 1 && tokenEsperado.startsWith(tokenLeido)) return true;
  if (tokenEsperado.length === 1 && tokenLeido.startsWith(tokenEsperado)) return true;
  return false;
}

function contarTokensEsperadosEnLectura(tokensEsperados, tokensLeidos) {
  const usados = new Set();
  let count = 0;
  for (const leido of tokensLeidos) {
    for (let i = 0; i < tokensEsperados.length; i++) {
      if (usados.has(i)) continue;
      if (tokenNombreCoincide(leido, tokensEsperados[i])) {
        usados.add(i);
        count++;
        break;
      }
    }
  }
  return count;
}

function compararNombreFlexible(esperado, lectura) {
  const esp = String(esperado || "").trim();
  if (!esp) return true;

  const lec = String(lectura || "").trim();
  if (!lec) return false;

  const espNorm = normalizeText(esp);
  const lecNorm = normalizeText(lec);
  if (lecNorm.includes(espNorm) || espNorm.includes(lecNorm)) return true;

  const espTokens = tokensNombreSignificativos(tokenizeNombre(esp));
  const lecTokens = tokenizeNombre(lec);
  if (!espTokens.length) return true;

  const coincidencias = contarTokensEsperadosEnLectura(espTokens, lecTokens);
  const minRequeridas = Math.max(2, Math.ceil(espTokens.length * 0.5));
  if (coincidencias >= minRequeridas) return true;

  const lecSig = tokensNombreSignificativos(lecTokens);
  if (lecSig.length >= 2) {
    const todasEnEsperado = lecSig.every((lt) =>
      espTokens.some((et) => tokenNombreCoincide(lt, et))
    );
    if (todasEnEsperado) return true;

    if (espTokens.length >= 2) {
      const firstEsp = espTokens[0];
      const lastEsp = espTokens[espTokens.length - 1];
      const firstLec = lecSig[0];
      const lastLec = lecSig[lecSig.length - 1];
      if (
        tokenNombreCoincide(firstLec, firstEsp) &&
        tokenNombreCoincide(lastLec, lastEsp)
      ) {
        return true;
      }
    }
  }

  return false;
}

function normalizarMonedaCanon(moneda) {
  const raw = normalizeText(moneda).replace(/\./g, "").replace(/\$/g, "");
  if (!raw) return "";

  for (const [canon, aliases] of Object.entries(MONEDA_ALIASES)) {
    if (aliases.some((alias) => raw === alias || raw.includes(alias))) {
      return canon;
    }
  }

  return raw;
}

function compararMonedaFlexible(esperada, leida) {
  const esp = String(esperada || "").trim();
  if (!esp) return true;

  const lec = String(leida || "").trim();
  if (!lec) return false;

  const espCanon = normalizarMonedaCanon(esp);
  const lecCanon = normalizarMonedaCanon(lec);
  if (espCanon && lecCanon && espCanon === lecCanon) return true;

  return normalizeText(esp) === normalizeText(lec);
}

function normalizarPaymentEsperado(payment = {}) {
  const p = payment && typeof payment === "object" ? payment : {};
  return {
    montoEsperado: toNumber(p.montoEsperado ?? p.monto_esperado, 0),
    monedaEsperada: String(p.monedaEsperada ?? p.moneda_esperada ?? "").trim(),
    nombreEsperado: String(p.nombreEsperado ?? p.nombre_esperado ?? "").trim(),
    tolerancia:
      parseFloat(p.tolerancia) >= 0
        ? parseFloat(p.tolerancia)
        : TOLERANCIA_MONTO_DEFAULT,
  };
}

function formatearLecturaSalida(lectura) {
  if (!lectura) return null;
  return {
    monto: toNumber(lectura.monto, 0),
    moneda: String(lectura.moneda || "").trim(),
    nombre: String(lectura.nombre || "").trim(),
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const direct = raw.match(/\{[\s\S]*\}/);
  if (!direct) return null;
  try {
    return JSON.parse(direct[0]);
  } catch (_) {
    return null;
  }
}

function esPdfComprobante({ mimeType, filename, imageUrl } = {}) {
  const mt = normalizeText(mimeType);
  if (mt === "application/pdf" || mt.includes("pdf")) return true;
  const fn = String(filename || "").toLowerCase();
  if (fn.endsWith(".pdf")) return true;
  const url = String(imageUrl || "").toLowerCase();
  return /\.pdf(\?|$)/.test(url) || url.includes("-doc.pdf");
}

function esImagenComprobante({ mimeType, filename } = {}) {
  const mt = normalizeText(mimeType);
  if (mt.startsWith("image/")) return true;
  const fn = String(filename || "").toLowerCase();
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/.test(fn);
}

function esDocumentoNoLegible({ mimeType, filename } = {}) {
  const mt = normalizeText(mimeType);
  const fn = String(filename || "").toLowerCase();
  if (esImagenComprobante({ mimeType, filename })) return false;
  if (esPdfComprobante({ mimeType, filename })) return false;
  if (!mt && !fn) return false;
  if (mt && !mt.startsWith("image/")) return true;
  if (/\.(doc|docx|xls|xlsx|zip|rar|txt|csv|mp4|mp3)$/.test(fn)) return true;
  return false;
}

async function analizarComprobanteConVision({ imageDataUrl, imagePublicUrl }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  if (!imageDataUrl && !imagePublicUrl) throw new Error("Imagen no disponible");

  const imageUrl = imageDataUrl || imagePublicUrl;
  const prompt = [
    "Extrae SOLO este JSON del comprobante de pago.",
    "Sin markdown y sin explicaciones.",
    'Formato exacto: {"monto":29,"moneda":"bs","nombre":"Marco Antonio Arias Perez"}',
    "Si falta un dato devuelve null en ese campo.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  }

  const content = data?.choices?.[0]?.message?.content || "";
  // TEMP LOG — respuesta RAW de Vision (antes de parse)
  console.log("[RAW_OPENAI_VISION_RESPONSE]", content);
  const parsed = extractJson(content);
  if (!parsed) throw new Error("No se pudo extraer JSON del comprobante");

  // TEMP LOG — valores originales post-JSON.parse (sin String/trim/|| "")
  console.log("[PARSED_OPENAI_VISION]", {
    monto: parsed.monto,
    moneda: parsed.moneda,
    nombre: parsed.nombre,
    montoType: typeof parsed.monto,
    monedaType: typeof parsed.moneda,
    nombreType: typeof parsed.nombre,
    nombreIsNull: parsed.nombre === null,
  });

  return {
    monto: toNumber(parsed.monto, 0),
    moneda: String(parsed.moneda || "").trim(),
    nombre: String(parsed.nombre || "").trim(),
  };
}

function calcularEspecificidadRuta(esperado, comparacion) {
  if (!comparacion?.valido) return 0;

  const tieneNombre = !!String(esperado?.nombreEsperado || "").trim();
  const tieneMoneda = !!String(esperado?.monedaEsperada || "").trim();

  if (
    tieneNombre &&
    comparacion.montoOk &&
    comparacion.monedaOk &&
    comparacion.nombreOk
  ) {
    return 3;
  }
  if (tieneMoneda && comparacion.montoOk && comparacion.monedaOk) {
    return 2;
  }
  if (comparacion.montoOk) {
    return 1;
  }
  return 0;
}

function compararPagoOpenAI(esperado, lectura) {
  const montoLeido = toNumber(lectura?.monto, 0);
  if (!lectura || montoLeido <= 0) {
    return {
      valido: false,
      motivo: "sin_monto",
      montoOk: false,
      monedaOk: false,
      nombreOk: false,
    };
  }

  const tolerancia = toNumber(esperado.tolerancia, TOLERANCIA_MONTO_DEFAULT);
  const montoOk =
    Math.abs(montoLeido - toNumber(esperado.montoEsperado, 0)) <= tolerancia;
  if (!montoOk) {
    return {
      valido: false,
      motivo: "monto_no_coincide",
      montoOk,
      monedaOk: false,
      nombreOk: false,
    };
  }

  const monedaOk = compararMonedaFlexible(esperado.monedaEsperada, lectura.moneda);
  if (!monedaOk) {
    return {
      valido: false,
      motivo: "moneda_no_coincide",
      montoOk,
      monedaOk,
      nombreOk: false,
    };
  }

  // TEMP LOG — comparar nombre
  console.log("[TEMP_PAYMENT_READER_NOMBRE_COMPARE_INPUT]", {
    nombreEsperado: esperado.nombreEsperado || null,
    lecturaNombre: lectura?.nombre ?? null,
  });
  const nombreOk = esperado.nombreEsperado
    ? compararNombreFlexible(esperado.nombreEsperado, lectura.nombre)
    : true;
  console.log("[TEMP_PAYMENT_READER_NOMBRE_COMPARE_RESULT]", {
    nombreEsperado: esperado.nombreEsperado || null,
    lecturaNombre: lectura?.nombre ?? null,
    nombreOk,
    seComparo: !!esperado.nombreEsperado,
  });
  if (!nombreOk) {
    return {
      valido: false,
      motivo: "nombre_no_coincide",
      montoOk,
      monedaOk,
      nombreOk,
    };
  }

  return {
    valido: true,
    motivo: null,
    montoOk,
    monedaOk,
    nombreOk,
  };
}

async function extraerLecturaComprobanteOpenAI({
  imageUrl,
  mimeType = null,
  filename = null,
  messageType = null,
} = {}) {
  if (!imageUrl) {
    const invalido = {
      ok: true,
      valido: false,
      motivo: "ocr_invalido",
      lectura: null,
    };
    console.log(
      "[OPENAI_PAYMENT_READER_VALIDATION]",
      JSON.stringify({ ...invalido, razon: "sin_imageUrl" })
    );
    return invalido;
  }

  if (esPdfComprobante({ mimeType, filename, imageUrl })) {
    console.log(
      "[OPENAI_PAYMENT_READER_OCR_START]",
      JSON.stringify({
        messageType: messageType || "document",
        mimeType: mimeType || "application/pdf",
        filename: filename || null,
        formato: "pdf",
      })
    );
    const invalidoPdf = {
      ok: true,
      valido: false,
      motivo: "formato_no_soportado",
      lectura: null,
    };
    console.log(
      "[OPENAI_PAYMENT_READER_OCR_RESULT]",
      JSON.stringify({ error: "pdf_no_soportado_por_vision" })
    );
    console.log("[OPENAI_PAYMENT_READER_VALIDATION]", JSON.stringify(invalidoPdf));
    return invalidoPdf;
  }

  const tipoMsg = messageType ? String(messageType).trim() : null;
  if (tipoMsg === "document" && esDocumentoNoLegible({ mimeType, filename })) {
    const invalidoFormato = {
      ok: true,
      valido: false,
      motivo: "formato_no_soportado",
      lectura: null,
    };
    console.log(
      "[OPENAI_PAYMENT_READER_VALIDATION]",
      JSON.stringify({
        ...invalidoFormato,
        mimeType: mimeType || null,
        filename: filename || null,
      })
    );
    return invalidoFormato;
  }

  console.log(
    "[OPENAI_PAYMENT_READER_OCR_START]",
    JSON.stringify({
      imageUrl: String(imageUrl).slice(0, 120),
      messageType: tipoMsg || null,
      mimeType: mimeType || null,
      filename: filename || null,
    })
  );

  let lectura = null;
  try {
    lectura = await analizarComprobanteConVision({ imagePublicUrl: imageUrl });
    console.log(
      "[OPENAI_PAYMENT_READER_OCR_RESULT]",
      JSON.stringify({ lectura: formatearLecturaSalida(lectura) })
    );
  } catch (error) {
    console.log(
      "[OPENAI_PAYMENT_READER_OCR_RESULT]",
      JSON.stringify({ error: error.message || String(error) })
    );
    const invalido = {
      ok: true,
      valido: false,
      motivo: "ocr_invalido",
      lectura: null,
    };
    console.log("[OPENAI_PAYMENT_READER_VALIDATION]", JSON.stringify(invalido));
    return invalido;
  }

  const lecturaSalida = formatearLecturaSalida(lectura);
  // TEMP LOG — OCR Vision exacto
  console.log("[TEMP_PAYMENT_READER_OCR_LECTURA]", {
    monto: lecturaSalida?.monto ?? null,
    moneda: lecturaSalida?.moneda ?? null,
    nombre: lecturaSalida?.nombre ?? null,
  });
  return {
    ok: true,
    valido: true,
    motivo: null,
    lectura: lecturaSalida,
  };
}

async function validarComprobanteOpenAI({
  imageUrl,
  imageMetaId = null,
  documentMetaId = null,
  metaToken = null,
  mimeType = null,
  filename = null,
  messageType = null,
  payment = {},
} = {}) {
  const esperado = normalizarPaymentEsperado(payment);

  const ocr = await extraerLecturaComprobanteOpenAI({
    imageUrl,
    mimeType,
    filename,
    messageType,
  });

  if (!ocr.valido || !ocr.lectura) {
    return {
      ok: true,
      valido: false,
      motivo: ocr.motivo || "ocr_invalido",
      lectura: ocr.lectura || null,
    };
  }

  const comparacion = compararPagoOpenAI(esperado, ocr.lectura);
  console.log(
    "[OPENAI_PAYMENT_READER_VALIDATION]",
    JSON.stringify({
      valido: comparacion.valido,
      motivo: comparacion.motivo,
      montoOk: comparacion.montoOk,
      monedaOk: comparacion.monedaOk,
      nombreOk: comparacion.nombreOk,
      lectura: ocr.lectura,
    })
  );

  if (!comparacion.valido) {
    return {
      ok: true,
      valido: false,
      motivo: comparacion.motivo,
      lectura: ocr.lectura,
    };
  }

  return {
    ok: true,
    valido: true,
    lectura: ocr.lectura,
  };
}

function evaluarRutasPaymentReaderContraLectura(rutasPaymentReader, lectura) {
  const candidatos = [];

  rutasPaymentReader.forEach((route, orden) => {
    const esperado = normalizarPaymentEsperado(route.payment);
    const comparacion = compararPagoOpenAI(esperado, lectura);
    const especificidad = calcularEspecificidadRuta(esperado, comparacion);

    console.log(
      "[OPENAI_PAYMENT_READER_EVAL_ROUTE]",
      JSON.stringify({
        routeId: route.id,
        routeNombre: route.nombre || null,
        orden,
        valido: comparacion.valido,
        motivo: comparacion.motivo || null,
        montoOk: comparacion.montoOk,
        monedaOk: comparacion.monedaOk,
        nombreOk: comparacion.nombreOk,
        especificidad,
        payment: esperado,
      })
    );

    if (comparacion.valido) {
      candidatos.push({ route, comparacion, especificidad, orden });
    }
  });

  if (!candidatos.length) return null;

  candidatos.sort((a, b) => {
    if (b.especificidad !== a.especificidad) {
      return b.especificidad - a.especificidad;
    }
    return a.orden - b.orden;
  });

  return candidatos[0];
}

module.exports = {
  validarComprobanteOpenAI,
  extraerLecturaComprobanteOpenAI,
  analizarComprobanteConVision,
  compararPagoOpenAI,
  calcularEspecificidadRuta,
  evaluarRutasPaymentReaderContraLectura,
  compararMonedaFlexible,
  compararNombreFlexible,
  normalizarPaymentEsperado,
};
