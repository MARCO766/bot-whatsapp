/**
 * Panel admin — listado y actualización de crm_usuarios (sin password_hash).
 */
const axios = require("axios");
const {
  PLANES_VALIDOS,
  ESTADOS_VALIDOS,
  LIMITES_MACBOT,
  DEFAULTS_MACBOT,
  resolverLimiteMacbot,
  normalizarPlanUsuario,
  canonizarPlan,
  esPlanMacbot,
  esPlanAgency,
  planPersistibleParaDb,
  planesEquivalentes,
} = require("./planesService");
const { isSchemaMissingError, logSchemaFallback, errorMessage } = require("./supabaseSafe");
const { esAdminProtegido } = require("../middlewares/adminAuth");
const { adjuntarLeadsRestantes, resumirLeadsRestantes } = require("./adminLeadsRestantes");

const ADMIN_PROTECTED_ERROR =
  "La cuenta administradora principal está protegida.";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const SELECT_USUARIO_ADMIN =
  "id,nombre,email,plan,estado_plan,fecha_vencimiento,max_whatsapp,max_contactos,max_flujos,activo";

const LIMITES_POR_PLAN = {
  free: { max_whatsapp: 1, max_contactos: 100, max_flujos: 1 },
  macbot: { ...DEFAULTS_MACBOT },
  starter: { ...DEFAULTS_MACBOT },
  pro: { ...DEFAULTS_MACBOT },
  agency: { max_whatsapp: -1, max_contactos: -1, max_flujos: -1 },
};

const DEFAULTS_FREE = LIMITES_POR_PLAN.free;
const DEFAULTS_AGENCY = LIMITES_POR_PLAN.agency;

/** Estrategia de límites al cambiar plan (canonizado anterior → nuevo). */
const ESTRATEGIA_LIMITES = {
  PRESERVAR: "preservar",
  FREE: "free",
  MACBOT: "macbot",
  AGENCY: "agency",
};

function resolverContactoMacbotPreservar(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULTS_MACBOT.max_contactos;
  }
  const n = Number(value);
  if (n === -1 || !Number.isFinite(n) || n < 0) {
    return DEFAULTS_MACBOT.max_contactos;
  }
  return Math.floor(n);
}

/**
 * Decide qué hacer con max_whatsapp / max_contactos / max_flujos según transición canónica.
 * starter/pro → macbot cuenta como macbot → macbot (preservar).
 */
function resolverEstrategiaLimitesTransicion(planAnteriorCanon, planNuevoCanon) {
  const prev = canonizarPlan(planAnteriorCanon);
  const next = canonizarPlan(planNuevoCanon);

  if (prev === next) {
    if (next === "macbot") return ESTRATEGIA_LIMITES.PRESERVAR;
    if (next === "free") return ESTRATEGIA_LIMITES.FREE;
    if (next === "agency") return ESTRATEGIA_LIMITES.AGENCY;
  }

  if (next === "free") return ESTRATEGIA_LIMITES.FREE;
  if (next === "agency") return ESTRATEGIA_LIMITES.AGENCY;
  if (next === "macbot") {
    if (prev === "macbot") return ESTRATEGIA_LIMITES.PRESERVAR;
    return ESTRATEGIA_LIMITES.MACBOT;
  }

  return ESTRATEGIA_LIMITES.PRESERVAR;
}

function limitesDesdeEstrategia(estrategia, limitesRaw = null) {
  switch (estrategia) {
    case ESTRATEGIA_LIMITES.PRESERVAR:
      return null;
    case ESTRATEGIA_LIMITES.FREE:
      return { ...DEFAULTS_FREE };
    case ESTRATEGIA_LIMITES.MACBOT:
      return { ...DEFAULTS_MACBOT };
    case ESTRATEGIA_LIMITES.AGENCY:
      return { ...DEFAULTS_AGENCY };
    default:
      return null;
  }
}

