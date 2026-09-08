/**
 * Transporte interno CTWA Ad ID (referral.source_id).
 * Extracción / normalización para threading hacia resolverActivadorEntrante.
 * Sin logging de diagnóstico.
 */

/**
 * Extrae Ad ID desde message.referral.source_id de forma segura.
 * @returns {string|undefined}
 */
function extractCtwaAdIdFromMessage(message) {
  try {
    if (!message || typeof message !== "object") return undefined;
    const referral = message.referral;
    if (referral == null || typeof referral !== "object") return undefined;
    if (referral.source_id == null) return undefined;
    const s = String(referral.source_id).trim();
    return s || undefined;
  } catch (_err) {
    return undefined;
  }
}

/**
 * Normaliza un valor ya threadado (opts.ctwaAdId).
 * @returns {string|undefined}
 */
function normalizeCtwaAdId(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

module.exports = {
  extractCtwaAdIdFromMessage,
  normalizeCtwaAdId,
};
