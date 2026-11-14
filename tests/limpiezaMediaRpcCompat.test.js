/**
 * Compara las funciones de las migraciones con las llamadas de Node.
 * Lee los archivos. No repite una lista manual de firmas y no abre red.
 *
 * Ejecutar: node tests/limpiezaMediaRpcCompat.test.js
 */
const assert = require("assert");
const { compararLlamadas } = require("./herramientas/limpiezaMediaFirmas");

const { funciones, tablas, llamadas, errores } = compararLlamadas();

assert.ok(funciones.size > 0, "las migraciones no entregaron funciones");
assert.strictEqual(
  tablas.size,
  5,
  `el lector debía encontrar cinco tablas y encontró: ${[...tablas.keys()].join(", ")}`
);
for (const [nombre, tabla] of tablas) {
  assert.strictEqual(tabla.rls, true, `${nombre} no habilita RLS en la migración`);
  assert.ok(!tabla.service.includes("delete"), `${nombre} otorga DELETE en la migración`);
}
assert.strictEqual(llamadas.size, funciones.size);
if (errores.length) {
  throw new Error(errores.join("\n"));
}

console.log(
  "ok",
  `las ${funciones.size} funciones SQL coinciden en nombre, orden y parámetros con los argumentos que envía Node`
);
console.log("1 prueba ok");
