/**
 * IDs de anuncios de Meta (macbot_meta.meta_ads).
 * Persistencia / validación opcional + elegibilidad runtime (FASE 3).
 *
 * Forma:
 *   { ad_ids: string[] }   // solo dígitos, sin duplicados
 * Ausente / vacío = válido (compat legacy).
 */

function emptyMetaAds() {
  return { ad_ids: [] };
}

/** ¿Hay meta_ads persistido en meta cruda? (sin inventar default) */
function hasPersistedMetaAds(rawMeta) {
  return Boolean(
    rawMeta &&
      typeof rawMeta === "object" &&
      rawMeta.meta_ads &&
      typeof rawMeta.meta_ads === "object"
  );
}

/**
 * Normaliza un ID individual: trim + solo dígitos.
 * Siempre string (nunca Number / parseInt).
 * @returns {string|null} null si vacío o no es solo dígitos
 */
function normalizeAdId(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Limpia lista: trim, solo dígitos, dedupe (primera ocurrencia gana).
 * @param {unknown} rawList
 * @returns {string[]}
 */
function sanitizeAdIdsList(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const out = [];
  for (const item of rawList) {
    const id = normalizeAdId(item);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Lectura para API/listado. Ausente → { ad_ids: [] } (compat; no migra filas).
 */
function normalizeMetaAdsForRead(raw) {
  if (raw == null || typeof raw !== "object") return emptyMetaAds();
  return { ad_ids: sanitizeAdIdsList(raw.ad_ids) };
}

/**
 * Validación de escritura (create / PATCH).
 * - meta_ads ausente / null / "" → { ad_ids: [] }
 * - IDs con letras u otros caracteres → se descartan (no se guardan)
 * - duplicados → se eliminan
 * - estructura inválida (no objeto) → error
 * @returns {{ ok: true, value: { ad_ids: string[] } } | { ok: false, error: string }}
 */
function normalizeMetaAdsForWrite(raw) {
  if (raw == null || raw === "") {
    return { ok: true, value: emptyMetaAds() };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "meta_ads inválido" };
  }
  if (raw.ad_ids !== undefined && raw.ad_ids !== null && !Array.isArray(raw.ad_ids)) {
    return { ok: false, error: "ad_ids debe ser un arreglo" };
  }
  return { ok: true, value: { ad_ids: sanitizeAdIdsList(raw.ad_ids) } };
}

/**
 * Elegibilidad runtime: ¿el flujo admite este ctwaAdId?
 *
 * Legacy-safe (sin restricción → true):
 * - meta_ads ausente / null / no-objeto
 * - ad_ids ausente / vacío tras normalizar
 *
 * Fail-closed (con restricción):
 * - ad_ids con uno o más IDs válidos
 * - ctwaAdId ausente / vacío / no-dígitos / no listado → false
 *
 * Comparación siempre como string (nunca Number).
 *
 * @param {unknown} metaAds  macbot_meta.meta_ads (crudo o normalizado)
 * @param {unknown} ctwaAdId  referral.source_id threadado
 * @returns {boolean}
 */
function isFlowCompatibleWithAdId(metaAds, ctwaAdId) {
  const { ad_ids: adIds } = normalizeMetaAdsForRead(metaAds);
  if (!adIds.length) return true;

  const id = normalizeAdId(ctwaAdId);
  if (!id) return false;
  return adIds.includes(id);
}

/**
 * Hard-match para excepción CTWA de primer_mensaje.
 * Requiere ad_ids NO vacío + ctwaAdId normalizado listado.
 * Distinto de isFlowCompatibleWithAdId (legacy-open con ad_ids []).
 *
 * @param {unknown} metaAds
 * @param {unknown} ctwaAdId
 * @returns {boolean}
 */
function flowHasExplicitAdIdMatch(metaAds, ctwaAdId) {
  const { ad_ids: adIds } = normalizeMetaAdsForRead(metaAds);
  if (!adIds.length) return false;

  const id = normalizeAdId(ctwaAdId);
  if (!id) return false;
  return adIds.includes(id);
}

module.exports = {
  emptyMetaAds,
  hasPersistedMetaAds,
  normalizeAdId,
  sanitizeAdIdsList,
  normalizeMetaAdsForRead,
  normalizeMetaAdsForWrite,
  isFlowCompatibleWithAdId,
  flowHasExplicitAdIdMatch,
};
