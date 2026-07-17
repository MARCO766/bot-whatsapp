/**
 * Servicio de auditoría de flow_sessions (Fase 2).
 * Todas las escrituras del runtime deben pasar por aquí.
 * Nunca lanza al caller: fire-and-forget para no alterar el comportamiento.
 */

const {
  crearFlowSession,
  obtenerFlowSession,
  obtenerFlowSessionActiva,
  actualizarFlowSessionActiva,
  cancelarFlowSessionsActivas,
  eliminarFlowSession,
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
} = require("./flowSessionsRepository");

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

/**
 * Crea una sesión de flujo (await). Preferir registrarInicioSesionFlujo en runtime.
 */
async function crearSesionFlujo(payload) {
  return crearFlowSession(payload || {});
}

async function obtenerSesionFlujo(payload) {
  return obtenerFlowSession(payload || {});
}

async function obtenerSesionFlujoActiva(payload) {
  return obtenerFlowSessionActiva(payload || {});
}

async function actualizarSesionFlujo(payload) {
  return actualizarFlowSessionActiva(payload || {});
}

async function eliminarSesionFlujo(payload) {
  return eliminarFlowSession(payload || {});
}

/**
 * Auditoría: nuevo inicio de flujo (status=active, nodo Inicio).
 * Fire-and-forget — no bloquea ni altera el runtime.
 */
function registrarInicioSesionFlujo({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId,
  currentNodeId = "nodo_inicio",
}) {
  auditarEnBackground("inicio", () =>
    crearFlowSession({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId: currentNodeId || "nodo_inicio",
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
    actualizarFlowSessionActiva({
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
    actualizarFlowSessionActiva({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
      currentNodeId,
      status: STATUS_FINISHED,
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
    cancelarFlowSessionsActivas({
      usuarioId,
      conexionWhatsappId,
      clienteNumero,
      flujoId,
    })
  );
}

/** Placeholder fases posteriores — no-op. */
async function evaluarCicloVidaSesionFlujo(_payload) {
  return null;
}

module.exports = {
  crearSesionFlujo,
  obtenerSesionFlujo,
  obtenerSesionFlujoActiva,
  actualizarSesionFlujo,
  eliminarSesionFlujo,
  registrarInicioSesionFlujo,
  registrarAvanceNodoFlujo,
  registrarFinSesionFlujo,
  registrarCancelacionSesionFlujo,
  evaluarCicloVidaSesionFlujo,
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
};
