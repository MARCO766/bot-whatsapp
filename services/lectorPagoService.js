/**
 * MacBot — Lector de Pago v1
 * Lee monto, moneda y nombre de comprobante con OpenAI Vision.
 */

const axios = require("axios");
const { enviarTextoWhatsApp } = require("./whatsappService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const VISION_MODEL = "gpt-4o-mini";
const VISION_TIMEOUT_MS = 25000;

const MONEDA_BS_VARIANTES = new Set([
  "bs",
  "bs.",
  "bob",
  "bolivianos",
  "boliviano",
]);

const MENSAJE_PEDIR_FOTO_DEFAULT =
  "📸 Envíame una foto clara de tu comprobante de pago.";

const MENSAJE_SIN_ESTADO =
  "No tengo una verificación de pago activa. Escribe el activador nuevamente.";

const MENSAJE_INVALIDO =
  "No pude validar el pago. Verifica que el monto y moneda se vean claros.";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function decodeHtmlJson(raw) {
  return String(raw || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function esNodoLectorPago(nodo) {
  if (!nodo) return false;

  const tipo = String(
    nodo.type ||
      nodo.tipo ||
      nodo.dataset?.tipo ||
      nodo.data?.type ||
      nodo.data?.nodeType ||
      ""
  ).toLowerCase();

  const html = nodo.html || "";
  const className = String(nodo.className || "");

  return (
    tipo === "lector_pago" ||
    tipo === "lector-pago" ||
    className.includes("lector-pago-node") ||
    html.includes("lector-pago-data")
  );
}

function parseLectorPagoFromNodo(nodo) {
  const defaults = {
    monto_esperado: 0,
    moneda_esperada: "BS",
    tolerancia: 0.5,
    producto_texto: "",
    mensaje_pedir_foto: MENSAJE_PEDIR_FOTO_DEFAULT,
    etiqueta_pagado: "PAGADO",
  };

  const html = nodo?.html || "";
  const dataNodo = nodo?.data && typeof nodo.data === "object" ? nodo.data : {};

  const match = html.match(
    /<textarea[^>]*class="lector-pago-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );

  let parsed = {};
  if (match) {
    try {
      parsed = JSON.parse(decodeHtmlJson(match[1]));
    } catch {
      parsed = {};
    }
  }

  const montoRaw =
    parsed.monto_esperado ??
    parsed.monto ??
    dataNodo.monto_esperado ??
    dataNodo.monto ??
    0;

  const monedaRaw =
    parsed.moneda_esperada ??
    parsed.moneda ??
    dataNodo.moneda_esperada ??
    dataNodo.moneda ??
    defaults.moneda_esperada;

  const toleranciaRaw =
    parsed.tolerancia ?? dataNodo.tolerancia ?? defaults.tolerancia;

  const tolerancia = parseFloat(toleranciaRaw);
  const monto = parseFloat(montoRaw);

  return {
    monto_esperado: Number.isFinite(monto) ? monto : 0,
    moneda_esperada: normalizarMoneda(monedaRaw) || "BS",
    tolerancia: Number.isFinite(tolerancia) ? tolerancia : 0.5,
    producto_texto: String(
      parsed.producto_texto ?? dataNodo.producto_texto ?? ""
    ).trim(),
    mensaje_pedir_foto: String(
      parsed.mensaje_pedir_foto ??
        dataNodo.mensaje_pedir_foto ??
        MENSAJE_PEDIR_FOTO_DEFAULT
    ).trim(),
    etiqueta_pagado: String(
      parsed.etiqueta_pagado ?? dataNodo.etiqueta_pagado ?? "PAGADO"
    ).trim(),
  };
}

function normalizarMoneda(moneda) {
  const limpio = String(moneda || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "");

  if (!limpio) return "";

  if (MONEDA_BS_VARIANTES.has(limpio) || limpio.startsWith("bs")) {
    return "BS";
  }

  return String(moneda || "")
    .trim()
    .toUpperCase();
}

function parseMonto(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor;
  }

  const texto = String(valor || "");
  const match = texto.match(/(\d[\d.,]*)/);
  if (!match) return null;

  let numStr = match[1];
  if (numStr.includes(",") && numStr.includes(".")) {
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else {
    numStr = numStr.replace(",", ".");
  }

  const n = parseFloat(numStr);
  return Number.isFinite(n) ? n : null;
}

function extraerJsonDeTexto(texto) {
  const raw = String(texto || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function compararPago({ montoEsperado, monedaEsperada, tolerancia, ocr }) {
  const montoDetectado = parseMonto(ocr?.monto);
  const monedaDetectada = normalizarMoneda(ocr?.moneda);
  const monedaEsperadaNorm = normalizarMoneda(monedaEsperada);
  const tol = Number.isFinite(tolerancia) ? tolerancia : 0.5;

  const montoOk =
    montoDetectado != null &&
    Math.abs(montoDetectado - montoEsperado) <= tol;

  const monedaOk =
    !!monedaDetectada &&
    !!monedaEsperadaNorm &&
    monedaDetectada === monedaEsperadaNorm;

  return {
    valido: montoOk && monedaOk,
    montoDetectado,
    monedaDetectada,
    montoOk,
    monedaOk,
  };
}

async function crearEstadoLectorPago(payload) {
  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado`,
    payload,
    { headers: supabaseHeaders({ Prefer: "return=representation" }) }
  );
  return Array.isArray(res.data) ? res.data[0] : res.data;
}

async function buscarEstadoActivo(usuarioId, clienteNumero) {
  const url =
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado` +
    `?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
    `&cliente_numero=eq.${encodeURIComponent(clienteNumero)}` +
    `&esperando_pago=eq.true` +
    `&order=creado_en.desc` +
    `&limit=1`;

  const res = await axios.get(url, { headers: supabaseHeaders() });
  return res.data?.[0] || null;
}

async function actualizarEstadoLectorPago(id, patch) {
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${encodeURIComponent(id)}`,
    {
      ...patch,
      actualizado_en: new Date().toISOString(),
    },
    { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
  );
}

async function agregarEtiquetaCliente(numero, etiqueta, usuarioId) {
  if (!numero || !etiqueta || !usuarioId) return;

  const etiquetaLimpia = etiqueta.trim();

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&etiqueta=eq.${encodeURIComponent(etiquetaLimpia)}`,
    { headers: supabaseHeaders() }
  );

  await axios.post(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
    {
      cliente_numero: numero,
      etiqueta: etiquetaLimpia,
      usuario_id: usuarioId,
    },
    { headers: supabaseHeaders({ Prefer: "return=minimal" }) }
  );
}

async function leerComprobanteVision(imagenUrl) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Lee esta imagen de comprobante de pago. Extrae SOLO monto, moneda y nombre. Devuelve únicamente JSON válido con este formato exacto: {\"monto\": number, \"moneda\": string, \"nombre\": string, \"confianza\": number}",
              },
              {
                type: "image_url",
                image_url: { url: imagenUrl },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    return extraerJsonDeTexto(content);
  } finally {
    clearTimeout(timer);
  }
}

async function ejecutarNodoLectorPago({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  nodo,
}) {
  console.log("[LECTOR_PAGO_V1] entrando nodo", {
    numero,
    flujoId,
    nodoId,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !numero) {
    console.log("[LECTOR_PAGO_V1] omitido (sin supabase o lead)");
    return { ok: false };
  }

  const cfg = parseLectorPagoFromNodo(nodo);

  try {
    const estado = await crearEstadoLectorPago({
      usuario_id: usuarioId,
      cliente_numero: String(numero).trim(),
      flujo_id: flujoId ? String(flujoId) : null,
      nodo_id: nodoId ? String(nodoId) : null,
      esperando_pago: true,
      monto_esperado: cfg.monto_esperado,
      moneda_esperada: cfg.moneda_esperada,
      tolerancia: cfg.tolerancia,
      producto_texto: cfg.producto_texto || null,
      estado_pago: "esperando",
    });

    console.log("[LECTOR_PAGO_V1] estado creado", {
      id: estado?.id,
      monto_esperado: cfg.monto_esperado,
      moneda_esperada: cfg.moneda_esperada,
    });

    await enviarTextoWhatsApp(numero, cfg.mensaje_pedir_foto, { usuarioId });

    return { ok: true, estadoId: estado?.id };
  } catch (err) {
    console.error(
      "[LECTOR_PAGO_V1] error creando estado:",
      err.response?.data || err.message
    );
    return { ok: false };
  }
}

async function procesarImagenLectorPago({
  usuarioId,
  clienteNumero,
  imagenUrl,
  responderSinEstado = false,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero || !imagenUrl) {
    return false;
  }

  console.log("[LECTOR_PAGO_V1] imagen recibida", {
    usuarioId,
    clienteNumero,
  });

  let estado;
  try {
    estado = await buscarEstadoActivo(usuarioId, clienteNumero);
  } catch (err) {
    console.error(
      "[LECTOR_PAGO_V1] error buscando estado:",
      err.response?.data || err.message
    );
    return false;
  }

  if (!estado) {
    if (responderSinEstado) {
      await enviarTextoWhatsApp(clienteNumero, MENSAJE_SIN_ESTADO, { usuarioId });
      return true;
    }
    return false;
  }

  let ocr = null;
  try {
    ocr = await leerComprobanteVision(imagenUrl);
    console.log("[LECTOR_PAGO_V1] OCR resultado", ocr);
  } catch (err) {
    console.error("[LECTOR_PAGO_V1] OCR error:", err.message || err);
    await actualizarEstadoLectorPago(estado.id, {
      estado_pago: "invalido",
      esperando_pago: true,
    });
    await enviarTextoWhatsApp(clienteNumero, MENSAJE_INVALIDO, { usuarioId });
    console.log("[LECTOR_PAGO_V1] pago invalido");
    return true;
  }

  const comparacion = compararPago({
    montoEsperado: parseFloat(estado.monto_esperado),
    monedaEsperada: estado.moneda_esperada,
    tolerancia: parseFloat(estado.tolerancia),
    ocr,
  });

  console.log("[LECTOR_PAGO_V1] comparacion", comparacion);

  const confianza = parseFloat(ocr?.confianza);
  const nombreDetectado = String(ocr?.nombre || "").trim() || null;

  if (comparacion.valido) {
    const ahora = new Date().toISOString();

    await actualizarEstadoLectorPago(estado.id, {
      estado_pago: "valido",
      esperando_pago: false,
      monto_detectado: comparacion.montoDetectado,
      moneda_detectada: comparacion.monedaDetectada,
      nombre_detectado: nombreDetectado,
      confianza: Number.isFinite(confianza) ? confianza : null,
      pagado_en: ahora,
    });

    if (estado.producto_texto) {
      await enviarTextoWhatsApp(clienteNumero, estado.producto_texto, {
        usuarioId,
      });
    }

    try {
      await agregarEtiquetaCliente(clienteNumero, "PAGADO", usuarioId);
    } catch (err) {
      console.log("[LECTOR_PAGO_V1] etiqueta omitida:", err.message || err);
    }

    console.log("[LECTOR_PAGO_V1] pago valido");
    return true;
  }

  await actualizarEstadoLectorPago(estado.id, {
    estado_pago: "invalido",
    esperando_pago: true,
    monto_detectado: comparacion.montoDetectado,
    moneda_detectada: comparacion.monedaDetectada,
    nombre_detectado: nombreDetectado,
    confianza: Number.isFinite(confianza) ? confianza : null,
  });

  await enviarTextoWhatsApp(clienteNumero, MENSAJE_INVALIDO, { usuarioId });
  console.log("[LECTOR_PAGO_V1] pago invalido");
  return true;
}

module.exports = {
  esNodoLectorPago,
  parseLectorPagoFromNodo,
  ejecutarNodoLectorPago,
  procesarImagenLectorPago,
  normalizarMoneda,
  compararPago,
};
