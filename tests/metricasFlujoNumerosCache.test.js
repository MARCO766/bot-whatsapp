/**
 * Caché de fetchFlujoClienteNumeros. No toca Supabase: axios queda sustituido.
 * Ejecutar: node --test tests/metricasFlujoNumerosCache.test.js
 */
const assert = require("assert");
const test = require("node:test");
const axios = require("axios");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-key";

const {
  computeDiagnostico,
  computeResumen,
  computeSeries,
  fetchFlujoClienteNumeros,
} = require("../services/metricasService");

const USER = "user-uno";
const USER_2 = "user-dos";
const FLOW = "flujo-a";
const FLOW_B = "flujo-b";
const LINE_A = "linea-a";
const LINE_B = "linea-b";

const originalGet = axios.get;
const originalPost = axios.post;

const calls = [];
const TABLAS_NUMEROS = [
  "/seguimientos_programados",
  "/crm_conversiones",
  "/ia_sessions",
];

const state = {
  failTables: null,
  resolver: null,
  clientesFor: null,
  conexiones: [{ id: LINE_A }, { id: LINE_B }],
  rpcLeads: 4,
  onIa: null,
  numerosEnTodasLasTablas: false,
};

function eqParam(url, name) {
  const match = String(url).match(new RegExp(`${name}=eq\\.([^&]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function inList(url) {
  const marker = "numero=in.(";
  const start = String(url).indexOf(marker);
  if (start < 0) return null;
  const end = String(url).indexOf(")", start);
  if (end < 0) return [];
  return decodeURIComponent(String(url).slice(start + marker.length, end))
    .split(",")
    .filter(Boolean);
}

function rows(data) {
  const list = Array.isArray(data) ? data : [];
  return {
    data: list,
    headers: { "content-range": `*/${list.length}` },
  };
}

function counted(n) {
  return { data: [], headers: { "content-range": `*/${n}` } };
}

function isNumerosQuery(url) {
  return (
    url.includes("select=cliente_numero") &&
    (url.includes("/seguimientos_programados") ||
      url.includes("/crm_conversiones") ||
      url.includes("/ia_sessions"))
  );
}

function iaCalls() {
  return calls.filter((call) => call.url.includes("/ia_sessions"));
}

function numerosCalls(tabla) {
  return calls.filter((call) => isNumerosQuery(call.url) && call.url.includes(tabla));
}

function leadRows(numeros) {
  const ahora = new Date().toISOString();
  return numeros.map((numero, index) => ({
    id: `cli-${index}-${numero}`,
    numero,
    creado_en: ahora,
  }));
}

function sumLeads(series) {
  return (series.diario || []).reduce((total, day) => total + (Number(day.leads) || 0), 0);
}

function conPlazo(promise, ms, mensaje) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(mensaje)), ms);
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

function installStub() {
  axios.get = async (url, config) => {
    const target = String(url);
    calls.push({ url: target, method: "GET" });
    if (state.onIa && target.includes("/ia_sessions")) {
      await state.onIa(target);
    }
    if (state.failTables && isNumerosQuery(target)) {
      const table = ["/seguimientos_programados", "/crm_conversiones", "/ia_sessions"].find((name) =>
        target.includes(name)
      );
      if (state.failTables.has(table)) {
        throw new Error(`fallo simulado ${table}`);
      }
    }
    if (isNumerosQuery(target)) {
      const numeros = state.resolver
        ? state.resolver({
            user: eqParam(target, "usuario_id"),
            flow: eqParam(target, "flujo_id"),
            conn: eqParam(target, "conexion_whatsapp_id"),
            url: target,
          })
        : ["591111", "591222"];
      const source =
        state.numerosEnTodasLasTablas || target.includes("/seguimientos_programados")
          ? numeros
          : [];
      return rows(source.map((cliente_numero) => ({ cliente_numero })));
    }
    if (target.includes("/clientes") && target.includes("numero=in.(")) {
      return counted(inList(target).length);
    }
    if (target.includes("/clientes")) {
      const numeros = state.clientesFor
        ? state.clientesFor({ user: eqParam(target, "usuario_id") })
        : ["591111", "591222"];
      return rows(leadRows(numeros));
    }
    if (target.includes("/conexiones_whatsapp") && target.includes("select=id")) {
      return rows(state.conexiones);
    }
    if (target.includes("/conversaciones") && target.includes("cliente_numero")) {
      return rows([{ cliente_numero: "591111" }, { cliente_numero: "591222" }]);
    }
    return rows([]);
  };
  axios.post = async (url) => {
    calls.push({ url: String(url), method: "POST" });
    return { data: state.rpcLeads, headers: {} };
  };
}

function restoreStub() {
  axios.get = originalGet;
  axios.post = originalPost;
}

function reset(extra = {}) {
  calls.length = 0;
  state.failTables = null;
  state.resolver = null;
  state.clientesFor = null;
  state.conexiones = [{ id: LINE_A }, { id: LINE_B }];
  state.rpcLeads = 4;
  state.onIa = null;
  state.numerosEnTodasLasTablas = false;
  Object.assign(state, extra);
}

test("caché de números de flujo en Métricas", async () => {
  installStub();
  try {
    await sinFlujo();
    await conFlujoUnaLinea();
    await todasLasLineas();
    await cambioRapido();
    await dosUsuarios();
    await separacionDeClave();
    await fallaDeSupabase();
    await arraysVaciosYCargaNueva();
    await fallaDeCache();
  } finally {
    restoreStub();
  }
});

async function sinFlujo() {
  reset();
  assert.deepEqual(await fetchFlujoClienteNumeros(USER, "", LINE_A), []);
  assert.deepEqual(await fetchFlujoClienteNumeros(USER, null, null), []);
  assert.equal(iaCalls().length, 0);

  reset({ conexiones: [{ id: LINE_A }] });
  const primero = await computeResumen(USER, { periodo: "7d", conexion_whatsapp_id: LINE_A });
  const serie = await computeSeries(USER, { periodo: "7d", conexion_whatsapp_id: LINE_A });
  assert.equal(primero.kpis.leads, 4);
  assert.equal(sumLeads(serie), 2);
  assert.equal(iaCalls().length, 0);

  const iaAntes = iaCalls().length;
  const segundo = await computeResumen(USER, { periodo: "7d", conexion_whatsapp_id: LINE_A });
  assert.deepEqual(segundo.kpis, primero.kpis);
  assert.equal(iaCalls().length, iaAntes);

  reset({ conexiones: [{ id: LINE_A }, { id: LINE_B }], rpcLeads: 4 });
  const todas = await computeResumen(USER, { periodo: "7d" });
  assert.equal(todas.kpis.leads, 8);
  assert.equal(iaCalls().length, 0);
  console.log("✓ sin flujo: no consulta números y Todas las líneas sigue sumando por línea");
}

async function conFlujoUnaLinea() {
  reset();
  const query = { periodo: "7d", flujo_id: FLOW, conexion_whatsapp_id: LINE_A };
  const [resumen, serie, diagnostico] = await Promise.all([
    computeResumen(USER, query),
    computeSeries(USER, query),
    computeDiagnostico(USER, query),
  ]);

  assert.equal(iaCalls().length, 1);
  assert.equal(resumen.kpis.leads, 2);
  assert.equal(sumLeads(serie), 2);
  assert.equal(diagnostico.ok, true);
  assert.equal(resumen.kpis.ventas, 0);
  assert.ok(iaCalls()[0].url.includes(`flujo_id=eq.${FLOW}`));
  assert.ok(iaCalls()[0].url.includes(`conexion_whatsapp_id=eq.${LINE_A}`));
  assert.ok(iaCalls()[0].url.includes(`usuario_id=eq.${USER}`));

  const kpis = resumen.kpis;
  const otra = await computeResumen(USER, query);
  assert.deepEqual(otra.kpis, kpis);
  assert.equal(iaCalls().length, 2);
  assert.equal(sumLeads(await computeSeries(USER, query)), 2);
  console.log("✓ flujo y una línea: 1 lectura compartida; la carga siguiente vuelve a leer y coincide");
}

async function todasLasLineas() {
  reset({
    resolver({ conn }) {
      if (conn === LINE_A) return ["111", "333"];
      if (conn === LINE_B) return ["222"];
      return ["111", "333", "222", "444"];
    },
    clientesFor() {
      return ["111", "333", "222", "444"];
    },
  });

  const query = { periodo: "7d", flujo_id: FLOW };
  const [resumen, serie] = await Promise.all([
    computeResumen(USER, query),
    computeSeries(USER, query),
  ]);

  assert.equal(resumen.kpis.leads, 3);
  assert.equal(sumLeads(serie), 4);
  assert.equal(iaCalls().length, 3);
  const porLinea = iaCalls().filter((call) => call.url.includes("conexion_whatsapp_id=eq."));
  const sinLinea = iaCalls().filter((call) => !call.url.includes("conexion_whatsapp_id=eq."));
  assert.equal(porLinea.length, 2);
  assert.equal(sinLinea.length, 1);
  assert.ok(porLinea.some((call) => call.url.includes(LINE_A)));
  assert.ok(porLinea.some((call) => call.url.includes(LINE_B)));

  const repetido = await computeResumen(USER, query);
  assert.deepEqual(repetido.kpis, resumen.kpis);
  console.log("✓ Todas las líneas: cada línea y el total sin filtro conservan sus propios números");
}

async function cambioRapido() {
  reset({
    resolver({ flow, conn }) {
      if (flow === FLOW && conn === LINE_A) return ["111", "333"];
      if (flow === FLOW_B && conn === LINE_A) return ["222"];
      if (flow === FLOW && conn === LINE_B) return ["222"];
      return ["999"];
    },
    clientesFor() {
      return ["111", "333", "222"];
    },
  });

  let vistas = 0;
  let avisar;
  const llegaron = new Promise((resolve) => {
    avisar = resolve;
  });
  const compuertas = new Map();
  state.onIa = async (url) => {
    const flow = eqParam(url, "flujo_id");
    const conn = eqParam(url, "conexion_whatsapp_id");
    const clave = `${flow}|${conn}`;
    if (!compuertas.has(clave)) compuertas.set(clave, { abierta: false, espera: [] });
    const compuerta = compuertas.get(clave);
    vistas += 1;
    if (vistas >= 2) avisar();
    if (!compuerta.abierta) {
      await new Promise((resolve) => compuerta.espera.push(resolve));
    }
  };
  const soltar = (clave) => {
    const compuerta = compuertas.get(clave);
    compuerta.abierta = true;
    compuerta.espera.splice(0).forEach((resolve) => resolve());
  };

  const flujoA = computeSeries(USER, {
    periodo: "7d",
    flujo_id: FLOW,
    conexion_whatsapp_id: LINE_A,
  });
  const flujoB = computeSeries(USER, {
    periodo: "7d",
    flujo_id: FLOW_B,
    conexion_whatsapp_id: LINE_A,
  });
  await conPlazo(llegaron, 4000, "las dos consultas de flujo no arrancaron");
  soltar(`${FLOW_B}|${LINE_A}`);
  const serieB = await flujoB;
  soltar(`${FLOW}|${LINE_A}`);
  const serieA = await flujoA;
  assert.equal(sumLeads(serieB), 1);
  assert.equal(sumLeads(serieA), 2);
  assert.equal(iaCalls().length, 2);

  calls.length = 0;
  vistas = 0;
  let avisarLineas;
  const lineasListas = new Promise((resolve) => {
    avisarLineas = resolve;
  });
  state.onIa = async (url) => {
    const conn = eqParam(url, "conexion_whatsapp_id");
    vistas += 1;
    if (vistas >= 2) avisarLineas();
    const compuerta = compuertas.get(`lineas|${conn}`) || { abierta: false, espera: [] };
    compuertas.set(`lineas|${conn}`, compuerta);
    if (!compuerta.abierta) {
      await new Promise((resolve) => compuerta.espera.push(resolve));
    }
  };
  const resumenA = computeResumen(USER, {
    periodo: "7d",
    flujo_id: FLOW,
    conexion_whatsapp_id: LINE_A,
  });
  const resumenB = computeResumen(USER, {
    periodo: "7d",
    flujo_id: FLOW,
    conexion_whatsapp_id: LINE_B,
  });
  await conPlazo(lineasListas, 4000, "las dos conexiones no arrancaron");
  soltar("lineas|" + LINE_B);
  const lineaB = await resumenB;
  soltar("lineas|" + LINE_A);
  const lineaA = await resumenA;
  assert.equal(lineaB.kpis.leads, 1);
  assert.equal(lineaA.kpis.leads, 2);
  assert.equal(iaCalls().length, 2);
  console.log("✓ cambio rápido: un flujo o una línea que termina antes no pisa al otro");
}

async function dosUsuarios() {
  reset({
    resolver({ user }) {
      if (user === USER) return ["111", "333"];
      if (user === USER_2) return ["222"];
      return ["999"];
    },
    clientesFor({ user }) {
      if (user === USER) return ["111", "333"];
      if (user === USER_2) return ["222"];
      return [];
    },
    conexiones: [{ id: LINE_A }],
  });

  const query = { periodo: "7d", flujo_id: FLOW, conexion_whatsapp_id: LINE_A };
  const [resumen1, resumen2, serie1, serie2] = await Promise.all([
    computeResumen(USER, query),
    computeResumen(USER_2, query),
    computeSeries(USER, query),
    computeSeries(USER_2, query),
  ]);

  assert.equal(resumen1.kpis.leads, 2);
  assert.equal(resumen2.kpis.leads, 1);
  assert.equal(sumLeads(serie1), 2);
  assert.equal(sumLeads(serie2), 1);
  assert.equal(iaCalls().length, 2);
  assert.ok(iaCalls().some((call) => call.url.includes(`usuario_id=eq.${USER}`)));
  assert.ok(iaCalls().some((call) => call.url.includes(`usuario_id=eq.${USER_2}`)));
  assert.deepEqual(
    (await computeResumen(USER, query)).kpis,
    resumen1.kpis
  );
  console.log("✓ dos usuarios: cada uno conserva sus números y sus indicadores");
}

async function separacionDeClave() {
  reset({
    resolver({ conn }) {
      return conn ? ["111"] : ["111", "222"];
    },
  });

  const [todas, vacio, marcado, conEspacios, linea] = await Promise.all([
    fetchFlujoClienteNumeros(USER, FLOW, null),
    fetchFlujoClienteNumeros(USER, FLOW, ""),
    fetchFlujoClienteNumeros(USER, FLOW, "__todas__"),
    fetchFlujoClienteNumeros(USER, FLOW, "  __todas__  "),
    fetchFlujoClienteNumeros(USER, FLOW, LINE_A),
  ]);

  assert.deepEqual(todas, ["111", "222"]);
  assert.deepEqual(vacio, ["111", "222"]);
  assert.deepEqual(marcado, ["111", "222"]);
  assert.deepEqual(conEspacios, ["111", "222"]);
  assert.deepEqual(linea, ["111"]);
  assert.equal(iaCalls().length, 2);
  assert.equal(iaCalls().filter((call) => call.url.includes("conexion_whatsapp_id=eq.")).length, 1);

  todas.push("contaminado");
  const otra = await fetchFlujoClienteNumeros(USER, FLOW, null);
  assert.deepEqual(otra, ["111", "222"]);
  assert.equal(iaCalls().length, 3);
  console.log("✓ Todas las líneas comparten clave; una línea no. Una respuesta vieja no se reutiliza después");
}

function assertCadaTabla(veces, detalle) {
  TABLAS_NUMEROS.forEach((tabla) => {
    assert.equal(numerosCalls(tabla).length, veces, `${detalle} ${tabla}`);
  });
}

async function incompletoNoSeGuarda(tabla, leadsEsperados) {
  reset({
    failTables: new Set([tabla]),
    resolver() {
      return ["591111"];
    },
  });
  const query = { periodo: "7d", flujo_id: FLOW, conexion_whatsapp_id: LINE_A };
  const primero = await computeResumen(USER, query);
  assert.equal(primero.ok, true);
  assert.equal(primero.kpis.leads, leadsEsperados);
  assertCadaTabla(1, `primera carga ${tabla}`);

  const segundo = await computeResumen(USER, query);
  assert.equal(segundo.ok, true);
  assert.deepEqual(segundo.kpis, primero.kpis);
  assertCadaTabla(2, `siguiente carga ${tabla}`);
}

async function fallaDeSupabase() {
  await incompletoNoSeGuarda("/seguimientos_programados", 0);
  await incompletoNoSeGuarda("/crm_conversiones", 1);
  await incompletoNoSeGuarda("/ia_sessions", 1);

  reset({
    failTables: new Set(TABLAS_NUMEROS),
  });
  const query = { periodo: "7d", flujo_id: FLOW, conexion_whatsapp_id: LINE_A };
  const primero = await computeResumen(USER, query);
  assert.equal(primero.ok, true);
  assert.equal(primero.kpis.leads, 0);
  assert.equal(primero.kpis.ventas, 0);
  assertCadaTabla(1, "tres tablas caídas, primera carga");

  const segundo = await computeResumen(USER, query);
  assert.equal(segundo.ok, true);
  assert.deepEqual(segundo.kpis, primero.kpis);
  assertCadaTabla(2, "tres tablas caídas, siguiente carga");
  console.log("✓ fallo de una tabla o de las tres: el resultado no se guarda y la carga siguiente vuelve a consultar");
}

async function arraysVaciosYCargaNueva() {
  reset({
    numerosEnTodasLasTablas: true,
    resolver() {
      return [];
    },
  });
  const query = { periodo: "7d", flujo_id: FLOW, conexion_whatsapp_id: LINE_A };
  const serie = await computeSeries(USER, query);
  assert.equal(sumLeads(serie), 0);
  assertCadaTabla(1, "arrays vacíos reutilizados en la misma carga");

  const otra = await computeSeries(USER, query);
  assert.equal(sumLeads(otra), 0);
  assertCadaTabla(2, "carga nueva después de liberar");
  console.log("✓ arrays vacíos se reutilizan en la carga; la carga siguiente, ya liberada, vuelve a consultar");
}

async function fallaDeCache() {
  reset({
    resolver() {
      return ["591111"];
    },
  });
  const originalSet = Map.prototype.set;
  Map.prototype.set = function setRoto(key, value) {
    if (typeof key === "string" && key.includes('"f":')) {
      throw new Error("cache rota");
    }
    return originalSet.call(this, key, value);
  };
  try {
    const numeros = await fetchFlujoClienteNumeros(USER, "flujo-cache-rota", LINE_A);
    assert.deepEqual(numeros, ["591111"]);
    assert.equal(iaCalls().length, 1);
  } finally {
    Map.prototype.set = originalSet;
  }
  console.log("✓ fallo de la caché: la consulta directa sigue devolviendo los números");
}