/**
 * Límites a persistir cuando la estrategia es preservar (macbot → macbot).
 * Valores inválidos en BD se completan con defaults MacBot sin resetear personalizaciones válidas.
 */
function limitesMacbotPreservados(limitesRaw) {
  const raw = limitesRaw && typeof limitesRaw === "object" ? limitesRaw : {};
  return {
    max_whatsapp: resolverLimiteMacbot(raw.max_whatsapp, DEFAULTS_MACBOT.max_whatsapp),
    max_contactos: resolverContactoMacbotPreservar(raw.max_contactos),
    max_flujos: resolverLimiteMacbot(raw.max_flujos, DEFAULTS_MACBOT.max_flujos),
  };
}

function resolverLimitesCambioPlan(planAnteriorCanon, planNuevoCanon, limitesRaw = null) {
  const estrategia = resolverEstrategiaLimitesTransicion(planAnteriorCanon, planNuevoCanon);
  if (estrategia === ESTRATEGIA_LIMITES.PRESERVAR) {
    return { estrategia, limites: null, omitir: true };
  }
  return { estrategia, limites: limitesDesdeEstrategia(estrategia), omitir: false };
}

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
    plan_almacenado: plan.plan_almacenado || row.plan || plan.plan,
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
    planes: { free, macbot: starter + pro, agency },
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
  const usuariosConLeads = await adjuntarLeadsRestantes(usuarios);
  return { resumen, usuarios: usuariosConLeads };
}

