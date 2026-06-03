/**
 * Diagnóstico de salud por línea WhatsApp — solo lectura, sin envíos ni CAPI real.
 */
const axios = require("axios");
const { getConexionPorId } = require("./conexionesWhatsappService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const MS_VENTANA_24H = 24 * 60 * 60 * 1000;
const GRAPH_VERSION = "v19.0";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[conexionDiagnostico] ${msg}`, extra);
  else console.log(`[conexionDiagnostico] ${msg}`);
}

function fmtFecha(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-BO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

function sanitizeMetaError(error) {
  const data = error?.response?.data?.error;
  const status = error?.response?.status;
  if (!data && !status) return "Error de conexión con Meta";
  const raw =
    data?.error_user_msg ||
    data?.message ||
    (typeof data?.error === "string" ? data.error : null) ||
    "Error Meta";
  const msg = String(raw)
    .replace(/EAA[A-Za-z0-9_-]+/g, "[token]")
    .replace(/Bearer\s+\S+/gi, "[token]")
    .slice(0, 200);
  return status ? `${msg} (HTTP ${status})` : msg;
}

async function fetchUltimoMensaje(usuarioId, conexionId, direccion) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
        `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionId)}` +
        `&direccion=eq.${encodeURIComponent(direccion)}` +
        `&select=contenido,creado_en,cliente_numero&order=creado_en.desc&limit=1`,
      { headers: supabaseHeaders() }
    );
    return res.data?.[0] || null;
  } catch (error) {
    log(`fetchUltimoMensaje ${direccion} error:`, error.response?.data || error.message);
    return null;
  }
}

async function probarGraphApi(phoneId, token) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=id,display_phone_number,verified_name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 12000,
      }
    );
    const d = res.data || {};
    const partes = [];
    if (d.display_phone_number) partes.push(d.display_phone_number);
    if (d.verified_name) partes.push(d.verified_name);
    const detalle =
      partes.length > 0
        ? `Conexión válida: ${partes.join(" · ")}`
        : "Conexión válida con Meta Graph API";
    return { ok: true, detalle, status: res.status };
  } catch (error) {
    const status = error.response?.status || null;
    log("probarGraphApi error:", sanitizeMetaError(error));
    return {
      ok: false,
      detalle: sanitizeMetaError(error),
      status,
    };
  }
}

function buildMensajesCheck(entrante, saliente) {
  if (!entrante && !saliente) {
    return {
      ok: false,
      label: "Mensajes",
      detalle: "Sin mensajes recientes",
    };
  }
  const partes = [];
  if (entrante) {
    const txt = (entrante.contenido || "").trim().slice(0, 60) || "(sin texto)";
    partes.push(`Entrante: ${txt} (${fmtFecha(entrante.creado_en)})`);
  }
  if (saliente) {
    const txt = (saliente.contenido || "").trim().slice(0, 60) || "(sin texto)";
    partes.push(`Saliente: ${txt} (${fmtFecha(saliente.creado_en)})`);
  }
  return {
    ok: true,
    label: "Mensajes",
    detalle: partes.join(" · "),
  };
}

function buildVentana24hCheck(ultimoEntrante) {
  if (!ultimoEntrante?.creado_en) {
    return {
      ok: false,
      label: "Ventana 24h",
      detalle: "Sin actividad",
    };
  }
  const ts = new Date(ultimoEntrante.creado_en).getTime();
  const diff = Date.now() - ts;
  if (diff < MS_VENTANA_24H) {
    return {
      ok: true,
      label: "Ventana 24h",
      detalle: `Abierta · último entrante ${fmtFecha(ultimoEntrante.creado_en)}`,
    };
  }
  return {
    ok: false,
    label: "Ventana 24h",
    detalle: `Cerrada · último entrante ${fmtFecha(ultimoEntrante.creado_en)}`,
  };
}

function computeEstadoGeneral(checks) {
  const waFail =
    !checks.whatsapp_config.ok ||
    !checks.phone_id.ok ||
    !checks.token.ok ||
    !checks.graph_api.ok;

  if (waFail) return "critico";

  const advertencia =
    !checks.pixel.ok ||
    !checks.capi.ok ||
    !checks.mensajes.ok ||
    !checks.ventana24h.ok;

  if (advertencia) return "advertencia";
  return "saludable";
}

/**
 * GET /api/ajustes/conexion/:id/diagnostico
 */
async function getDiagnosticoConexion(usuarioId, conexionId) {
  if (!usuarioId || !conexionId) {
    const err = new Error("usuarioId y conexionId son obligatorios");
    err.status = 400;
    throw err;
  }

  const conexion = await getConexionPorId(usuarioId, conexionId);
  if (!conexion) {
    const err = new Error("Conexión no encontrada");
    err.status = 404;
    throw err;
  }

  const tokenOk = Boolean(conexion.token?.trim());
  const phoneOk = Boolean(conexion.phone_id?.trim());
  const pixelOk = Boolean(conexion.pixel_id?.trim());
  const capiOk = Boolean(conexion.capi_token?.trim());

  const whatsappConfigOk = tokenOk && phoneOk;

  const [graphResult, ultimoEntrante, ultimoSaliente] = await Promise.all([
    whatsappConfigOk
      ? probarGraphApi(conexion.phone_id.trim(), conexion.token.trim())
      : Promise.resolve({
          ok: false,
          detalle: "Configura token y Phone ID para probar Graph API",
          status: null,
        }),
    fetchUltimoMensaje(usuarioId, conexionId, "entrante"),
    fetchUltimoMensaje(usuarioId, conexionId, "saliente"),
  ]);

  const checks = {
    whatsapp_config: {
      ok: whatsappConfigOk,
      label: "WhatsApp API",
      detalle: whatsappConfigOk
        ? "Token y Phone ID configurados"
        : "Faltan token o Phone ID",
    },
    phone_id: {
      ok: phoneOk,
      label: "Phone ID",
      detalle: phoneOk ? "Configurado" : "Faltante",
    },
    token: {
      ok: tokenOk,
      label: "Token WhatsApp",
      detalle: tokenOk ? "Configurado" : "Faltante",
    },
    graph_api: {
      ok: graphResult.ok,
      label: "Graph API",
      detalle: graphResult.detalle,
      status: graphResult.status,
    },
    pixel: {
      ok: pixelOk,
      label: "Pixel",
      detalle: pixelOk ? "Configurado" : "Pendiente",
    },
    capi: {
      ok: capiOk,
      label: "CAPI",
      detalle: capiOk ? "Configurado" : "Pendiente",
    },
    mensajes: buildMensajesCheck(ultimoEntrante, ultimoSaliente),
    ventana24h: buildVentana24hCheck(ultimoEntrante),
  };

  const estado_general = computeEstadoGeneral(checks);

  log("diagnostico OK", {
    usuarioId,
    conexionId,
    estado_general,
  });

  return {
    ok: true,
    conexion_id: conexion.id,
    nombre: conexion.nombre || "",
    numero: conexion.numero || "",
    estado_general,
    checks,
  };
}

module.exports = {
  getDiagnosticoConexion,
};
