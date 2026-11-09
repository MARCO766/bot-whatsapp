import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  METRICAS_CACHE_MAX_PER_SECTION,
  buildMetricasCacheKey,
  dropMetricasCacheExceptUser,
  invalidateMetricasSections,
  isMetricasCacheFresh,
  loadMetricasCached,
  metricasCacheEpoch,
  metricasResultIsCurrent,
  readMetricasCache,
  resetMetricasQueryCacheForTests,
} from "./metricasQueryCache.js";

const USER = "usuario-a";
const OTHER = "usuario-b";

function key(overrides = {}) {
  return buildMetricasCacheKey({
    usuarioId: USER,
    periodo: "hoy",
    desde: null,
    hasta: null,
    flujoId: null,
    conexionWhatsappId: null,
    section: "series",
    ...overrides,
  });
}

beforeEach(() => {
  resetMetricasQueryCacheForTests();
});

test("la misma clave comparte una sola promesa en vuelo", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const cacheKey = key();
  const fetcher = () => {
    calls += 1;
    return gate.then(() => ({ n: calls }));
  };

  const first = loadMetricasCached(cacheKey, fetcher);
  const second = loadMetricasCached(cacheKey, fetcher);
  release();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(readMetricasCache(cacheKey).data.n, 1);
});

test("una clave fresca no vuelve a consultar", async () => {
  const cacheKey = key();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: true };
  };

  await loadMetricasCached(cacheKey, fetcher);
  await loadMetricasCached(cacheKey, fetcher);

  assert.equal(calls, 1);
  assert.equal(isMetricasCacheFresh(cacheKey), true);
});

test("usuarios, periodo, rango, flujo y conexión no comparten datos", async () => {
  const base = key();
  const variants = [
    key({ usuarioId: OTHER }),
    key({ periodo: "7d" }),
    key({ periodo: "custom", desde: "2026-01-01T00:00:00.000Z", hasta: "2026-01-02T00:00:00.000Z" }),
    key({
      periodo: "custom",
      desde: "2026-02-01T00:00:00.000Z",
      hasta: "2026-02-02T00:00:00.000Z",
    }),
    key({ flujoId: "flujo-1" }),
    key({ conexionWhatsappId: "linea-1" }),
    key({ section: "revenue" }),
    key({ section: "diagnostico" }),
  ];

  await loadMetricasCached(base, async () => ({ origen: "base" }));
  for (const variant of variants) {
    assert.notEqual(variant, base);
    assert.equal(readMetricasCache(variant), null);
  }
  assert.deepEqual(readMetricasCache(base).data, { origen: "base" });
});

test("Todas las líneas y la conexión vacía usan la misma clave", () => {
  const todas = key({ conexionWhatsappId: "__todas__" });
  const vacia = key({ conexionWhatsappId: "" });
  const nula = key({ conexionWhatsappId: null });
  const linea = key({ conexionWhatsappId: "abc" });

  assert.equal(todas, vacia);
  assert.equal(vacia, nula);
  assert.notEqual(nula, linea);
});

test("invalidar una sección de un usuario no toca al otro ni a otra sección", async () => {
  const seriesA = key();
  const seriesB = key({ usuarioId: OTHER });
  const revenueA = key({ section: "revenue" });

  await loadMetricasCached(seriesA, async () => ({ seccion: "series-a" }));
  await loadMetricasCached(seriesB, async () => ({ seccion: "series-b" }));
  await loadMetricasCached(revenueA, async () => ({ seccion: "revenue-a" }));

  invalidateMetricasSections(["series"], USER);

  assert.equal(isMetricasCacheFresh(seriesA), false);
  assert.equal(readMetricasCache(seriesA).stale, true);
  assert.equal(isMetricasCacheFresh(seriesB), true);
  assert.equal(isMetricasCacheFresh(revenueA), true);
  assert.deepEqual(readMetricasCache(seriesB).data, { seccion: "series-b" });
});

