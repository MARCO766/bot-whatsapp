/**
 * Excepción aislada: primer_mensaje + hard-match CTWA Ad ID
 * cuando esPrimerMensaje !== true.
 * No altera matchActivador ni calcularEsPrimerMensaje.
 *
 * Si la sesión más reciente de esta misma entrada todavía bloquea el
 * reingreso (active/finished con expires_at vigente o null), no se
 * permite cambiar de flujo. Una sesión vencida, cancelada o de otra
 * entrada no bloquea esta excepción.
 * Una lectura fallida o indeterminada tampoco la abre: no se asume
 * que la ausencia de fila esté confirmada.
 */

const { flowHasExplicitAdIdMatch } = require("./flowMetaAdsMeta");
const { sesionBloqueaReingreso } = require("./firstMessageService");

function sameFlowId(a, b) {
  const sa = a == null ? "" : String(a).trim();
  const sb = b == null ? "" : String(b).trim();
  if (!sa || !sb) return false;
  return sa === sb;
}

function textoClave(valor) {
  if (valor == null) return "";
  return String(valor).trim().toLowerCase();
}

/**
 * La fila solo cuenta si es de esta entrada.
 * Otra combinación de usuario, número o conexión no bloquea.
 */
function sesionEsDeEstaEntrada(sesion, clave) {
  if (!sesion || !clave) return false;
  const uid = textoClave(clave.usuarioId);
  const num = textoClave(clave.clienteNumero);
  const conn = textoClave(clave.conexionWhatsappId);
  if (!uid || !num || !conn) return false;
  return (
    textoClave(sesion.usuario_id) === uid &&
    textoClave(sesion.cliente_numero) === num &&
    textoClave(sesion.conexion_whatsapp_id) === conn
  );
}

/**
 * Separa el resultado de leer la última flow_session.
 * ok + null = ausencia confirmada. ok false, o un valor que no es fila, = indeterminado.
 * @param {{ ok?: boolean, sesion?: object|null }} resultado
 * @returns {{ lecturaSesion: "encontrada"|"ausente"|"indeterminada", sesionReciente: object|null }}
 */
function clasificarLecturaSesion(resultado) {
  if (!resultado || resultado.ok !== true) {
    return { lecturaSesion: "indeterminada", sesionReciente: null };
  }
  if (resultado.sesion == null) {
    return { lecturaSesion: "ausente", sesionReciente: null };
  }
  if (typeof resultado.sesion !== "object" || Array.isArray(resultado.sesion)) {
    return { lecturaSesion: "indeterminada", sesionReciente: null };
  }
  return { lecturaSesion: "encontrada", sesionReciente: resultado.sesion };
}

/**
 * @param {object} args
 * @param {string} args.tipoActivador
 * @param {boolean|undefined|null} args.esPrimerMensaje
 * @param {unknown} args.ctwaAdId
 * @param {unknown} args.metaAds
 * @param {unknown} args.candidateFlowId
 * @param {unknown} args.activeSessionFlowId  flujo_id de sesión ACTIVE (null si no hay)
 * @param {object|null|undefined} args.sesionReciente  última flow_session de la entrada
 * @param {object|null|undefined} args.claveEntrada  usuario, número y conexión del mensaje
 * @param {"encontrada"|"ausente"|"indeterminada"|null|undefined} args.lecturaSesion
 * @returns {{ allow: boolean, reason: string }}
 */
function evaluateCtwaPrimerMensajeException({
  tipoActivador,
  esPrimerMensaje,
  ctwaAdId,
  metaAds,
  candidateFlowId,
  activeSessionFlowId,
  sesionReciente = null,
  claveEntrada = null,
  lecturaSesion = null,
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
  // Sin lectura confirmada no se asume "no hay sesión".
  if (lecturaSesion != null && lecturaSesion !== "ausente" && lecturaSesion !== "encontrada") {
    return { allow: false, reason: "lectura_sesion_indeterminada" };
  }
  if (lecturaSesion === "encontrada" && !sesionEsDeEstaEntrada(sesionReciente, claveEntrada)) {
    return { allow: false, reason: "lectura_sesion_indeterminada" };
  }
  // finished no equivale a vencida: manda expires_at, igual que primer mensaje.
  // "ausente" confirmado no entra aquí. Sin bandera, solo bloquea una fila de esta entrada.
  const sesionDeEstaEntrada = sesionEsDeEstaEntrada(sesionReciente, claveEntrada);
  if (sesionDeEstaEntrada && sesionBloqueaReingreso(sesionReciente)) {
    return { allow: false, reason: "sesion_vigente_bloquea_reingreso" };
  }
  return { allow: true, reason: "ctwa_hard_match" };
}

module.exports = {
  evaluateCtwaPrimerMensajeException,
  clasificarLecturaSesion,
  sameFlowId,
  sesionEsDeEstaEntrada,
};
