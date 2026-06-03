/**
 * Ajustes MacBot — reutiliza conexiones antiguas, crm_usuarios y etiquetas.
 * Sin crm_ajustes_usuario ni tablas nuevas.
 */
const axios = require("axios");
const bcrypt = require("bcryptjs");
const {
  getConexionActiva,
  getConexionesUsuario,
  guardarConexion,
  hacerPrincipal,
  desconectarWhatsapp,
  desconectarWhatsappPorId,
  probarWhatsapp,
  probarWhatsappPorId,
  mapConexionApi,
  maskToken,
} = require("./conexionesWhatsappService");
const { enviarEventoMeta } = require("./metaService");
const { getDiagnosticoConexion } = require("./conexionDiagnosticoService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const DEFAULT_AUTO = {
  detenerSeguimientosSiResponde: true,
  evitarFlujoDuplicado: true,
  zonaHoraria: "America/La_Paz",
  modoSeguroAntiSpam: true,
  cooldownActivadoresMin: 5,
};

const DEFAULT_NOTIF = {
  sonidoNuevoMensaje: true,
  alertaLeadSinResponder: true,
  alertaConversion: true,
  alertaErrorConexion: true,
};

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[ajustesService] ${msg}`, extra);
  else console.log(`[ajustesService] ${msg}`);
}

function buildWebhookInfo(req) {
  const proto = req?.get?.("x-forwarded-proto") || req?.protocol || "https";
  const host = req?.get?.("x-forwarded-host") || req?.get?.("host") || "";
  const base = host ? `${proto}://${host}` : "";
  const verifyToken =
    process.env.VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || "123456";
  return {
    webhookUrl: base ? `${base}/webhook` : "/webhook",
    verifyToken,
    instrucciones:
      "Copia esta URL y token en Meta Developers → WhatsApp → Webhooks.",
  };
}

function metaFromConexion(row) {
  const pixelId = row?.pixel_id || "";
  const tieneCapi = Boolean(row?.capi_token?.trim());
  const capi_token_masked = tieneCapi ? maskToken(row.capi_token) : null;
  return {
    pixelId,
    pixelNombre: row?.nombre || "",
    activo: Boolean(pixelId && tieneCapi),
    capi_token_masked,
    capiTokenMasked: capi_token_masked,
    tieneCapiToken: tieneCapi,
  };
}

