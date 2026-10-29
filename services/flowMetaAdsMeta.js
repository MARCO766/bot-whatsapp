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
 * Motivo de descarte solo cuando isFlowCompatibleWithAdId es false.
 * null = el flujo sigue siendo elegible por anuncio. No elige candidato.
 * @returns {"sin_source_id"|"source_id_sin_coincidencia"|null}
 */
function clasificarDescarteAdId(metaAds, ctwaAdId) {
  if (isFlowCompatibleWithAdId(metaAds, ctwaAdId)) return null;
  const raw = ctwaAdId == null ? "" : String(ctwaAdId).trim();
  if (!raw) return "sin_source_id";
  return "source_id_sin_coincidencia";
}

/**
 * Valor mostrado en logs [CTWA_ROUTING]. No normaliza ni compara:
 * la elegibilidad sigue usando el identificador completo.
 * @returns {string} últimos 4 caracteres, o "sin_id" si no hay valor usable
 */
function idAnuncioParaLog(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "sin_id";
    raw = String(raw);
  } else if (typeof raw === "bigint") {
    raw = String(raw);
  } else if (typeof raw !== "string") {
    return "sin_id";
  }
  const texto = raw.trim();
  if (!texto) return "sin_id";
  return texto.slice(-4);
}

/**
 * Resumen cuando el bucle no eligió flujo.
 * null = el cierre no fue por anuncio ni por país; el caller conserva su log genérico.
 * No altera el orden ni el ganador.
 * @returns {"sin_source_id"|"source_id_sin_coincidencia"|"pais"|null}
 */
function resumenCierreEnrutamientoCtwa({
  tieneSourceId = false,
  descartesAd = [],
  rechazoPais = false,
} = {}) {
  if (rechazoPais) return "pais";
  const lista = Array.isArray(descartesAd) ? descartesAd : [];
  if (!tieneSourceId && lista.includes("sin_source_id")) return "sin_source_id";
  if (tieneSourceId && lista.includes("source_id_sin_coincidencia")) {
    return "source_id_sin_coincidencia";
  }
  return null;
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
  clasificarDescarteAdId,
  idAnuncioParaLog,
  resumenCierreEnrutamientoCtwa,
  flowHasExplicitAdIdMatch,
};
