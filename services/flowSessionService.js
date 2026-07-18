/**
 * Servicio de negocio de flow_sessions (Fase 4).
 * Única capa de reglas sobre flow_sessions: status, defaults, cancelación,
 * y evaluación de ciclo de vida (solo lectura; aún no usada por el runtime).
 * Las escrituras de auditoría van fire-and-forget vía registrar*.
 */

const {
  crearFlowSession,
  obtenerFlowSession,
  obtenerFlowSessionActiva,
  actualizarFlowSessionActiva,
  actualizarFlowSessionsActivas,
  eliminarFlowSession,
} = require("./flowSessionsRepository");

const STATUS_DEFAULT = "active";
const STATUS_FINISHED = "finished";
const STATUS_CANCELLED = "cancelled";
const STATUS_EXPIRED = "expired";
const NODO_INICIO_DEFAULT = "nodo_inicio";

const MOTIVO_NO_ACTIVE_SESSION = "NO_ACTIVE_SESSION";

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
 * Motor de evaluación de ciclo de vida (Fase 4) — SOLO LECTURA.
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
 * Contratos de campos (estables para fases futuras):
 * - status: estado almacenado en DB (sin reinterpretar).
 * - esActiva: únicamente status === "active" (independiente de expiración).
 * - expirada: resultado del motor de evaluación (independiente de status).
 *   Fase 4: siempre false (aún no hay motor de expiración).
 *   Futuro posible: status === "active" && expirada === true.
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

  // status = valor en DB; no se muta ni se deriva a expirada.
  const statusAlmacenado = textoStatusAlmacenado(sesionActiva.status);
  const esActiva = statusAlmacenado === STATUS_DEFAULT;
  // Fase 4: el motor aún no evalúa expiración por tiempo.
  const expirada = false;

  if (esActiva) {
    return {
      existe: true,
      sesion: sesionActiva,
      status: STATUS_DEFAULT,
      esActiva: true,
      puedeContinuar: true,
      expirada,
      motivo: null,
    };
  }

  // finished | cancelled | expired (u otro): devolver status tal cual, sin cambiar.
  return {
    existe: true,
    sesion: sesionActiva,
    status: statusAlmacenado,
    esActiva: false,
    puedeContinuar: false,
    expirada,
    motivo: null,
  };
}

function textoStatusAlmacenado(valor) {
  if (valor == null) return null;
  const s = String(valor).trim();
  return s !== "" ? s : null;
}

module.exports = {
  // API de negocio encapsulada
  crearSesion,
  actualizarNodo,
  finalizarSesion,
  cancelarSesion,
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
  // Evaluación ciclo de vida (solo lectura; no usada por runtime)
  evaluarCicloVidaSesionFlujo,
  // Constantes de negocio
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
  STATUS_EXPIRED,
  MOTIVO_NO_ACTIVE_SESSION,
  NODO_INICIO_DEFAULT,
};
