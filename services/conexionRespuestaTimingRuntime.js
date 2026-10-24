/**
 * Runtime aislado: indicador de escritura + demora opcional antes de una
 * respuesta automática elegible (un disparo por mensaje entrante).
 * No modifica whatsappService ni el motor de nodos.
 *
 * Lock de conversación: solo cuando timing está activo; alcance single-process
 * (ver conversacionRespuestaLock.js).
 */

const { esperarSegundos } = require("../utils/timers");
const {
  readTimingFromRow,
  parseDemoraSegundos,
} = require("./conexionRespuestaTimingConfig");
const {
  intentarEnviarIndicadorEscritura,
} = require("./whatsappTypingIndicatorService");
const {
  estaBotPausado,
} = require("./conversaciones/botPauseService");
const {
  acquireConversacionLock,
} = require("./conversacionRespuestaLock");

function timingEstaActivo(timing) {
  const t = timing && typeof timing === "object" ? timing : readTimingFromRow(null);
  return t.indicador_escritura === true || t.demora_respuesta_activa === true;
}

/**
 * Aplica typing (si ON) y demora (si ON), con lock de conversación (1 proceso).
 * Tras la demora: revalida pausa + titularidad del lock.
 * Si ambas OFF → no-op inmediato (sin espera, sin lock, sin Graph).
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, motivo?: string, releaseLock?: function }>}
 *   Caller DEBE llamar releaseLock() en finally si se devolvió.
 */
async function aplicarTimingAntesDeRespuestaAutomatica(params = {}, deps = {}) {
  let convLock = null;
  const releaseLock = () => {
    try {
      if (convLock && typeof convLock.release === "function") {
        convLock.release();
        convLock = null;
      }
    } catch (errRel) {
      console.log("[WA_TIMING] release lock:", errRel.message || errRel);
    }
  };

  try {
    const rawTiming =
      params.timing && typeof params.timing === "object" ? params.timing : null;
    const timing = readTimingFromRow(rawTiming);
    if (!timingEstaActivo(timing)) {
      return { ok: true, skipped: true, releaseLock: () => {} };
    }

    const acquire = deps.acquireConversacionLock || acquireConversacionLock;
    convLock = await acquire({
      usuarioId: params.usuarioId || null,
      clienteNumero: params.clienteNumero || params.numero || null,
      conexionWhatsappId: params.conexionWhatsappId || null,
    });

    const sendTyping =
      deps.intentarEnviarIndicadorEscritura || intentarEnviarIndicadorEscritura;
    const sleep = deps.esperarSegundos || esperarSegundos;
    const checkPausa = deps.estaBotPausado || estaBotPausado;
    const sigueSiendoTitular =
      typeof params.sigueSiendoTitular === "function"
        ? params.sigueSiendoTitular
        : () => (convLock ? convLock.sigueSiendoTitular() : true);

    // Typing fire-and-forget: no await (no retrasar respuesta por Meta).
    if (timing.indicador_escritura === true) {
      Promise.resolve(
        sendTyping(
          {
            habilitado: true,
            messageId: params.messageId || null,
            usuarioId: params.usuarioId || null,
            conexionWhatsappId: params.conexionWhatsappId || null,
            token: params.metaToken || params.token || null,
            phoneId: params.metaPhoneId || params.phoneId || null,
            timeoutMs: params.typingTimeoutMs,
          },
          deps.typingDeps || {}
        )
      ).catch((errTyping) => {
        console.log(
          "[WA_TIMING] typing lanzó (ignorado):",
          errTyping?.message || errTyping
        );
      });
    }

    if (timing.demora_respuesta_activa === true) {
      let segundos = null;
      const rawSegundos =
        rawTiming &&
        rawTiming.demora_respuesta_segundos !== undefined &&
        rawTiming.demora_respuesta_segundos !== null
          ? rawTiming.demora_respuesta_segundos
          : timing.demora_respuesta_segundos;
      try {
        segundos = parseDemoraSegundos(rawSegundos);
      } catch (err) {
        console.log(
          "[WA_TIMING] demora activa con segundos inválidos — sin espera artificial",
          err.message || err
        );
      }
      if (segundos != null) {
        console.log("[WA_TIMING] demora", {
          segundos,
          conexionWhatsappId: params.conexionWhatsappId || null,
          lock: "single_process_only",
        });
        await sleep(segundos);
      }
    }

    // C: titularidad tras la espera
    if (!sigueSiendoTitular()) {
      console.log("[WA_TIMING] perdió titularidad del lock — no enviar", {
        conexionWhatsappId: params.conexionWhatsappId || null,
      });
      releaseLock();
      return { ok: false, motivo: "lock_titularidad_perdida", releaseLock: () => {} };
    }

    const usuarioId = params.usuarioId || null;
    const clienteNumero = params.clienteNumero || params.numero || null;
    if (usuarioId && clienteNumero) {
      try {
        const pausado = await checkPausa({
          usuarioId,
          clienteNumero,
          conexionWhatsappId: params.conexionWhatsappId || null,
        });
        if (pausado) {
          console.log("[WA_TIMING] bot pausado tras timing — no enviar respuesta", {
            usuarioId,
            conexionWhatsappId: params.conexionWhatsappId || null,
          });
          releaseLock();
          return { ok: false, motivo: "bot_pausado", releaseLock: () => {} };
        }
      } catch (err) {
        console.log(
          "[WA_TIMING] error re-chequeando pausa (se continúa):",
          err.message || err
        );
      }
    }

    // Re-check titularidad after async pause lookup
    if (!sigueSiendoTitular()) {
      releaseLock();
      return { ok: false, motivo: "lock_titularidad_perdida", releaseLock: () => {} };
    }

    // Caller holds lock until end of ejecutarFlujo (serialize sends while timing ON).
    return { ok: true, releaseLock };
  } catch (err) {
    console.log(
      "[WA_TIMING] error no controlado (no bloquea respuesta):",
      err.message || err
    );
    releaseLock();
    return { ok: true, skipped: false, motivo: "timing_error_swallowed", releaseLock: () => {} };
  }
}

module.exports = {
  timingEstaActivo,
  aplicarTimingAntesDeRespuestaAutomatica,
};
