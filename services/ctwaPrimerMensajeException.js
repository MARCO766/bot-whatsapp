/**
 * Excepción aislada: primer_mensaje + hard-match CTWA Ad ID
 * cuando esPrimerMensaje !== true (sesión vigente de otro flujo).
 * No altera matchActivador ni calcularEsPrimerMensaje.
 */

const { flowHasExplicitAdIdMatch } = require("./flowMetaAdsMeta");

function sameFlowId(a, b) {
  const sa = a == null ? "" : String(a).trim();
  const sb = b == null ? "" : String(b).trim();
  if (!sa || !sb) return false;
  return sa === sb;
}

/**
 * @param {object} args
 * @param {string} args.tipoActivador
 * @param {boolean|undefined|null} args.esPrimerMensaje
 * @param {unknown} args.ctwaAdId
 * @param {unknown} args.metaAds
 * @param {unknown} args.candidateFlowId
 * @param {unknown} args.activeSessionFlowId  flujo_id de sesión ACTIVE (null si no hay)
 * @returns {{ allow: boolean, reason: string }}
 */
function evaluateCtwaPrimerMensajeException({
  tipoActivador,
  esPrimerMensaje,
  ctwaAdId,
  metaAds,
  candidateFlowId,
  activeSessionFlowId,
}) {
  if (tipoActivador !== "primer_mensaje") {
    return { allow: false, reason: "not_primer_mensaje" };
  }
  // Solo cuando el match normal no aplica (sesión / contexto bloquea).
  if (esPrimerMensaje === true) {
    return { allow: false, reason: "already_es_primer_mensaje" };
  }
  if (ctwaAdId == null || String(ctwaAdId).trim() === "") {
    return { allow: false, reason: "no_ctwa_ad_id" };
  }
  if (!flowHasExplicitAdIdMatch(metaAds, ctwaAdId)) {
    return { allow: false, reason: "no_explicit_ad_match" };
  }
  if (sameFlowId(activeSessionFlowId, candidateFlowId)) {
    return { allow: false, reason: "same_active_flow" };
  }
  return { allow: true, reason: "ctwa_hard_match" };
}

module.exports = {
  evaluateCtwaPrimerMensajeException,
  sameFlowId,
};
