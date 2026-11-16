/**
 * Compara las funciones de las migraciones con las llamadas de Node.
 * Lee los archivos. No repite una lista manual de firmas y no abre red.
 *
 * Ejecutar: node tests/limpiezaMediaRpcCompat.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
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
assert.deepStrictEqual(llamadas.get("limpieza_media_revalidar_lote"), [
  "p_fase",
  "p_claves",
  "p_hilos",
]);
const loteSrc = fs.readFileSync(
  path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaRevalidarLote.js"),
  "utf8"
);
assert.match(
  loteSrc,
  /axios\.post\(\s*`\$\{process\.env\.SUPABASE_URL\}\/rest\/v1\/rpc\/limpieza_media_revalidar_lote`\s*,\s*\{\s*p_fase:\s*fase,\s*p_claves:\s*claves\s*\|\|\s*\[\],\s*p_hilos:\s*hilos\s*\|\|\s*\[\]\s*\}/
);
const referencias = loteSrc.indexOf('fase: "referencias"');
const segundaLectura = loteSrc.indexOf("segundaNecesaria");
assert.ok(referencias >= 0 && segundaLectura > referencias);
if (errores.length) {
  throw new Error(errores.join("\n"));
}

console.log(
  "ok",
  `las ${funciones.size} funciones SQL coinciden en nombre, orden y parámetros con los argumentos que envía Node`
);
console.log("1 prueba ok");