async function fetchUsuarioRowPorId(id) {
  const idFilter = filtroIdEq(id);
  if (!idFilter) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?${idFilter}&select=${SELECT_USUARIO_ADMIN}`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function fetchUsuarioPorId(id) {
  const row = await fetchUsuarioRowPorId(id);
  return row ? mapUsuarioRow(row) : null;
}

const LIMITES_MACBOT_CAMPOS = ["max_whatsapp", "max_contactos", "max_flujos"];

function parseEnteroLimiteMacbot(value, fieldName) {
  if (typeof value !== "number") {
    return { error: `${fieldName} debe ser un entero >= 0` };
  }
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return { error: `${fieldName} debe ser un entero >= 0` };
  }
  return { value };
}

function parseLimitesMacbotBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body inválido" };
  }

  const parsed = {};
  for (const key of LIMITES_MACBOT_CAMPOS) {
    if (!(key in body)) {
      return { error: `${key} es obligatorio` };
    }
    const result = parseEnteroLimiteMacbot(body[key], key);
    if (result.error) return result;
    parsed[key] = result.value;
  }

  return { value: parsed };
}

async function actualizarLimitesUsuario(id, body) {
  const usuarioId = normalizarUsuarioId(id);
  if (!usuarioId) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const limitesParsed = parseLimitesMacbotBody(body);
  if (limitesParsed.error) {
    return { ok: false, status: 400, error: limitesParsed.error };
  }

  const idFilter = filtroIdEq(usuarioId);
  if (!idFilter) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const anterior = await fetchUsuarioPorId(usuarioId);
  if (!anterior) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  if (esPlanAgency(anterior.plan)) {
    return {
      ok: false,
      status: 403,
      error: "Los límites de Agency no se pueden modificar desde esta función.",
    };
  }

  if (!esPlanMacbot(anterior.plan)) {
    return {
      ok: false,
      status: 403,
      error: "Los límites personalizados solo están disponibles para usuarios MacBot.",
    };
  }

  const limites = limitesParsed.value;
  const payload = {
    max_whatsapp: limites.max_whatsapp,
    max_contactos: limites.max_contactos,
    max_flujos: limites.max_flujos,
    updated_plan_at: new Date().toISOString(),
  };

  console.log("[ADMIN_LIMITES_UPDATE] start", {
    id: usuarioId,
    max_whatsapp: limites.max_whatsapp,
    max_contactos: limites.max_contactos,
    max_flujos: limites.max_flujos,
  });

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
      return { ok: false, status: 404, error: "Usuario no encontrado o sin cambios en base de datos" };
    }

    const usuario = mapUsuarioRow(rows[0]);
    let usuarioConLeads = usuario;
    try {
      const [enriquecido] = await adjuntarLeadsRestantes([usuario]);
      if (enriquecido) usuarioConLeads = enriquecido;
    } catch (leadsError) {
      console.log(
        "[ADMIN_LIMITES_UPDATE] leads:",
        leadsError?.message || leadsError
      );
    }

    console.log("[ADMIN_LIMITES_UPDATE] updated", {
      id: usuario.id,
      max_whatsapp: usuario.max_whatsapp,
      max_contactos: usuario.max_contactos,
      max_flujos: usuario.max_flujos,
    });

    return { ok: true, usuario: usuarioConLeads, anterior };
  } catch (error) {
    console.log("[ADMIN_LIMITES_UPDATE] error", {
      message: error.response?.data?.message || error.response?.data?.hint || error.message,
      id: usuarioId,
    });
    throw error;
  }
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

  const rowAnterior = await fetchUsuarioRowPorId(usuarioId);
  if (!rowAnterior) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  const anterior = mapUsuarioRow(rowAnterior);
  const planAnteriorCanon = anterior.plan;
  const planNuevoCanon = canonizarPlan(plan);
  const resolucionLimites = resolverLimitesCambioPlan(planAnteriorCanon, planNuevoCanon);

  const planDb = planPersistibleParaDb(plan, anterior.plan_almacenado);
  const payload = {
    plan: planDb,
    estado_plan,
    fecha_vencimiento: fechaParsed.value,
    updated_plan_at: new Date().toISOString(),
  };

  if (!resolucionLimites.omitir && resolucionLimites.limites) {
    payload.max_whatsapp = resolucionLimites.limites.max_whatsapp;
    payload.max_contactos = resolucionLimites.limites.max_contactos;
    payload.max_flujos = resolucionLimites.limites.max_flujos;
  }

  console.log("[ADMIN_PLAN_UPDATE] limites", {
    id: usuarioId,
    transicion: planAnteriorCanon + " -> " + planNuevoCanon,
    estrategia: resolucionLimites.estrategia,
    omitir: resolucionLimites.omitir,
    limites: resolucionLimites.limites,
  });

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

    if (!planesEquivalentes(usuario.plan, plan)) {
      console.log("[ADMIN_PLAN_UPDATE] error", {
        message: "plan en respuesta no coincide con el solicitado",
        id: usuarioId,
        esperado: plan,
        persistido: planDb,
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

/**
 * Delta del ajuste de leads. No acepta el límite absoluto.
 * Un entero no seguro, un decimal o un tipo distinto se rechazan.
 * Cero se rechaza con un mensaje propio.
 */
function parseDeltaAjusteLeads(delta) {
  if (typeof delta !== "number" || !Number.isFinite(delta) || !Number.isSafeInteger(delta)) {
    return { error: "delta debe ser un entero" };
  }
  if (delta === 0) {
    return { error: "delta debe ser distinto de cero" };
  }
  return { value: delta };
}

function sumaEnteraSegura(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  if (b > 0 && a > Number.MAX_SAFE_INTEGER - b) return null;
  if (b < 0 && a < Number.MIN_SAFE_INTEGER - b) return null;
  return a + b;
}

/**
 * Reglas del ajuste, sin lectura ni escritura.
 * La base nueva es base + delta. El límite efectivo suma los bloques ya pagados.
 * Una reducción no puede dejar ese límite por debajo de los leads utilizados.
 */
function evaluarAjusteCapacidadLeads({ base, bloques, usados, delta }) {
  if (!Number.isSafeInteger(base) || base < 0) {
    return { ok: false, status: 400, error: "La capacidad base no admite un ajuste numérico." };
  }
  if (!Number.isSafeInteger(bloques) || bloques < 0) {
    return {
      ok: false,
      status: 503,
      error: "No se pudieron leer los bloques pagados. No se modificó la capacidad.",
    };
  }
  if (!Number.isSafeInteger(usados) || usados < 0) {
    return {
      ok: false,
      status: 503,
      error: "No se pudo verificar el consumo de leads. No se modificó la capacidad.",
    };
  }
  if (!Number.isSafeInteger(delta) || delta === 0) {
    return { ok: false, status: 400, error: "delta debe ser un entero distinto de cero" };
  }

  const limiteAnterior = sumaEnteraSegura(base, bloques);
  const nuevaBase = sumaEnteraSegura(base, delta);
  if (limiteAnterior == null || nuevaBase == null) {
    return { ok: false, status: 400, error: "El ajuste excede el rango permitido." };
  }
  const limiteNuevo = sumaEnteraSegura(nuevaBase, bloques);
  if (limiteNuevo == null) {
    return { ok: false, status: 400, error: "El ajuste excede el rango permitido." };
  }

  const reduccionMaximaBase = Math.min(base, Math.max(0, limiteAnterior - usados));

  if (nuevaBase < 0) {
    return {
      ok: false,
      status: 400,
      error:
        "La capacidad base no puede quedar negativa. Reducción máxima aplicable por la base: " +
        reduccionMaximaBase +
        ".",
      reduccion_maxima_base: reduccionMaximaBase,
    };
  }

  if (delta < 0 && usados > limiteAnterior) {
    return {
      ok: false,
      status: 400,
      error:
        "El usuario ya supera su límite actual (" +
        usados +
        " utilizados, límite " +
        limiteAnterior +
        "). Solo se permiten aumentos.",
      reduccion_maxima_base: 0,
    };
  }

  if (delta < 0 && limiteNuevo < usados) {
    return {
      ok: false,
      status: 400,
      error:
        "La reducción dejaría el límite en " +
        limiteNuevo +
        ", por debajo de los " +
        usados +
        " leads utilizados. Reducción máxima aplicable por la base: " +
        reduccionMaximaBase +
        ".",
      reduccion_maxima_base: reduccionMaximaBase,
    };
  }

  return {
    ok: true,
    nuevaBase,
    limiteAnterior,
    limiteNuevo,
    reduccionMaximaBase,
    disponibles: Math.max(0, limiteNuevo - usados),
  };
}

const OPERACION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOperacionAjusteLeads(value) {
  const id = String(value ?? "").trim();
  if (!OPERACION_UUID_RE.test(id)) {
    return { error: "operacion_id debe ser un UUID" };
  }
  return { value: id };
}

function rpcNoDisponible(error) {
  const code = String(error?.response?.data?.code || "");
  const msg = errorMessage(error).toLowerCase();
  return (
    isSchemaMissingError(error) ||
    code === "PGRST202" ||
    msg.includes("could not find the function") ||
    (msg.includes("does not exist") && msg.includes("function"))
  );
}

async function aplicarAjusteCapacidadLeadsRpc({ usuarioId, operacionId, delta }) {
  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/rpc/aplicar_ajuste_capacidad_leads`,
    {
      p_usuario_id: usuarioId,
      p_operacion_id: operacionId,
      p_delta: delta,
    },
    {
      headers: headers({ "Content-Type": "application/json" }),
    }
  );
  return res.data;
}

