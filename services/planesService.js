/**
 * Planes SaaS MacBot — lectura desde crm_usuarios.
 *
 * Fase 1 (unificación conceptual):
 *   free | macbot | agency
 * Compatibilidad temporal (sin migrar datos):
 *   starter → macbot
 *   pro → macbot
 *
 * Fase 2.2: capacidad efectiva de contactos = max_contactos + bloques pagados
 * (solo MACBOT). No escribe crm_usuarios.max_contactos.
 *
 * El CHECK de Supabase todavía necesita una migración antes de poder guardar macbot.
 * crm_usuarios_plan_check sigue permitiendo solo: free, starter, pro, agency.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const PLANES_CANONICOS = new Set(["free", "macbot", "agency"]);
const PLANES_LEGACY_MACBOT = new Set(["starter", "pro"]);
const PLANES_VALIDOS = new Set(["free", "macbot", "agency", "starter", "pro"]);
const PLANES_PERSISTIBLES_DB = new Set(["free", "starter", "pro", "agency"]);
const ESTADOS_VALIDOS = new Set(["activo", "vencido", "suspendido", "trial"]);

const DEFAULTS_PLAN = {
  plan: "free",
  estado_plan: "activo",
  fecha_vencimiento: null,
  max_whatsapp: 1,
  max_contactos: 100,
  max_flujos: 1,
};

/** Defaults de catálogo MACBOT (Fase A). No sobrescriben valores válidos en crm_usuarios. */
const DEFAULTS_MACBOT = {
  max_whatsapp: 2,
  max_contactos: 1000,
  max_flujos: 20,
};

/** Alias histórico — adminUsuariosService importa LIMITES_MACBOT para cambios de plan (Fase C). */
const LIMITES_MACBOT = { ...DEFAULTS_MACBOT };

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

/** null o -1 = sin tope de contactos (agency) */
function normalizarMaxContactos(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (n === -1) return -1;
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULTS_PLAN.max_contactos;
}

function esContactosIlimitado(maxContactos) {
  return maxContactos === null || maxContactos === -1;
}

/** null o -1 = sin tope de flujos (agency) */
function normalizarMaxFlujos(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (n === -1) return -1;
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULTS_PLAN.max_flujos;
}

function esFlujosIlimitado(maxFlujos) {
  return maxFlujos === null || maxFlujos === -1;
}

/**
 * Límite MacBot desde BD con fallback seguro. null/undefined/inválido → default MacBot.
 * -1 no aplica ilimitado en MacBot (solo Agency).
 */
function resolverLimiteMacbot(value, defaultVal) {
  if (value === null || value === undefined || value === "") {
    return defaultVal;
  }
  const n = Number(value);
  if (n === -1 || !Number.isFinite(n) || n < 0) {
    return defaultVal;
  }
  return Math.floor(n);
}

/**
 * Modelo canónico: starter/pro se tratan como macbot.
 * Planes desconocidos sí caen a free; starter/pro NUNCA.
 */
function canonizarPlan(plan) {
  const p = String(plan || "").trim().toLowerCase();
  if (PLANES_LEGACY_MACBOT.has(p) || p === "macbot") return "macbot";
  if (p === "agency") return "agency";
  if (p === "free") return "free";
  return DEFAULTS_PLAN.plan;
}

function esPlanMacbot(plan) {
  return canonizarPlan(plan) === "macbot";
}

function esPlanAgency(plan) {
  return canonizarPlan(plan) === "agency";
}

/**
 * Valor que se puede escribir en crm_usuarios sin romper el CHECK actual.
 * Si el admin elige macbot y el usuario ya era starter/pro, se conserva ese valor legacy.
 * Usuarios nuevos a macbot se persisten como pro (equivalente CHECK-compatible).
 *
 * El CHECK de Supabase todavía necesita una migración antes de poder guardar macbot.
 */
