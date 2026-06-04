/**
 * Planes SaaS MacBot — lectura desde crm_usuarios (Fase 1: sin aplicar límites).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const PLANES_VALIDOS = new Set(["free", "starter", "pro", "agency"]);
const ESTADOS_VALIDOS = new Set(["activo", "vencido", "suspendido", "trial"]);

const DEFAULTS_PLAN = {
  plan: "free",
  estado_plan: "activo",
  fecha_vencimiento: null,
  max_whatsapp: 1,
  max_contactos: 100,
  max_flujos: 3,
};

const SELECT_PLAN =
  "id,plan,estado_plan,fecha_vencimiento,max_whatsapp,max_contactos,max_flujos,created_plan_at,updated_plan_at";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[planesService] ${msg}`, extra);
  else console.log(`[planesService] ${msg}`);
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** null o -1 = sin tope de conexiones WhatsApp */
function normalizarMaxWhatsapp(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (n === -1) return -1;
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULTS_PLAN.max_whatsapp;
}

function esWhatsappIlimitado(maxWhatsapp) {
  return maxWhatsapp === null || maxWhatsapp === -1;
}

/**
 * Asegura valores válidos y defaults si faltan columnas o datos legacy.
 */
function normalizarPlanUsuario(usuario) {
  if (!usuario || typeof usuario !== "object") {
    return { ...DEFAULTS_PLAN };
  }

  const plan = PLANES_VALIDOS.has(usuario.plan) ? usuario.plan : DEFAULTS_PLAN.plan;
  const estado_plan = ESTADOS_VALIDOS.has(usuario.estado_plan)
    ? usuario.estado_plan
    : DEFAULTS_PLAN.estado_plan;

  let fecha_vencimiento = usuario.fecha_vencimiento ?? null;
  if (fecha_vencimiento != null && fecha_vencimiento !== "") {
    const d = new Date(fecha_vencimiento);
    fecha_vencimiento = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else {
    fecha_vencimiento = null;
  }

  return {
    plan,
    estado_plan,
    fecha_vencimiento,
    max_whatsapp: normalizarMaxWhatsapp(usuario.max_whatsapp),
    max_contactos: toInt(usuario.max_contactos, DEFAULTS_PLAN.max_contactos),
    max_flujos: toInt(usuario.max_flujos, DEFAULTS_PLAN.max_flujos),
    created_plan_at: usuario.created_plan_at ?? null,
    updated_plan_at: usuario.updated_plan_at ?? null,
  };
}

/**
 * Plan activo: estado activo o trial, y sin vencimiento pasado.
 */
function esPlanActivo(usuario) {
  const u = normalizarPlanUsuario(usuario);
  if (u.estado_plan === "suspendido" || u.estado_plan === "vencido") {
    return false;
  }
  if (u.estado_plan !== "activo" && u.estado_plan !== "trial") {
    return false;
  }
  if (u.fecha_vencimiento) {
    const vence = new Date(u.fecha_vencimiento);
    if (!Number.isNaN(vence.getTime()) && vence.getTime() < Date.now()) {
      return false;
    }
  }
  return true;
}

async function fetchPlanRow(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=${SELECT_PLAN}`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

/**
 * Datos de plan del usuario (normalizados).
 */
async function obtenerPlanUsuario(usuarioId) {
  try {
    const row = await fetchPlanRow(usuarioId);
    if (!row) {
      return normalizarPlanUsuario(null);
    }
    return normalizarPlanUsuario(row);
  } catch (error) {
    log("obtenerPlanUsuario:", error.response?.data || error.message);
    return normalizarPlanUsuario(null);
  }
}

/**
 * Límites numéricos del plan (solo lectura; no se aplican en Fase 1).
 */
async function obtenerLimitesUsuario(usuarioId) {
  const plan = await obtenerPlanUsuario(usuarioId);
  return {
    whatsapp: plan.max_whatsapp,
    contactos: plan.max_contactos,
    flujos: plan.max_flujos,
  };
}

/**
 * Respuesta API GET /api/planes/mi-plan
 */
function buildMiPlanResponse(planData) {
  const u = normalizarPlanUsuario(planData);
  return {
    ok: true,
    plan: {
      nombre: u.plan,
      estado: u.estado_plan,
      fecha_vencimiento: u.fecha_vencimiento,
      limites: {
        whatsapp: u.max_whatsapp,
        contactos: u.max_contactos,
        flujos: u.max_flujos,
      },
    },
  };
}

module.exports = {
  PLANES_VALIDOS,
  ESTADOS_VALIDOS,
  DEFAULTS_PLAN,
  normalizarPlanUsuario,
  normalizarMaxWhatsapp,
  esWhatsappIlimitado,
  esPlanActivo,
  obtenerPlanUsuario,
  obtenerLimitesUsuario,
  buildMiPlanResponse,
};
