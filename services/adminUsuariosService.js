/**
 * Panel admin — listado y actualización de crm_usuarios (sin password_hash).
 */
const axios = require("axios");
const {
  PLANES_VALIDOS,
  ESTADOS_VALIDOS,
  normalizarPlanUsuario,
} = require("./planesService");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");
const { esAdminProtegido } = require("../middlewares/adminAuth");

const ADMIN_PROTECTED_ERROR =
  "La cuenta administradora principal está protegida.";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const SELECT_USUARIO_ADMIN =
  "id,nombre,email,plan,estado_plan,fecha_vencimiento,max_whatsapp,max_contactos,max_flujos,activo";

const LIMITES_POR_PLAN = {
  free: { max_whatsapp: 1, max_contactos: 100, max_flujos: 1 },
  starter: { max_whatsapp: 2, max_contactos: 2000, max_flujos: 10 },
  pro: { max_whatsapp: 5, max_contactos: 10000, max_flujos: 20 },
  agency: { max_whatsapp: -1, max_contactos: -1, max_flujos: -1 },
};

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function mapUsuarioRow(row) {
  const plan = normalizarPlanUsuario(row);
  return {
    id: row.id != null ? String(row.id) : "",
    nombre: row.nombre ?? "",
    email: row.email ?? "",
    plan: plan.plan,
    estado_plan: plan.estado_plan,
    fecha_vencimiento: plan.fecha_vencimiento,
    max_whatsapp: plan.max_whatsapp,
    max_contactos: plan.max_contactos,
    max_flujos: plan.max_flujos,
    activo: Boolean(row.activo),
    admin_protegido: esAdminProtegido(row.email),
  };
}

function parseFechaVencimiento(value) {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { error: "fecha_vencimiento inválida" };
  return { value: d.toISOString() };
}

function normalizarUsuarioId(id) {
  return String(id ?? "").trim();
}

function filtroIdEq(id) {
  const uid = normalizarUsuarioId(id);
  if (!uid) return null;
  return `id=eq.${encodeURIComponent(uid)}`;
}

async function supabaseCount(table, filterQuery = "") {
  const suffix = filterQuery ? `&${filterQuery}` : "";
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${suffix}`;
  try {
    const res = await axios.get(url, {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    const range = res.headers["content-range"] || res.headers["Content-Range"] || "";
    const part = String(range).split("/")[1];
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (error) {
    if (table === "crm_conversiones" && isSchemaMissingError(error)) {
      logSchemaFallback(table, error);
      return 0;
    }
    console.log(`[adminUsuarios] count ${table}:`, error.response?.data || error.message);
    throw error;
  }
}

async function obtenerResumenAdmin() {
  const [
    usuarios_total,
    usuarios_activos,
    usuarios_suspendidos,
    free,
    starter,
    pro,
    agency,
    whatsapp_conectados,
    contactos_totales,
    flujos_totales,
    conversiones_totales,
  ] = await Promise.all([
    supabaseCount("crm_usuarios"),
    supabaseCount("crm_usuarios", "activo=eq.true"),
    supabaseCount("crm_usuarios", "or=(activo.eq.false,estado_plan.eq.suspendido)"),
    supabaseCount("crm_usuarios", "plan=eq.free"),
    supabaseCount("crm_usuarios", "plan=eq.starter"),
    supabaseCount("crm_usuarios", "plan=eq.pro"),
    supabaseCount("crm_usuarios", "plan=eq.agency"),
    supabaseCount("conexiones_whatsapp"),
    supabaseCount("clientes"),
    supabaseCount("flujos_builder"),
    supabaseCount("crm_conversiones"),
  ]);

  return {
    usuarios_total,
    usuarios_activos,
    usuarios_suspendidos,
    planes: { free, starter, pro, agency },
    uso: {
      whatsapp_conectados,
      contactos_totales,
      flujos_totales,
      conversiones_totales,
    },
  };
}

async function listarUsuarios() {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?select=${SELECT_USUARIO_ADMIN}&order=email.asc`,
    { headers: headers() }
  );
  return (res.data || []).map(mapUsuarioRow);
}

async function obtenerDashboardAdmin() {
  const [resumen, usuarios] = await Promise.all([obtenerResumenAdmin(), listarUsuarios()]);
  return { resumen, usuarios };
}

