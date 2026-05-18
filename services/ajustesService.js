/**
 * Ajustes MacBot CRM — Supabase + sesión, consultas resilientes.
 */
const axios = require("axios");
const bcrypt = require("bcryptjs");

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

const EMPTY_META_ADS = {
  pixelId: "",
  pixelNombre: "",
  activo: false,
  capiTokenMasked: null,
  tieneCapiToken: false,
};

let crmAjustesTableDisponible = true;

function log(msg, extra) {
  if (extra !== undefined) console.log(`[ajustesService] ${msg}`, extra);
  else console.log(`[ajustesService] ${msg}`);
}

function headers(extra = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { apikey: "", Authorization: "Bearer ", ...extra };
  }
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function supabaseErrorDetail(error) {
  const d = error?.response?.data;
  if (!d) return error?.message || "unknown";
  if (typeof d === "string") return d;
  return d.message || d.error || d.hint || JSON.stringify(d);
}

function isMissingSchemaError(error) {
  const status = error?.response?.status;
  const detail = String(supabaseErrorDetail(error)).toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    status === 406 ||
    detail.includes("does not exist") ||
    detail.includes("column") ||
    detail.includes("relation") ||
    detail.includes("pgrst")
  );
}

/**
 * GET Supabase REST sin lanzar: devuelve { data, error, status }.
 */
async function supabaseGet(path, label) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log(`${label}: Supabase no configurado`);
    return { data: [], error: "SUPABASE_NOT_CONFIGURED", status: 0 };
  }

  const url = path.startsWith("http") ? path : `${SUPABASE_URL}/rest/v1/${path}`;

  try {
    const res = await axios.get(url, { headers: headers() });
    return { data: res.data || [], error: null, status: res.status };
  } catch (error) {
    const status = error.response?.status;
    const detail = supabaseErrorDetail(error);
    log(`${label} falló (${status || "network"}):`, detail);
    return { data: [], error: detail, status: status || 0 };
  }
}

function maskSecret(value) {
  if (!value || typeof value !== "string") return null;
  const t = value.trim();
  if (t.length <= 8) return "********";
  return `${t.slice(0, 4)}${"*".repeat(Math.min(12, t.length - 8))}${t.slice(-4)}`;
}

function connectionEstado(row) {
  const hasToken = Boolean(row?.token?.trim());
  const hasPhone = Boolean(row?.phone_id?.trim());
  if (row?.estado === "error") return "error";
  if (hasToken && hasPhone) return row.activo !== false ? "conectado" : "inactivo";
  return "incompleto";
}