async function fetchUsuario(usuarioId, sessionUsuario) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,nombre,email`,
      { headers: headers() }
    );
    if (res.data?.[0]) return res.data[0];
  } catch (error) {
    log("fetchUsuario:", error.response?.data || error.message);
  }
  return sessionUsuario
    ? { id: usuarioId, nombre: sessionUsuario.nombre, email: sessionUsuario.email }
    : null;
}

function buildPerfil(usuario, sessionUsuario) {
  return {
    nombre: usuario?.nombre || sessionUsuario?.nombre || "",
    email: usuario?.email || sessionUsuario?.email || "",
    empresa: "",
    zonaHoraria: DEFAULT_AUTO.zonaHoraria,
    idioma: "es",
  };
}

function buildAjustesVacio(req, sessionUsuario) {
  const metaAds = metaFromConexion(null);
  return {
    ok: true,
    source: "fallback",
    perfil: buildPerfil(null, sessionUsuario),
    conexionActiva: null,
    conexiones: [],
    conexionesWhatsapp: [],
    metaAds,
    meta: metaAds,
    automatizacion: { ...DEFAULT_AUTO },
    notificaciones: { ...DEFAULT_NOTIF },
    webhook: buildWebhookInfo(req),
  };
}

async function getAjustesCompleto(usuarioId, req, sessionUsuario) {
  log("GET ajustes", { usuarioId });

  if (!usuarioId) {
    return buildAjustesVacio(req, sessionUsuario);
  }

  const [usuario, rowActiva, conexionesRows] = await Promise.all([
    fetchUsuario(usuarioId, sessionUsuario),
    getConexionActiva(usuarioId),
    getConexionesUsuario(usuarioId),
  ]);

  const conexionApi = mapConexionApi(rowActiva);
  const lista = conexionesRows.map((row) => mapConexionApi(row));
  const metaAds = metaFromConexion(rowActiva);

  log("GET ajustes OK", { conectado: Boolean(conexionApi?.conectado) });

  return {
    ok: true,
    source: "supabase",
    perfil: buildPerfil(usuario, sessionUsuario),
    conexionActiva: conexionApi,
    conexiones: lista,
    conexionesWhatsapp: lista,
    metaAds,
    meta: metaAds,
    automatizacion: { ...DEFAULT_AUTO },
    notificaciones: { ...DEFAULT_NOTIF },
    webhook: buildWebhookInfo(req),
    seguridad: { puedeCambiarPassword: true, ocultarTokens: true },
  };
}

/** Solo nombre y email en crm_usuarios (como antes) */
async function patchPerfil(usuarioId, body, sessionUsuario) {
  const { nombre, email } = body || {};
  const patch = {};
  if (nombre !== undefined) patch.nombre = String(nombre).trim();
  if (email !== undefined) patch.email = String(email).trim().toLowerCase();

  if (Object.keys(patch).length) {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
      patch,
      { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
    );
  }
  return { ok: true };
}

/** Preferencias UI: sin tabla — no falla */
async function patchAjustesGenerales() {
  return { ok: true, skipped: true };
}

async function guardarConexionAjustes(usuarioId, body) {
  const conexionId = body?.id || body?.conexionId || body?.conexion_id || null;
  const row = await guardarConexion(usuarioId, {
    id: conexionId,
    nombre: body.nombre,
    numero: body.numero,
    token: body.token,
    phone_id: body.phone_id || body.phoneNumberId,
    pixel_id: body.pixel_id || body.pixelId,
    capi_token: body.capi_token || body.capiToken,
  });
  const activa = await getConexionActiva(usuarioId);
  return {
    ok: true,
    conexion: mapConexionApi(row),
    conexionActiva: mapConexionApi(activa),
  };
}

async function desconectarConexionAjustes(usuarioId) {
  await desconectarWhatsapp(usuarioId);
  return { ok: true };
}

async function desconectarConexionAjustesPorId(usuarioId, conexionId) {
  await desconectarWhatsappPorId(usuarioId, conexionId);
  return { ok: true };
}

async function probarConexionAjustes(usuarioId, numero) {
  return probarWhatsapp(usuarioId, numero);
}

async function probarConexionAjustesPorId(usuarioId, conexionId, numero) {
  return probarWhatsappPorId(usuarioId, conexionId, numero);
}

async function hacerPrincipalAjustes(usuarioId, conexionId) {
  const row = await hacerPrincipal(usuarioId, conexionId);
  return { ok: true, conexionActiva: mapConexionApi(row) };
}

async function diagnosticoConexionAjustes(usuarioId, conexionId) {
  return getDiagnosticoConexion(usuarioId, conexionId);
}

async function probarMetaEvento(usuarioId, opciones = {}) {
  const conexionWhatsappId =
    opciones.conexionWhatsappId ?? opciones.conexion_whatsapp_id ?? null;
  await enviarEventoMeta(usuarioId, "Lead", "59170000000", {
    value: 0,
    conexionWhatsappId,
  });
  return { ok: true, mensaje: "Evento enviado (revisa Events Manager en Meta)" };
}

async function cambiarPassword(usuarioId, actual, nueva) {
  if (!actual || !nueva || nueva.length < 6) {
    const err = new Error("Contraseña actual y nueva (mín. 6 caracteres) son obligatorias");
    err.status = 400;
    throw err;
  }
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=password_hash`,
    { headers: headers() }
  );
  const hash = res.data?.[0]?.password_hash;
  if (!hash) {
    const err = new Error("No se puede cambiar la contraseña");
    err.status = 400;
    throw err;
  }
  const ok = await bcrypt.compare(actual, hash);
  if (!ok) {
    const err = new Error("Contraseña actual incorrecta");
    err.status = 403;
    throw err;
  }
  const password_hash = await bcrypt.hash(nueva, 10);
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
    { password_hash },
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
  );
  return { ok: true };
}

module.exports = {
  getAjustesCompleto,
  buildAjustesVacio,
  patchPerfil,
  patchAjustesGenerales,
  guardarConexionAjustes,
  desconectarConexionAjustes,
  desconectarConexionAjustesPorId,
  probarConexionAjustes,
  probarConexionAjustesPorId,
  hacerPrincipalAjustes,
  probarMetaEvento,
  diagnosticoConexionAjustes,
  cambiarPassword,
};
