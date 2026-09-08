/**
 * FASE 2 — Transporte interno CTWA Ad ID (referral.source_id).
 * Solo extracción / normalización. Sin routing ni filtro por meta_ads.
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

/** Log temporal (eliminar tras validar Fase 3). Solo si hay valor. */
function logCtwaAdIdThread(ctwaAdId) {
  const id = normalizeCtwaAdId(ctwaAdId);
  if (!id) return;
  console.log("[CTWA AD ID THREAD]");
  console.log(`ctwaAdId: ${id}`);
  console.log("[/CTWA AD ID THREAD]");
}

module.exports = {
  extractCtwaAdIdFromMessage,
  normalizeCtwaAdId,
  logCtwaAdIdThread,
};