function mapConexion(row) {
  if (!row) return null;
  const estado = connectionEstado(row);
  return {
    id: row.id,
    nombre: row.nombre || "",
    numero: row.numero || "",
    phoneNumberId: row.phone_id || "",
    wabaId: row.waba_id || "",
    activo: row.activo !== false,
    estado,
    estadoLabel:
      estado === "conectado"
        ? "Conectado"
        : estado === "inactivo"
          ? "Inactivo"
          : estado === "error"
            ? "Error"
            : "Incompleto",
    tieneToken: Boolean(row.token),
    tokenMasked: row.token ? maskSecret(row.token) : null,
    pixelId: row.pixel_id || "",
    capiTokenMasked: row.capi_token ? maskSecret(row.capi_token) : null,
    creadoEn: row.creado_en || null,
    actualizadoEn: row.actualizado_en || null,
  };
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

function buildMetaAdsFromRow(ajustes, conexionActiva) {
  const pixelId = ajustes?.meta_pixel_id || conexionActiva?.pixel_id || "";
  const capiRaw = ajustes?.meta_capi_token || conexionActiva?.capi_token || "";
  return {
    ...EMPTY_META_ADS,
    pixelId,
    pixelNombre: ajustes?.meta_pixel_nombre || "",
    activo: Boolean(ajustes?.meta_activo) || Boolean(pixelId && capiRaw),
    capiTokenMasked: capiRaw ? maskSecret(capiRaw) : null,
    tieneCapiToken: Boolean(capiRaw),
  };
}

function buildPerfil(usuario, ajustes, sessionUsuario) {
  return {
    nombre: usuario?.nombre || sessionUsuario?.nombre || "",
    email: usuario?.email || sessionUsuario?.email || "",
    empresa: ajustes?.empresa || "",
    zonaHoraria: ajustes?.zona_horaria || DEFAULT_AUTO.zonaHoraria,
    idioma: ajustes?.idioma || "es",
  };
}

/** Respuesta vacía garantizada (nunca 400 en GET). */
function buildAjustesVacio(req, sessionUsuario, warnings = []) {
  const perfil = buildPerfil(null, null, sessionUsuario);
  const metaAds = { ...EMPTY_META_ADS };
  return {
    ok: true,
    perfil,
    conexiones: [],
    conexionesWhatsapp: [],
    metaAds,
    meta: metaAds,
    automatizacion: { ...DEFAULT_AUTO },
    notificaciones: { ...DEFAULT_NOTIF },
    etiquetas: [],
    webhook: buildWebhookInfo(req),
    seguridad: { puedeCambiarPassword: true, ocultarTokens: true },
    warnings: warnings.length ? warnings : undefined,
    source: "fallback",
  };
}

async function fetchUsuario(usuarioId, sessionUsuario) {
  const uid = encodeURIComponent(usuarioId);
  const { data, error } = await supabaseGet(
    `crm_usuarios?id=eq.${uid}&select=id,nombre,email,activo`,
    "fetchUsuario"
  );

  if (data?.[0]) return data[0];

  if (error) {
    log("fetchUsuario: usando datos de sesión", { usuarioId });
  }

  return sessionUsuario
    ? {
        id: sessionUsuario.id || usuarioId,
        nombre: sessionUsuario.nombre || "",
        email: sessionUsuario.email || "",
        activo: true,
      }
    : null;
}

async function fetchAjustesRow(usuarioId) {
  if (!crmAjustesTableDisponible) return null;

  const uid = encodeURIComponent(usuarioId);

  const attempts = [
    `crm_ajustes_usuario?usuario_id=eq.${uid}&select=*&limit=1`,
    `crm_ajustes_usuario?usuario_id=eq.${uid}&select=usuario_id,empresa,zona_horaria,idioma,automatizacion,notificaciones,meta_pixel_id,meta_pixel_nombre,meta_capi_token,meta_activo&limit=1`,
  ];

  for (const path of attempts) {
    const { data, error, status } = await supabaseGet(path, "fetchAjustesRow");
    if (!error && data?.[0]) return data[0];
    if (error && (status === 404 || isMissingSchemaError({ response: { status, data: { message: error } } }))) {
      if (path.includes("select=*")) continue;
      crmAjustesTableDisponible = false;
      log("Tabla crm_ajustes_usuario no disponible — usando solo crm_usuarios");
      return null;
    }
  }

  return null;
}

async function fetchConexiones(usuarioId) {
  const uid = encodeURIComponent(usuarioId);

  const queries = [
    {
      label: "conexiones_full",
      path: `conexiones_whatsapp?usuario_id=eq.${uid}&select=id,nombre,numero,phone_id,waba_id,token,pixel_id,capi_token,activo,estado,creado_en,actualizado_en&order=creado_en.desc`,
    },
    {
      label: "conexiones_sin_order",
      path: `conexiones_whatsapp?usuario_id=eq.${uid}&select=id,nombre,numero,phone_id,token,pixel_id,capi_token,activo`,
    },
    {
      label: "conexiones_min",
      path: `conexiones_whatsapp?usuario_id=eq.${uid}&select=id,nombre,numero,phone_id,token,activo`,
    },
  ];

  for (const q of queries) {
    const { data, error } = await supabaseGet(q.path, q.label);
    if (!error && Array.isArray(data)) {
      return data.map(mapConexion).filter(Boolean);
    }
    if (error && !isMissingSchemaError({ response: { status: 400, data: { message: error } } })) {
      break;
    }
  }

  log("fetchConexiones: sin filas, devolviendo []", { usuarioId });
  return [];
}

async function fetchEtiquetas(usuarioId) {
  const uid = encodeURIComponent(usuarioId);

  const queries = [
    `etiquetas?usuario_id=eq.${uid}&select=id,nombre,color,creado_en&order=creado_en.asc`,
    `etiquetas?usuario_id=eq.${uid}&select=id,nombre,color`,
    `etiquetas?usuario_id=eq.${uid}&select=id,nombre,color,creado_en`,
  ];

  for (const path of queries) {
    const { data, error } = await supabaseGet(path, "fetchEtiquetas");
    if (!error && Array.isArray(data)) return data;
  }

  return [];
}

async function getAjustesCompleto(usuarioId, req, sessionUsuario) {
  const warnings = [];

  log("GET ajustes inicio", { usuarioId });

  if (!usuarioId) {
    log("GET ajustes: sin usuario_id en sesión");
    return buildAjustesVacio(req, sessionUsuario, ["Sesión sin usuario_id"]);
  }

  let usuario = null;
  let ajustes = null;
  let conexiones = [];
  let etiquetas = [];

  try {
    usuario = await fetchUsuario(usuarioId, sessionUsuario);
  } catch (e) {
    warnings.push(`usuario: ${e.message}`);
    usuario = sessionUsuario || null;
  }

  try {
    ajustes = await fetchAjustesRow(usuarioId);
  } catch (e) {
    warnings.push(`ajustes: ${e.message}`);
    ajustes = null;
  }

  try {
    conexiones = await fetchConexiones(usuarioId);
  } catch (e) {
    warnings.push(`conexiones: ${e.message}`);
    conexiones = [];
  }

  try {
    etiquetas = await fetchEtiquetas(usuarioId);
  } catch (e) {
    warnings.push(`etiquetas: ${e.message}`);
    etiquetas = [];
  }

  const conexionActiva = conexiones.find((c) => c.activo) || conexiones[0] || null;
  const metaAds = buildMetaAdsFromRow(ajustes, conexionActiva);

  const payload = {
    ok: true,
    source: "supabase",
    perfil: buildPerfil(usuario, ajustes, sessionUsuario),
    conexiones,
    conexionesWhatsapp: conexiones,
    metaAds,
    meta: metaAds,
    automatizacion: { ...DEFAULT_AUTO, ...(ajustes?.automatizacion || {}) },
    notificaciones: { ...DEFAULT_NOTIF, ...(ajustes?.notificaciones || {}) },
    etiquetas,
    webhook: buildWebhookInfo(req),
    seguridad: {
      puedeCambiarPassword: true,
      ocultarTokens: true,
    },
  };

  if (warnings.length) {
    payload.warnings = warnings;
    log("GET ajustes completado con advertencias", warnings);
  } else {
    log("GET ajustes OK", {
      usuarioId,
      conexiones: conexiones.length,
      etiquetas: etiquetas.length,
      tieneAjustesRow: Boolean(ajustes),
    });
  }

  return payload;
}

async function upsertAjustes(usuarioId, patch) {
  if (!crmAjustesTableDisponible) {
    log("upsertAjustes omitido: tabla crm_ajustes_usuario no disponible");
    return { ok: true, skipped: true };
  }

  const existing = await fetchAjustesRow(usuarioId);
  const body = {
    ...patch,
    usuario_id: usuarioId,
    actualizado_en: new Date().toISOString(),
  };

  try {
    if (existing) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/crm_ajustes_usuario?usuario_id=eq.${encodeURIComponent(usuarioId)}`,
        body,
        { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
      );
    } else {
      await axios.post(`${SUPABASE_URL}/rest/v1/crm_ajustes_usuario`, body, {
        headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      });
    }
    return { ok: true };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      crmAjustesTableDisponible = false;
      log("upsertAjustes: tabla no disponible", supabaseErrorDetail(error));
      return { ok: true, skipped: true };
    }
    throw error;
  }
}

async function assertPhoneIdAvailable(phoneId, usuarioId, excludeId = null) {
  if (!phoneId?.trim()) {
    const err = new Error("Phone Number ID es obligatorio");
    err.status = 400;
    throw err;
  }
  const pid = encodeURIComponent(phoneId.trim());
  const { data } = await supabaseGet(
    `conexiones_whatsapp?phone_id=eq.${pid}&select=id,usuario_id`,
    "assertPhoneId"
  );
  const conflict = (data || []).find(
    (r) => r.usuario_id !== usuarioId && (!excludeId || r.id !== excludeId)
  );
  if (conflict) {
    const err = new Error(
      "Este Phone Number ID ya está registrado en otra cuenta."
    );
    err.status = 409;
    throw err;
  }
}

async function patchPerfil(usuarioId, body, sessionUsuario) {
  const { nombre, email, empresa, zonaHoraria, idioma } = body || {};
  const usuarioPatch = {};
  if (nombre !== undefined) usuarioPatch.nombre = String(nombre).trim();
  if (email !== undefined) usuarioPatch.email = String(email).trim().toLowerCase();

  if (Object.keys(usuarioPatch).length) {
    try {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
        usuarioPatch,
        { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
      );
    } catch (error) {
      log("patchPerfil crm_usuarios:", supabaseErrorDetail(error));
      throw error;
    }
  }

  const ajustesPatch = {};
  if (empresa !== undefined) ajustesPatch.empresa = String(empresa).trim();
  if (zonaHoraria !== undefined) ajustesPatch.zona_horaria = String(zonaHoraria).trim();
  if (idioma !== undefined) ajustesPatch.idioma = String(idioma).trim();

  if (Object.keys(ajustesPatch).length) {
    await upsertAjustes(usuarioId, ajustesPatch);
  }

  return { ok: true };
}

async function patchAjustesGenerales(usuarioId, body) {
  const patch = {};
  if (body.automatizacion) {
    const current = (await fetchAjustesRow(usuarioId))?.automatizacion || {};
    patch.automatizacion = { ...DEFAULT_AUTO, ...current, ...body.automatizacion };
  }
  if (body.notificaciones) {
    const current = (await fetchAjustesRow(usuarioId))?.notificaciones || {};
    patch.notificaciones = { ...DEFAULT_NOTIF, ...current, ...body.notificaciones };
  }
  if (body.meta) {
    const m = body.meta;
    if (m.pixelId !== undefined) patch.meta_pixel_id = m.pixelId ? String(m.pixelId).trim() : null;
    if (m.pixelNombre !== undefined) patch.meta_pixel_nombre = m.pixelNombre ? String(m.pixelNombre).trim() : null;
    if (m.activo !== undefined) patch.meta_activo = Boolean(m.activo);
    if (m.capiToken !== undefined && m.capiToken !== "" && m.capiToken !== "__KEEP__") {
      patch.meta_capi_token = String(m.capiToken).trim();
    }
  }
  if (Object.keys(patch).length) await upsertAjustes(usuarioId, patch);
  return { ok: true };
}

async function listConexiones(usuarioId) {
  const conexiones = await fetchConexiones(usuarioId);
  return { ok: true, conexiones };
}

async function createConexion(usuarioId, body) {
  const {
    nombre,
    numero,
    accessToken,
    phoneNumberId,
    wabaId,
    activo = true,
    hacerPrincipal = false,
  } = body || {};

  if (!accessToken?.trim()) {
    const err = new Error("Access Token es obligatorio");
    err.status = 400;
    throw err;
  }

  await assertPhoneIdAvailable(phoneNumberId, usuarioId);

  if (hacerPrincipal || activo) {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}`,
      { activo: false },
      { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
    ).catch((e) => log("createConexion desactivar otras:", supabaseErrorDetail(e)));
  }

  const row = {
    usuario_id: usuarioId,
    nombre: nombre?.trim() || "WhatsApp",
    numero: numero?.trim() || "",
    token: accessToken.trim(),
    phone_id: phoneNumberId.trim(),
    activo: Boolean(activo),
  };

  if (wabaId?.trim()) row.waba_id = wabaId.trim();

  const res = await axios.post(`${SUPABASE_URL}/rest/v1/conexiones_whatsapp`, row, {
    headers: headers({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
  });

  const created = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, conexion: mapConexion(created) };
}

async function updateConexion(usuarioId, id, body) {
  const uid = encodeURIComponent(usuarioId);
  const { data: rows } = await supabaseGet(
    `conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${uid}&select=id,phone_id,token`,
    "updateConexion_check"
  );
  const existing = rows?.[0];
  if (!existing) {
    const err = new Error("Conexión no encontrada");
    err.status = 404;
    throw err;
  }

  const phoneNumberId = body.phoneNumberId ?? existing.phone_id;
  if (phoneNumberId && phoneNumberId !== existing.phone_id) {
    await assertPhoneIdAvailable(phoneNumberId, usuarioId, id);
  }

  if (body.hacerPrincipal || body.activo === true) {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${uid}`,
      { activo: false },
      { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
    ).catch(() => {});
  }

  const patch = {};
  if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body.numero !== undefined) patch.numero = String(body.numero).trim();
  if (body.phoneNumberId !== undefined) patch.phone_id = String(body.phoneNumberId).trim();
  if (body.wabaId !== undefined) patch.waba_id = body.wabaId ? String(body.wabaId).trim() : null;
  if (body.activo !== undefined) patch.activo = Boolean(body.activo);
  if (body.accessToken && body.accessToken !== "__KEEP__") {
    patch.token = String(body.accessToken).trim();
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${uid}`,
    patch,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
  );

  const { data: updated } = await supabaseGet(
    `conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&select=id,nombre,numero,phone_id,token,activo`,
    "updateConexion_read"
  );
  return { ok: true, conexion: mapConexion(updated?.[0]) };
}

async function deleteConexion(usuarioId, id) {
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: headers() }
  );
  return { ok: true };
}

