/**
 * Backfill M1 con HTTP simulado. No abre red ni llama a Supabase.
 *
 * Ejecutar: node tests/limpiezaMediaBackfillM1.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const backfill = require("../scripts/limpieza-media-backfill-m1");

const URL = "https://ejemplo.invalid";
const DESTINO = `${URL}/rest/v1/rpc/${backfill.RPC}`;

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function lote(parcial) {
  return {
    ok: true,
    motivo: "lote",
    procesados: 20,
    actualizados: 20,
    pendientes: 0,
    agotado: false,
    ...parcial,
  };
}

function clienteDe(respuestas) {
  const llamadas = [];
  let enVuelo = 0;
  const cliente = {
    async post(url, body, config) {
      if (enVuelo > 0) throw new Error("llamada solapada");
      enVuelo += 1;
      llamadas.push({ url, body, config });
      const respuesta = respuestas[llamadas.length - 1];
      enVuelo -= 1;
      if (!respuesta) throw new Error("sin respuesta simulada");
      if (respuesta.error) throw respuesta.error;
      return { status: respuesta.status || 200, data: respuesta.data };
    },
  };
  return { cliente, llamadas };
}

function errorHttp(status) {
  const error = new Error(`status ${status}`);
  error.response = { status, data: { message: "fallo" } };
  return error;
}

function errorTimeout() {
  const error = new Error("timeout of 30000ms exceeded");
  error.code = "ECONNABORTED";
  return error;
}

async function correr(opciones) {
  const escritas = [];
  const pausas = [];
  const resultado = await backfill.ejecutarBackfillM1({
    url: URL,
    key: "clave-de-prueba",
    escribirLinea(texto) {
      escritas.push(texto);
    },
    dormir(ms) {
      pausas.push(ms);
      return Promise.resolve();
    },
    ...opciones,
  });
  return { resultado, escritas, pausas };
}

function assertPedido(llamada) {
  assert.strictEqual(llamada.url, DESTINO);
  assert.deepStrictEqual(llamada.body, { p_lote: 20 });
  assert.strictEqual(llamada.config.timeout, backfill.TIMEOUT_MS);
  assert.strictEqual(llamada.config.headers.apikey, "clave-de-prueba");
  assert.strictEqual(llamada.config.headers.Authorization, "Bearer clave-de-prueba");
  assert.strictEqual(llamada.config.headers["Content-Type"], "application/json");
  assert.strictEqual(Object.keys(llamada.config.headers).length, 3);
}

function assertRegistro(escritas, lineas) {
  assert.strictEqual(escritas.length, lineas.length);
  escritas.forEach((texto, indice) => {
    assert.deepStrictEqual(JSON.parse(texto), lineas[indice]);
  });
}

async function sinConfirmarNoAbreRed() {
  let llamadas = 0;
  const cliente = {
    async post() {
      llamadas += 1;
      throw new Error("red");
    },
  };
  const { resultado, pausas } = await correr({ confirmar: false, cliente });
  assert.strictEqual(llamadas, 0);
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.red, false);
  assert.strictEqual(resultado.motivo, "sin_confirmar");
  assert.strictEqual(resultado.llamadas, 0);
  assert.deepStrictEqual(pausas, []);
  ok("sin --confirmar no abre red");
}

async function sinCredencialesNoLlama() {
  let llamadas = 0;
  const cliente = {
    async post() {
      llamadas += 1;
      throw new Error("red");
    },
  };
  const sinUrl = await correr({ confirmar: true, cliente, url: "" });
  const sinClave = await correr({ confirmar: true, cliente, key: "" });
  const sinCliente = await backfill.ejecutarBackfillM1({
    confirmar: true,
    url: URL,
    key: "clave-de-prueba",
  });
  assert.strictEqual(llamadas, 0);
  assert.strictEqual(sinUrl.resultado.codigo, 1);
  assert.strictEqual(sinUrl.resultado.motivo, "sin_supabase");
  assert.strictEqual(sinUrl.resultado.red, false);
  assert.strictEqual(sinClave.resultado.motivo, "sin_supabase");
  assert.strictEqual(sinCliente.codigo, 1);
  assert.strictEqual(sinCliente.motivo, "sin_cliente");
  assert.strictEqual(sinCliente.red, false);
  ok("sin credenciales o sin cliente no llama");
}

async function seDetieneAlAgotarse() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 20, actualizados: 18, pendientes: 40, agotado: false }) },
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 15, agotado: false }) },
    { data: lote({ procesados: 15, actualizados: 15, pendientes: 0, agotado: true }) },
  ]);
  const { resultado, escritas, pausas } = await correr({
    confirmar: true,
    cliente,
    url: `${URL}/`,
  });
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.motivo, "agotado");
  assert.strictEqual(resultado.red, true);
  assert.strictEqual(llamadas.length, 3);
  llamadas.forEach(assertPedido);
  assert.deepStrictEqual(pausas, [1000, 1000]);
  assert.strictEqual(resultado.lineas[0].paro, null);
  assert.strictEqual(resultado.lineas[0].http, 200);
  assert.strictEqual(resultado.lineas[0].procesados, 20);
  assert.strictEqual(resultado.lineas[0].actualizados, 18);
  assert.strictEqual(resultado.lineas[0].pendientes, 40);
  assert.strictEqual(resultado.lineas[0].agotado, false);
  assert.strictEqual(resultado.lineas[2].paro, "agotado");
  assert.strictEqual(resultado.lineas[2].pendientes, 0);
  assert.ok(Number.isInteger(resultado.lineas[0].duracion_ms));
  assert.ok(resultado.lineas[0].ts.includes("T"));
  assertRegistro(escritas, resultado.lineas);
  ok("se detiene cuando agotado es true y pendientes es 0");
}

async function unErrorNoSeReintenta(nombre, respuesta, paro) {
  const { cliente, llamadas } = clienteDe([respuesta, { data: lote({ agotado: true }) }]);
  const { resultado, pausas } = await correr({ confirmar: true, cliente });
  assert.strictEqual(llamadas.length, 1);
  assertPedido(llamadas[0]);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, paro);
  assert.strictEqual(resultado.lineas[0].paro, paro);
  assert.deepStrictEqual(pausas, []);
  ok(nombre);
}

async function erroresSinReintento() {
  await unErrorNoSeReintenta(
    "un HTTP 500 detiene el proceso sin reintento",
    { error: errorHttp(500) },
    "error_http"
  );
  const http = await correr({
    confirmar: true,
    cliente: clienteDe([{ error: errorHttp(500) }]).cliente,
  });
  assert.strictEqual(http.resultado.lineas[0].http, 500);
  assert.strictEqual(http.resultado.lineas[0].ok, null);

  await unErrorNoSeReintenta(
    "un timeout detiene el proceso sin reintento",
    { error: errorTimeout() },
    "timeout"
  );
  await unErrorNoSeReintenta(
    "ok false detiene el proceso sin reintento",
    {
      data: {
        ok: false,
        motivo: "lote_invalido",
        procesados: 0,
        actualizados: 0,
        pendientes: null,
        agotado: false,
      },
    },
    "respuesta_invalida"
  );
  await unErrorNoSeReintenta(
    "un cuerpo ilegible detiene el proceso sin reintento",
    { data: "no-json" },
    "respuesta_invalida"
  );
  await unErrorNoSeReintenta(
    "un motivo distinto de lote detiene el proceso sin reintento",
    { data: lote({ motivo: "otro" }) },
    "respuesta_invalida"
  );
}

async function cincoBloqueosDetienen() {
  const { cliente, llamadas } = clienteDe(
    Array.from({ length: 6 }, () => ({
      data: lote({ procesados: 0, actualizados: 0, pendientes: 50, agotado: false }),
    }))
  );
  const { resultado, pausas } = await correr({ confirmar: true, cliente });
  assert.strictEqual(llamadas.length, 5);
  llamadas.forEach(assertPedido);
  assert.deepStrictEqual(pausas, [5000, 5000, 5000, 5000]);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "filas_bloqueadas");
  assert.strictEqual(resultado.lineas[4].paro, "filas_bloqueadas");
  assert.strictEqual(resultado.lineas[3].paro, null);
  ok("la quinta respuesta seguida con filas bloqueadas detiene el proceso");
}

async function elBloqueoSeReinicia() {
  const bloqueo = { data: lote({ procesados: 0, actualizados: 0, pendientes: 100, agotado: false }) };
  const respuestas = [
    bloqueo,
    bloqueo,
    bloqueo,
    bloqueo,
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 80, agotado: false }) },
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 80, agotado: false }) },
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 80, agotado: false }) },
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 80, agotado: false }) },
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 80, agotado: false }) },
    { data: lote({ procesados: 20, actualizados: 10, pendientes: 0, agotado: true }) },
  ];
  const { cliente, llamadas } = clienteDe(respuestas);
  const { resultado, pausas } = await correr({ confirmar: true, cliente });
  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.motivo, "agotado");
  assert.strictEqual(llamadas.length, 10);
  assert.deepStrictEqual(pausas, [5000, 5000, 5000, 5000, 1000, 5000, 5000, 5000, 5000]);
  ok("un lote con avance reinicia el conteo de filas bloqueadas");
}

async function pendientesQueSubenParan() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 5, actualizados: 5, pendientes: 10, agotado: false }) },
    { data: lote({ procesados: 1, actualizados: 1, pendientes: 11, agotado: false }) },
    { data: lote({ agotado: true }) },
  ]);
  const { resultado, pausas } = await correr({ confirmar: true, cliente });
  assert.strictEqual(llamadas.length, 2);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "pendientes_aumento");
  assert.deepStrictEqual(pausas, [1000]);
  ok("si pendientes sube, el proceso se detiene");
}

async function bajadaInsuficientePara() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 10, actualizados: 10, pendientes: 30, agotado: false }) },
    { data: lote({ procesados: 10, actualizados: 10, pendientes: 25, agotado: false }) },
    { data: lote({ agotado: true }) },
  ]);
  const { resultado } = await correr({ confirmar: true, cliente });
  assert.strictEqual(llamadas.length, 2);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "bajada_insuficiente");
  ok("si pendientes baja menos que procesados, el proceso se detiene");
}

async function agotadoInconsistentePara() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 0, actualizados: 0, pendientes: 4, agotado: true }) },
  ]);
  const { resultado, pausas } = await correr({ confirmar: true, cliente });
  assert.strictEqual(llamadas.length, 1);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "agotado_inconsistente");
  assert.deepStrictEqual(pausas, []);
  ok("agotado con pendientes distintos de 0 se trata como error");
}

async function elTopeDeLlamadasPara() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 40, agotado: false }) },
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 20, agotado: false }) },
    { data: lote({ agotado: true }) },
  ]);
  const { resultado, pausas } = await correr({
    confirmar: true,
    cliente,
    topeLlamadas: 2,
  });
  assert.strictEqual(llamadas.length, 2);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "tope_llamadas");
  assert.strictEqual(resultado.lineas[1].paro, "tope_llamadas");
  assert.deepStrictEqual(pausas, [1000]);
  assert.strictEqual(backfill.TOPE_LLAMADAS, 1800);
  ok("al llegar al tope de llamadas no se hace otra");
}

async function unRegistroRotoNoSigue() {
  const { cliente, llamadas } = clienteDe([
    { data: lote({ procesados: 20, actualizados: 20, pendientes: 20, agotado: false }) },
    { data: lote({ agotado: true }) },
  ]);
  const { resultado } = await correr({
    confirmar: true,
    cliente,
    escribirLinea() {
      throw new Error("disco");
    },
  });
  assert.strictEqual(llamadas.length, 1);
  assert.strictEqual(resultado.codigo, 1);
  assert.strictEqual(resultado.motivo, "registro_fallo");
  ok("si el registro falla, no hay otra llamada");
}

async function laSegundaEsperaALaPrimera() {
  let resolverPrimera;
  let primeraTermino = false;
  let segundaInicio = false;
  let llamadas = 0;
  const cliente = {
    post(url, body, config) {
      llamadas += 1;
      assert.strictEqual(url, DESTINO);
      assert.deepStrictEqual(body, { p_lote: 20 });
      assert.strictEqual(config.headers.apikey, "clave-de-prueba");
      if (llamadas === 1) {
        return new Promise((resolver) => {
          resolverPrimera = () => {
            primeraTermino = true;
            resolver({
              status: 200,
              data: lote({ procesados: 20, actualizados: 20, pendientes: 20, agotado: false }),
            });
          };
        });
      }
      assert.strictEqual(primeraTermino, true);
      segundaInicio = true;
      return Promise.resolve({
        status: 200,
        data: lote({ procesados: 20, actualizados: 20, pendientes: 0, agotado: true }),
      });
    },
  };
  const promesa = correr({ confirmar: true, cliente });
  await new Promise((resolver) => setImmediate(resolver));
  assert.strictEqual(llamadas, 1);
  assert.strictEqual(segundaInicio, false);
  resolverPrimera();
  const { resultado, pausas } = await promesa;
  assert.strictEqual(segundaInicio, true);
  assert.strictEqual(llamadas, 2);
  assert.strictEqual(resultado.codigo, 0);
  assert.deepStrictEqual(pausas, [1000]);
  ok("la segunda llamada empieza después de que la primera responde");
}

function contratoEstatico() {
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/limpieza-media-backfill-m1.js"),
    "utf8"
  );
  const servicio = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
    "utf8"
  );
  const ignore = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8");
  const migracion = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_ultimo_entrante_en.sql"),
    "utf8"
  );
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");

  assert.ok(ignore.split(/\r?\n/).includes("tmp/backfill-m1/"));
  assert.ok(servicio.includes("const ELIMINACION_REAL_BLOQUEADA = true;"));
  assert.ok(!servicio.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.ok(!script.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.ok(!script.includes("limpiezaMediaEliminar"));
  assert.ok(!script.includes("routes/webhook"));
  assert.ok(!script.includes("supabase.co"));
  assert.ok(script.includes("limpieza_media_backfill_ultimo_entrante"));
  assert.ok(!script.includes("limpieza_media_revalidar_lote"));
  assert.ok(migracion.includes("limpieza_media_backfill_ultimo_entrante"));
  assert.ok(webhook.length > 0);
  ok("el borrado real sigue bloqueado y este script no toca el webhook ni M1");
}

async function main() {
  await sinConfirmarNoAbreRed();
  await sinCredencialesNoLlama();
  await seDetieneAlAgotarse();
  await erroresSinReintento();
  await cincoBloqueosDetienen();
  await elBloqueoSeReinicia();
  await pendientesQueSubenParan();
  await bajadaInsuficientePara();
  await agotadoInconsistentePara();
  await elTopeDeLlamadasPara();
  await unRegistroRotoNoSigue();
  await laSegundaEsperaALaPrimera();
  contratoEstatico();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
