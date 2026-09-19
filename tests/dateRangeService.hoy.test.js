/**
 * Pruebas aisladas: periodo=hoy usa día UTC (no America/La_Paz).
 * Ejecutar: node tests/dateRangeService.hoy.test.js
 */
const assert = require("assert");
const {
  resolveToday,
  resolveDateRange,
  resolveYesterday,
  resolveLastDays,
} = require("../services/dateRangeService");

function inRange(iso, rango) {
  const t = new Date(iso).getTime();
  return t >= new Date(rango.desde).getTime() && t <= new Date(rango.hasta).getTime();
}

const now = new Date("2026-09-19T12:00:00.000Z");

// 1–2. Límites UTC exactos
const hoy = resolveToday({ now });
assert.strictEqual(hoy.periodo, "hoy");
assert.strictEqual(hoy.desde, "2026-09-19T00:00:00.000Z");
assert.strictEqual(hoy.hasta, "2026-09-19T23:59:59.999Z");

const hoyViaApi = resolveDateRange({ periodo: "hoy" }, { now });
assert.strictEqual(hoyViaApi.desde, "2026-09-19T00:00:00.000Z");
assert.strictEqual(hoyViaApi.hasta, "2026-09-19T23:59:59.999Z");

// timeZone La Paz no debe desplazar hoy a 04:00Z
const hoyIgnoraTz = resolveDateRange(
  { periodo: "hoy" },
  { now, timeZone: "America/La_Paz" }
);
assert.strictEqual(hoyIgnoraTz.desde, "2026-09-19T00:00:00.000Z");
assert.strictEqual(hoyIgnoraTz.hasta, "2026-09-19T23:59:59.999Z");
assert.notStrictEqual(hoyIgnoraTz.desde, "2026-09-19T04:00:00.000Z");

// 3. Conversión 02:32Z del 19 entra en hoy del 19
assert.strictEqual(inRange("2026-09-19T02:32:08Z", hoy), true);

// 4. Fin del 18 UTC no entra en hoy del 19
assert.strictEqual(inRange("2026-09-18T23:59:59Z", hoy), false);

// 5. Inicio del 20 UTC no entra en hoy del 19
assert.strictEqual(inRange("2026-09-20T00:00:00Z", hoy), false);

// 6–8. Otros periodos no usan resolveToday; ayer/7d siguen La Paz (invariante de no-regresión)
const ayer = resolveYesterday({ now, timeZone: "America/La_Paz" });
assert.strictEqual(ayer.periodo, "ayer");
assert.strictEqual(ayer.desde, "2026-09-18T04:00:00.000Z");
assert.strictEqual(ayer.hasta, "2026-09-19T03:59:59.999Z");

const d7 = resolveLastDays(7, { now, timeZone: "America/La_Paz", periodo: "7d" });
assert.strictEqual(d7.periodo, "7d");
assert.strictEqual(d7.hasta, "2026-09-20T03:59:59.999Z");
assert.strictEqual(d7.desde, "2026-09-13T04:00:00.000Z");

console.log("OK dateRangeService.hoy.test.js — all assertions passed");