async function probarConexion(usuarioId, id, numeroPrueba) {
  const { data } = await supabaseGet(
    `conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=*`,
    "probarConexion"
  );
  const conexion = data?.[0];
  if (!conexion?.token || !conexion?.phone_id) {
    const err = new Error("Conexión incompleta: falta token o Phone Number ID");
    err.status = 400;
    throw err;
  }

  const to = String(numeroPrueba || conexion.numero || "").replace(/\D/g, "");
  if (!to) {
    const err = new Error("Indica un número de prueba (con código de país, sin +)");
    err.status = 400;
    throw err;
  }

  await axios.post(
    `https://graph.facebook.com/v19.0/${conexion.phone_id}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: "✅ MacBot: prueba de conexión WhatsApp API exitosa." },
    },
    {
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return { ok: true, mensaje: "Mensaje de prueba enviado correctamente" };
}

async function probarMetaEvento(usuarioId) {
  const ajustes = await fetchAjustesRow(usuarioId);
  if (!ajustes?.meta_pixel_id || !ajustes?.meta_capi_token) {
    const err = new Error("Configura Pixel ID y CAPI Token antes de probar");
    err.status = 400;
    throw err;
  }

  const crypto = require("crypto");
  const telefonoHash = crypto.createHash("sha256").update("59170000000").digest("hex");

  await axios.post(
    `https://graph.facebook.com/v19.0/${ajustes.meta_pixel_id}/events?access_token=${ajustes.meta_capi_token}`,
    {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "system_generated",
          user_data: { ph: [telefonoHash] },
          custom_data: { test_event: true },
        },
      ],
    }
  );

  return { ok: true, mensaje: "Evento de prueba enviado a Meta CAPI" };
}