function usuarioDesdeAjuste(data, usuarioId) {
  const vigente = data && data.vigente;
  const pintar = Boolean(vigente && vigente.disponible === true);
  if (!pintar) return { usuario: null, pintar: false };
  const leads = resumirLeadsRestantes(Number(vigente.usados), Number(vigente.limite));
  if (!data.usuario || typeof data.usuario !== "object") {
    return {
      usuario: {
        id: String(usuarioId),
        max_contactos: Number(vigente.base),
        leads,
      },
      pintar: true,
    };
  }
  const base = mapUsuarioRow(data.usuario);
  base.max_contactos = Number(vigente.base);
  base.leads = leads;
  return { usuario: base, pintar: true };
}

/**
 * Suma o resta capacidad de un solo usuario MacBot.
 * La escritura ocurre solo dentro de aplicar_ajuste_capacidad_leads.
 * El mismo UUID no vuelve a modificar max_contactos.
 */
async function ajustarCapacidadLeads(id, delta, operacionId, deps = {}) {
  const deltaParsed = parseDeltaAjusteLeads(delta);
  if (deltaParsed.error) {
    return { ok: false, status: 400, error: deltaParsed.error };
  }

  const operacionParsed = parseOperacionAjusteLeads(operacionId);
  if (operacionParsed.error) {
    return { ok: false, status: 400, error: operacionParsed.error };
  }

  const usuarioId = normalizarUsuarioId(id);
  if (!usuarioId) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const aplicar =
    typeof deps.aplicarRpc === "function" ? deps.aplicarRpc : aplicarAjusteCapacidadLeadsRpc;

  let data;
  try {
    data = await aplicar({
      usuarioId,
      operacionId: operacionParsed.value,
      delta: deltaParsed.value,
    });
    if (typeof data === "string") {
      data = JSON.parse(data);
    }
  } catch (error) {
    if (rpcNoDisponible(error)) {
      logSchemaFallback("rpc/aplicar_ajuste_capacidad_leads", error);
      return {
        ok: false,
        status: 503,
        error: "La función de ajuste todavía no está disponible. No se modificó la capacidad.",
      };
    }
    console.log("[ADMIN_AJUSTE_LEADS] error", {
      message: error.response?.data?.message || error.response?.data?.hint || error.message,
      id: usuarioId,
    });
    throw error;
  }

  if (!data || data.ok !== true) {
    return {
      ok: false,
      status: Number(data?.status) || 400,
      error: data?.error || "No se pudo aplicar el ajuste",
      code: data?.code,
      plan: data?.plan,
      reduccion_maxima_base:
        data?.reduccion_maxima_base == null ? undefined : Number(data.reduccion_maxima_base),
    };
  }

  const repetida = data.repetida === true;
  const ajuste = data.ajuste || {};
  const { usuario, pintar } = usuarioDesdeAjuste(data, usuarioId);

  console.log("[ADMIN_AJUSTE_LEADS] " + (repetida ? "replay" : "updated"), {
    id: usuarioId,
    operacion_id: operacionParsed.value,
    delta: ajuste.delta,
    repetida,
  });

  return {
    ok: true,
    repetida,
    pintar,
    usuario,
    ajuste,
    vigente: data.vigente || null,
    detalle: repetida
      ? null
      : {
          usuario_afectado_id: usuario?.id || usuarioId,
          usuario_afectado_email: usuario?.email || data.usuario?.email || null,
          operacion_id: operacionParsed.value,
          delta: Number(ajuste.delta),
          base_anterior: Number(ajuste.base_anterior),
          base_nueva: Number(ajuste.base_nueva),
          bloques: Number(ajuste.bloques),
          limite_efectivo_anterior: Number(ajuste.limite_anterior),
          limite_efectivo_nuevo: Number(ajuste.limite_nuevo),
          leads_utilizados: Number(ajuste.leads_utilizados),
          leads_disponibles: Number(ajuste.leads_disponibles),
        },
  };
}

module.exports = {
  LIMITES_POR_PLAN,
  ESTRATEGIA_LIMITES,
  resolverEstrategiaLimitesTransicion,
  resolverLimitesCambioPlan,
  limitesMacbotPreservados,
  LIMITES_MACBOT_CAMPOS,
  parseLimitesMacbotBody,
  obtenerResumenAdmin,
  obtenerDashboardAdmin,
  listarUsuarios,
  actualizarPlanUsuario,
  actualizarLimitesUsuario,
  actualizarEstadoUsuario,
  parseDeltaAjusteLeads,
  parseOperacionAjusteLeads,
  evaluarAjusteCapacidadLeads,
  ajustarCapacidadLeads,
};
