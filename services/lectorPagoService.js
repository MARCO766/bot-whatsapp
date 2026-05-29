const axios = require("axios");
const { enviarTextoWhatsApp } = require("./whatsappService");

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

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

/** Multi-número: misma línea o legacy (ambos null). */
function filtroConexionLector(conexionWhatsappId) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  if (conexion) {
    return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexion)}`;
  }
  return "&conexion_whatsapp_id=is.null";
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

  const mensajePedirFoto = String(
    data.mensaje_pedir_foto ??
      data.mensajePedirFoto ??
      parsedHtmlConfig.mensaje_pedir_foto ??
      parsedHtmlConfig.mensajePedirFoto ??
      ""
  ).trim();

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

  const productoTexto = String(
    data.producto_texto ??
      data.productoTexto ??
      parsedHtmlConfig.producto_texto ??
      parsedHtmlConfig.productoTexto ??
      ""
  ).trim();

  const productoUrl = String(
    data.producto_url ??
      data.productoUrl ??
      parsedHtmlConfig.producto_url ??
      parsedHtmlConfig.productoUrl ??
      ""
  ).trim();

  return {
    montoEsperado,
    monedaEsperada,
    nombreEsperado,
    tolerancia,
    mensajePedirFoto,
    mensajeValido,
    mensajeInvalido,
    productoTexto,
    productoUrl,
  };
}

function logInsertError(err) {
  const detalle = err.response?.data || err.message;
  console.error("[LECTOR_PAGO_V1] insert error", detalle);
}

function buildPayloadEstadoLector({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  flujoId,
  nodoId,
  cfg,
  extended,
}) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const base = {
    usuario_id: usuarioId,
    cliente_numero: clienteNumero,
    flujo_id: String(flujoId || ""),
    nodo_id: String(nodoId || ""),
    esperando_pago: true,
    estado_pago: "esperando",
    monto_esperado: cfg.montoEsperado,
    moneda_esperada: cfg.monedaEsperada,
    nombre_esperado: cfg.nombreEsperado || null,
    tolerancia: cfg.tolerancia,
    conexion_whatsapp_id: conexion,
  };

  if (!extended) return base;

  const extra = {};
  if (cfg.productoTexto) extra.producto_texto = cfg.productoTexto;
  if (cfg.productoUrl) extra.producto_url = cfg.productoUrl;

  return { ...base, ...extra };
}

async function insertarEstadoLectorPago(payload) {
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
  return res.data?.[0] || null;
}

function tieneConfianzaSuficiente(lectura) {
  if (!lectura) return false;
  const monto = toNumber(lectura.monto, 0);
  const moneda = String(lectura.moneda || "").trim();
  if (monto <= 0 || !moneda || moneda === "null") return false;
  return true;
}

function armarMensajeEntregaProducto(estado) {
  const partes = [];
  const msgValido = String(estado.mensaje_pago_valido || "").trim();
  const productoTexto = String(estado.producto_texto || "").trim();
  const productoUrl = String(estado.producto_url || "").trim();

  if (msgValido) partes.push(msgValido);
  if (productoTexto) partes.push(productoTexto);
  if (productoUrl) partes.push(productoUrl);

  return partes.join("\n").trim();
}

async function enviarMensajesWhatsApp(numero, mensajes, usuarioId, conexionWhatsappId) {
  const lista = (Array.isArray(mensajes) ? mensajes : [mensajes])
    .map((m) => String(m || "").trim())
    .filter(Boolean);

  const conexion = normalizarConexionId(conexionWhatsappId);
  const opEnvio = { usuarioId };
  if (conexion) {
    opEnvio.conexionWhatsappId = conexion;
    opEnvio.strictConexionWhatsappId = true;
  }

  for (const texto of lista) {
    await enviarTextoWhatsApp(numero, texto, opEnvio);
  }

  return lista.length;
}

async function iniciarEsperaLectorPago({
  usuarioId,
  clienteNumero,
  conexionWhatsappId = null,
  flujoId,
  nodoId,
  nodo,
}) {
  const conexion = normalizarConexionId(conexionWhatsappId);

  console.log("[LECTOR_PAGO_V1] entrando nodo", {
    usuarioId,
    clienteNumero,
    conexion_whatsapp_id: conexion,
    flujoId,
    nodoId,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const err = new Error("Supabase no configurado");
    console.error("[LECTOR_PAGO_V1] insert error", err.message);
    throw err;
  }

  if (!usuarioId || !clienteNumero) {
    const err = new Error("Falta usuario_id o cliente_numero");
    console.error("[LECTOR_PAGO_V1] insert error", err.message);
    throw err;
  }

  const cfg = parseNodoConfig(nodo);
  console.log("[LECTOR_PAGO_V1] config recibida", {
    monto_esperado: cfg.montoEsperado,
    moneda_esperada: cfg.monedaEsperada,
    nombre_esperado: cfg.nombreEsperado,
    tolerancia: cfg.tolerancia,
    producto_texto: cfg.productoTexto ? "(si)" : "(no)",
    producto_url: cfg.productoUrl ? "(si)" : "(no)",
    mensaje_pedir_foto: cfg.mensajePedirFoto ? "(si)" : "(no)",
  });

  console.log("[LECTOR_PAGO_V1] creando estado");

  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(
        clienteNumero
      )}${filtroConexionLector(conexion)}&esperando_pago=eq.true`,
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
  } catch (err) {
    console.log(
      "[LECTOR_PAGO_V1] aviso: no se pudo cerrar estado anterior:",
      err.response?.data?.message || err.message
    );
  }

  const ctx = { usuarioId, clienteNumero, conexionWhatsappId: conexion, flujoId, nodoId, cfg };
  let estado = null;

  const payloadExtendido = buildPayloadEstadoLector({ ...ctx, extended: true });
  console.log("[LECTOR_PAGO_V1] insert payload", payloadExtendido);

  try {
    estado = await insertarEstadoLectorPago(payloadExtendido);
  } catch (errExt) {
    logInsertError(errExt);
    const payloadMinimo = buildPayloadEstadoLector({ ...ctx, extended: false });
    console.log("[LECTOR_PAGO_V1] insert payload (minimo)", payloadMinimo);
    try {
      estado = await insertarEstadoLectorPago(payloadMinimo);
    } catch (errMin) {
      logInsertError(errMin);
      throw errMin;
    }
  }

  if (!estado?.id) {
    const err = new Error("Insert sin fila devuelta");
    console.error("[LECTOR_PAGO_V1] insert error", err.message);
    throw err;
  }

  console.log("[LECTOR_PAGO_V1] insert ok", { id: estado.id });

  const estadoConConfig = {
    ...estado,
    mensaje_pago_valido: cfg.mensajeValido,
    mensaje_pago_invalido: cfg.mensajeInvalido,
    producto_texto: estado.producto_texto || cfg.productoTexto || null,
    producto_url: estado.producto_url || cfg.productoUrl || null,
  };

  const msgPedir = cfg.mensajePedirFoto;
  if (msgPedir) {
    console.log("[LECTOR_PAGO_V1] enviando mensaje pedir foto");
    await enviarMensajesWhatsApp(clienteNumero, msgPedir, usuarioId, conexion);
  } else {
    console.log("[LECTOR_PAGO_V1] sin mensaje_pedir_foto configurado");
  }

  return {
    ok: true,
    estado: estadoConConfig,
    config: cfg,
  };
}

