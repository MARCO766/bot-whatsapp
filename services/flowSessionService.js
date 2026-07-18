/**
 * Servicio de negocio de flow_sessions (Fase 6).
 * Única capa de reglas sobre flow_sessions: status, defaults, cancelación,
 * y evaluación real de ciclo de vida (solo lectura; aún no usada por el runtime).
 * Las escrituras de auditoría van fire-and-forget vía registrar*.
 */

const axios = require("axios");

const {
  crearFlowSession,
  obtenerFlowSession,
  obtenerFlowSessionActiva,
  actualizarFlowSessionActiva,
  actualizarFlowSessionsActivas,
  eliminarFlowSession,
} = require("./flowSessionsRepository");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const FLOW_EVAL_TIMEOUT_MS = 2000;

const STATUS_DEFAULT = "active";
const STATUS_FINISHED = "finished";
const STATUS_CANCELLED = "cancelled";
const STATUS_EXPIRED = "expired";
const NODO_INICIO_DEFAULT = "nodo_inicio";

const MOTIVO_NO_ACTIVE_SESSION = "NO_ACTIVE_SESSION";
const MOTIVO_SESSION_EXPIRED = "SESSION_EXPIRED";

/**
 * Renovación por actividad (Fase 6 — documentado, no persistido en JSON aún).
 * renewOnActivity = true → el reloj principal es last_activity_at
 * (fallback: started_at si last_activity_at no existe).
 */
const RENEW_ON_ACTIVITY_DEFAULT = true;

const LIFECYCLE_UNITS_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

function auditarEnBackground(etiqueta, fn) {
  void (async () => {
    try {
      await fn();
    } catch (err) {
      console.log(
        `[FLOW_SESSION_AUDIT] ${etiqueta}`,
        err?.response?.data || err?.message || err
      );
    }
  })();
}

function normalizarStatus(valor, fallback = STATUS_DEFAULT) {
  if (valor == null) return fallback;
  const s = String(valor).trim();
  return s !== "" ? s : fallback;
}

function normalizarNodoInicio(currentNodeId) {
  if (currentNodeId == null) return NODO_INICIO_DEFAULT;
  const s = String(currentNodeId).trim();
  return s !== "" ? s : NODO_INICIO_DEFAULT;
}

/**
 * Crea una sesión de flujo (status=active, nodo por defecto Inicio).
 */
async function crearSesion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId = NODO_INICIO_DEFAULT,
  status = STATUS_DEFAULT,
  startedAt = null,
  lastActivityAt = null,
} = {}) {
  return crearFlowSession({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId: normalizarNodoInicio(currentNodeId),
    status: normalizarStatus(status, STATUS_DEFAULT),
    startedAt,
    lastActivityAt,
  });
}

/**
 * Actualiza current_node_id (+ last_activity_at) de la sesión active más reciente.
 */
async function actualizarNodo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
} = {}) {
  return actualizarFlowSessionActiva({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId,
  });
}

/**
 * Marca la sesión active más reciente como finished (no elimina la fila).
 */
async function finalizarSesion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
} = {}) {
  return actualizarFlowSessionActiva({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId,
    status: STATUS_FINISHED,
  });
}

/**
 * Marca como cancelled todas las sesiones active del lead/línea (no elimina).
 */
async function cancelarSesion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
} = {}) {
  return actualizarFlowSessionsActivas({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    status: STATUS_CANCELLED,
  });
}

/**
 * Marca la sesión active más reciente como expired (no elimina la fila).
 * Usado por el runtime tras evaluarCicloVidaSesionFlujo (el evaluador no escribe).
 */
async function expirarSesion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
} = {}) {
  return actualizarFlowSessionActiva({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId,
    status: STATUS_EXPIRED,
  });
}

/**
 * Obtiene la sesión active más reciente.
 */
async function obtenerSesionActiva(payload = {}) {
  return obtenerFlowSessionActiva(payload || {});
}

async function obtenerSesion(payload = {}) {
  return obtenerFlowSession(payload || {});
}

