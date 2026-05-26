const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

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
    .trim();
}

function parseNodoConfig(nodo) {
  const data = nodo?.data || {};
  const html = String(nodo?.html || "");
  let parsedHtmlConfig = {};

  const match = html.match(
    /<textarea[^>]*class="lector-pago-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  const matchAlt = html.match(
    /<textarea[^>]*class="lector_pago-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  const rawConfig = match?.[1] || matchAlt?.[1] || "";

  if (rawConfig) {
    try {
      parsedHtmlConfig = JSON.parse(decodeHtmlEntities(rawConfig));
    } catch (e) {
      console.log("[LECTOR_PAGO] JSON inválido en nodo:", e.message);
    }
  }

  const montoEsperado = toNumber(
    data.monto_esperado ??
      data.montoEsperado ??
      parsedHtmlConfig.monto_esperado ??
      parsedHtmlConfig.montoEsperado,
    0
  );

  const monedaEsperada = String(
    data.moneda_esperada ??
      data.monedaEsperada ??
      parsedHtmlConfig.moneda_esperada ??
      parsedHtmlConfig.monedaEsperada ??
      "bs"
  )
    .trim()
    .toLowerCase();

  const nombreEsperado = String(
    data.nombre_esperado ??
      data.nombreEsperado ??
      parsedHtmlConfig.nombre_esperado ??
      parsedHtmlConfig.nombreEsperado ??
      ""
  ).trim();

  const tolerancia = toNumber(
    data.tolerancia ?? parsedHtmlConfig.tolerancia,
    0.01
  );

  const mensajeValido = String(
    data.mensaje_pago_valido ??
      data.mensajePagoValido ??
      parsedHtmlConfig.mensaje_pago_valido ??
      parsedHtmlConfig.mensajePagoValido ??
      "Pago valido. Gracias, estamos verificando internamente."
  ).trim();

  const mensajeInvalido = String(
    data.mensaje_pago_invalido ??
      data.mensajePagoInvalido ??
      parsedHtmlConfig.mensaje_pago_invalido ??
      parsedHtmlConfig.mensajePagoInvalido ??
      "Pago invalido. Verifica el comprobante e intentalo nuevamente."
  ).trim();

  return {
    montoEsperado,
    monedaEsperada,
    nombreEsperado,
    tolerancia,
    mensajeValido,
    mensajeInvalido,
  };
}

async function iniciarEsperaLectorPago({
  usuarioId,
  clienteNumero,
  flujoId,
  nodoId,
  nodo,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) return null;

  const cfg = parseNodoConfig(nodo);

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(
      clienteNumero
    )}&esperando_pago=eq.true`,
    {
      esperando_pago: false,
      actualizado_en: new Date().toISOString(),
    },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  const payload = {
    usuario_id: usuarioId,
    cliente_numero: clienteNumero,
    flujo_id: String(flujoId || ""),
    nodo_id: String(nodoId || ""),
    esperando_pago: true,
    monto_esperado: cfg.montoEsperado,
    moneda_esperada: cfg.monedaEsperada,
    nombre_esperado: cfg.nombreEsperado || null,
    tolerancia: cfg.tolerancia,
    estado_pago: "pendiente",
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  };

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado`,
    payload,
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  return {
    estado: res.data?.[0] || payload,
    config: cfg,
  };
}

async function obtenerEstadoPagoActivo({ usuarioId, clienteNumero }) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(
      clienteNumero
    )}&esperando_pago=eq.true&order=actualizado_en.desc&limit=1`,
    { headers: supabaseHeaders() }
  );

  return res.data?.[0] || null;
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

async function descargarImagenMeta(mediaId, token) {
  if (!mediaId || !token) return null;

  const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const mediaUrl = info.data?.url;
  const mimeType = info.data?.mime_type || "image/jpeg";
  if (!mediaUrl) return null;

  const file = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${token}` },
  });

  const base64 = Buffer.from(file.data).toString("base64");
  return {
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
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
  const parsed = extractJson(content);
  if (!parsed) throw new Error("No se pudo extraer JSON del comprobante");

  return {
    monto: toNumber(parsed.monto, 0),
    moneda: String(parsed.moneda || "").trim().toLowerCase(),
    nombre: String(parsed.nombre || "").trim(),
  };
}

function compararPago(estado, lectura) {
  const esperadoMonto = toNumber(estado.monto_esperado, 0);
  const tolerancia = toNumber(estado.tolerancia, 0.01);
  const esperadoMoneda = String(estado.moneda_esperada || "").trim().toLowerCase();
  const esperadoNombre = String(estado.nombre_esperado || "").trim();

  const montoOk = Math.abs(toNumber(lectura.monto, 0) - esperadoMonto) <= tolerancia;
  const monedaOk = esperadoMoneda
    ? normalizeText(lectura.moneda) === normalizeText(esperadoMoneda)
    : true;

  const nombreOk = esperadoNombre
    ? normalizeText(lectura.nombre).includes(normalizeText(esperadoNombre))
    : true;

  return {
    montoOk,
    monedaOk,
    nombreOk,
    valido: montoOk && monedaOk && nombreOk,
  };
}

async function procesarImagenLectorPago({
  usuarioId,
  clienteNumero,
  imageMetaId,
  metaToken,
  imagePublicUrl,
}) {
  if (!usuarioId || !clienteNumero) return { handled: false };

  const estado = await obtenerEstadoPagoActivo({ usuarioId, clienteNumero });
  if (!estado) return { handled: false };

  try {
    const media = await descargarImagenMeta(imageMetaId, metaToken);
    const lectura = await analizarComprobanteConVision({
      imageDataUrl: media?.dataUrl || null,
      imagePublicUrl: imagePublicUrl || null,
    });
    const comparacion = compararPago(estado, lectura);
    const estadoPago = comparacion.valido ? "valido" : "invalido";

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}`,
      {
        esperando_pago: false,
        estado_pago: estadoPago,
        actualizado_en: new Date().toISOString(),
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    return {
      handled: true,
      valido: comparacion.valido,
      lectura,
      comparacion,
      mensaje: comparacion.valido
        ? "Pago valido. Comprobante recibido correctamente."
        : "Pago invalido. Monto, moneda o nombre no coinciden.",
    };
  } catch (error) {
    console.log("[LECTOR_PAGO] error validando comprobante:", error.message);
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}`,
      {
        esperando_pago: false,
        estado_pago: "invalido",
        actualizado_en: new Date().toISOString(),
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    return {
      handled: true,
      valido: false,
      mensaje: "Pago invalido. No se pudo validar el comprobante.",
    };
  }
}

module.exports = {
  iniciarEsperaLectorPago,
  procesarImagenLectorPago,
};
