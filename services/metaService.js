const axios = require("axios");
const crypto = require("crypto");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GRAPH_VERSION = "v19.0";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function maskId(value) {
  if (!value || typeof value !== "string") return null;
  const s = String(value).trim();
  if (s.length <= 6) return "******";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function maskPixelId(value) {
  if (!value || typeof value !== "string") return null;
  const s = String(value).trim();
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}${"*".repeat(8)}${s.slice(-4)}`;
}

function normalizeConexionWhatsappId(opciones = {}) {
  const raw =
    opciones.conexionWhatsappId ?? opciones.conexion_whatsapp_id ?? null;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

function normalizeClienteNumero(telefono) {
  return String(telefono || "").replace(/\D/g, "");
}

function hashTelefonoMeta(telefono) {
  const digits = normalizeClienteNumero(telefono);
  if (!digits) return null;
  return crypto.createHash("sha256").update(digits).digest("hex");
}

function buildMetaEventId(eventName, usuarioId, clienteNumero, conexionWhatsappId) {
  const num = normalizeClienteNumero(clienteNumero) || "unknown";
  const conn = conexionWhatsappId || "none";
  const ts = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `meta_${eventName}_${usuarioId}_${num}_${conn}_${ts}_${random}`;
}

function normalizeTestEventCode(opciones = {}) {
  const raw = opciones.testEventCode ?? opciones.test_event_code ?? "";
  const code = String(raw).trim();
  return code || null;
}

function metaErrorMessage(error) {
  const apiErr = error?.response?.data?.error;
  if (apiErr && typeof apiErr === "object") {
    return {
      message: String(apiErr.message || error?.message || "Error Meta CAPI"),
      code: apiErr.code ?? null,
      error_subcode: apiErr.error_subcode ?? null,
      error_user_title: apiErr.error_user_title ?? null,
      error_user_msg: apiErr.error_user_msg ?? null,
      fbtrace_id: apiErr.fbtrace_id ?? null,
    };
  }

  const data = error?.response?.data;
  let message = String(error?.message || "Error Meta CAPI").slice(0, 200);
  if (typeof data === "string") message = data.slice(0, 200);
  else if (data?.message) message = String(data.message);

  return {
    message,
    code: null,
    error_subcode: null,
    error_user_title: null,
    error_user_msg: null,
    fbtrace_id: null,
  };
}

async function fetchConexionMeta(usuarioId, conexionWhatsappId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const headers = supabaseHeaders();
  const connId = normalizeConexionWhatsappId({ conexionWhatsappId });

  if (connId) {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&id=eq.${encodeURIComponent(connId)}&select=id,pixel_id,capi_token&limit=1`,
      { headers }
    );
    return res.data?.[0] || null;
  }

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&activo=eq.true&select=id,pixel_id,capi_token&limit=1`,
    { headers }
  );
  return res.data?.[0] || null;
}

function buildCapiEventData({ eventName, telefono, opciones = {} }) {
  const telefonoHash = hashTelefonoMeta(telefono);
  const usuarioId = opciones.usuarioId;
  const clienteNumero = normalizeClienteNumero(telefono);
  const conexionWhatsappId = normalizeConexionWhatsappId(opciones);
  const eventId =
    opciones.eventId ||
    buildMetaEventId(eventName, usuarioId, clienteNumero, conexionWhatsappId);

  const user_data = {};
  if (telefonoHash) user_data.ph = [telefonoHash];

  const custom_data = {
    ...(opciones.custom_data && typeof opciones.custom_data === "object"
      ? opciones.custom_data
      : {}),
  };

  if (custom_data.currency == null) {
    const defaultCurrency = eventName === "Lead" ? "BOB" : "USD";
    custom_data.currency = opciones.currency || opciones.moneda || defaultCurrency;
  }
  if (custom_data.value == null) {
    custom_data.value = opciones.value ?? 0;
  }

  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "system_generated",
    user_data,
    custom_data,
  };
}

function logMetaOk(ctx, resData) {
  console.log("[META] evento enviado", {
    event_name: ctx.event_name,
    event_id: ctx.event_id,
    pixel_id_masked: ctx.pixel_id_masked,
    conexion_whatsapp_id: ctx.conexion_whatsapp_id,
    events_received: resData?.events_received ?? null,
    fbtrace_id: resData?.fbtrace_id ?? null,
  });
}

function logMetaError(ctx, error) {
  const metaErr = metaErrorMessage(error);
  console.log("[META] error", {
    event_name: ctx.event_name,
    event_id: ctx.event_id,
    pixel_id_masked: ctx.pixel_id_masked,
    conexion_whatsapp_id: ctx.conexion_whatsapp_id,
    message: metaErr.message,
    code: metaErr.code,
    error_subcode: metaErr.error_subcode,
    error_user_title: metaErr.error_user_title,
    error_user_msg: metaErr.error_user_msg,
    fbtrace_id: metaErr.fbtrace_id,
    status: error?.response?.status ?? null,
  });
}

async function postMetaCapiEvent(conexion, eventData, opciones = {}) {
  const conexionIdLog = conexion?.id || normalizeConexionWhatsappId(opciones) || null;
  const ctx = {
    event_name: eventData.event_name,
    event_id: eventData.event_id,
    pixel_id_masked: maskPixelId(conexion.pixel_id),
    conexion_whatsapp_id: conexionIdLog,
  };

  const body = { data: [eventData] };
  const testEventCode = normalizeTestEventCode(opciones);
  if (testEventCode) body.test_event_code = testEventCode;

  if (opciones.esPrueba) {
    console.log("[META TEST]", {
      event_name: ctx.event_name,
      event_id: ctx.event_id,
      test_event_code: testEventCode,
      pixel_id_masked: ctx.pixel_id_masked,
      conexion_whatsapp_id: ctx.conexion_whatsapp_id,
    });
  }

  const res = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(conexion.pixel_id)}/events?access_token=${encodeURIComponent(conexion.capi_token)}`,
    body
  );

  logMetaOk(ctx, res.data);

  if (opciones.esPrueba) {
    return { ok: true, ...res.data };
  }
  return { ok: true, ...res.data };
}

