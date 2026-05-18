/**
 * Ajustes MacBot CRM — Supabase + sesión, sin mocks.
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

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
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
  if (hasToken && hasPhone) return row.activo ? "conectado" : "inactivo";
  return "incompleto";
}

function mapConexion(row, { includeToken = false } = {}) {
  if (!row) return null;
  const estado = connectionEstado(row);
  return {
    id: row.id,
    nombre: row.nombre || "",
    numero: row.numero || "",
    phoneNumberId: row.phone_id || "",
    wabaId: row.waba_id || "",
    activo: Boolean(row.activo),
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
    token: includeToken ? row.token : undefined,
    pixelId: row.pixel_id || "",
    capiTokenMasked: row.capi_token ? maskSecret(row.capi_token) : null,
    creadoEn: row.creado_en || null,
    actualizadoEn: row.actualizado_en || null,
  };
}

async function fetchUsuario(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${uid}&select=id,nombre,email,activo`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function fetchAjustesRow(usuarioId) {
  const uid = encodeURIComponent(usuarioId);
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/crm_ajustes_usuario?usuario_id=eq.${uid}&select=*`,
      { headers: headers() }
    );
    return res.data?.[0] || null;
  } catch (e) {
    if (e.response?.status === 404 || e.response?.status === 406) return null;
    throw e;
  }
}

async function upsertAjustes(usuarioId, patch) {
  const existing = await fetchAjustesRow(usuarioId);
  const body = {
    ...patch,
    usuario_id: usuarioId,
    actualizado_en: new Date().toISOString(),
  };

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
}

async function assertPhoneIdAvailable(phoneId, usuarioId, excludeId = null) {
  if (!phoneId?.trim()) {
    const err = new Error("Phone Number ID es obligatorio");
    err.status = 400;
    throw err;
  }
  const pid = encodeURIComponent(phoneId.trim());
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?phone_id=eq.${pid}&select=id,usuario_id`,
    { headers: headers() }
  );
  const conflict = (res.data || []).find(
    (r) => r.usuario_id !== usuarioId && (!excludeId || r.id !== excludeId)
  );
  if (conflict) {
    const err = new Error(
      "Este Phone Number ID ya está registrado en otra cuenta. Usa otro número o contacta soporte."
    );
    err.status = 409;
    throw err;
  }
}

function buildWebhookInfo(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "";
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

async function getAjustesCompleto(usuarioId, req) {
  const [usuario, ajustes, conexionesRes, etiquetasRes] = await Promise.all([
    fetchUsuario(usuarioId),
    fetchAjustesRow(usuarioId),
    axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&order=creado_en.desc&select=id,nombre,numero,phone_id,waba_id,token,pixel_id,capi_token,activo,estado,creado_en,actualizado_en`,
      { headers: headers() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&order=creado_en.asc&select=id,nombre,color,creado_en`,
      { headers: headers() }
    ).catch(() => ({ data: [] })),
  ]);

  const auto = { ...DEFAULT_AUTO, ...(ajustes?.automatizacion || {}) };
  const notif = { ...DEFAULT_NOTIF, ...(ajustes?.notificaciones || {}) };

  return {
    ok: true,
    perfil: {
      nombre: usuario?.nombre || "",
      email: usuario?.email || "",
      empresa: ajustes?.empresa || "",
      zonaHoraria: ajustes?.zona_horaria || DEFAULT_AUTO.zonaHoraria,
      idioma: ajustes?.idioma || "es",
    },
    meta: {
      pixelId: ajustes?.meta_pixel_id || "",
      pixelNombre: ajustes?.meta_pixel_nombre || "",
      activo: Boolean(ajustes?.meta_activo),
      capiTokenMasked: ajustes?.meta_capi_token ? maskSecret(ajustes.meta_capi_token) : null,
      tieneCapiToken: Boolean(ajustes?.meta_capi_token),
    },
    automatizacion: auto,
    notificaciones: notif,
    conexionesWhatsapp: (conexionesRes.data || []).map((r) => mapConexion(r)),
    etiquetas: etiquetasRes.data || [],
    webhook: buildWebhookInfo(req),
    seguridad: {
      puedeCambiarPassword: true,
      ocultarTokens: true,
    },
  };
}

async function patchPerfil(usuarioId, body) {
  const { nombre, email, empresa, zonaHoraria, idioma } = body || {};
  const usuarioPatch = {};
  if (nombre !== undefined) usuarioPatch.nombre = String(nombre).trim();
  if (email !== undefined) usuarioPatch.email = String(email).trim().toLowerCase();

  if (Object.keys(usuarioPatch).length) {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
      usuarioPatch,
      { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
    );
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
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&order=creado_en.desc&select=id,nombre,numero,phone_id,waba_id,token,activo,estado,creado_en,actualizado_en`,
    { headers: headers() }
  );
  return { ok: true, conexiones: (res.data || []).map((r) => mapConexion(r)) };
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
    );
  }

  const now = new Date().toISOString();
  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp`,
    {
      usuario_id: usuarioId,
      nombre: nombre?.trim() || "WhatsApp",
      numero: numero?.trim() || "",
      token: accessToken.trim(),
      phone_id: phoneNumberId.trim(),
      waba_id: wabaId?.trim() || null,
      activo: Boolean(activo),
      estado: "conectado",
      creado_en: now,
      actualizado_en: now,
    },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, conexion: mapConexion(row) };
}

async function updateConexion(usuarioId, id, body) {
  const uid = encodeURIComponent(usuarioId);
  const check = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${uid}&select=id,phone_id,token`,
    { headers: headers() }
  );
  const existing = check.data?.[0];
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
    );
  }

  const patch = { actualizado_en: new Date().toISOString() };
  if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body.numero !== undefined) patch.numero = String(body.numero).trim();
  if (body.phoneNumberId !== undefined) patch.phone_id = String(body.phoneNumberId).trim();
  if (body.wabaId !== undefined) patch.waba_id = body.wabaId ? String(body.wabaId).trim() : null;
  if (body.activo !== undefined) patch.activo = Boolean(body.activo);
  if (body.accessToken && body.accessToken !== "__KEEP__") {
    patch.token = String(body.accessToken).trim();
    patch.estado = "conectado";
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${uid}`,
    patch,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }) }
  );

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&select=id,nombre,numero,phone_id,waba_id,token,activo,estado,creado_en,actualizado_en`,
    { headers: headers() }
  );
  return { ok: true, conexion: mapConexion(res.data?.[0]) };
}

async function deleteConexion(usuarioId, id) {
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: headers() }
  );
  return { ok: true };
}

async function probarConexion(usuarioId, id, numeroPrueba) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=*`,
    { headers: headers() }
  );
  const conexion = res.data?.[0];
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
      text: {
        body: "✅ MacBot: prueba de conexión WhatsApp API exitosa.",
      },
    },
    {
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        "Content-Type": "application/json",
      },
    }
  );

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(id)}`,
    { estado: "conectado", actualizado_en: new Date().toISOString() },
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
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
  const testPhone = "59170000000";
  const telefonoHash = crypto
    .createHash("sha256")
    .update(testPhone)
    .digest("hex");

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
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&order=creado_en.asc&select=id,nombre,color,creado_en`,
    { headers: headers() }
  );
  return { ok: true, etiquetas: res.data || [] };
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
    {
      nombre,
      color: body?.color || "#22c55e",
      usuario_id: usuarioId,
    },
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
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }) }
  );

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&select=id,nombre,color,creado_en`,
    { headers: headers() }
  );
  return { ok: true, etiqueta: res.data?.[0] };
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

  const usuario = await fetchUsuario(usuarioId);
  const full = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=password_hash`,
    { headers: headers() }
  );
  const hash = full.data?.[0]?.password_hash;
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
