/**
 * Clasificación de errores del candado y de la valla.
 * No abre red. Los módulos ajenos a la limpieza siguen usando isSchemaMissingError.
 * Ejecutar: node tests/limpiezaMediaClasificacion.test.js
 */
const assert = require("assert");
const { clasificarErrorPostgrest, isSchemaMissingError } = require("../services/supabaseSafe");
const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
const valla = require("../services/limpiezaMedia/limpiezaMediaValla");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function errorHttp(status, data, code, message) {
  const error = new Error(message || "fallo");
  if (code) error.code = code;
  if (status) error.response = { status, data: data || {} };
  return error;
}

function testClases() {
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(404, { code: "PGRST202" })), "funcion_ausente");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(404, { code: "42P01", message: "relation limpieza_media_lock does not exist" })), "tabla_ausente");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(400, { code: "42703", message: "column estado does not exist" })), "columna_ausente");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(404, { message: "Not Found" }, null, "Not Found")), "http_404");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(403, { code: "42501", message: "permission denied" })), "permiso_denegado");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(0, null, "ECONNABORTED", "timeout of 500ms exceeded")), "timeout");
  assert.strictEqual(clasificarErrorPostgrest(errorHttp(0, null, "ECONNRESET", "socket hang up")), "error_de_red");
  assert.strictEqual(isSchemaMissingError(errorHttp(404, { message: "Not Found" }, null, "Not Found")), true);
  ok("las clases distinguen función, tabla, columna, 404, permiso, timeout y red");
}

async function testCandadoNoContinua() {
  const generico = {
    async post() {
      throw errorHttp(404, { message: "Not Found" }, null, "Not Found");
    },
  };
  const caido = await lock.adquirirLockLimpiezaMedia({
    url: "http://127.0.0.1:9",
    key: "prueba",
    cliente: generico,
  });
  assert.strictEqual(caido.acquired, false);
  assert.notStrictEqual(caido.motivo, "candado_ocupado");
  assert.strictEqual(caido.motivo, "lock_adquisicion_fallida");

  const tabla = {
    async post() {
      throw errorHttp(404, { code: "42P01", message: "relation limpieza_media_lock does not exist" });
    },
  };
  const ausente = await lock.adquirirLockLimpiezaMedia({
    url: "http://127.0.0.1:9",
    key: "prueba",
    cliente: tabla,
  });
  assert.strictEqual(ausente.acquired, false);
  assert.strictEqual(ausente.motivo, "lock_tabla_ausente");
  ok("un error desconocido del candado no se trata como ocupación ni deja continuar");
}

async function testVallaNoQuedaAbierta() {
  let inserts = 0;
  let deletes = 0;
  const cliente = {
    async post() {
      throw errorHttp(404, { message: "Not Found" }, null, "Not Found");
    },
    async delete() {
      deletes += 1;
    },
  };
  const entrante = await valla.ejecutarPersistenciaEntrante({
    cliente,
    url: "http://127.0.0.1:9",
    key: "prueba",
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.404",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(entrante.status, 503);
  assert.strictEqual(inserts, 0);
  assert.notStrictEqual(entrante.valla && entrante.valla.ok, true);

  const abierta = await valla.abrirVallaLimpieza({
    permitirRed: true,
    cliente,
    url: "http://127.0.0.1:9",
    key: "prueba",
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  assert.notStrictEqual(abierta.bloqueaInsertos, true);
  assert.notStrictEqual(abierta.sesionAbierta, true);

  const plan = await eliminar.planificarEliminacion("archivos/whatsapp/u/foto.jpg", {
    permitirRed: true,
    cliente,
    url: "http://127.0.0.1:9",
    key: "prueba",
    workerId: "w1",
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo: "u|c|591" }),
    io: { leerUltimoEntrante: async () => 1000 },
    borrarObjeto: async () => {
      deletes += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(deletes, 0);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("una valla que falla no queda abierta y no autoriza un DELETE");
}

(async () => {
  testClases();
  await testCandadoNoContinua();
  await testVallaNoQuedaAbierta();
  console.log(`${passed} pruebas ok`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
