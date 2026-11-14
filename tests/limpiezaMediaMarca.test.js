/**
 * Marca sin vencimiento que sobrevive a la desconexión.
 * No abre Postgres ni Storage.
 * Ejecutar: node tests/limpiezaMediaMarca.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");
const sesion = require("../services/limpiezaMedia/limpiezaMediaSesion");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function testNoHayMarcaReal() {
  const real = marca.abrirMarcaReal();
  assert.strictEqual(real.disponible, false);
  assert.strictEqual(real.motivo, "marca_no_disponible");
  const src = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaMarca.js"),
    "utf8"
  );
  assert.ok(!src.includes("require(\"pg\")"));
  assert.ok(!src.includes("DATABASE_URL"));
  assert.ok(!src.includes("restaurarObjeto"));
  assert.ok(!src.includes("axios"));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("sin marca desplegada el archivo sigue protegido");
}

async function testLaSesionNoAutorizaElBorrado() {
  const registro = sesion.crearRegistroDePrueba();
  const candado = await sesion.abrirSesionDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  let llamados = 0;
  const plan = await eliminar.planificarEliminacion("archivos/whatsapp/u/foto.jpg", {
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato" }),
    abrirValla: async () => candado,
  });
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(plan.motivo, "proteccion_no_durable");
  const corrido = await eliminar.ejecutarBorradoSobrePlan(
    { eliminar: true, valla: candado, entranteMs: 1000 },
    "archivos/whatsapp/u/foto.jpg",
    {
      borrarObjeto: async () => {
        llamados += 1;
        return { eliminado: true };
      },
    }
  );
  assert.strictEqual(corrido.motivo, "proteccion_no_durable");
  assert.strictEqual(corridosStorage(corrido), false);
  assert.strictEqual(llamados, 0);
  ok("el candado de sesión no autoriza el DELETE");
}

function corridosStorage(resultado) {
  return resultado.storage === true;
}

async function testMarcaCubreTodaLaLlamada() {
  const registro = marca.crearRegistroDePrueba();
  const limpieza = await marca.abrirMarcaDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  assert.ok(!registro.porHilo.get("u|c|591").locked_until);
  let inserts = 0;
  const http = marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/foto.jpg",
    marca: limpieza,
    borrarObjeto: () => new Promise((resolver) => setTimeout(() => resolver({ eliminado: true }), 40)),
  });
  const bloqueado = await marca.entrarConversacion({
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
  assert.strictEqual(bloqueado.confirmado, false);
  assert.strictEqual(inserts, 0);
  const otra = await marca.entrarConversacion({
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
  const espera = marca.entrarConversacion({
    registro,
    hilo: "u|c|591",
    owner: "wh:wamid.espera",
    esperarMs: 200,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  const hecho = await http;
  const entro = await espera;
  assert.strictEqual(hecho.motivo, "eliminado");
  assert.strictEqual(hecho.incierto, false);
  assert.strictEqual(entro.guardado, true);
  assert.strictEqual(inserts, 2);
  const duplicado = await marca.entrarConversacion({
    registro,
    hilo: "u|c|591",
    owner: "wh:wamid.espera",
    esperarMs: 0,
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.duplicado, true);
  assert.strictEqual(inserts, 2);
  ok("la marca cubre toda la llamada, otra conversación sigue y el duplicado es 200");
}

async function testPerdidaAntesYDurante() {
  const clave = "archivos/whatsapp/u/nota.jpg";
  const registro = marca.crearRegistroDePrueba();
  const antes = await marca.abrirMarcaDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  antes.promoverABorrando = async () => ({ ok: false });
  let llamados = 0;
  const noToca = await marca.ejecutarBajoMarca({
    clave,
    marca: antes,
    borrarObjeto: async () => {
      llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(noToca.motivo, "conexion_perdida");
  assert.strictEqual(noToca.storage, false);
  assert.strictEqual(llamados, 0);
  assert.strictEqual(registro.porHilo.has("u|c|591"), false);

  const registro2 = marca.crearRegistroDePrueba();
  const durante = await marca.abrirMarcaDePrueba({
    registro: registro2,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  const confirmar = durante.confirmar.bind(durante);
  let fase = "antes";
  durante.confirmar = async (estado) => {
    if (fase === "despues") throw new Error("conexion perdida");
    return confirmar(estado);
  };
  let vistos = 0;
  const incierto = await marca.ejecutarBajoMarca({
    clave,
    marca: durante,
    borrarObjeto: async () => {
      vistos += 1;
      fase = "despues";
      registro2.cortar();
      return { eliminado: true };
    },
  });
  assert.strictEqual(incierto.motivo, "resultado_incierto");
  assert.strictEqual(incierto.reintentar, false);
  assert.strictEqual(incierto.eliminado, false);
  assert.strictEqual(registro2.porHilo.get("u|c|591").estado, "borrando");
  let colado = 0;
  const bloqueado = await marca.entrarConversacion({
    registro: registro2,
    hilo: "u|c|591",
    owner: "wh:wamid.durante",
    esperarMs: 0,
    persistir: async () => {
      colado += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(bloqueado.status, 503);
  assert.strictEqual(colado, 0);
  const ciego = await marca.ejecutarBajoMarca({
    clave,
    marca: durante,
    borrarObjeto: async () => {
      vistos += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(ciego.motivo, "resultado_incierto");
  assert.strictEqual(ciego.reintentar, false);
  assert.strictEqual(vistos, 1);

  const real = await eliminar.eliminarSoloObjetoStorage(clave, {
    cliente: { delete: async () => ({ status: 200 }) },
  });
  assert.strictEqual(real.motivo, "bloqueada");
  assert.strictEqual(real.storage, false);
  ok("antes no borra; durante queda incierto, el webhook no entra y no hay segundo DELETE");
}

async function testVallaVencidaNoLlegaAStorage() {
  const registro = marca.crearRegistroDePrueba();
  const sesion = await marca.abrirMarcaDePrueba({
    registro,
    hilo: "u|c|591",
    owner: "cl:w1",
    entranteMs: 1000,
  });
  sesion.asegurarVigencia = async () => ({ ok: false, motivo: "valla_perdida" });
  let storage = 0;
  const perdido = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/foto.jpg",
    marca: sesion,
    borrarObjeto: async () => {
      storage += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(perdido.motivo, "resultado_incierto");
  assert.strictEqual(perdido.reintentar, false);
  assert.strictEqual(storage, 0);
  assert.strictEqual(registro.porHilo.get("u|c|591").estado, "borrando");
  assert.strictEqual(registro.porHilo.get("u|c|591").resultado, "incierto");
  ok("una valla perdida antes de storage no borra y no se libera");
}

async function abrir(estado, hilo) {
  const registro = marca.crearRegistroDePrueba();
  const valla = await marca.abrirMarcaDePrueba({
    registro,
    hilo,
    owner: "cl:w1",
    entranteMs: 1,
  });
  if (estado === "borrando") await valla.promoverABorrando();
  return { registro, valla };
}

async function testDeleteDirectoYConfirmacion() {
  marca.olvidarMemoriaDeProceso();
  const clave = "archivos/whatsapp/u/foto.jpg";
  const cliente = {
    llamadas: [],
    async delete(url) {
      this.llamadas.push(url);
      return { status: 200 };
    },
  };
  const base = { url: "https://proj.supabase.co", cliente };

  const sinMarca = await eliminar.borrarObjetoStorage(clave, base);
  assert.strictEqual(sinMarca.motivo, "marca_no_verificada");
  assert.strictEqual(sinMarca.eliminado, false);
  assert.strictEqual(sinMarca.storage, false);

  const reservada = await abrir("reservado", "u|c|591");
  const conReserva = await eliminar.borrarObjetoStorage(clave, { ...base, marca: reservada.valla });
  assert.strictEqual(conReserva.motivo, "marca_no_borrando");
  assert.strictEqual(conReserva.storage, false);
  assert.strictEqual(reservada.registro.porHilo.get("u|c|591").estado, "reservado");

  const borrando = await abrir("borrando", "u|c|592");
  const conBorrando = await eliminar.borrarObjetoStorage(clave, { ...base, marca: borrando.valla });
  assert.strictEqual(conBorrando.motivo, "bloqueada");
  assert.strictEqual(conBorrando.eliminado, false);
  assert.strictEqual(conBorrando.storage, false);
  assert.strictEqual(borrando.registro.porHilo.get("u|c|592").estado, "borrando");
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  assert.strictEqual(cliente.llamadas.length, 0);

  const srcEliminar = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaEliminar.js"),
    "utf8"
  );
  const verifica = srcEliminar.indexOf("verificarMarcaBorrando");
  const bloqueo = srcEliminar.indexOf('motivo: "bloqueada"');
  const deleteAt = srcEliminar.indexOf("cliente.delete");
  assert.ok(verifica >= 0 && verifica < deleteAt);
  assert.ok(bloqueo > verifica && bloqueo < deleteAt);

  const vivo = await abrir("reservado", "u|c|700");
  let llamados = 0;
  const sinEvidencia = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/vivo.jpg",
    marca: vivo.valla,
    borrarObjeto: async () => {
      llamados += 1;
      return { eliminado: false, confirmado: true };
    },
  });
  assert.strictEqual(sinEvidencia.motivo, "resultado_incierto");
  assert.strictEqual(sinEvidencia.incierto, true);
  assert.strictEqual(sinEvidencia.reintentar, false);
  assert.strictEqual(llamados, 1);
  assert.strictEqual(vivo.registro.porHilo.get("u|c|700").estado, "borrando");
  assert.strictEqual(vivo.registro.porHilo.get("u|c|700").resultado, "incierto");
  const segundo = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/vivo.jpg",
    marca: vivo.valla,
    borrarObjeto: async () => {
      llamados += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(segundo.motivo, "resultado_incierto");
  assert.strictEqual(segundo.reintentar, false);
  assert.strictEqual(llamados, 1);

  marca.olvidarMemoriaDeProceso();
  const lento = await abrir("reservado", "u|c|701");
  let timeouts = 0;
  const caido = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/lento.jpg",
    marca: lento.valla,
    borrarObjeto: async () => {
      timeouts += 1;
      const error = new Error("timeout");
      error.code = "ECONNABORTED";
      throw error;
    },
  });
  assert.strictEqual(caido.motivo, "resultado_incierto");
  assert.strictEqual(caido.reintentar, false);
  assert.strictEqual(timeouts, 1);
  assert.strictEqual(lento.registro.porHilo.get("u|c|701").estado, "borrando");
  assert.strictEqual(lento.registro.porHilo.get("u|c|701").resultado, "incierto");
  const repetido = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/lento.jpg",
    marca: lento.valla,
    borrarObjeto: async () => {
      timeouts += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(repetido.motivo, "resultado_incierto");
  assert.strictEqual(timeouts, 1);

  marca.olvidarMemoriaDeProceso();
  const ausente = await abrir("reservado", "u|c|702");
  const ido = await marca.ejecutarBajoMarca({
    clave: "archivos/whatsapp/u/ausente.jpg",
    marca: ausente.valla,
    borrarObjeto: async () => ({ eliminado: false, confirmado: true, status: 404 }),
  });
  assert.strictEqual(ido.motivo, "eliminado");
  assert.strictEqual(ido.incierto, false);
  assert.strictEqual(ausente.registro.porHilo.has("u|c|702"), false);

  const httpError = marca.clasificarResultadoStorage({
    eliminado: false,
    confirmado: true,
    status: 500,
  });
  assert.strictEqual(httpError, "incierto");
  assert.strictEqual(marca.clasificarResultadoStorage({ eliminado: false, confirmado: true }), "incierto");
  assert.strictEqual(marca.clasificarResultadoStorage({ eliminado: true, status: 200 }), "eliminado_confirmado");
  ok("el DELETE directo exige borrando, y un confirmado sin evidencia no suelta la marca");
}

async function main() {
  testNoHayMarcaReal();
  await testLaSesionNoAutorizaElBorrado();
  await testMarcaCubreTodaLaLlamada();
  await testPerdidaAntesYDurante();
  await testVallaVencidaNoLlegaAStorage();
  await testDeleteDirectoYConfirmacion();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