async function listEtiquetas(usuarioId) {
  const etiquetas = await fetchEtiquetas(usuarioId);
  return { ok: true, etiquetas };
}

async function createEtiqueta(usuarioId, body) {
  const nombre = String(body?.nombre || "").trim();
  if (!nombre) {
    const err = new Error("Nombre de etiqueta obligatorio");
    err.status = 400;
    throw err;
  }
  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/etiquetas`,
    { nombre, color: body?.color || "#22c55e", usuario_id: usuarioId },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, etiqueta: row };
}

async function updateEtiqueta(usuarioId, id, body) {
  const patch = {};
  if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body.color !== undefined) patch.color = String(body.color).trim();

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    patch,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
  );

  const { data } = await supabaseGet(
    `etiquetas?id=eq.${encodeURIComponent(id)}&select=id,nombre,color`,
    "updateEtiqueta_read"
  );
  return { ok: true, etiqueta: data?.[0] };
}

async function deleteEtiqueta(usuarioId, id) {
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: headers() }
  );
  return { ok: true };
}

async function cambiarPassword(usuarioId, actual, nueva) {
  if (!actual || !nueva || nueva.length < 6) {
    const err = new Error("Contraseña actual y nueva (mín. 6 caracteres) son obligatorias");
    err.status = 400;
    throw err;
  }

  const { data } = await supabaseGet(
    `crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=password_hash`,
    "cambiarPassword"
  );
  const hash = data?.[0]?.password_hash;
  if (!hash) {
    const err = new Error("No se puede cambiar la contraseña para este usuario");
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
  listConexiones,
  createConexion,
  updateConexion,
  deleteConexion,
  probarConexion,
  probarMetaEvento,
  listEtiquetas,
  createEtiqueta,
  updateEtiqueta,
  deleteEtiqueta,
  cambiarPassword,
  maskSecret,
};