async function eliminarSesion(payload = {}) {
  return eliminarFlowSession(payload || {});
}

/* --- Aliases await (compat Fase 1/2) --- */

async function crearSesionFlujo(payload) {
  return crearSesion(payload || {});
}

async function obtenerSesionFlujo(payload) {
  return obtenerSesion(payload || {});
}

async function obtenerSesionFlujoActiva(payload) {
  return obtenerSesionActiva(payload || {});
}

async function actualizarSesionFlujo(payload) {
  return actualizarNodo(payload || {});
}

async function eliminarSesionFlujo(payload) {
  return eliminarSesion(payload || {});
}

/* --- Auditoría fire-and-forget (runtime Fase 2; comportamiento idéntico) --- */

/**
 * Auditoría: nuevo inicio de flujo (status=active, nodo Inicio).
 * Fire-and-forget — no bloquea ni altera el runtime.
 */
function registrarInicioSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  currentNodeId = NODO_INICIO_DEFAULT,
}) {
  auditarEnBackground("inicio", () =>
    crearSesion({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId,
      status: STATUS_DEFAULT,
    })
  );
}

/**
 * Auditoría: avance de nodo (solo current_node_id + last_activity_at).
 * Fire-and-forget.
 */
function registrarAvanceNodoFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  currentNodeId,
}) {
  auditarEnBackground("avance", () =>
    actualizarNodo({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId,
    })
  );
}

/**
 * Auditoría: fin natural del grafo (sin siguientes nodos).
 * Fire-and-forget. No elimina la fila.
 */
function registrarFinSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  currentNodeId,
}) {
  auditarEnBackground("finished", () =>
    finalizarSesion({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId,
    })
  );
}

/**
 * Auditoría: resetbot u otra limpieza explícita → cancelled.
 * Fire-and-forget. No elimina la fila.
 */
function registrarCancelacionSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
}) {
  auditarEnBackground("cancelled", () =>
    cancelarSesion({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
    })
  );
}

/**
 * Motor de evaluación de ciclo de vida (Fase 6) — SOLO LECTURA.
 * Punto único de evaluación del estado de una flow_session.
 * No crea, actualiza, cancela ni finaliza sesiones.
 * No es llamado por el runtime todavía (firma estable para fases futuras).
 *
 * Entrada: solo identidad de conversación.
 * @param {{ usuarioId: string, conexionWhatsappId: string, clienteNumero: string }} payload
 * @returns {Promise<{
 *   existe: boolean,
 *   sesion: object | null,
 *   status: "active"|"finished"|"cancelled"|"expired"|null,
 *   esActiva: boolean,
 *   puedeContinuar: boolean,
 *   expirada: boolean,
 *   motivo: string | null
 * }>}
 *
 * Contratos de campos (estables):
 * - status: estado almacenado en DB (sin reinterpretar ni mutar).
 * - esActiva: únicamente status === "active" (independiente de expiración).
 * - expirada: resultado del motor (puede ser true con status === "active").
 * - renewOnActivity: por ahora true (documentado); reloj = last_activity_at || started_at.
 */