test("una respuesta vieja no pisa el resultado de un epoch más nuevo", async () => {
  const cacheKey = key();
  let releaseOld;
  const oldGate = new Promise((resolve) => {
    releaseOld = resolve;
  });
  const captured = metricasCacheEpoch(USER, "series");
  const oldRequest = loadMetricasCached(cacheKey, () => oldGate.then(() => "viejo"));

  invalidateMetricasSections(["series"], USER);
  const fresh = await loadMetricasCached(cacheKey, async () => "nuevo", { force: true });
  releaseOld();
  const oldResult = await oldRequest;

  assert.equal(oldResult, "viejo");
  assert.equal(fresh, "nuevo");
  assert.equal(readMetricasCache(cacheKey).data, "nuevo");
  assert.equal(readMetricasCache(cacheKey).stale, false);
  assert.equal(metricasResultIsCurrent(cacheKey, "viejo", captured), false);
  assert.equal(
    metricasResultIsCurrent(cacheKey, "nuevo", metricasCacheEpoch(USER, "series")),
    true
  );
});

test("forzar la recarga ignora una entrada fresca y un error no queda fresco", async () => {
  const cacheKey = key({ section: "diagnostico" });
  let calls = 0;
  await loadMetricasCached(cacheKey, async () => {
    calls += 1;
    return { v: 1 };
  });
  await loadMetricasCached(
    cacheKey,
    async () => {
      calls += 1;
      return { v: 2 };
    },
    { force: true }
  );
  assert.equal(calls, 2);
  assert.deepEqual(readMetricasCache(cacheKey).data, { v: 2 });

  const failKey = key({ section: "revenue" });
  await assert.rejects(
    () =>
      loadMetricasCached(failKey, async () => {
        throw new Error("fallo");
      }),
    /fallo/
  );
  assert.equal(isMetricasCacheFresh(failKey), false);

  await loadMetricasCached(failKey, async () => ({ recuperado: true }));
  assert.equal(isMetricasCacheFresh(failKey), true);
});

test("la caché conserva como máximo 12 entradas por sección", async () => {
  const revenueKey = key({ section: "revenue", flujoId: "premium" });
  await loadMetricasCached(revenueKey, async () => ({ seccion: "revenue" }));

  const keys = [];
  for (let i = 0; i < METRICAS_CACHE_MAX_PER_SECTION + 1; i += 1) {
    const cacheKey = key({ flujoId: `flujo-${i}` });
    keys.push(cacheKey);
    await loadMetricasCached(cacheKey, async () => ({ i }));
  }

  assert.equal(readMetricasCache(keys[0]), null);
  assert.equal(readMetricasCache(keys[1]).data.i, 1);
  assert.equal(readMetricasCache(keys[keys.length - 1]).data.i, METRICAS_CACHE_MAX_PER_SECTION);
  assert.deepEqual(readMetricasCache(revenueKey).data, { seccion: "revenue" });
});

test("una respuesta tardía de otro usuario no reingresa a la caché", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const theirs = key({ usuarioId: OTHER, section: "revenue" });
  const pending = loadMetricasCached(theirs, () => gate.then(() => ({ yo: false })));

  dropMetricasCacheExceptUser(USER);
  release();
  await pending;

  assert.equal(readMetricasCache(theirs), null);
  assert.equal(isMetricasCacheFresh(theirs), false);
});

test("descartar otros usuarios borra sus entradas", async () => {
  const mine = key();
  const theirs = key({ usuarioId: OTHER, section: "diagnostico" });
  await loadMetricasCached(mine, async () => ({ yo: true }));
  await loadMetricasCached(theirs, async () => ({ yo: false }));

  dropMetricasCacheExceptUser(USER);

  assert.deepEqual(readMetricasCache(mine).data, { yo: true });
  assert.equal(readMetricasCache(theirs), null);
});
