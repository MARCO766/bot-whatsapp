/**
 * Persistencia/validación — indicador de escritura + demora por conexión.
 * Ejecutar: node tests/conexionRespuestaTimingConfig.test.js
 */
const assert = require("assert");
const {
  DEMORA_SEGUNDOS_DEFAULT,
  DEMORA_SEGUNDOS_MAX,
  DEMORA_SEGUNDOS_MIN,
  DEFAULTS,
  mapTimingToApi,
  parseDemoraSegundos,
  readTimingFromRow,
  resolveTimingForSave,
} = require("../services/conexionRespuestaTimingConfig");
const { mapConexionApi } = require("../services/conexionesWhatsappService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function expectThrow(fn, re) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    assert.strictEqual(err.status, 400);
    if (re) assert.match(String(err.message), re);
  }
  assert.ok(threw, "debía lanzar error 400");
}

function testDefaultsFilaAntigua() {
  const t = readTimingFromRow({
    id: "c1",
    token: "x",
    phone_id: "p",
  });
  assert.deepStrictEqual(t, { ...DEFAULTS });
  assert.strictEqual(t.indicador_escritura, false);
  assert.strictEqual(t.demora_respuesta_activa, false);
  assert.strictEqual(t.demora_respuesta_segundos, DEMORA_SEGUNDOS_DEFAULT);
  ok("conexión antigua sin campos → OFF + 3s sugeridos");
}

function testMapConexionApiDefaults() {
  const api = mapConexionApi({
    id: "uuid-1",
    nombre: "Ventas",
    numero: "591",
    token: "EAAlongtokenvalue",
    phone_id: "123",
    pixel_id: null,
    capi_token: null,
    activo: true,
  });
  assert.strictEqual(api.indicador_escritura, false);
  assert.strictEqual(api.indicadorEscritura, false);
  assert.strictEqual(api.demora_respuesta_activa, false);
  assert.strictEqual(api.demoraRespuestaActiva, false);
  assert.strictEqual(api.demora_respuesta_segundos, 3);
  assert.strictEqual(api.demoraRespuestaSegundos, 3);
  ok("mapConexionApi expone defaults seguros sin columnas nuevas");
}

function testMapConexionApiValoresGuardados() {
  const api = mapTimingToApi({
    indicador_escritura: true,
    demora_respuesta_activa: true,
    demora_respuesta_segundos: 12,
  });
  assert.strictEqual(api.indicador_escritura, true);
  assert.strictEqual(api.demora_respuesta_activa, true);
  assert.strictEqual(api.demora_respuesta_segundos, 12);
  ok("mapTimingToApi refleja valores persistidos");
}

function testDemoraLimitesValidos() {
  assert.strictEqual(parseDemoraSegundos(1), 1);
  assert.strictEqual(parseDemoraSegundos(60), 60);
  assert.strictEqual(parseDemoraSegundos("3"), 3);
  ok("demora acepta 1, 60 y string entero");
}

function testDemoraRechazaInvalidos() {
  expectThrow(() => parseDemoraSegundos(0), /entre/);
  expectThrow(() => parseDemoraSegundos(61), /entre/);
  expectThrow(() => parseDemoraSegundos(-1), /entre/);
  expectThrow(() => parseDemoraSegundos(3.5), /entero|decimales/i);
  expectThrow(() => parseDemoraSegundos("3.5"), /entero|decimales/i);
  expectThrow(() => parseDemoraSegundos("abc"), /entero|decimales/i);
  expectThrow(() => parseDemoraSegundos(true), /entero/);
  expectThrow(() => parseDemoraSegundos(""), /obligatorio|entero|entre/i);
  ok("demora rechaza 0, 61, negativos, decimales y no numéricos");
}

function testResolveConservaSiBodyNoTraeTiming() {
  const saved = resolveTimingForSave(
    { nombre: "X", phone_id: "1", token: "t" },
    {
      indicador_escritura: true,
      demora_respuesta_activa: true,
      demora_respuesta_segundos: 9,
    }
  );
  assert.deepStrictEqual(saved, {
    indicador_escritura: true,
    demora_respuesta_activa: true,
    demora_respuesta_segundos: 9,
  });
  ok("guardar sin campos timing conserva la fila (no pisa otra config)");
}

function testResolveBodySobrescribe() {
  const saved = resolveTimingForSave(
    {
      indicador_escritura: false,
      demora_respuesta_activa: true,
      demora_respuesta_segundos: 5,
    },
    {
      indicador_escritura: true,
      demora_respuesta_activa: false,
      demora_respuesta_segundos: 3,
    }
  );
  assert.deepStrictEqual(saved, {
    indicador_escritura: false,
    demora_respuesta_activa: true,
    demora_respuesta_segundos: 5,
  });
  ok("body válido sobrescribe timing de la conexión");
}

function testResolveCamelCase() {
  const saved = resolveTimingForSave(
    {
      indicadorEscritura: true,
      demoraRespuestaActiva: false,
      demoraRespuestaSegundos: 20,
    },
    null
  );
  assert.strictEqual(saved.indicador_escritura, true);
  assert.strictEqual(saved.demora_respuesta_activa, false);
  assert.strictEqual(saved.demora_respuesta_segundos, 20);
  ok("acepta alias camelCase del frontend");
}

function testDosConexionesIndependientes() {
  const a = readTimingFromRow({
    id: "a",
    indicador_escritura: true,
    demora_respuesta_activa: true,
    demora_respuesta_segundos: 10,
  });
  const b = readTimingFromRow({
    id: "b",
    indicador_escritura: false,
    demora_respuesta_activa: false,
    demora_respuesta_segundos: 3,
  });
  assert.notDeepStrictEqual(a, b);
  const a2 = resolveTimingForSave(
    { demora_respuesta_segundos: 15 },
    { id: "a", ...a }
  );
  assert.strictEqual(a2.demora_respuesta_segundos, 15);
  assert.strictEqual(b.demora_respuesta_segundos, 3);
  ok("config de una conexión no altera la lectura de otra");
}

function testDemoraInactivaAunValidaSegundosSiSeEnvian() {
  expectThrow(
    () =>
      resolveTimingForSave(
        {
          demora_respuesta_activa: false,
          demora_respuesta_segundos: 99,
        },
        null
      ),
    /entre/
  );
  ok("segundos inválidos se rechazan aunque la demora esté OFF");
}

function testMinMaxConstantes() {
  assert.strictEqual(DEMORA_SEGUNDOS_MIN, 1);
  assert.strictEqual(DEMORA_SEGUNDOS_MAX, 60);
  assert.strictEqual(DEMORA_SEGUNDOS_DEFAULT, 3);
  ok("constantes de rango alineadas al requisito");
}

testDefaultsFilaAntigua();
testMapConexionApiDefaults();
testMapConexionApiValoresGuardados();
testDemoraLimitesValidos();
testDemoraRechazaInvalidos();
testResolveConservaSiBodyNoTraeTiming();
testResolveBodySobrescribe();
testResolveCamelCase();
testDosConexionesIndependientes();
testDemoraInactivaAunValidaSegundosSiSeEnvian();
testMinMaxConstantes();

console.log(`\n${passed} tests OK`);
