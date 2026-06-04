/**
 * Auditoría panel admin — admin_logs en Supabase.
 * Fallos al registrar no deben revertir la operación principal.
 */
const axios = require("axios");
const { isSchemaMissingError } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const SELECT_LOG =
  "id,admin_usuario_id,admin_email,usuario_afectado_id,usuario_afectado_email,accion,detalle,creado_en";

const SENSITIVE_KEYS = /password|secret|token|hash|api_?key/i;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function sanitizarDetalle(detalle) {
  if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) {
    return detalle ?? null;
  }
  const out = {};
  for (const [key, value] of Object.entries(detalle)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizarDetalle(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mapAdminUsuario(adminUsuario) {
  if (!adminUsuario) return { id: null, email: null, nombre: null };
  return {
    id: adminUsuario.id != null ? String(adminUsuario.id) : null,
    email: adminUsuario.email ? String(adminUsuario.email).trim() : null,
    nombre: adminUsuario.nombre ? String(adminUsuario.nombre).trim() : null,
  };
}

function mapUsuarioAfectado(usuario) {
  if (!usuario) return { id: null, email: null };
  return {
    id: usuario.id != null ? String(usuario.id) : null,
    email: usuario.email ? String(usuario.email).trim() : null,
  };
}

function detalleCambioPlan(anterior, nuevo) {
  return sanitizarDetalle({
    plan_anterior: anterior?.plan ?? null,
    plan_nuevo: nuevo?.plan ?? null,
    estado_plan_anterior: anterior?.estado_plan ?? null,
    estado_plan_nuevo: nuevo?.estado_plan ?? null,
    max_whatsapp_anterior: anterior?.max_whatsapp ?? null,
    max_whatsapp_nuevo: nuevo?.max_whatsapp ?? null,
    max_contactos_anterior: anterior?.max_contactos ?? null,
    max_contactos_nuevo: nuevo?.max_contactos ?? null,
    max_flujos_anterior: anterior?.max_flujos ?? null,
    max_flujos_nuevo: nuevo?.max_flujos ?? null,
  });
}

async function registrarAdminLog({ adminUsuario, usuarioAfectado, accion, detalle }) {
  try {
    const admin = mapAdminUsuario(adminUsuario);
    const afectado = mapUsuarioAfectado(usuarioAfectado);

    await axios.post(
      `${SUPABASE_URL}/rest/v1/admin_logs`,
      {
        admin_usuario_id: admin.id,
        admin_email: admin.email,
        usuario_afectado_id: afectado.id,
        usuario_afectado_email: afectado.email,
        accion: String(accion || "").trim(),
        detalle: sanitizarDetalle(detalle),
      },
      {
        headers: headers({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );
  } catch (error) {
    if (isSchemaMissingError(error)) {
      console.error("[adminLogs] tabla admin_logs no disponible — ejecuta create_admin_logs.sql");
      return;
    }
    console.error(
      "[adminLogs] registrarAdminLog:",
      error.response?.data?.message || error.message
    );
  }
}

async function registrarLogsCambioPlan(adminUsuario, anterior, nuevo) {
  if (!anterior || !nuevo) return;

  if (anterior.plan !== nuevo.plan) {
    await registrarAdminLog({
      adminUsuario,
      usuarioAfectado: nuevo,
      accion: "cambio_plan",
      detalle: detalleCambioPlan(anterior, nuevo),
    });
  }

  if (anterior.estado_plan !== nuevo.estado_plan) {
    await registrarAdminLog({
      adminUsuario,
      usuarioAfectado: nuevo,
      accion: "cambio_estado_plan",
      detalle: detalleCambioPlan(anterior, nuevo),
    });
  }
}

async function registrarLogEstadoUsuario(adminUsuario, anterior, nuevo) {
  if (!anterior || !nuevo) return;
  if (Boolean(anterior.activo) === Boolean(nuevo.activo)) return;

  const accion = nuevo.activo ? "activar_usuario" : "suspender_usuario";
  await registrarAdminLog({
    adminUsuario,
    usuarioAfectado: nuevo,
    accion,
    detalle: sanitizarDetalle({
      activo_anterior: Boolean(anterior.activo),
      activo_nuevo: Boolean(nuevo.activo),
    }),
  });
}

function mapLogRow(row) {
  return {
    id: row.id != null ? String(row.id) : "",
    admin_usuario_id: row.admin_usuario_id != null ? String(row.admin_usuario_id) : null,
    admin_email: row.admin_email ?? "",
    usuario_afectado_id:
      row.usuario_afectado_id != null ? String(row.usuario_afectado_id) : null,
    usuario_afectado_email: row.usuario_afectado_email ?? "",
    accion: row.accion ?? "",
    detalle: row.detalle ?? null,
    creado_en: row.creado_en ?? null,
  };
}

async function listarAdminLogs({ limit = 50 } = {}) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/admin_logs?select=${SELECT_LOG}&order=creado_en.desc&limit=${n}`,
      { headers: headers() }
    );
    return (res.data || []).map(mapLogRow);
  } catch (error) {
    if (isSchemaMissingError(error)) {
      console.error("[adminLogs] tabla admin_logs no disponible");
      return [];
    }
    throw error;
  }
}

module.exports = {
  registrarAdminLog,
  registrarLogsCambioPlan,
  registrarLogEstadoUsuario,
  listarAdminLogs,
  detalleCambioPlan,
};
