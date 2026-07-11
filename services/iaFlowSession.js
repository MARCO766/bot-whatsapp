/**
 * Sesiones de flujo pausadas en nodo IA (espera respuesta del lead).
 * Clave por línea: usuarioId:conexionWhatsappId:numero
 */

const sesiones = new Map();
const missingSessionCache = new Map();
const restoresInProgress = new Map();
const MISS_CACHE_TTL_MS = 30000;

function esTimeoutSupabase(err) {
  return (
    err?.code === "ECONNABORTED" || /timeout/i.test(String(err?.message || ""))
  );
}

function missCacheActivo(key) {
  const cachedAt = missingSessionCache.get(key);
  if (cachedAt == null) return false;

  if (Date.now() - cachedAt >= MISS_CACHE_TTL_MS) {
    missingSessionCache.delete(key);
    return false;
  }

  return true;
}

function registrarMissCache(key) {
  missingSessionCache.set(key, Date.now());
}

function limpiarMissCache(key) {
  missingSessionCache.delete(key);
}

function claveSesion(usuarioId, conexionWhatsappId, numero) {
  return `${usuarioId || "0"}:${conexionWhatsappId || ""}:${numero || ""}`;
}

function logFlowKey(usuarioId, conexionWhatsappId, numero) {
  const flowKey = claveSesion(usuarioId, conexionWhatsappId, numero);
  console.log("[FLOW KEY]", {
    usuarioId,
    conexionWhatsappId,
    numero,
    flowKey,
  });
  return flowKey;
}

const MAX_LAST_REPLIES_SYNC = 3;

function extraerLastRepliesSync(flowContext) {
  const chatHistory = Array.isArray(flowContext?.chat_history) ? flowContext.chat_history : [];
  return chatHistory
    .filter((turno) => ["assistant", "bot", "ia"].includes(String(turno?.role || "")))
    .map((turno) => String(turno.text || turno.content || "").trim())
    .filter(Boolean)
    .slice(-MAX_LAST_REPLIES_SYNC);
}

function resolverPaymentReaderStatus(usuarioId, conexionWhatsappId, numero) {
  try {
    const { getPaymentReaderStatus } = require("./openaiAgentService");
    return getPaymentReaderStatus(usuarioId, conexionWhatsappId, numero);
  } catch {
    return null;
  }
}

function sincronizarSesionSupabase(sesion) {
  void (async () => {
    try {
      const { upsertIaSession } = require("./iaSessionsRepository");
      const flowContext = sesion.flowContext || {};
      const chatHistory = Array.isArray(flowContext.chat_history)
        ? flowContext.chat_history
        : [];

      await upsertIaSession({
        usuarioId: sesion.usuarioId,
        conexionWhatsappId: sesion.conexionWhatsappId,
        clienteNumero: sesion.numero,
        flujoId: sesion.flujoId,
        nodoId: sesion.nodoId,
        flowContext,
        chatHistory,
        lastReplies: extraerLastRepliesSync(flowContext),
        paymentReaderStatus: resolverPaymentReaderStatus(
          sesion.usuarioId,
          sesion.conexionWhatsappId,
          sesion.numero
        ),
      });

      console.log("[IA_SESSION_SYNC] Guardada sesión IA en Supabase");
    } catch (err) {
      console.error(
        "[IA_SESSION_SYNC_ERROR]",
        err.response?.data || err.message || err
      );
    }
  })();
}

function logChatHistorySource(origen, chatHistory) {
  const historial = (Array.isArray(chatHistory) ? chatHistory : []).map((t) => ({
    role: t.role || "?",
    text: String(t.text || t.content || "").slice(0, 300),
  }));
  const cantidadUser = historial.filter((t) => t.role === "user").length;
  const cantidadAssistant = historial.filter(
    (t) => t.role === "assistant" || t.role === "bot" || t.role === "ia"
  ).length;

  console.log(
    "[CHAT_HISTORY_SOURCE]",
    JSON.stringify(
      {
        origen,
        total: historial.length,
        cantidadUser,
        cantidadAssistant,
        chat_history: historial,
      },
      null,
      2
    )
  );
}

function guardarSesionIAPendiente(payload) {
  const { usuarioId, conexionWhatsappId, numero } = payload;
  const conexionLinea =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : payload.flowContext?.conexionWhatsappId != null &&
          String(payload.flowContext.conexionWhatsappId).trim() !== ""
        ? String(payload.flowContext.conexionWhatsappId).trim()
        : null;

  if (!conexionLinea) {
    console.log("[IA_MULTI] sesión omitida sin conexionWhatsappId", {
      usuarioId,
      numero,
    });
    return null;
  }

  const key = claveSesion(usuarioId, conexionLinea, numero);
  if (!numero || key.endsWith(":")) return null;

  logFlowKey(usuarioId, conexionLinea, numero);

  const flowContext = { ...(payload.flowContext || {}) };
  if (Array.isArray(payload.visitados)) {
    flowContext.visitados = payload.visitados;
  }
  if (payload.iaLoopReentry === true) {
    flowContext.iaLoopReentry = true;
  }

  const sesion = {
    ...payload,
    flowContext,
    conexionWhatsappId: conexionLinea,
    creadoEn: Date.now(),
  };

  sesiones.set(key, sesion);
  logChatHistorySource(
    `sesion_guardada:nodo=${payload.nodoId || "?"}`,
    payload.flowContext?.chat_history
  );
  console.log("[IA] Sesión pendiente guardada:", key, "| nodo:", payload.nodoId);
  sincronizarSesionSupabase(sesion);
  return sesion;
}