async function obtenerEstadoPagoActivo({ usuarioId, clienteNumero, conexionWhatsappId }) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(
      clienteNumero
    )}${filtroConexionLector(conexionWhatsappId)}&esperando_pago=eq.true&order=actualizado_en.desc&limit=1`,
    { headers: supabaseHeaders() }
  );

  return res.data?.[0] || null;
}

async function obtenerUltimoEstadoLector({ usuarioId, clienteNumero, conexionWhatsappId }) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(
      clienteNumero
    )}${filtroConexionLector(conexionWhatsappId)}&order=actualizado_en.desc&limit=1`,
    { headers: supabaseHeaders() }
  );

  return res.data?.[0] || null;
}

function productoYaEntregado(estado) {
  if (!estado) return false;
  if (estado.producto_entregado_at) return true;
  return estado.estado_pago === "valido" && !!estado.pagado_en;
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
  conexionWhatsappId = null,
  imageMetaId,
  metaToken,
  imagePublicUrl,
}) {
  if (!usuarioId || !clienteNumero) return { handled: false };

  const conexion = normalizarConexionId(conexionWhatsappId);

  let estado = await obtenerEstadoPagoActivo({
    usuarioId,
    clienteNumero,
    conexionWhatsappId: conexion,
  });

  if (!estado) {
    const ultimo = await obtenerUltimoEstadoLector({
      usuarioId,
      clienteNumero,
      conexionWhatsappId: conexion,
    });
    if (productoYaEntregado(ultimo)) {
      console.log("[LECTOR_PAGO_V1] producto ya entregado, ignorando duplicado");
      return {
        handled: true,
        valido: true,
        duplicado: true,
        enviadoPorServicio: true,
      };
    }
    return { handled: false };
  }

  if (productoYaEntregado(estado)) {
    console.log("[LECTOR_PAGO_V1] producto ya entregado, ignorando duplicado");
    return {
      handled: true,
      valido: true,
      duplicado: true,
      enviadoPorServicio: true,
    };
  }

  const ahora = new Date().toISOString();
  const msgInvalidoDefault =
    String(estado.mensaje_pago_invalido || "").trim() ||
    "Pago invalido. Monto, moneda o nombre no coinciden.";

  try {
    const media = await descargarImagenMeta(imageMetaId, metaToken);
    const lectura = await analizarComprobanteConVision({
      imageDataUrl: media?.dataUrl || null,
      imagePublicUrl: imagePublicUrl || null,
    });

    const confianzaOk = tieneConfianzaSuficiente(lectura);
    const comparacion = compararPago(estado, lectura);
    const pagoValido = confianzaOk && comparacion.valido;

    if (!pagoValido) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}&esperando_pago=eq.true`,
        {
          estado_pago: "invalido",
          actualizado_en: ahora,
        },
        {
          headers: supabaseHeaders({
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          }),
        }
      );

      await enviarMensajesWhatsApp(
        clienteNumero,
        msgInvalidoDefault,
        usuarioId,
        conexion || estado.conexion_whatsapp_id
      );
      console.log("[LECTOR_PAGO_V1] pago invalido, permanece esperando");

      return {
        handled: true,
        valido: false,
        continuarFlujo: false,
        conexionWhatsappId: conexion || estado.conexion_whatsapp_id || null,
        lectura,
        comparacion,
        confianzaOk,
        mensaje: msgInvalidoDefault,
        enviadoPorServicio: true,
      };
    }

    console.log("[LECTOR_PAGO_V1] pago valido, entrega producto");

    const patchValido = await axios.patch(
      `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}&esperando_pago=eq.true`,
      {
        esperando_pago: false,
        estado_pago: "valido",
        pagado_en: ahora,
        actualizado_en: ahora,
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    if (!patchValido.data?.length) {
      console.log("[LECTOR_PAGO_V1] producto ya entregado, ignorando duplicado");
      return {
        handled: true,
        valido: true,
        duplicado: true,
        enviadoPorServicio: true,
      };
    }

    estado = patchValido.data[0] || estado;

    const mensajeEntrega = armarMensajeEntregaProducto(estado);
    if (mensajeEntrega) {
      console.log("[LECTOR_PAGO_V1] enviando producto");
      await enviarMensajesWhatsApp(
        clienteNumero,
        mensajeEntrega,
        usuarioId,
        conexion || estado.conexion_whatsapp_id
      );
      console.log("[LECTOR_PAGO_V1] producto enviado");

      await axios.patch(
        `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}`,
        {
          producto_entregado_at: ahora,
          actualizado_en: ahora,
        },
        {
          headers: supabaseHeaders({
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          }),
        }
      );
    } else {
      const msgValido =
        String(estado.mensaje_pago_valido || "").trim() ||
        "Pago valido. Comprobante recibido correctamente.";
      await enviarMensajesWhatsApp(
        clienteNumero,
        msgValido,
        usuarioId,
        conexion || estado.conexion_whatsapp_id
      );
    }

    return {
      handled: true,
      valido: true,
      continuarFlujo: true,
      flujoId: estado.flujo_id || null,
      nodoId: estado.nodo_id || null,
      conexionWhatsappId:
        conexion || normalizarConexionId(estado.conexion_whatsapp_id) || null,
      lectura,
      comparacion,
      mensaje: mensajeEntrega,
      enviadoPorServicio: true,
    };
  } catch (error) {
    console.log("[LECTOR_PAGO] error validando comprobante:", error.message);

    try {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/lector_pagos_estado?id=eq.${estado.id}&esperando_pago=eq.true`,
        {
          estado_pago: "invalido",
          actualizado_en: ahora,
        },
        {
          headers: supabaseHeaders({
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          }),
        }
      );
    } catch (patchErr) {
      console.log(
        "[LECTOR_PAGO_V1] aviso patch error:",
        patchErr.response?.data || patchErr.message
      );
    }

    const msgError =
      String(estado.mensaje_pago_invalido || "").trim() ||
      "Pago invalido. No se pudo validar el comprobante.";
    await enviarMensajesWhatsApp(
      clienteNumero,
      msgError,
      usuarioId,
      conexion || estado.conexion_whatsapp_id
    );
    console.log("[LECTOR_PAGO_V1] pago invalido, permanece esperando");

    return {
      handled: true,
      valido: false,
      continuarFlujo: false,
      conexionWhatsappId: conexion || estado.conexion_whatsapp_id || null,
      mensaje: msgError,
      enviadoPorServicio: true,
    };
  }
}

