/**
 * Pruebas aisladas: periodo=hoy usa día calendario de Bolivia (America/La_Paz).
 * Ejecutar: node tests/dateRangeService.hoy.test.js
 */
const assert = require("assert");
const {
  resolveToday,
  resolveDateRange,
  resolveYesterday,
  resolveLastDays,
  DEFAULT_TIMEZONE,
} = require("../services/dateRangeService");

function inRange(iso, rango) {
  const t = new Date(iso).getTime();
  return t >= new Date(rango.desde).getTime() && t <= new Date(rango.hasta).getTime();
}

const now = new Date("2026-09-19T12:00:00.000Z");
const TZ = "America/La_Paz";

assert.strictEqual(DEFAULT_TIMEZONE, TZ);

// 1–3. resolveToday usa America/La_Paz: día 19 Bolivia = 04:00Z → 03:59:59.999Z del día siguiente
const hoy = resolveToday({ now, timeZone: TZ });
assert.strictEqual(hoy.periodo, "hoy");
assert.strictEqual(hoy.desde, "2026-09-19T04:00:00.000Z");
assert.strictEqual(hoy.hasta, "2026-09-20T03:59:59.999Z");

const hoyViaApi = resolveDateRange({ periodo: "hoy" }, { now, timeZone: TZ });
assert.strictEqual(hoyViaApi.desde, "2026-09-19T04:00:00.000Z");
assert.strictEqual(hoyViaApi.hasta, "2026-09-20T03:59:59.999Z");

// 4. 2026-09-19T02:32:08Z = 18/09 22:32 en Bolivia → pertenece al día 18, fuera de hoy del 19
assert.strictEqual(inRange("2026-09-19T02:32:08Z", hoy), false);

// 5. 2026-09-19T04:00:00Z = inicio del día 19 en Bolivia
assert.strictEqual(inRange("2026-09-19T04:00:00.000Z", hoy), true);

// 6. ayer sigue usando America/La_Paz
const ayer = resolveYesterday({ now, timeZone: TZ });
assert.strictEqual(ayer.periodo, "ayer");
assert.strictEqual(ayer.desde, "2026-09-18T04:00:00.000Z");
assert.strictEqual(ayer.hasta, "2026-09-19T03:59:59.999Z");

// 7. 7d / 30d / 90d siguen usando America/La_Paz
const d7 = resolveLastDays(7, { now, timeZone: TZ, periodo: "7d" });
assert.strictEqual(d7.periodo, "7d");
assert.strictEqual(d7.desde, "2026-09-13T04:00:00.000Z");
assert.strictEqual(d7.hasta, "2026-09-20T03:59:59.999Z");

const d30 = resolveLastDays(30, { now, timeZone: TZ, periodo: "30d" });
assert.strictEqual(d30.periodo, "30d");
assert.strictEqual(d30.desde, "2026-08-21T04:00:00.000Z");
assert.strictEqual(d30.hasta, "2026-09-20T03:59:59.999Z");

const d90 = resolveLastDays(90, { now, timeZone: TZ, periodo: "90d" });
assert.strictEqual(d90.periodo, "90d");
assert.strictEqual(d90.desde, "2026-06-22T04:00:00.000Z");
assert.strictEqual(d90.hasta, "2026-09-20T03:59:59.999Z");

// 8. custom no cambia
const custom = resolveDateRange(
  {
    periodo: "custom",
    desde: "2026-09-01T00:00:00.000Z",
    hasta: "2026-09-10T23:59:59.999Z",
  },
  { now }
);
assert.strictEqual(custom.periodo, "custom");
assert.strictEqual(custom.desde, "2026-09-01T00:00:00.000Z");
assert.strictEqual(custom.hasta, "2026-09-10T23:59:59.999Z");

console.log("OK dateRangeService.hoy.test.js — all assertions passed");