function planPersistibleParaDb(planSolicitado, planAlmacenadoAnterior) {
  const solicitado = String(planSolicitado || "").trim().toLowerCase();
  if (PLANES_PERSISTIBLES_DB.has(solicitado)) return solicitado;
  if (solicitado === "macbot") {
    const prev = String(planAlmacenadoAnterior || "").trim().toLowerCase();
    if (prev === "starter" || prev === "pro") return prev;
    return "pro";
  }
  return DEFAULTS_PLAN.plan;
}

function planesEquivalentes(a, b) {
  return canonizarPlan(a) === canonizarPlan(b);
}

function nombrePlanUi(plan) {
  const c = canonizarPlan(plan);
  if (c === "macbot") return "MACBOT";
  if (c === "agency") return "Agency";
  return "Free";
}

/**
 * Asegura valores válidos y defaults si faltan columnas o datos legacy.
 * starter/pro → macbot (no se degradan a free).
 * MACBOT lee max_whatsapp/max_flujos de crm_usuarios (defaults 2/20 si faltan).
 * max_contactos se conserva desde BD; capacidad efectiva suma bloques en Fase 2.2.
 */
function normalizarPlanUsuario(usuario) {
  if (!usuario || typeof usuario !== "object") {
    return { ...DEFAULTS_PLAN };
  }

  const planAlmacenado = String(usuario.plan || "").trim().toLowerCase();
  const plan = PLANES_VALIDOS.has(planAlmacenado)
    ? canonizarPlan(planAlmacenado)
    : DEFAULTS_PLAN.plan;
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

  let max_whatsapp = normalizarMaxWhatsapp(usuario.max_whatsapp);
  const max_contactos = normalizarMaxContactos(usuario.max_contactos);
  let max_flujos = normalizarMaxFlujos(usuario.max_flujos);

  if (plan === "macbot") {
    max_whatsapp = resolverLimiteMacbot(
      usuario.max_whatsapp,
      DEFAULTS_MACBOT.max_whatsapp
    );
    max_flujos = resolverLimiteMacbot(usuario.max_flujos, DEFAULTS_MACBOT.max_flujos);
  }

  return {
    plan,
    plan_almacenado: PLANES_VALIDOS.has(planAlmacenado) ? planAlmacenado : plan,
    estado_plan,
    fecha_vencimiento,
    max_whatsapp,
    max_contactos,
    max_flujos,
    created_plan_at: usuario.created_plan_at ?? null,
    updated_plan_at: usuario.updated_plan_at ?? null,
  };
}

/**
 * Plan activo: estado activo o trial.
 * MACBOT (incl. starter/pro) no depende de fecha de vencimiento mensual.
 * FREE y AGENCY conservan el chequeo de vencimiento.
 */
