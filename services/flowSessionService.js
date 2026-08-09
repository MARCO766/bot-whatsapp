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
  actualizarFlowSessionsActiveOFinished,
  actualizarFlowSessionPorId,
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
 * expires_at = ahora + lifecycle si está habilitado; si no, NULL.
 *
 * Fase 4.5: antes de insertar, cancela cualquier sesión active del mismo
 * lead/línea (no toca finished / expired / cancelled).
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
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const lifecycle = await resolverLifecyclePorFlujo(usuarioId, flujoId);
  const expiresAt = calcularExpiresAtIso(lifecycle, ahora.getTime());

  // Una sola active por (usuario, línea, lead). Sin flujoId → todas las active.
  try {
    await cancelarSesion({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
    });
  } catch (err) {
    console.log(
      "[FLOW_SESSION] no se pudieron cancelar active previas antes de crear",
      err?.response?.data || err?.message || err
    );
  }

  return crearFlowSession({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId: normalizarNodoInicio(currentNodeId),
    status: normalizarStatus(status, STATUS_DEFAULT),
    startedAt: startedAt || ahoraIso,
    lastActivityAt: lastActivityAt || ahoraIso,
    expiresAt,
    finishedAt: null,
  });
}

/**
 * Actualiza current_node_id (+ last_activity_at) de la sesión active más reciente.
 * Si lifecycle habilitado, recalcula expires_at = ahora + lifecycle.
 */
async function actualizarNodo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
} = {}) {
  const lifecycle = await resolverLifecyclePorFlujo(usuarioId, flujoId);
  const payload = {
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId,
  };

  if (lifecycle.enabled) {
    payload.expiresAt = calcularExpiresAtIso(lifecycle, Date.now());
  }

  return actualizarFlowSessionActiva(payload);
}

/**
 * Marca la sesión active más reciente como finished (no elimina la fila).
 * finished_at = ahora; expires_at = finished_at + lifecycle (o NULL si deshabilitado).
 */
