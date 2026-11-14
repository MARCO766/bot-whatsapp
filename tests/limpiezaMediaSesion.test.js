/**
 * Sesión sin vencimiento. No abre Postgres ni Storage.
 * Ejecutar: node tests/limpiezaMediaSesion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sesion = require("../services/limpiezaMedia/limpiezaMediaSesion");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function testNoHayConexionReal() {
  const real = sesion.abrirSesionDedicada();
  assert.strictEqual(real.disponible, false);
  assert.strictEqual(real.motivo, "sesion_dedicada_no_disponible");
  const src = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaSesion.js"),
    "utf8"
  );
  assert.ok(!src.includes("require(\"pg\")"));
  assert.ok(!src.includes("DATABASE_URL"));
  assert.ok(!src.includes("restaurarObjeto"));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("sin conexión dedicada el archivo sigue protegido");
}

async function testStorageLentoNoDejaEntrarAlWebhook() {
  const registro = sesion.crearRegistroDePrueba();
  const limpieza = await sesion.abrirSesionDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  assert.strictEqual(limpieza.sinVencimiento, true);
  assert.ok(!registro.porHilo.get("u|c|591").locked_until);
  let inserts = 0;
  const bloqueado = await sesion.entrarConversacion({
    registro,
    hilo: "u|c|591",
    owner: "wh:wamid.lento",
    esperarMs: 0,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(bloqueado.status, 503);
  assert.strictEqual(bloqueado.guardado, false);
  assert.strictEqual(bloqueado.confirmado, false);
  assert.strictEqual(inserts, 0);

  const otra = await sesion.entrarConversacion({
    registro,
    hilo: "u|c|592",
    owner: "wh:wamid.otra",
    esperarMs: 0,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(otra.guardado, true);
  assert.strictEqual(inserts, 1);

  let borrados = 0;
  const rechazado = await sesion.ejecutarBajoSesion({
    clave: "archivos/whatsapp/u/foto.jpg",
    sesion: limpieza,
    borrarObjeto: async () => {
      borrados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(rechazado.motivo, "marca_no_verificada");
  assert.strictEqual(rechazado.eliminado, false);
  assert.strictEqual(rechazado.storage, false);
  assert.strictEqual(rechazado.reintentar, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(registro.porHilo.has("u|c|591"), true);
  const durante = await sesion.entrarConversacion({
    registro,
    hilo: "u|c|591",
    owner: "wh:wamid.durante",
    esperarMs: 0,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(durante.status, 503);
  assert.strictEqual(inserts, 1);
  await limpieza.cerrar();

  const duplicado = await sesion.entrarConversacion({
    registro,
    hilo: "u|c|591",
    owner: "wh:wamid.durante",
    esperarMs: 0,
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.duplicado, true);
  assert.strictEqual(inserts, 1);
  ok("storage lento mantiene la conversación y el duplicado sigue siendo 200");
}

async function testSesionSinMarcaNoBorra() {
  const registro = sesion.crearRegistroDePrueba();
  const limpieza = await sesion.abrirSesionDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  const marcas = marca.crearRegistroDePrueba();
  const durable = await marca.abrirMarcaDePrueba({
    registro: marcas,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  await durable.promoverABorrando();
  let borrados = 0;
  const borrarObjeto = async () => {
    borrados += 1;
    return { eliminado: true };
  };
  const sinMarca = await sesion.ejecutarBajoSesion({
    clave: "archivos/whatsapp/u/foto.jpg",
    sesion: limpieza,
    borrarObjeto,
  });
  assert.strictEqual(sinMarca.motivo, "marca_no_verificada");
  assert.strictEqual(sinMarca.storage, false);
  assert.strictEqual(borrados, 0);
  const conMarca = await sesion.ejecutarBajoSesion({
    clave: "archivos/whatsapp/u/foto.jpg",
    sesion: limpieza,
    marca: durable,
    borrarObjeto,
  });
  assert.strictEqual(conMarca.motivo, "sesion_dedicada_no_disponible");
  assert.strictEqual(conMarca.eliminado, false);
  assert.strictEqual(conMarca.reintentar, false);
  assert.strictEqual(borrados, 0);
  assert.strictEqual(marcas.porHilo.get("u|c|591").estado, "borrando");
  assert.strictEqual(sesion.abrirSesionDedicada().disponible, false);
  ok("sesión sin marca o sin conexión dedicada no ejecuta el borrado");
}

async function testConexionPerdida() {
  const clave = "archivos/whatsapp/u/foto.jpg";
  const registro = sesion.crearRegistroDePrueba();
  const antes = await sesion.abrirSesionDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  registro.cortar(antes.conexionId);
  let llamados = 0;
  const noToca = await sesion.ejecutarBajoSesion({
    clave,
    sesion: antes,
    borrarObjeto: async () => {
      llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(noToca.motivo, "marca_no_verificada");
  assert.strictEqual(noToca.storage, false);
  assert.strictEqual(llamados, 0);

  const registro2 = sesion.crearRegistroDePrueba();
  const durante = await sesion.abrirSesionDePrueba({
    registro: registro2,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  let vistos = 0;
  const incierto = await sesion.ejecutarBajoSesion({
    clave,
    sesion: durante,
    borrarObjeto: async () => {
      vistos += 1;
      registro2.cortar(durante.conexionId);
      return { eliminado: true };
    },
  });
  assert.strictEqual(incierto.motivo, "marca_no_verificada");
  assert.strictEqual(incierto.reintentar, false);
  assert.strictEqual(incierto.eliminado, false);
  const ciego = await sesion.ejecutarBajoSesion({
    clave,
    sesion: durante,
    borrarObjeto: async () => {
      vistos += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(ciego.motivo, "marca_no_verificada");
  assert.strictEqual(ciego.reintentar, false);
  assert.strictEqual(vistos, 0);
  registro2.cortar(durante.conexionId);
  let colado = 0;
  const entro = await sesion.entrarConversacion({
    registro: registro2,
    hilo: "u|c|591",
    owner: "wh:wamid.colado",
    esperarMs: 0,
    persistir: async () => {
      colado += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(entro.guardado, true);
  assert.strictEqual(colado, 1);
  ok("conexión perdida antes no borra; durante queda incierto y el candado de sesión ya no frena al webhook");
}

async function main() {
  testNoHayConexionReal();
  await testStorageLentoNoDejaEntrarAlWebhook();
  await testSesionSinMarcaNoBorra();
  await testConexionPerdida();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
