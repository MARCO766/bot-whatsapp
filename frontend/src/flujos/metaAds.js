/**
 * Helpers UI para macbot_meta.meta_ads.ad_ids (opcional).
 * Sin validación contra Meta API.
 */

export function emptyMetaAdsValue() {
  return { ad_ids: [] };
}

/** Solo dígitos tras trim; null si vacío o inválido. */
export function normalizeAdIdInput(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return trimmed;
}

/** Filtra caracteres no dígitos mientras se escribe. */
export function digitsOnlyAsTyped(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * Normaliza payload meta_ads: trim, solo dígitos, dedupe (orden estable).
 */
export function buildMetaAdsFromAdIds(adIds) {
  const list = Array.isArray(adIds) ? adIds : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = normalizeAdIdInput(item);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return { ad_ids: out };
}

/** Lee meta.meta_ads (legacy sin meta_ads → vacío). */
export function normalizeMetaAdsForUi(raw) {
  if (!raw || typeof raw !== "object") return emptyMetaAdsValue();
  return buildMetaAdsFromAdIds(raw.ad_ids);
}

export function formatMetaAdsLabel(metaAds) {
  const ads = normalizeMetaAdsForUi(metaAds);
  const n = ads.ad_ids.length;
  if (n === 0) return null;
  if (n === 1) return `1 anuncio Meta`;
  return `${n} anuncios Meta`;
}