function esPlanActivo(usuario) {
  const u = normalizarPlanUsuario(usuario);
  if (u.estado_plan === "suspendido" || u.estado_plan === "vencido") {
    return false;
  }
  if (u.estado_plan !== "activo" && u.estado_plan !== "trial") {
    return false;
  }
  if (u.plan === "macbot") {
    return true;
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

async function supabaseCountPorUsuario(table, usuarioId) {
  if (!usuarioId || !SUPABASE_URL || !SUPABASE_KEY) return 0;
  const filter = `usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&${filter}`;
  try {
    const res = await axios.get(url, {
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
    });
    const range = res.headers["content-range"] || res.headers["Content-Range"] || "";
    const part = String(range).split("/")[1];
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (error) {
    log(`supabaseCountPorUsuario ${table}:`, error.response?.data || error.message);
    return 0;
  }
}

/**
 * Uso real de recursos del usuario (conteos en Supabase).
 */
async function obtenerUsoUsuario(usuarioId) {
  const [whatsapp_usados, contactos_usados, flujos_usados] = await Promise.all([
    supabaseCountPorUsuario("conexiones_whatsapp", usuarioId),
    supabaseCountPorUsuario("clientes", usuarioId),
    supabaseCountPorUsuario("flujos_builder", usuarioId),
  ]);
  return { whatsapp_usados, contactos_usados, flujos_usados };
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
 * Capacidad efectiva de contactos. No escribe max_contactos.
 *
 * - Ilimitado (null / -1, p.ej. Agency): se conserva ilimitado.
 * - MACBOT (incl. starter/pro): max_contactos + SUM(bloques estado=pagado).
 * - Free u otro: solo max_contactos (no suma bloques).
 * - Tabla de bloques ausente o error de ledger: extra = 0 (nunca ilimita).
 */
async function obtenerCapacidadEfectivaContactos(usuarioId, planPreloaded = null) {
  const plan = planPreloaded
    ? normalizarPlanUsuario(planPreloaded)
    : await obtenerPlanUsuario(usuarioId);
  const base = plan.max_contactos;

  if (esContactosIlimitado(base)) {
    return base;
  }

  const baseNum = toInt(base, DEFAULTS_PLAN.max_contactos);

  if (!esPlanMacbot(plan.plan)) {
    return baseNum;
  }

  let extra = 0;
  try {
    const { obtenerCapacidadPagada } = require("./macbotContactosService");
    extra = await obtenerCapacidadPagada(usuarioId);
  } catch (error) {
    log("obtenerCapacidadEfectivaContactos ledger:", error.response?.data || error.message);
    extra = 0;
  }

  return baseNum + toInt(extra, 0);
}

/**
 * Límites numéricos del plan. contactos = capacidad efectiva (Fase 2.2).
 */
async function obtenerLimitesUsuario(usuarioId) {
  const plan = await obtenerPlanUsuario(usuarioId);
  const contactos = await obtenerCapacidadEfectivaContactos(usuarioId, plan);
  return {
    whatsapp: plan.max_whatsapp,
    contactos,
    flujos: plan.max_flujos,
  };
}

/**
 * Respuesta API GET /api/planes/mi-plan
 * extras.contactos, si se pasa, es la capacidad efectiva (no max_contactos).
 */
function buildMiPlanResponse(planData, uso = null, extras = null) {
  const u = normalizarPlanUsuario(planData);
  const usoNorm = uso && typeof uso === "object" ? uso : {};
  const contactosLimite =
    extras && extras.contactos !== undefined ? extras.contactos : u.max_contactos;
  return {
    ok: true,
    plan: {
      nombre: u.plan,
      estado: u.estado_plan,
      fecha_vencimiento: u.fecha_vencimiento,
      limites: {
        whatsapp: u.max_whatsapp,
        contactos: contactosLimite,
        flujos: u.max_flujos,
      },
      uso: {
        whatsapp_usados: toInt(usoNorm.whatsapp_usados, 0),
        contactos_usados: toInt(usoNorm.contactos_usados, 0),
        flujos_usados: toInt(usoNorm.flujos_usados, 0),
      },
    },
  };
}

module.exports = {
  PLANES_VALIDOS,
  PLANES_CANONICOS,
  PLANES_LEGACY_MACBOT,
  PLANES_PERSISTIBLES_DB,
  ESTADOS_VALIDOS,
  DEFAULTS_PLAN,
  DEFAULTS_MACBOT,
  LIMITES_MACBOT,
  resolverLimiteMacbot,
  canonizarPlan,
  esPlanMacbot,
  esPlanAgency,
  planPersistibleParaDb,
  planesEquivalentes,
  nombrePlanUi,
  normalizarPlanUsuario,
  normalizarMaxWhatsapp,
  esWhatsappIlimitado,
  normalizarMaxContactos,
  esContactosIlimitado,
  normalizarMaxFlujos,
  esFlujosIlimitado,
  esPlanActivo,
  obtenerPlanUsuario,
  obtenerCapacidadEfectivaContactos,
  obtenerLimitesUsuario,
  obtenerUsoUsuario,
  buildMiPlanResponse,
};
