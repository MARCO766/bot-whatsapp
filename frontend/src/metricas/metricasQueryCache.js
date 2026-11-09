/**
 * Caché en memoria de las secciones bajo demanda de Métricas.
 * La clave separa usuario, periodo, rango, flujo, conexión y sección.
 * Las promesas en vuelo de la misma clave se comparten.
 */

const MAX_PER_SECTION = 12;
const CONEXION_TODAS = "__todas__";

const store = new Map();
const inflight = new Map();
const epochs = new Map();
let seq = 0;
let activeUser = null;

function normalizeConexion(conexionWhatsappId) {
  if (conexionWhatsappId == null) return null;
  const raw = String(conexionWhatsappId).trim();
  if (!raw || raw === CONEXION_TODAS) return null;
  return raw;
}

function epochId(usuarioId, section) {
  return JSON.stringify([String(usuarioId ?? ""), String(section)]);
}

function parseKey(key) {
  const parsed = JSON.parse(key);
  return {
    u: parsed.u == null ? "" : String(parsed.u),
    section: parsed.section == null ? "" : String(parsed.section),
  };
}

export function buildMetricasCacheKey({
  usuarioId,
  periodo,
  desde = null,
  hasta = null,
  flujoId = null,
  conexionWhatsappId = null,
  section,
}) {
  const flujo = flujoId == null || String(flujoId).trim() === "" ? null : String(flujoId);
  return JSON.stringify({
    u: usuarioId == null ? "" : String(usuarioId),
    periodo: periodo == null ? "" : String(periodo),
    desde: desde || null,
    hasta: hasta || null,
    flujoId: flujo,
    conexion: normalizeConexion(conexionWhatsappId),
    section: String(section),
  });
}

export function metricasCacheEpoch(usuarioId, section) {
  return epochs.get(epochId(usuarioId, section)) || 0;
}

export function readMetricasCache(key) {
  const row = store.get(key);
  return row ? { ...row } : null;
}

export function isMetricasCacheFresh(key) {
  const row = store.get(key);
  if (!row || row.stale || row.error != null || row.data == null) return false;
  const parsed = parseKey(key);
  return row.epoch === metricasCacheEpoch(parsed.u, parsed.section);
}

export function metricasResultIsCurrent(key, data, capturedEpoch) {
  const parsed = parseKey(key);
  const now = metricasCacheEpoch(parsed.u, parsed.section);
  if (now === capturedEpoch) return true;
  const row = store.get(key);
  return Boolean(
    row &&
      row.data === data &&
      !row.stale &&
      row.error == null &&
      row.epoch === now
  );
}

function trimSection(section) {
  const rows = [];
  for (const [key, value] of store) {
    if (parseKey(key).section === section) {
      rows.push({ key, seq: value.seq });
    }
  }
  rows.sort((a, b) => a.seq - b.seq);
  let extra = rows.length - MAX_PER_SECTION;
  for (const row of rows) {
    if (extra <= 0) break;
    if (inflight.has(row.key)) continue;
    store.delete(row.key);
    extra -= 1;
  }
}

function acceptsKey(key) {
  if (!activeUser) return true;
  return parseKey(key).u === activeUser;
}

function commitSuccess(key, data, captured) {
  if (!acceptsKey(key)) return;
  const parsed = parseKey(key);
  const current = metricasCacheEpoch(parsed.u, parsed.section);
  const prev = store.get(key);
  if (prev && prev.epoch > captured) return;
  store.set(key, {
    data,
    error: null,
    stale: current !== captured,
    epoch: captured,
    fetchedAt: Date.now(),
    seq: ++seq,
  });
  trimSection(parsed.section);
}

function commitError(key, err, captured) {
  if (!acceptsKey(key)) return;
  const parsed = parseKey(key);
  const current = metricasCacheEpoch(parsed.u, parsed.section);
  const prev = store.get(key);
  if (prev && prev.epoch > captured) return;
  const message = err?.message || "Error al cargar métricas";
  if (prev && prev.data != null && prev.epoch === captured && current === captured) {
    store.set(key, { ...prev, error: message });
    return;
  }
  store.set(key, {
    data: null,
    error: message,
    stale: current !== captured,
    epoch: captured,
    fetchedAt: Date.now(),
    seq: ++seq,
  });
  trimSection(parsed.section);
}

export function loadMetricasCached(key, fetcher, { force = false } = {}) {
  const parsed = parseKey(key);
  const captured = metricasCacheEpoch(parsed.u, parsed.section);
  if (!force && isMetricasCacheFresh(key)) {
    return Promise.resolve(store.get(key).data);
  }

  const existing = inflight.get(key);
  if (existing && existing.epoch === captured) return existing.promise;

  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((data) => {
      commitSuccess(key, data, captured);
      return data;
    })
    .catch((err) => {
      commitError(key, err, captured);
      throw err;
    })
    .finally(() => {
      const current = inflight.get(key);
      if (current && current.promise === promise) inflight.delete(key);
    });

  inflight.set(key, { promise, epoch: captured, force: Boolean(force) });
  return promise;
}

export function invalidateMetricasSections(sections, usuarioId) {
  const wanted = new Set(sections);
  const users = new Set();
  if (usuarioId != null) {
    users.add(String(usuarioId));
  } else {
    for (const key of store.keys()) users.add(parseKey(key).u);
    for (const key of inflight.keys()) users.add(parseKey(key).u);
  }

  for (const section of wanted) {
    for (const user of users) {
      const id = epochId(user, section);
      epochs.set(id, (epochs.get(id) || 0) + 1);
    }
  }

  for (const [key, value] of store) {
    const parsed = parseKey(key);
    if (!wanted.has(parsed.section)) continue;
    if (usuarioId != null && parsed.u !== String(usuarioId)) continue;
    store.set(key, { ...value, stale: true });
  }
}

export function dropMetricasCacheExceptUser(usuarioId) {
  const keep = String(usuarioId);
  activeUser = keep;
  for (const key of [...store.keys()]) {
    if (parseKey(key).u !== keep) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (parseKey(key).u !== keep) inflight.delete(key);
  }
  for (const id of [...epochs.keys()]) {
    try {
      const [user] = JSON.parse(id);
      if (String(user) !== keep) epochs.delete(id);
    } catch {
      epochs.delete(id);
    }
  }
}

export function retireMetricasCache(usuarioId) {
  invalidateMetricasSections(["revenue", "series", "diagnostico"], usuarioId);
}

export function resetMetricasQueryCacheForTests() {
  store.clear();
  inflight.clear();
  epochs.clear();
  seq = 0;
  activeUser = null;
}

export const METRICAS_CACHE_MAX_PER_SECTION = MAX_PER_SECTION;
export const METRICAS_SECTION_OPEN_DELAY_MS = 150;
