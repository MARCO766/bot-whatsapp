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

// M1 y M2 las deja para el operador. Node no las llama en esta fase.
const OPERADOR_M1 = new Set([
  "limpieza_media_refrescar_ultimo_entrante",
  "limpieza_media_registrar_ultimo_entrante",
  "limpieza_media_conversacion_ultimo_entrante",
  "limpieza_media_backfill_ultimo_entrante",
]);
const OPERADOR_M2 = new Set([
  "limpieza_media_decodificar_segmento",
  "limpieza_media_partir_bucket_ruta",
  "limpieza_media_analizar_storage",
  "limpieza_media_reemplazar_citas",
  "limpieza_media_aplicar_citas_mensaje",
  "limpieza_media_media_cita_mensaje",
  "limpieza_media_backfill_media_cita",
]);
const OPERADOR = new Set([...OPERADOR_M1, ...OPERADOR_M2]);

function esOperadorSinLlamada(error) {
  for (const nombre of OPERADOR) {
    if (error.startsWith(`La migración define ${nombre}(`) && error.includes("Node no la llama")) {
      return true;
    }
  }
  return false;
}

assert.ok(funciones.size > 0, "las migraciones no entregaron funciones");
assert.strictEqual(
  tablas.size,
  6,
  `el lector debía encontrar seis tablas y encontró: ${[...tablas.keys()].join(", ")}`
);
for (const [nombre, tabla] of tablas) {
  assert.strictEqual(tabla.rls, true, `${nombre} no habilita RLS en la migración`);
  if (nombre === "media_cita") {
    assert.deepStrictEqual(tabla.service.slice().sort(), ["delete", "insert", "select"]);
  } else {
    assert.ok(!tabla.service.includes("delete"), `${nombre} otorga DELETE en la migración`);
  }
}
for (const nombre of OPERADOR) {
  assert.ok(funciones.has(nombre), nombre);
  assert.strictEqual(llamadas.has(nombre), false, nombre);
}
assert.strictEqual(llamadas.size + OPERADOR.size, funciones.size);
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
const erroresDeContrato = errores.filter((error) => !esOperadorSinLlamada(error));
if (erroresDeContrato.length) {
  throw new Error(erroresDeContrato.join("\n"));
}

console.log(
  "ok",
  `las ${llamadas.size} funciones que llama Node coinciden en nombre, orden y parámetros; ${OPERADOR_M1.size} de M1 y ${OPERADOR_M2.size} de M2 quedan para el operador`
);
console.log("1 prueba ok");