function reconstruirSesionDesdeSupabase(usuarioId, conexionWhatsappId, numero, row) {
  const { jsonSeguro } = require("./iaSessionsRepository");
  const conexionLinea = String(conexionWhatsappId).trim();
  const clienteNumero = String(numero).trim();
  const flowContext = jsonSeguro(row.flow_context, {});
  const chatHistory = jsonSeguro(row.chat_history, []);

  flowContext.chat_history = chatHistory.length
    ? chatHistory
    : Array.isArray(flowContext.chat_history)
      ? flowContext.chat_history
      : [];

  if (!flowContext.conexionWhatsappId) {
    flowContext.conexionWhatsappId = conexionLinea;
  }

  const visitados = Array.isArray(flowContext.visitados) ? flowContext.visitados : [];
  const sesion = {
    usuarioId,
    conexionWhatsappId: conexionLinea,
    numero: clienteNumero,
    flujoId: row.flujo_id || null,
    nodoId: row.nodo_id || null,
    visitados,
    flowContext,
    creadoEn: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };

  if (flowContext.iaLoopReentry === true) {
    sesion.iaLoopReentry = true;
  }

  return sesion;
}

async function restaurarSesionDesdeSupabase(usuarioId, conexionWhatsappId, numero, key) {
  try {
    const { obtenerIaSession } = require("./iaSessionsRepository");
    const row = await obtenerIaSession({
      usuarioId,
      conexionWhatsappId,
      clienteNumero: numero,
    });

    if (!row) {
      registrarMissCache(key);
      return null;
    }

    limpiarMissCache(key);

    const sesion = reconstruirSesionDesdeSupabase(
      usuarioId,
      conexionWhatsappId,
      numero,
      row
    );

    sesiones.set(key, sesion);
    console.log("[IA_SESSION_RESTORE] Sesión restaurada desde Supabase");
    return sesion;
  } catch (err) {
    if (esTimeoutSupabase(err)) {
      console.log("[IA_SESSION_TIMEOUT]");
      registrarMissCache(key);
      return null;
    }

    console.error(
      "[IA_SESSION_RESTORE_ERROR]",
      err.response?.data || err.message || err
    );
    return null;
  }
}

async function obtenerSesionIAPendiente(usuarioId, conexionWhatsappId, numero) {
  if (!conexionWhatsappId) return null;

  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  logFlowKey(usuarioId, conexionWhatsappId, numero);

  const sesionRam = sesiones.get(key);
  if (sesionRam) return sesionRam;

  if (missCacheActivo(key)) {
    return null;
  }

  const restoreEnCurso = restoresInProgress.get(key);
  if (restoreEnCurso) {
    return restoreEnCurso;
  }

  const restorePromise = restaurarSesionDesdeSupabase(
    usuarioId,
    conexionWhatsappId,
    numero,
    key
  ).finally(() => {
    restoresInProgress.delete(key);
  });

  restoresInProgress.set(key, restorePromise);
  return restorePromise;
}

function limpiarSesionIAPendiente(usuarioId, conexionWhatsappId, numero) {
  if (arguments.length === 2) {
    numero = conexionWhatsappId;
    conexionWhatsappId = null;
    const prefix = `${usuarioId || "0"}:`;
    const suffix = `:${numero || ""}`;
    for (const key of sesiones.keys()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        sesiones.delete(key);
        console.log("[IA_SESSION_CLEARED]", {
          usuarioId,
          numero,
          key,
        });
      }
    }
    return;
  }

  const key = claveSesion(usuarioId, conexionWhatsappId, numero);
  logFlowKey(usuarioId, conexionWhatsappId, numero);
  const teniaSesion = sesiones.has(key);
  sesiones.delete(key);
  if (teniaSesion) {
    console.log("[IA_SESSION_CLEARED]", {
      usuarioId,
      conexionWhatsappId,
      numero,
      key,
    });
  }
}

const OPENAI_SESSION_CLOSE_LOGS = {
  route: {
    close: "[OPENAI_SESSION_CLOSE]",
    ok: "[OPENAI_SESSION_DELETE_OK]",
    error: "[OPENAI_SESSION_DELETE_ERROR]",
  },
  resetbot: {
    close: "[RESETBOT_OPENAI_CLOSE]",
    ok: "[RESETBOT_OPENAI_CLOSE_OK]",
    error: "[RESETBOT_OPENAI_CLOSE_ERROR]",
  },
};

async function cerrarSesionOpenAICompleta(
  usuarioId,
  conexionWhatsappId,
  numero,
  origen = "route"
) {
  const labels = OPENAI_SESSION_CLOSE_LOGS[origen] || OPENAI_SESSION_CLOSE_LOGS.route;
  const ctx = { usuario: usuarioId, conexion: conexionWhatsappId, numero };

  console.log(labels.close, ctx);
  limpiarSesionIAPendiente(usuarioId, conexionWhatsappId, numero);
  try {
    const { deleteIaSession } = require("./iaSessionsRepository");
    await deleteIaSession({
      usuarioId,
      conexionWhatsappId,
      clienteNumero: numero,
    });
    console.log(labels.ok, ctx);
  } catch (err) {
    console.log(labels.error, {
      ...ctx,
      error: err.response?.data || err.message || err,
    });
  }
}

module.exports = {
  claveSesion,
  logFlowKey,
  logChatHistorySource,
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
  cerrarSesionOpenAICompleta,
};