/**
 * INSERT atómico para dedup Lead. Devuelve { reserved, degraded }.
 * degraded=true si la tabla no existe (modo sin dedup, no rompe webhook).
 */
async function reservarEnvioLeadMeta(
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  eventId
) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId) {
    return { reserved: false, degraded: false };
  }

  const numero = normalizeClienteNumero(clienteNumero);
  if (!numero) return { reserved: false, degraded: false };

  const connId = normalizeConexionWhatsappId({ conexionWhatsappId });
  const payload = {
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: connId,
    event_id: eventId,
  };

  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/meta_capi_leads_enviados?on_conflict=usuario_id,cliente_numero,conexion_whatsapp_id`,
      payload,
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=representation",
        }),
      }
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return { reserved: Boolean(row?.id), degraded: false };
  } catch (error) {
    if (isSchemaMissingError(error)) {
      logSchemaFallback("meta_capi_leads_enviados", error);
      console.log("[META] Lead sin dedup (tabla meta_capi_leads_enviados no disponible)", {
        conexion_whatsapp_id: connId,
      });
      return { reserved: true, degraded: true };
    }
    console.log("[META] error reservando Lead dedup", {
      conexion_whatsapp_id: connId,
      message: metaErrorMessage(error).message,
    });
    return { reserved: false, degraded: false };
  }
}

async function enviarEventoMetaInterno(usuarioId, nombreEvento, telefono, opciones = {}) {
  const esPrueba = Boolean(opciones.esPrueba);
  const conexionWhatsappId = normalizeConexionWhatsappId(opciones);
  const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
  const conexionIdLog = conexion?.id || conexionWhatsappId || null;

  if (!conexion?.pixel_id?.trim() || !conexion?.capi_token?.trim()) {
    console.log("[META] Pixel/CAPI no configurado para esta línea", {
      event_name: nombreEvento,
      conexion_whatsapp_id: conexionIdLog,
    });
    if (esPrueba) {
      const err = new Error("Pixel ID y CAPI Token son obligatorios para la prueba");
      err.status = 400;
      throw err;
    }
    return null;
  }

  const eventData = buildCapiEventData({
    eventName: nombreEvento,
    telefono,
    opciones: {
      ...opciones,
      usuarioId,
      conexionWhatsappId: conexionIdLog,
    },
  });

  return postMetaCapiEvent(conexion, eventData, opciones);
}

async function enviarEventoMeta(usuarioId, nombreEvento, telefono, opciones = {}) {
  const esPrueba = Boolean(opciones.esPrueba);
  const conexionWhatsappId = normalizeConexionWhatsappId(opciones);
  const eventId =
    opciones.eventId ||
    (usuarioId
      ? buildMetaEventId(
          nombreEvento,
          usuarioId,
          normalizeClienteNumero(telefono),
          conexionWhatsappId
        )
      : null);

  try {
    if (!usuarioId) {
      if (esPrueba) {
        const err = new Error("usuarioId requerido");
        err.status = 400;
        throw err;
      }
      return;
    }

    return await enviarEventoMetaInterno(usuarioId, nombreEvento, telefono, opciones);
  } catch (error) {
    let pixelIdMasked = null;
    try {
      const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
      pixelIdMasked = maskPixelId(conexion?.pixel_id);
    } catch {
      /* logging best-effort */
    }
    logMetaError(
      {
        event_name: nombreEvento,
        event_id: eventId,
        pixel_id_masked: pixelIdMasked,
        conexion_whatsapp_id: conexionWhatsappId,
      },
      error
    );
    if (esPrueba) {
      const err = new Error(
        metaErrorMessage(error).message || "No se pudo enviar el evento de prueba"
      );
      err.status = error.response?.status || error.status || 502;
      throw err;
    }
  }
}

/**
 * Lead CAPI — una vez por usuario + cliente + línea. No lanza errores al caller.
 */
async function enviarLeadMetaSiCorresponde(usuarioId, telefono, opciones = {}) {
  const conexionWhatsappId = normalizeConexionWhatsappId(opciones);
  const clienteNumero = normalizeClienteNumero(telefono);
  let eventId = null;
  let pixelIdMasked = null;

  try {
    if (!usuarioId) return;
    if (!clienteNumero) return;

    eventId = buildMetaEventId(
      "Lead",
      usuarioId,
      clienteNumero,
      conexionWhatsappId
    );

    const { reserved, degraded } = await reservarEnvioLeadMeta(
      usuarioId,
      clienteNumero,
      conexionWhatsappId,
      eventId
    );

    if (!reserved) {
      console.log("[META] Lead omitido (ya enviado)", {
        event_id: eventId,
        conexion_whatsapp_id: conexionWhatsappId,
      });
      return;
    }

    if (degraded) {
      console.log("[META] Lead en modo degradado (sin tabla dedup)", {
        event_id: eventId,
        conexion_whatsapp_id: conexionWhatsappId,
      });
    }

    const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
    pixelIdMasked = maskPixelId(conexion?.pixel_id);

    await enviarEventoMetaInterno(usuarioId, "Lead", clienteNumero, {
      ...opciones,
      conexionWhatsappId,
      eventId,
    });
  } catch (error) {
    if (!pixelIdMasked && usuarioId) {
      try {
        const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
        pixelIdMasked = maskPixelId(conexion?.pixel_id);
      } catch {
        /* logging best-effort */
      }
    }
    logMetaError(
      {
        event_name: "Lead",
        event_id: eventId,
        pixel_id_masked: pixelIdMasked,
        conexion_whatsapp_id: conexionWhatsappId,
      },
      error
    );
  }
}

function buildPurchaseCustomData(datos) {
  const metadata =
    datos.metadata && typeof datos.metadata === "object" && !Array.isArray(datos.metadata)
      ? datos.metadata
      : {};

  const producto =
    String(metadata.producto || metadata.nodeName || metadata.nombre || "").trim() || undefined;
  const tipoVenta = metadata.tipo != null ? String(metadata.tipo) : undefined;

  const custom = {
    value: datos.valor ?? 0,
    currency: datos.moneda || "USD",
    flujo_id: datos.flujoId || undefined,
    nodo_id: datos.nodoId || undefined,
    conexion_whatsapp_id: datos.conexionWhatsappId || undefined,
    origen: datos.origen || undefined,
    tipo_venta: tipoVenta,
  };

  if (producto) custom.producto = producto;
  if (datos.conversionId) custom.conversion_id = String(datos.conversionId);

  Object.keys(custom).forEach((k) => {
    if (custom[k] === undefined || custom[k] === null || custom[k] === "") {
      delete custom[k];
    }
  });

  return custom;
}

/**
 * Purchase CAPI desde conversión CRM. Fire-and-forget: nunca lanza al caller.
 */
function enviarPurchaseMetaDesdeConversion(datos) {
  setImmediate(() => {
    enviarPurchaseMetaDesdeConversionAsync(datos).catch(() => {});
  });
}

async function enviarPurchaseMetaDesdeConversionAsync(datos) {
  const conexionWhatsappId = normalizeConexionWhatsappId({
    conexionWhatsappId: datos?.conexionWhatsappId,
  });
  let eventId = null;
  let pixelIdMasked = null;

  try {
    const usuarioId = datos?.usuarioId;
    const clienteNumero = normalizeClienteNumero(datos?.clienteNumero);
    if (!usuarioId || !clienteNumero) return;

    const valor = Number(datos.valor) || 0;
    const moneda = datos.moneda || "USD";
    eventId = buildMetaEventId(
      "Purchase",
      usuarioId,
      clienteNumero,
      conexionWhatsappId
    );

    const conexion = await fetchConexionMeta(usuarioId, conexionWhatsappId);
    pixelIdMasked = maskPixelId(conexion?.pixel_id);

    const custom_data = buildPurchaseCustomData({
      ...datos,
      valor,
      moneda,
      conexionWhatsappId,
    });

    await enviarEventoMetaInterno(usuarioId, "Purchase", clienteNumero, {
      conexionWhatsappId,
      usuarioId,
      eventId,
      value: valor,
      currency: moneda,
      custom_data,
    });
  } catch (error) {
    if (!pixelIdMasked && datos?.usuarioId) {
      try {
        const conexion = await fetchConexionMeta(datos.usuarioId, conexionWhatsappId);
        pixelIdMasked = maskPixelId(conexion?.pixel_id);
      } catch {
        /* logging best-effort */
      }
    }
    logMetaError(
      {
        event_name: "Purchase",
        event_id: eventId,
        pixel_id_masked: pixelIdMasked,
        conexion_whatsapp_id: conexionWhatsappId,
      },
      error
    );
  }
}

module.exports = {
  enviarEventoMeta,
  enviarLeadMetaSiCorresponde,
  enviarPurchaseMetaDesdeConversion,
  buildMetaEventId,
  hashTelefonoMeta,
};
