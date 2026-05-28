/**
 * Lógica de Conexiones WhatsApp — misma que /guardar-conexion y admin (flows.js).
 * Una conexión activa por usuario en conexiones_whatsapp.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[conexionesWhatsapp] ${msg}`, extra);
  else console.log(`[conexionesWhatsapp] ${msg}`);
}

/** Igual que admin.js — conexión activa del usuario */
async function getConexionActiva(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&activo=eq.true&select=*`,
      { headers: supabaseHeaders() }
    );
    return res.data?.[0] || null;
  } catch (error) {
    log("getConexionActiva error:", error.response?.data || error.message);
    return null;
  }
}

async function getConexionesUsuario(usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=*&order=creado_en.desc`,
      { headers: supabaseHeaders() }
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    log("getConexionesUsuario error:", error.response?.data || error.message);
    return [];
  }
}

/** Igual que POST /guardar-conexion (si falta token/phone_id, conserva la conexión activa) */
async function guardarConexion(usuarioId, body) {
  const [existing, conexiones] = await Promise.all([
    getConexionActiva(usuarioId),
    getConexionesUsuario(usuarioId),
  ]);
  const {
    nombre,
    numero,
    token: tokenIn,
    phone_id: phoneIn,
    pixel_id,
    capi_token,
  } = body || {};

  const token = (tokenIn && String(tokenIn).trim()) || existing?.token || "";
  const phone_id =
    (phoneIn && String(phoneIn).trim()) || existing?.phone_id || "";

  if (!token || !phone_id) {
    const err = new Error("TOKEN y PHONE_ID son obligatorios");
    err.status = 400;
    throw err;
  }

  const esPrimeraConexion = conexiones.length === 0;

  await axios.post(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp`,
    {
      usuario_id: usuarioId,
      nombre: (nombre ?? existing?.nombre)?.trim() || "WhatsApp",
      numero: (numero ?? existing?.numero)?.trim() || "",
      token: token.trim(),
      phone_id: phone_id.trim(),
      pixel_id:
        pixel_id !== undefined && pixel_id !== null
          ? String(pixel_id).trim() || null
          : existing?.pixel_id || null,
      capi_token:
        capi_token !== undefined && capi_token !== null
          ? String(capi_token).trim() || null
          : existing?.capi_token || null,
      activo: esPrimeraConexion,
    },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  log("guardarConexion OK", { usuarioId, phone_id });
  return getConexionActiva(usuarioId);
}

async function hacerPrincipal(usuarioId, conexionId) {
  if (!usuarioId || !conexionId) {
    const err = new Error("usuarioId y conexionId son obligatorios");
    err.status = 400;
    throw err;
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { activo: false },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { activo: true },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );

  return getConexionActiva(usuarioId);
}

/** Igual que POST /desconectar-whatsapp */
async function desconectarWhatsapp(usuarioId) {
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: supabaseHeaders() }
  );
  log("desconectarWhatsapp OK", { usuarioId });
  return { ok: true };
}

async function desconectarWhatsappPorId(usuarioId, conexionId) {
  if (!usuarioId || !conexionId) {
    const err = new Error("usuarioId y conexionId son obligatorios");
    err.status = 400;
    throw err;
  }
  await axios.delete(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: supabaseHeaders() }
  );

  const activa = await getConexionActiva(usuarioId);
  if (!activa) {
    const restantes = await getConexionesUsuario(usuarioId);
    if (restantes[0]?.id) {
      await hacerPrincipal(usuarioId, restantes[0].id);
    }
  }
  return { ok: true };
}

/** Igual que POST /probar-whatsapp */
async function probarWhatsapp(usuarioId, numero) {
  const conexion = await getConexionActiva(usuarioId);

  if (!conexion?.token || !conexion?.phone_id) {
    const err = new Error("Primero conecta tu WhatsApp en Conexiones");
    err.status = 400;
    throw err;
  }

  const to = String(numero || conexion.numero || "").replace(/\D/g, "");
  if (!to) {
    const err = new Error("Indica un número de prueba");
    err.status = 400;
    throw err;
  }

  await axios.post(
    `https://graph.facebook.com/v19.0/${conexion.phone_id}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: {
        body: "✅ MacBot conectado correctamente. Esta es una prueba de WhatsApp API.",
      },
    },
    {
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        "Content-Type": "application/json",
      },
    }
  );

  log("probarWhatsapp OK", { usuarioId, to });
  return { ok: true, mensaje: "Mensaje de prueba enviado" };
}

async function probarWhatsappPorId(usuarioId, conexionId, numero) {
  const conexiones = await getConexionesUsuario(usuarioId);
  const conexion = conexiones.find((c) => String(c.id) === String(conexionId));
  if (!conexion?.token || !conexion?.phone_id) {
    const err = new Error("Conexión inválida para prueba");
    err.status = 400;
    throw err;
  }
  const to = String(numero || conexion.numero || "").replace(/\D/g, "");
  if (!to) {
    const err = new Error("Indica un número de prueba");
    err.status = 400;
    throw err;
  }
  await axios.post(
    `https://graph.facebook.com/v19.0/${conexion.phone_id}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: "✅ MacBot conectado correctamente. Esta es una prueba de WhatsApp API." },
    },
    {
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return { ok: true, mensaje: "Mensaje de prueba enviado" };
}

function maskToken(token) {
  if (!token || typeof token !== "string") return null;
  const t = token.trim();
  if (t.length <= 8) return "********";
  return `${t.slice(0, 4)}${"*".repeat(8)}${t.slice(-4)}`;
}

/** Respuesta API (lista + activa); incluye token solo si includeToken */
function mapConexionApi(row, { includeToken = false } = {}) {
  if (!row) return null;
  const ok = Boolean(row.token?.trim() && row.phone_id?.trim());
  return {
    id: row.id,
    nombre: row.nombre || "",
    numero: row.numero || "",
    phone_id: row.phone_id || "",
    phoneNumberId: row.phone_id || "",
    token: includeToken ? row.token || "" : undefined,
    tokenMasked: row.token ? maskToken(row.token) : null,
    pixel_id: row.pixel_id || "",
    pixelId: row.pixel_id || "",
    capi_token: includeToken ? row.capi_token || "" : undefined,
    capiTokenMasked: row.capi_token ? maskToken(row.capi_token) : null,
    activo: row.activo !== false,
    conectado: ok,
    estado: ok ? "conectado" : "incompleto",
  };
}

module.exports = {
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
};