async function evaluarCicloVidaSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
} = {}) {
  const sesionActiva = await obtenerSesionActiva({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
  });

  if (!sesionActiva) {
    // TEMP DIAG
    console.log("[FLOW_SESSION_EVAL_DIAG] flow_id=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_raw=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle.enabled=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] resultado=", {
      existe: false,
      status: null,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: MOTIVO_NO_ACTIVE_SESSION,
    });
    return {
      existe: false,
      sesion: null,
      status: null,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: MOTIVO_NO_ACTIVE_SESSION,
    };
  }

  // status = valor en DB; no se muta.
  const statusAlmacenado = textoStatusAlmacenado(sesionActiva.status);
  const esActiva = statusAlmacenado === STATUS_DEFAULT;

  // Sesión encontrada pero no "active" en DB: reportar tal cual, sin mutar.
  if (!esActiva) {
    // TEMP DIAG
    console.log("[FLOW_SESSION_EVAL_DIAG] flow_id=", sesionActiva.flujo_id || null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_raw=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle.enabled=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] resultado=", {
      existe: true,
      status: statusAlmacenado,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: null,
    });
    return {
      existe: true,
      sesion: sesionActiva,
      status: statusAlmacenado,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: null,
    };
  }

  const lifecycle = await resolverLifecycleDeSesion(sesionActiva, usuarioId);

  // Caso 2: lifecycle deshabilitado / ausente → puede continuar, no expirada.
  if (!lifecycle.enabled) {
    // TEMP DIAG
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_normalizado=", lifecycle);
    console.log("[FLOW_SESSION_EVAL_DIAG] resultado=", {
      existe: true,
      status: statusAlmacenado,
      esActiva: true,
      puedeContinuar: true,
      expirada: false,
      motivo: null,
    });
    return {
      existe: true,
      sesion: sesionActiva,
      status: statusAlmacenado,
      esActiva: true,
      puedeContinuar: true,
      expirada: false,
      motivo: null,
    };
  }

  // Caso 3: lifecycle habilitado → evaluar ventana temporal (sin escribir DB).
  const evalExp = evaluarExpiracionTemporal(sesionActiva, lifecycle);

  // TEMP DIAG
  console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_normalizado=", lifecycle);
  console.log("[FLOW_SESSION_EVAL_DIAG] resultado=", {
    existe: true,
    status: statusAlmacenado,
    esActiva: true,
    puedeContinuar: evalExp.puedeContinuar,
    expirada: evalExp.expirada,
    motivo: evalExp.motivo,
  });
  return {
    existe: true,
    sesion: sesionActiva,
    status: statusAlmacenado,
    esActiva: true,
    puedeContinuar: evalExp.puedeContinuar,
    expirada: evalExp.expirada,
    motivo: evalExp.motivo,
  };
}

function textoStatusAlmacenado(valor) {
  if (valor == null) return null;
  const s = String(valor).trim();
  return s !== "" ? s : null;
}

/**
 * Lee data.lifecycle del nodo Inicio del flujo asociado a la sesión.
 * Sin lifecycle / flujo / nodo → { enabled: false }.
 */
async function resolverLifecycleDeSesion(sesion, usuarioId) {
  const flujoId = sesion?.flujo_id;
  // TEMP DIAG
  console.log("[FLOW_SESSION_EVAL_DIAG] flow_id=", flujoId || null);
  if (!flujoId || !usuarioId) {
    // TEMP DIAG
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_raw=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle.enabled=", null);
    return { enabled: false };
  }

  const flujoData = await obtenerDataFlujoBuilder(usuarioId, flujoId);
  return leerLifecycleDesdeFlujoData(flujoData);
}