async function fetchUsuarioPorId(id) {
  const idFilter = filtroIdEq(id);
  if (!idFilter) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?${idFilter}&select=${SELECT_USUARIO_ADMIN}`,
    { headers: headers() }
  );
  const row = res.data?.[0];
  return row ? mapUsuarioRow(row) : null;
}

async function actualizarPlanUsuario(id, body) {
  const usuarioId = normalizarUsuarioId(id);
  const plan = String(body?.plan || "").trim().toLowerCase();
  const estado_plan = String(body?.estado_plan || "").trim().toLowerCase();

  console.log("[ADMIN_PLAN_UPDATE] start", { id: usuarioId, plan, estado_plan });

  if (!usuarioId) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }
  if (!PLANES_VALIDOS.has(plan)) {
    return { ok: false, status: 400, error: "plan inválido" };
  }
  if (!ESTADOS_VALIDOS.has(estado_plan)) {
    return { ok: false, status: 400, error: "estado_plan inválido" };
  }

  const fechaParsed = parseFechaVencimiento(body?.fecha_vencimiento);
  if (fechaParsed?.error) {
    return { ok: false, status: 400, error: fechaParsed.error };
  }

  const idFilter = filtroIdEq(usuarioId);
  if (!idFilter) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const anterior = await fetchUsuarioPorId(usuarioId);
  if (!anterior) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  const limites = LIMITES_POR_PLAN[plan];
  const payload = {
    plan,
    estado_plan,
    fecha_vencimiento: fechaParsed.value,
    max_whatsapp: limites.max_whatsapp,
    max_contactos: limites.max_contactos,
    max_flujos: limites.max_flujos,
    updated_plan_at: new Date().toISOString(),
  };

  try {
    const patchRes = await axios.patch(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?${idFilter}`,
      payload,
      {
        headers: headers({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
      }
    );

    const rows = Array.isArray(patchRes.data) ? patchRes.data : patchRes.data ? [patchRes.data] : [];
    if (rows.length === 0) {
      console.log("[ADMIN_PLAN_UPDATE] error", {
        message: "PATCH no actualizó ninguna fila en crm_usuarios",
        id: usuarioId,
      });
      return { ok: false, status: 404, error: "Usuario no encontrado o sin cambios en base de datos" };
    }

    const row = rows[0];
    const usuario = mapUsuarioRow(row);

    if (usuario.plan !== plan) {
      console.log("[ADMIN_PLAN_UPDATE] error", {
        message: "plan en respuesta no coincide con el solicitado",
        id: usuarioId,
        esperado: plan,
        recibido: usuario.plan,
      });
      return { ok: false, status: 500, error: "El plan no se guardó correctamente en Supabase" };
    }

    console.log("[ADMIN_PLAN_UPDATE] updated", {
      id: usuario.id,
      plan: usuario.plan,
      max_whatsapp: usuario.max_whatsapp,
      max_contactos: usuario.max_contactos,
      max_flujos: usuario.max_flujos,
    });

    return { ok: true, usuario, anterior };
  } catch (error) {
    console.log("[ADMIN_PLAN_UPDATE] error", {
      message: error.response?.data?.message || error.response?.data?.hint || error.message,
      id: usuarioId,
    });
    throw error;
  }
}

async function actualizarEstadoUsuario(id, activo) {
  if (typeof activo !== "boolean") {
    return { ok: false, status: 400, error: "activo debe ser true o false" };
  }

  const usuarioId = normalizarUsuarioId(id);
  const idFilter = filtroIdEq(usuarioId);
  if (!idFilter) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const anterior = await fetchUsuarioPorId(usuarioId);
  if (!anterior) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  if (activo === false && esAdminProtegido(anterior.email)) {
    return {
      ok: false,
      status: 403,
      code: "ADMIN_PROTECTED",
      error: ADMIN_PROTECTED_ERROR,
      targetEmail: anterior.email,
    };
  }

  const patchRes = await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?${idFilter}`,
    { activo },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const rows = Array.isArray(patchRes.data) ? patchRes.data : patchRes.data ? [patchRes.data] : [];
  if (rows.length === 0) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  const usuario = mapUsuarioRow(rows[0]);
  return { ok: true, usuario, anterior };
}

module.exports = {
  LIMITES_POR_PLAN,
  obtenerResumenAdmin,
  obtenerDashboardAdmin,
  listarUsuarios,
  actualizarPlanUsuario,
  actualizarEstadoUsuario,
};