async function cancelarEsperaLectorPagoPorResetbot({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const conexion = normalizarConexionId(conexionWhatsappId);

  if (!conexion) {
    console.log(
      "[LECTOR_PAGO_MULTI] resetbot omitido sin conexionWhatsappId",
      { cliente_numero: clienteNumero, usuario_id: usuarioId }
    );
    return { ok: false, filasCanceladas: 0 };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) {
    return { ok: false, filasCanceladas: 0 };
  }

  const ahora = new Date().toISOString();
  const url =
    `${SUPABASE_URL}/rest/v1/lector_pagos_estado?usuario_id=eq.${encodeURIComponent(
      usuarioId
    )}&cliente_numero=eq.${encodeURIComponent(
      clienteNumero
    )}${filtroConexionLector(conexion)}&esperando_pago=eq.true`;

  const patchBody = {
    esperando_pago: false,
    estado_pago: "cancelado_resetbot",
    actualizado_en: ahora,
  };

  try {
    const res = await axios.patch(url, patchBody, {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    });
    const filasCanceladas = Array.isArray(res.data) ? res.data.length : 0;
    console.log("[LECTOR_PAGO_RESETBOT]", {
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexion,
      filas_canceladas: filasCanceladas,
    });
    return { ok: true, filasCanceladas };
  } catch (err) {
    if (err.response?.status === 400 || err.response?.status === 422) {
      try {
        const res = await axios.patch(
          url,
          { esperando_pago: false, actualizado_en: ahora },
          {
            headers: supabaseHeaders({
              "Content-Type": "application/json",
              Prefer: "return=representation",
            }),
          }
        );
        const filasCanceladas = Array.isArray(res.data) ? res.data.length : 0;
        console.log("[LECTOR_PAGO_RESETBOT]", {
          cliente_numero: clienteNumero,
          conexion_whatsapp_id: conexion,
          filas_canceladas: filasCanceladas,
        });
        return { ok: true, filasCanceladas };
      } catch (errMin) {
        console.log(
          "[LECTOR_PAGO_RESETBOT] error:",
          errMin.response?.data || errMin.message
        );
        return { ok: false, filasCanceladas: 0 };
      }
    }
    console.log(
      "[LECTOR_PAGO_RESETBOT] error:",
      err.response?.data || err.message
    );
    return { ok: false, filasCanceladas: 0 };
  }
}

module.exports = {
  iniciarEsperaLectorPago,
  procesarImagenLectorPago,
  cancelarEsperaLectorPagoPorResetbot,
};
