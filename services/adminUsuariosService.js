/**
 * Panel admin — listado y actualización de crm_usuarios (sin password_hash).
 */
const axios = require("axios");
const {
  PLANES_VALIDOS,
  ESTADOS_VALIDOS,
  normalizarPlanUsuario,
} = require("./planesService");

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
    id: row.id,
    nombre: row.nombre ?? "",
    email: row.email ?? "",
    plan: plan.plan,
    estado_plan: plan.estado_plan,
    fecha_vencimiento: plan.fecha_vencimiento,
    max_whatsapp: plan.max_whatsapp,
    max_contactos: plan.max_contactos,
    max_flujos: plan.max_flujos,
    activo: Boolean(row.activo),
  };
}

function parseFechaVencimiento(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { error: "fecha_vencimiento inválida" };
  return { value: d.toISOString() };
}

async function listarUsuarios() {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?select=${SELECT_USUARIO_ADMIN}&order=email.asc`,
    { headers: headers() }
  );
  return (res.data || []).map(mapUsuarioRow);
}

async function fetchUsuarioPorId(id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(id)}&select=${SELECT_USUARIO_ADMIN}`,
    { headers: headers() }
  );
  const row = res.data?.[0];
  return row ? mapUsuarioRow(row) : null;
}

async function actualizarPlanUsuario(id, body) {
  const plan = String(body?.plan || "").trim().toLowerCase();
  const estado_plan = String(body?.estado_plan || "").trim().toLowerCase();

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

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(id)}`,
    payload,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
  );

  const usuario = await fetchUsuarioPorId(id);
  if (!usuario) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }
  return { ok: true, usuario };
}

async function actualizarEstadoUsuario(id, activo) {
  if (typeof activo !== "boolean") {
    return { ok: false, status: 400, error: "activo debe ser true o false" };
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(id)}`,
    { activo },
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }) }
  );

  const usuario = await fetchUsuarioPorId(id);
  if (!usuario) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }
  return { ok: true, usuario };
}

module.exports = {
  LIMITES_POR_PLAN,
  listarUsuarios,
  actualizarPlanUsuario,
  actualizarEstadoUsuario,
};