async function finalizarSesion({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
} = {}) {
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const lifecycle = await resolverLifecyclePorFlujo(usuarioId, flujoId);

  return actualizarFlowSessionActiva({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
    flujoId,
    currentNodeId,
    status: STATUS_FINISHED,
    finishedAt: ahoraIso,
    expiresAt: calcularExpiresAtIso(lifecycle, ahora.getTime()),
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
 * RESETBOT: libera reingreso de "Primer mensaje".
 * Cancela active|finished del lead/línea. No toca expired ni cancelled.
 * No usar fuera del camino resetbot.
 */
async function cancelarSesionPorResetbot({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
} = {}) {
  return actualizarFlowSessionsActiveOFinished({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
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
 * Inicio de flujo (status=active, nodo Inicio).
 * Fase 4.5: await de la creación (cancel active previas + insert) para reducir
 * doble active por concurrencia. Avances/fin siguen fire-and-forget.
 * Errores se registran y no rompen el runtime del flujo.
 */
async function registrarInicioSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  currentNodeId = NODO_INICIO_DEFAULT,
}) {
  try {
    await crearSesion({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId,
      status: STATUS_DEFAULT,
    });
  } catch (err) {
    console.log(
      "[FLOW_SESSION_AUDIT] inicio",
      err?.response?.data || err?.message || err
    );
  }
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
 * Motor de evaluación de ciclo de vida (Fase 3).
 * Fuente de verdad temporal: expires_at persistido.
 * Puede marcar status=expired (active|finished) y limpiar expires_at
 * si el lifecycle del flujo quedó deshabilitado.
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
 * Contratos:
 * - status: estado en DB tras la evaluación (puede haber mutado a expired).
 * - esActiva: true si la sesión era/es active y el runtime debe cortar continuidad
 *   (incluye el caso active→expired en este mismo tick, para no romper limpieza IA).
 * - expirada: true solo cuando esta evaluación detectó vencimiento por expires_at.
 * - expires_at NULL → nunca expirar automáticamente.
 */
async function evaluarCicloVidaSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
} = {}) {
  const sesion = await obtenerSesion({
    usuarioId,
    conexionWhatsappId,
    clienteNumero,
  });

  if (!sesion) {
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

  let sesionActual = sesion;
  const statusAlmacenado = textoStatusAlmacenado(sesionActual.status);

  if (
    statusAlmacenado === STATUS_CANCELLED ||
    statusAlmacenado === STATUS_EXPIRED
  ) {
    return {
      existe: true,
      sesion: sesionActual,
      status: statusAlmacenado,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: null,
    };
  }

  if (
    statusAlmacenado !== STATUS_DEFAULT &&
    statusAlmacenado !== STATUS_FINISHED
  ) {
    return {
      existe: true,
      sesion: sesionActual,
      status: statusAlmacenado,
      esActiva: false,
      puedeContinuar: false,
      expirada: false,
      motivo: null,
    };
  }

  const eraActiva = statusAlmacenado === STATUS_DEFAULT;
  const lifecycle = await resolverLifecycleDeSesion(sesionActual, usuarioId);

  // Lifecycle deshabilitado: limpiar expires_at residual y nunca expirar.
  if (!lifecycle.enabled) {
    if (sesionActual.expires_at != null) {
      try {
        const limpiada = await actualizarFlowSessionPorId(sesionActual.id, {
          expiresAt: null,
        });
        if (limpiada) sesionActual = limpiada;
        else sesionActual = { ...sesionActual, expires_at: null };
      } catch (err) {
        console.log(
          "[FLOW_SESSION_EVAL] no se pudo limpiar expires_at",
          err?.response?.data || err?.message || err
        );
      }
    }

    return {
      existe: true,
      sesion: sesionActual,
      status: statusAlmacenado,
      esActiva: eraActiva,
      puedeContinuar: eraActiva,
      expirada: false,
      motivo: null,
    };
  }

  // Lifecycle habilitado: expires_at es la única fuente de verdad temporal.
  const evalExp = evaluarExpiracionPorExpiresAt(sesionActual);

  if (!evalExp.expirada) {
    return {
      existe: true,
      sesion: sesionActual,
      status: statusAlmacenado,
      esActiva: eraActiva,
      puedeContinuar: eraActiva,
      expirada: false,
      motivo: null,
    };
  }

  // active|finished + expires_at <= now → expired
  try {
    const actualizada = await actualizarFlowSessionPorId(sesionActual.id, {
      status: STATUS_EXPIRED,
    });
    if (actualizada) sesionActual = actualizada;
    else sesionActual = { ...sesionActual, status: STATUS_EXPIRED };
  } catch (err) {
    console.log(
      "[FLOW_SESSION_EVAL] no se pudo marcar expired",
      err?.response?.data || err?.message || err
    );
  }

  return {
    existe: true,
    sesion: sesionActual,
    status: STATUS_EXPIRED,
    // eraActiva=true permite que flowService limpie IA como antes (expirarSesion queda no-op).
    esActiva: eraActiva,
    puedeContinuar: false,
    expirada: true,
    motivo: MOTIVO_SESSION_EXPIRED,
  };
}

function textoStatusAlmacenado(valor) {
  if (valor == null) return null;
  const s = String(valor).trim();
  return s !== "" ? s : null;
}

/**
 * Lee data.lifecycle del nodo Inicio del flujo.
 * Sin lifecycle / flujo / nodo → { enabled: false }.
 */
async function resolverLifecyclePorFlujo(usuarioId, flujoId) {
  if (!flujoId || !usuarioId) {
    return { enabled: false };
  }

  const flujoData = await obtenerDataFlujoBuilder(usuarioId, flujoId);
  return leerLifecycleDesdeFlujoData(flujoData);
}

/**
 * Lee data.lifecycle del nodo Inicio del flujo asociado a la sesión.
 * Sin lifecycle / flujo / nodo → { enabled: false }.
 */
async function resolverLifecycleDeSesion(sesion, usuarioId) {
  return resolverLifecyclePorFlujo(usuarioId, sesion?.flujo_id);
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
    return { enabled: false };
  }

  const nodos = Array.isArray(flujoData.nodos) ? flujoData.nodos : [];
  const nodoInicio =
    nodos.find((n) => n && n.id === NODO_INICIO_DEFAULT) ||
    nodos.find((n) => n && (n.tipo === "inicio" || n.type === "inicio")) ||
    null;

  const raw = nodoInicio?.data?.lifecycle;
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
 * Punto único de cálculo de expires_at.
 * @returns {string|null} ISO timestamptz, o null si lifecycle deshabilitado/inválido.
 */
function calcularExpiresAtIso(lifecycle, baseMs = Date.now()) {
  if (!lifecycle || lifecycle.enabled !== true) return null;
  if (!Number.isFinite(baseMs)) return null;

  const ventanaMs = lifecycleValueToMs(lifecycle.value, lifecycle.unit);
  if (ventanaMs == null) return null;

  return new Date(baseMs + ventanaMs).toISOString();
}

/**
 * Expira solo según expires_at persistido (única fuente de verdad temporal).
 * expires_at NULL / inválido → no expirar.
 */
function evaluarExpiracionPorExpiresAt(sesion) {
  const raw = sesion?.expires_at;
  if (raw == null || String(raw).trim() === "") {
    return { expirada: false, puedeContinuar: true, motivo: null };
  }

  const expiresAtMs = new Date(raw).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return { expirada: false, puedeContinuar: true, motivo: null };
  }

  if (expiresAtMs <= Date.now()) {
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
  cancelarSesionPorResetbot,
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