async function obtenerDataFlujoBuilder(usuarioId, flujoId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const uid = String(usuarioId || "").trim();
  const fid = String(flujoId || "").trim();
  if (!uid || !fid) return null;

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder` +
        `?id=eq.${encodeURIComponent(fid)}` +
        `&usuario_id=eq.${encodeURIComponent(uid)}` +
        `&select=id,data`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        timeout: FLOW_EVAL_TIMEOUT_MS,
      }
    );

    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (!row) return null;
    return row.data || null;
  } catch (err) {
    console.log(
      "[FLOW_SESSION_EVAL] no se pudo leer flujo para lifecycle",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}

function leerLifecycleDesdeFlujoData(flujoData) {
  if (!flujoData || typeof flujoData !== "object") {
    // TEMP DIAG
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle_raw=", null);
    console.log("[FLOW_SESSION_EVAL_DIAG] lifecycle.enabled=", null);
    return { enabled: false };
  }

  const nodos = Array.isArray(flujoData.nodos) ? flujoData.nodos : [];
  const nodoInicio =
    nodos.find((n) => n && n.id === NODO_INICIO_DEFAULT) ||
    nodos.find((n) => n && (n.tipo === "inicio" || n.type === "inicio")) ||
    null;

  const raw = nodoInicio?.data?.lifecycle;
  // TEMP DIAG — distinguir undefined / null / boolean sin cambiar lógica
  console.log(
    "[FLOW_SESSION_EVAL_DIAG] lifecycle_raw=",
    raw === undefined ? "undefined" : raw
  );
  console.log(
    "[FLOW_SESSION_EVAL_DIAG] lifecycle.enabled=",
    raw === undefined
      ? "undefined"
      : raw === null
        ? "null"
        : typeof raw !== "object"
          ? "undefined"
          : raw.enabled === undefined
            ? "undefined"
            : raw.enabled === null
              ? "null"
              : raw.enabled
  );
  if (!raw || typeof raw !== "object" || raw.enabled !== true) {
    return { enabled: false };
  }

  const value = parseInt(raw.value, 10);
  const unit = normalizarUnidadLifecycle(raw.unit);
  if (!Number.isFinite(value) || value < 1 || !unit) {
    return { enabled: false };
  }

  return {
    enabled: true,
    value,
    unit,
    // renewOnActivity asumido true (Fase 6); no se lee ni escribe en JSON todavía.
    renewOnActivity: RENEW_ON_ACTIVITY_DEFAULT,
  };
}

function normalizarUnidadLifecycle(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "minutes" || s === "minutos" || s === "minuto" || s === "min") {
    return "minutes";
  }
  if (s === "hours" || s === "horas" || s === "hora" || s === "h") {
    return "hours";
  }
  if (
    s === "days" ||
    s === "dias" ||
    s === "días" ||
    s === "dia" ||
    s === "día" ||
    s === "d"
  ) {
    return "days";
  }
  return null;
}

function lifecycleValueToMs(value, unit) {
  const factor = LIFECYCLE_UNITS_MS[unit];
  if (!factor || !Number.isFinite(value) || value < 1) return null;
  return value * factor;
}

/**
 * Calcula expiración temporal sin mutar la sesión.
 * Reloj (renewOnActivity=true): last_activity_at || started_at.
 */
function evaluarExpiracionTemporal(sesion, lifecycle) {
  const momentoBaseRaw =
    sesion.last_activity_at || sesion.started_at || null;

  if (!momentoBaseRaw) {
    return { expirada: false, puedeContinuar: true, motivo: null };
  }

  const momentoBaseMs = new Date(momentoBaseRaw).getTime();
  if (!Number.isFinite(momentoBaseMs)) {
    return { expirada: false, puedeContinuar: true, motivo: null };
  }

  const ventanaMs = lifecycleValueToMs(lifecycle.value, lifecycle.unit);
  if (ventanaMs == null) {
    return { expirada: false, puedeContinuar: true, motivo: null };
  }

  const limiteMs = momentoBaseMs + ventanaMs;
  if (Date.now() > limiteMs) {
    return {
      expirada: true,
      puedeContinuar: false,
      motivo: MOTIVO_SESSION_EXPIRED,
    };
  }

  return { expirada: false, puedeContinuar: true, motivo: null };
}

module.exports = {
  // API de negocio encapsulada
  crearSesion,
  actualizarNodo,
  finalizarSesion,
  cancelarSesion,
  expirarSesion,
  obtenerSesionActiva,
  obtenerSesion,
  eliminarSesion,
  // Aliases await (compat)
  crearSesionFlujo,
  obtenerSesionFlujo,
  obtenerSesionFlujoActiva,
  actualizarSesionFlujo,
  eliminarSesionFlujo,
  // Auditoría runtime (fire-and-forget)
  registrarInicioSesionFlujo,
  registrarAvanceNodoFlujo,
  registrarFinSesionFlujo,
  registrarCancelacionSesionFlujo,
  // Evaluación ciclo de vida (solo lectura)
  evaluarCicloVidaSesionFlujo,
  // Constantes de negocio
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
  STATUS_EXPIRED,
  MOTIVO_NO_ACTIVE_SESSION,
  MOTIVO_SESSION_EXPIRED,
  RENEW_ON_ACTIVITY_DEFAULT,
  NODO_INICIO_DEFAULT,
};
