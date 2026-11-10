/**
 * Reglas de metricas_resumen_conteos y del respaldo.
 * No consulta Supabase de producción: axios queda sustituido.
 * Ejecutar: node --test tests/metricasResumenConteos.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const axios = require("axios");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-key";
delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;

const {
  computeResumen,
  computeSalud,
  parseRango,
  rangoAnterior,
  pct,
  metricasRpcResumenConteosActiva,
  telefonoCuentaParaDistinto,
  instanteEnRangoInclusivo,
  conversacionesSegunRegla,
  simularConteoLinea,
  filasResumenConteosPorConexion,
  sumarFilasResumenConteos,
  leerResumenConteosONull,
  PAGINA_FILAS_METRICAS,
  PAGINAS_MAX_METRICAS,
  reunirPaginas,
  distintosDeFilas,
  computeFunnel,
  computeDiagnostico,
  fetchFlujoClienteNumeros,
} = require("../services/metricasService");

const LINE_A = "linea-a";
const LINE_B = "linea-b";
const USER_GRANDE = "usuario-grande-a";
const USER_GRANDE_2 = "usuario-grande-b";
const USER_PEQUENO = "usuario-pequeno";
const FLUJO = "flujo-real";
const DESDE = "2026-11-01T00:00:00.000Z";
const HASTA = "2026-11-10T23:59:59.999Z";
const DESDE_ANT = "2026-10-22T00:00:00.000Z";
const HASTA_ANT = "2026-11-01T00:00:00.000Z";

const originalGet = axios.get;
const originalPost = axios.post;
const calls = [];
const state = {
  rpc: "off",
  salientes: 0,
  entrantes: 0,
  respuestasFilas: [],
  conversaciones: 0,
  conversacionesAnterior: 0,
  leads: 4,
};

function rows(data) {
  const list = Array.isArray(data) ? data : [];
  return { data: list, headers: { "content-range": `*/${list.length}` } };
}

function counted(n) {
  return { data: [], headers: { "content-range": `*/${n}` } };
}

function httpError(status, data, responseHeaders) {
  const err = new Error(data?.message || "error simulado");
  err.response = { status, data, headers: responseHeaders || {} };
  return err;
}

function filasDeRango(start, count, prefijo) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefijo}-${start + i}`,
    cliente_numero: `${prefijo}-n-${start + i}`,
  }));
}

function paginaDesdeLista(lista, config) {
  const list = Array.isArray(lista) ? lista : [];
  const range = String(config?.headers?.Range || "0-999");
  const start = parseInt(range.split("-")[0], 10) || 0;
  if (list.length === 0) {
    if (start === 0) return { data: [], headers: { "content-range": "*/0" } };
    throw httpError(416, { message: "range" }, { "content-range": "*/0" });
  }
  if (start >= list.length) {
    throw httpError(416, { message: "range" }, { "content-range": `*/${list.length}` });
  }
  const endPedido = parseInt(range.split("-")[1], 10);
  const pedido = Number.isFinite(endPedido) ? endPedido - start + 1 : list.length - start;
  const slice = list.slice(start, start + pedido).map((row, i) => ({
    id: row.id || `lista-${start + i}`,
    cliente_numero: row.cliente_numero,
  }));
  const last = start + slice.length - 1;
  return { data: slice, headers: { "content-range": `${start}-${last}/${list.length}` } };
}

function tablaDeNumeros(url) {
  if (url.includes("/seguimientos_programados")) return "seguimientos";
  if (url.includes("/crm_conversiones")) return "conversiones";
  if (url.includes("/ia_sessions")) return "ia";
  return "";
}

function paginaSecuencia(lectura, config) {
  const range = String(config?.headers?.Range || "0-999");
  const start = parseInt(range.split("-")[0], 10) || 0;
  const paso = lectura.secuencia.find((item) => item.start === start);
  if (!paso) throw httpError(500, { message: "paso ausente" });
  if (paso.status === 416) {
    const headers416 = paso.header ? { "content-range": paso.header } : {};
    throw httpError(416, { message: "range" }, headers416);
  }
  if (paso.status === 500) throw httpError(500, { message: "fallo de pagina" });
  const data = filasDeRango(start, paso.count, "seq");
  if (paso.header == null) return { data, headers: {} };
  return { data, headers: { "content-range": paso.header } };
}

function paginaMensajes(config) {
  const lectura = state.lecturaMensajes;
  if (Array.isArray(lectura.secuencia)) return paginaSecuencia(lectura, config);
  const range = String(config?.headers?.Range || "0-999");
  const start = parseInt(range.split("-")[0], 10) || 0;
  const end = parseInt(range.split("-")[1], 10);
  const pedido = Number.isFinite(end) ? end - start + 1 : PAGINA_FILAS_METRICAS;
  if (lectura.failAt != null && start === lectura.failAt) {
    throw httpError(500, { message: "fallo de pagina" });
  }
  if (start >= lectura.total) {
    if (start === 0 && lectura.total === 0) {
      return { data: [], headers: { "content-range": "*/0" } };
    }
    const headers416 =
      lectura.rango === "total" ? { "content-range": `*/${lectura.total}` } : {};
    throw httpError(416, { message: "range" }, headers416);
  }
  const cap = lectura.cap || PAGINA_FILAS_METRICAS;
  const count = Math.min(cap, pedido, lectura.total - start);
  const data = filasDeRango(start, count, "msg");
  const last = start + count - 1;
  const contentRange =
    lectura.rango === "total" ? `${start}-${last}/${lectura.total}` : `${start}-${last}/*`;
  return { data, headers: { "content-range": contentRange } };
}

function paginaFlujo(tabla, config) {
  const lectura = state.flujoLectura[tabla] || { total: 0 };
  if (lectura.fallo) {
    throw httpError(lectura.estado || 500, {
      code: lectura.codigo,
      message: lectura.mensaje || `fallo ${tabla}`,
    });
  }
  const range = String(config?.headers?.Range || "0-999");
  const start = parseInt(range.split("-")[0], 10) || 0;
  if (lectura.failAt != null && start === lectura.failAt) {
    throw httpError(500, { message: `fallo ${tabla}` });
  }
  const total = lectura.total || 0;
  if (start >= total) {
    if (start === 0 && total === 0) return { data: [], headers: { "content-range": "*/0" } };
    throw httpError(416, { message: "range" }, { "content-range": `*/${total}` });
  }
  const cap = lectura.cap || PAGINA_FILAS_METRICAS;
  const end = parseInt(range.split("-")[1], 10);
  const pedido = Number.isFinite(end) ? end - start + 1 : cap;
  const count = Math.min(cap, pedido, total - start);
  const data = Array.from({ length: count }, (_, i) => ({
    id: `${tabla}-id-${start + i}`,
    cliente_numero: `${tabla}-${start + i}`,
  }));
  const last = start + count - 1;
  return { data, headers: { "content-range": `${start}-${last}/${total}` } };
}

function filaRpc(id, campos) {
  return {
    conexion_whatsapp_id: id,
    salientes: 0,
    entrantes: 0,
    respuestas: 0,
    clientes_con_mensaje: 0,
    conversaciones: 0,
    conversaciones_anterior: 0,
    ...campos,
  };
}

function installStub() {
  axios.get = async (url, config) => {
    const target = String(url);
    const range = config?.headers?.Range || "";
    calls.push({ url: target, method: "GET", range });
    if (target.includes("/conexiones_whatsapp") && target.includes("select=id")) {
      return rows([{ id: LINE_A }, { id: LINE_B }]);
    }
    if (target.includes("/mensajes") && target.includes("select=id&") && target.includes("direccion=eq.saliente")) {
      if (state.falloSalientes) throw httpError(500, { message: "fallo salientes" });
      return counted(state.salientes);
    }
    if (target.includes("/mensajes") && target.includes("select=id&") && target.includes("direccion=eq.entrante")) {
      return counted(state.entrantes);
    }
    if (target.includes("/mensajes") && target.includes("cliente_numero")) {
      if (state.lecturaMensajes) return paginaMensajes(config);
      if (state.paginaLlena) {
        return paginaDesdeLista(
          Array.from({ length: PAGINA_FILAS_METRICAS }, (_, i) => ({
            id: `llena-${i}`,
            cliente_numero: `${range || "0"}-${i}`,
          })),
          config
        );
      }
      if (state.paginasRespuestas) {
        return paginaDesdeLista(state.paginasRespuestas.flat(), config);
      }
      return paginaDesdeLista(state.respuestasFilas, config);
    }
    if (target.includes("/conversaciones") && target.includes("select=id")) {
      const anterior = target.includes(encodeURIComponent(HASTA_ANT)) || target.includes("2026-10-22");
      return counted(anterior ? state.conversacionesAnterior : state.conversaciones);
    }
    const tablaFlujo = tablaDeNumeros(target);
    if (tablaFlujo && state.flujoLectura && target.includes("cliente_numero")) {
      return paginaFlujo(tablaFlujo, config);
    }
    return rows([]);
  };
  axios.post = async (url, body) => {
    const target = String(url);
    calls.push({ url: target, method: "POST", body });
    if (target.includes("count_leads_por_linea")) {
      return { data: state.leads, headers: {} };
    }
    if (!target.includes("metricas_resumen_conteos")) {
      return { data: null, headers: {} };
    }
    if (state.rpc === "ausente") {
      throw httpError(404, {
        code: "PGRST202",
        message: "Could not find the function public.metricas_resumen_conteos",
      });
    }
    if (state.rpc === "timeout") {
      throw httpError(500, { message: "canceling statement due to statement timeout" });
    }
    if (state.rpc === "incompleta") return { data: state.rpcFilas, headers: {} };
    return { data: state.rpcFilas, headers: {} };
  };
}

function restoreStub() {
  axios.get = originalGet;
  axios.post = originalPost;
}

function reset(extra = {}) {
  calls.length = 0;
  state.rpc = "ok";
  state.salientes = 11;
  state.entrantes = 7;
  state.respuestasFilas = [{ cliente_numero: "591111" }, { cliente_numero: "591222" }];
  state.conversaciones = 4;
  state.conversacionesAnterior = 2;
  state.leads = 4;
  state.paginaLlena = false;
  state.paginasRespuestas = null;
  state.lecturaMensajes = null;
  state.falloSalientes = false;
  state.flujoLectura = null;
  state.rpcFilas = [
    filaRpc(LINE_A, {
      salientes: 5,
      entrantes: 2,
      respuestas: 2,
      clientes_con_mensaje: 3,
      conversaciones: 4,
      conversaciones_anterior: 2,
    }),
  ];
  Object.assign(state, extra);
}

function postsRpc() {
  return calls.filter((call) => call.url.includes("metricas_resumen_conteos"));
}

function conteosMensajes() {
  return calls.filter(
    (call) => call.method === "GET" && call.url.includes("/mensajes") && call.url.includes("select=id&")
  );
}

test("regla de distintos, extremos inclusivos y periodos", () => {
  assert.equal(telefonoCuentaParaDistinto(null), false);
  assert.equal(telefonoCuentaParaDistinto(""), false);
  assert.equal(telefonoCuentaParaDistinto(" "), true);
  assert.equal(telefonoCuentaParaDistinto("0"), true);
  assert.equal(telefonoCuentaParaDistinto("591111"), true);

  assert.equal(instanteEnRangoInclusivo(HASTA, DESDE, HASTA), true);
  assert.equal(instanteEnRangoInclusivo(DESDE, DESDE, HASTA), true);
  assert.equal(
    instanteEnRangoInclusivo("2026-11-11T00:00:00.000Z", DESDE, HASTA),
    false
  );

  const rango = { desde: DESDE, hasta: HASTA, periodo: "30d" };
  const anterior = rangoAnterior(rango.desde, rango.hasta, rango.periodo);
  assert.equal(anterior.hasta, rango.desde);
  assert.equal(instanteEnRangoInclusivo(rango.desde, rango.desde, rango.hasta), true);
  assert.equal(instanteEnRangoInclusivo(anterior.hasta, anterior.desde, anterior.hasta), true);

  const hoy = parseRango({ periodo: "hoy" });
  const ayer = parseRango({ periodo: "ayer" });
  const semana = parseRango({ periodo: "7d" });
  const mes = parseRango({ periodo: "30d" });
  const custom = parseRango({ desde: DESDE, hasta: HASTA, periodo: "custom" });
  [hoy, ayer, semana, mes, custom].forEach((item) => {
    assert.ok(item.desde <= item.hasta);
  });
  assert.equal(custom.desde, DESDE);
  assert.equal(custom.hasta, HASTA);
  const anteriorAyer = rangoAnterior(ayer.desde, ayer.hasta, "ayer");
  assert.notEqual(anteriorAyer.hasta, ayer.desde);
  assert.equal(
    instanteEnRangoInclusivo(ayer.desde, anteriorAyer.desde, anteriorAyer.hasta),
    false
  );
});

test("una línea, todas las líneas, flujo, teléfonos y dos usuarios", () => {
  const telefono = "59170000001";
  const mensajes = [
    mensaje(USER_GRANDE, LINE_A, telefono, "entrante", HASTA),
    mensaje(USER_GRANDE, LINE_A, telefono, "saliente", DESDE),
    mensaje(USER_GRANDE, LINE_A, null, "entrante", DESDE),
    mensaje(USER_GRANDE, LINE_A, "", "entrante", DESDE),
    mensaje(USER_GRANDE, LINE_A, " ", "saliente", DESDE),
    mensaje(USER_GRANDE, LINE_A, "otro", "nota", DESDE),
    mensaje(USER_GRANDE, LINE_A, telefono, "entrante", "2026-11-11T00:00:00.000Z"),
    mensaje(USER_GRANDE, LINE_B, telefono, "entrante", DESDE),
    mensaje(USER_GRANDE_2, LINE_A, "59180000002", "saliente", DESDE),
    mensaje(USER_PEQUENO, LINE_A, "59110000003", "entrante", DESDE),
  ];
  for (let i = 0; i < 40; i += 1) {
    mensajes.push(mensaje(USER_GRANDE, LINE_A, `g1-${i}`, "saliente", DESDE));
    mensajes.push(mensaje(USER_GRANDE_2, LINE_A, `g2-${i}`, "entrante", DESDE));
  }
  const conversaciones = [
    conversacion(USER_GRANDE, LINE_A, telefono, DESDE),
    conversacion(USER_GRANDE, LINE_A, "otro", HASTA),
  ];
  const params = {
    usuarioId: USER_GRANDE,
    conexionId: LINE_A,
    desde: DESDE,
    hasta: HASTA,
    desdeAnterior: DESDE_ANT,
    hastaAnterior: HASTA_ANT,
    flujoNumeros: null,
  };
  const una = simularConteoLinea(mensajes, conversaciones, params);
  assert.equal(una.salientes, 42);
  assert.equal(una.entrantes, 3);
  assert.equal(una.respuestas, 1);
  assert.equal(una.clientes_con_mensaje, 43);
  assert.equal(una.conversaciones, 2);
  assert.equal(conversacionesSegunRegla(false, 0, una.clientes_con_mensaje), 43);

  const otraLinea = simularConteoLinea(mensajes, [], {
    ...params,
    conexionId: LINE_B,
  });
  const mapa = filasResumenConteosPorConexion([una, otraLinea], [LINE_A, LINE_B]);
  const suma = sumarFilasResumenConteos(mapa, [LINE_A, LINE_B]);
  assert.equal(suma.respuestas, 2);
  assert.equal(suma.salientes, una.salientes + otraLinea.salientes);

  const conFlujo = simularConteoLinea(mensajes, conversaciones, {
    ...params,
    flujoNumeros: [telefono],
  });
  assert.equal(conFlujo.salientes, 1);
  assert.equal(conFlujo.entrantes, 1);
  assert.equal(conFlujo.respuestas, 1);
  assert.equal(conFlujo.conversaciones, 1);
  assert.notEqual(conFlujo.conversaciones, 2);

  const flujoVacio = simularConteoLinea(mensajes, conversaciones, {
    ...params,
    flujoNumeros: [],
  });
  assert.equal(flujoVacio.salientes, 0);
  assert.equal(flujoVacio.conversaciones, 0);

  const grande2 = simularConteoLinea(mensajes, [], {
    ...params,
    usuarioId: USER_GRANDE_2,
  });
  const pequeno = simularConteoLinea(mensajes, [], {
    ...params,
    usuarioId: USER_PEQUENO,
  });
  assert.equal(grande2.entrantes, 40);
  assert.equal(pequeno.entrantes, 1);
  assert.equal(pequeno.respuestas, 1);
  assert.ok(una.salientes > grande2.salientes);
  assert.ok(grande2.entrantes > pequeno.entrantes);
});

test("filas incompletas no se aceptan", () => {
  const completa = filaRpc(LINE_A, { salientes: 1, conversaciones: 2 });
  assert.ok(filasResumenConteosPorConexion([completa], [LINE_A]));
  assert.equal(filasResumenConteosPorConexion([completa], [LINE_A, LINE_B]), null);
  assert.equal(
    filasResumenConteosPorConexion([completa, completa], [LINE_A]),
    null
  );
  assert.equal(
    filasResumenConteosPorConexion([filaRpc(LINE_A, { salientes: 1.5 })], [LINE_A]),
    null
  );
  assert.equal(
    filasResumenConteosPorConexion([filaRpc(LINE_A, { salientes: -1 })], [LINE_A]),
    null
  );
  assert.equal(filasResumenConteosPorConexion("no-es-lista", [LINE_A]), null);
});

test("la migración no escribe ni crea índices", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "create_metricas_resumen_conteos_rpc.sql"),
    "utf8"
  );
  assert.match(sql, /create or replace function public\.metricas_resumen_conteos/i);
  assert.match(sql, /creado_en >= p_desde/);
  assert.match(sql, /creado_en <= p_hasta/);
  assert.match(sql, /direccion = 'saliente'/);
  assert.match(sql, /direccion = 'entrante'/);
  assert.match(sql, /cliente_numero <> ''/);
  assert.match(sql, /metricas_numeros_de_flujo/);
  assert.match(sql, /p_flujo_id is not null/);
  assert.match(sql, /grant execute on function public\.metricas_resumen_conteos/i);
  assert.match(sql, /revoke execute on function public\.metricas_resumen_conteos/i);
  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /to service_role/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /join public\.conexiones_whatsapp cw/i);
  assert.match(sql, /cw\.usuario_id = p_usuario_id/);
  assert.match(sql, /from public\.flujos_builder fb/i);
  assert.match(sql, /fb\.usuario_id = p_usuario_id/);
  assert.doesNotMatch(sql, /\bset\s+statement_timeout\b/i);
  assert.doesNotMatch(sql, /grant execute on function public\.metricas_resumen_conteos[\s\S]*to (anon|authenticated)/i);
  assert.doesNotMatch(sql, /\b(insert into|delete from|alter table|drop |create index|create unique index)\b/i);
});

test("bandera apagada: no llama la RPC y conserva el cálculo anterior", async () => {
  delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  assert.equal(metricasRpcResumenConteosActiva(), false);
  installStub();
  try {
    reset();
    assert.equal(await leerResumenConteosONull(USER_PEQUENO, [LINE_A], parseRango({ periodo: "hoy" }), null, null), null);
    const resumen = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(postsRpc().length, 0);
    assert.ok(conteosMensajes().length >= 2);
    assert.equal(resumen.kpis.mensajesEnviados, 11);
    assert.equal(resumen.kpis.mensajesEntrantes, 7);
    assert.equal(resumen.kpis.respuestas, 2);
    assert.equal(resumen.kpis.conversaciones, 4);
    assert.equal(resumen.kpis.ventas, 0);
    assert.equal(resumen.kpis.ingresos, 0);
    assert.equal(resumen.kpis.moneda, "BOB");
    assert.equal(resumen.kpis.seguimientosActivos, 0);
    assert.equal(resumen.kpis.tasaCierre, pct(0, 4));
    assert.equal(
      resumen.salud.score,
      computeSalud({
        leads: resumen.kpis.leads,
        conversaciones: 4,
        respuestas: 2,
        ventas: 0,
        seguimientosActivos: 0,
        tasaCierre: resumen.kpis.tasaCierre,
        conversion: resumen.kpis.conversion,
      })
    );
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("RPC ausente, timeout o incompleta vuelve al método anterior", async () => {
  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    for (const modo of ["ausente", "timeout"]) {
      reset({ rpc: modo, salientes: 11 });
      const resumen = await computeResumen(USER_GRANDE, {
        periodo: "30d",
        conexion_whatsapp_id: LINE_A,
      });
      assert.equal(resumen.kpis.mensajesEnviados, 11);
      assert.notEqual(resumen.kpis.mensajesEnviados, 0);
      assert.ok(conteosMensajes().length >= 2);
      assert.ok(postsRpc().length >= 1);
    }

    reset({
      rpc: "incompleta",
      rpcFilas: [filaRpc(LINE_A, { salientes: 99, conversaciones: 99, respuestas: 99 })],
      salientes: 11,
    });
    const todas = await computeResumen(USER_GRANDE_2, { periodo: "hoy" });
    assert.equal(todas.kpis.mensajesEnviados, 22);
    assert.notEqual(todas.kpis.mensajesEnviados, 99);
    assert.equal(todas.kpis.leads, 8);
    assert.equal(todas.kpis.ventas, 0);
    assert.equal(todas.kpis.moneda, "BOB");
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("con la bandera de prueba, una línea y un flujo usan la RPC; todas las líneas no", async () => {
  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    reset({
      rpcFilas: [
        filaRpc(LINE_A, {
          salientes: 5,
          entrantes: 2,
          respuestas: 2,
          clientes_con_mensaje: 3,
          conversaciones: 4,
          conversaciones_anterior: 2,
        }),
      ],
    });
    const una = await computeResumen(USER_PEQUENO, {
      periodo: "custom",
      desde: DESDE,
      hasta: HASTA,
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(conteosMensajes().length, 0);
    assert.equal(una.kpis.mensajesEnviados, 5);
    assert.equal(una.kpis.mensajesEntrantes, 2);
    assert.equal(una.kpis.respuestas, 2);
    assert.equal(una.kpis.conversaciones, 4);
    assert.equal(una.kpis.tendenciaConversaciones, 100);
    assert.equal(una.kpis.ventas, 0);
    assert.equal(una.kpis.ingresos, 0);
    assert.equal(una.kpis.moneda, "BOB");
    assert.equal(una.kpis.seguimientosActivos, 0);
    assert.equal(una.kpis.tasaCierre, 0);

    reset({
      rpcFilas: [
        filaRpc(LINE_A, {
          salientes: 5,
          entrantes: 2,
          respuestas: 1,
          clientes_con_mensaje: 2,
          conversaciones: 4,
          conversaciones_anterior: 2,
        }),
        filaRpc(LINE_B, {
          salientes: 1,
          entrantes: 1,
          respuestas: 1,
          clientes_con_mensaje: 1,
          conversaciones: 6,
          conversaciones_anterior: 2,
        }),
      ],
    });
    const todas = await computeResumen(USER_GRANDE, { periodo: "7d" });
    assert.equal(postsRpc().length, 0);
    assert.equal(todas.kpis.mensajesEnviados, 22);
    assert.equal(todas.kpis.mensajesEntrantes, 14);
    assert.equal(todas.kpis.respuestas, 4);
    assert.notEqual(todas.kpis.mensajesEnviados, 6);
    assert.equal(todas.kpis.leads, 8);
    assert.equal(todas.kpis.ventas, 0);
    assert.equal(todas.kpis.ingresos, 0);
    assert.equal(todas.kpis.moneda, "BOB");

    reset({
      rpcFilas: [
        filaRpc(LINE_A, {
          salientes: 5,
          entrantes: 1,
          respuestas: 1,
          clientes_con_mensaje: 1,
          conversaciones: 1,
          conversaciones_anterior: 0,
        }),
      ],
    });
    const conFlujo = await computeResumen(USER_GRANDE_2, {
      periodo: "ayer",
      flujo_id: FLUJO,
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(conteosMensajes().length, 0);
    assert.equal(conFlujo.kpis.conversaciones, 1);
    assert.equal(conFlujo.kpis.mensajesEnviados, 5);
    assert.equal(conFlujo.kpis.respuestas, 1);
    assert.equal(conFlujo.kpis.ventas, 0);
    assert.equal(conFlujo.kpis.moneda, "BOB");
    assert.equal(conFlujo.flujoId, FLUJO);
    const cuerpo = postsRpc().at(-1).body;
    assert.equal(cuerpo.p_flujo_id, FLUJO);
    assert.equal(cuerpo.p_usuario_id, USER_GRANDE_2);
    assert.deepEqual(cuerpo.p_conexiones, [LINE_A]);
    assert.ok(cuerpo.p_desde);
    assert.ok(cuerpo.p_hasta);
    assert.ok(cuerpo.p_desde_anterior);
    assert.ok(cuerpo.p_hasta_anterior);
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("paginación: el distinto completo entra y la página llena no se publica", async () => {
  const corto = reunirPaginas([[{ cliente_numero: "591" }]], 2);
  assert.equal(corto.completo, true);
  assert.equal(corto.filas.length, 1);

  const dosPaginas = reunirPaginas(
    [[{ cliente_numero: "591" }, { cliente_numero: "" }], [{ cliente_numero: "0" }]],
    2
  );
  assert.equal(dosPaginas.completo, true);
  assert.equal(distintosDeFilas(dosPaginas.filas, { soloEntrantes: false }), 2);

  const tope = reunirPaginas(
    [[{ cliente_numero: "591" }, { cliente_numero: "592" }]],
    2
  );
  assert.equal(tope.completo, false);
  assert.equal(tope.motivo, "incompleto");
  assert.equal(tope.filas, null);

  const cerrado = reunirPaginas(
    [[{ cliente_numero: "591" }, { cliente_numero: "592" }], []],
    2
  );
  assert.equal(cerrado.completo, true);
  assert.equal(cerrado.filas.length, 2);

  const mensajes = [
    mensaje(USER_PEQUENO, LINE_A, null, "entrante", DESDE),
    mensaje(USER_PEQUENO, LINE_A, "", "entrante", DESDE),
    mensaje(USER_PEQUENO, LINE_A, " ", "entrante", DESDE),
    mensaje(USER_PEQUENO, LINE_A, "0", "entrante", DESDE),
    mensaje(USER_PEQUENO, LINE_A, "591", "saliente", DESDE),
    mensaje(USER_PEQUENO, LINE_A, "591", "entrante", DESDE),
    mensaje(USER_GRANDE, LINE_A, "999", "entrante", DESDE),
  ];
  const simulado = simularConteoLinea(mensajes, [], {
    usuarioId: USER_PEQUENO,
    conexionId: LINE_A,
    desde: DESDE,
    hasta: HASTA,
  });
  const delUsuario = mensajes.filter((fila) => fila.usuario_id === USER_PEQUENO);
  assert.equal(distintosDeFilas(delUsuario, { soloEntrantes: true }), simulado.respuestas);
  assert.equal(simulado.respuestas, 3);
  assert.equal(simulado.entrantes, 5);
  assert.equal(distintosDeFilas(delUsuario), simulado.clientes_con_mensaje);

  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    const primera = Array.from({ length: PAGINA_FILAS_METRICAS }, (_, i) => ({
      cliente_numero: `p0-${i}`,
    }));
    const segunda = [{ cliente_numero: "p1-extra" }];
    reset({
      rpc: "timeout",
      paginasRespuestas: [primera, segunda],
      salientes: 11,
      conversaciones: 4,
    });
    const resumen = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(resumen.kpis.respuestas, PAGINA_FILAS_METRICAS + 1);
    assert.equal(resumen.kpis.conversaciones, 4);
    assert.equal(resumen.kpis.mensajesEnviados, 11);
    const lectura = calls.find(
      (call) => call.url.includes("/mensajes") && call.url.includes("cliente_numero")
    );
    assert.ok(lectura.url.includes("direccion=eq.entrante"));
    assert.ok(lectura.url.includes("creado_en=gte."));
    assert.ok(lectura.url.includes("creado_en=lte."));
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("49.999, 50.000 y más filas se leen enteras con la bandera apagada", async () => {
  delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  installStub();
  try {
    for (const total of [49999, 50000, 50001]) {
      reset({
        lecturaMensajes: { total, cierre: "416" },
        salientes: 11,
        conversaciones: 4,
      });
      const resumen = await computeResumen(USER_PEQUENO, {
        periodo: "7d",
        conexion_whatsapp_id: LINE_A,
      });
      assert.equal(postsRpc().length, 0);
      assert.equal(resumen.kpis.respuestas, total);
      assert.equal(resumen.kpis.mensajesEnviados, 11);
      assert.equal(resumen.kpis.conversaciones, 4);
      assert.equal(resumen.kpis.ventas, 0);
    }

    reset({
      lecturaMensajes: { total: 2500, cap: 400, rango: "total", cierre: "416" },
      salientes: 11,
      conversaciones: 4,
    });
    const cortas = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(cortas.kpis.respuestas, 2500);
    assert.notEqual(cortas.kpis.respuestas, 400);

    reset({
      lecturaMensajes: { total: 1500, rango: "total" },
      salientes: 11,
      conversaciones: 4,
    });
    const conTotal = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(conTotal.kpis.respuestas, 1500);
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("un error de página no se publica como cero ni como parcial", async () => {
  delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  installStub();
  try {
    for (const failAt of [0, 1000, 2000]) {
      reset({
        lecturaMensajes: { total: 2500, failAt, cierre: "416" },
        salientes: 11,
        conversaciones: 4,
      });
      await assert.rejects(
        () => computeResumen(USER_PEQUENO, { periodo: "7d", conexion_whatsapp_id: LINE_A }),
        (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
      );
    }

    reset({ lecturaMensajes: { total: 0, cierre: "416" }, salientes: 0, conversaciones: 4 });
    const cero = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(cero.kpis.respuestas, 0);
    assert.equal(cero.kpis.mensajesEnviados, 0);
    assert.equal(postsRpc().length, 0);

    reset({ falloSalientes: true, salientes: 11, conversaciones: 4 });
    await assert.rejects(
      () => computeResumen(USER_PEQUENO, { periodo: "7d", conexion_whatsapp_id: LINE_A }),
      (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
    );
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("números de flujo incompletos o una fuente caída no publican leads parciales", async () => {
  installStub();
  try {
    reset({
      flujoLectura: {
        seguimientos: { total: 1500, failAt: 1000 },
        conversiones: { total: 2, rango: "stub" },
        ia: { total: 1, rango: "stub" },
      },
    });
    await assert.rejects(
      () => fetchFlujoClienteNumeros(USER_PEQUENO, FLUJO, LINE_A),
      (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
    );
    await assert.rejects(
      () =>
        computeResumen(USER_PEQUENO, {
          periodo: "7d",
          conexion_whatsapp_id: LINE_A,
          flujo_id: FLUJO,
        }),
      (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
    );

    reset({
      flujoLectura: {
        seguimientos: { total: 2, rango: "stub" },
        conversiones: { fallo: true },
        ia: { total: 1, rango: "stub" },
      },
    });
    await assert.rejects(
      () => fetchFlujoClienteNumeros(USER_PEQUENO, FLUJO, LINE_A),
      (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
    );

    reset({
      flujoLectura: {
        seguimientos: { total: 1, rango: "stub" },
        conversiones: { total: 0 },
        ia: { total: 0 },
      },
    });
    const numeros = await fetchFlujoClienteNumeros(USER_PEQUENO, FLUJO, LINE_A);
    assert.deepEqual(numeros, ["seguimientos-0"]);
    const ordenadas = calls.filter(
      (call) => call.url.includes("cliente_numero") && call.url.includes("order=id.asc")
    );
    assert.equal(ordenadas.length, 3);

    reset({
      flujoLectura: {
        seguimientos: { total: 1 },
        conversiones: {
          fallo: true,
          estado: 404,
          codigo: "PGRST205",
          mensaje: "Could not find the table public.crm_conversiones in the schema cache",
        },
        ia: { total: 0 },
      },
    });
    assert.deepEqual(await fetchFlujoClienteNumeros(USER_PEQUENO, FLUJO, LINE_A), ["seguimientos-0"]);

    for (const conversiones of [
      {
        fallo: true,
        estado: 404,
        codigo: "PGRST204",
        mensaje: "Could not find the cliente_numero column of crm_conversiones in the schema cache",
      },
      {
        fallo: true,
        estado: 400,
        codigo: "42703",
        mensaje: "column cliente_numero of relation crm_conversiones does not exist",
      },
      { fallo: true, estado: 404, mensaje: "not found" },
      { fallo: true, estado: 401, codigo: "42501", mensaje: "permission denied for table crm_conversiones" },
    ]) {
      reset({
        flujoLectura: {
          seguimientos: { total: 1 },
          conversiones,
          ia: { total: 1 },
        },
      });
      await assert.rejects(
        () => fetchFlujoClienteNumeros(USER_PEQUENO, FLUJO, LINE_A),
        (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
      );
    }
  } finally {
    restoreStub();
  }
});

test("una página corta con total desconocido cierra y no pide otra", async () => {
  delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  installStub();
  try {
    const query = { periodo: "7d", conexion_whatsapp_id: LINE_A };
    const paginasDe = () =>
      calls.filter((call) => call.url.includes("/mensajes") && call.url.includes("cliente_numero"));

    for (const caso of [
      { header: "0-18/*", count: 19 },
      { header: "0-96/*", count: 97 },
    ]) {
      reset({
        lecturaMensajes: { secuencia: [{ start: 0, header: caso.header, count: caso.count }] },
        salientes: 11,
        conversaciones: 4,
      });
      const resumen = await computeResumen(USER_PEQUENO, query);
      assert.equal(resumen.kpis.respuestas, caso.count);
      assert.equal(resumen.kpis.leads, 4);
      assert.equal(resumen.kpis.ventas, 0);
      assert.equal(resumen.kpis.ingresos, 0);
      assert.equal(resumen.kpis.seguimientosActivos, 0);
      assert.equal(postsRpc().length, 0);
      assert.deepEqual(
        paginasDe().map((call) => call.range),
        ["0-999"]
      );
    }

    reset({
      lecturaMensajes: {
        secuencia: [
          { start: 0, header: "0-999/*", count: 1000 },
          { start: 1000, header: "1000-1004/*", count: 5 },
        ],
      },
      salientes: 11,
      conversaciones: 4,
    });
    const llena = await computeResumen(USER_PEQUENO, query);
    assert.equal(llena.kpis.respuestas, 1005);
    assert.deepEqual(
      paginasDe().map((call) => call.range),
      ["0-999", "1000-1999"]
    );

    reset({
      lecturaMensajes: { secuencia: [{ start: 0, header: "0-999/1000", count: 1000 }] },
      salientes: 11,
      conversaciones: 4,
    });
    const numerica = await computeResumen(USER_PEQUENO, query);
    assert.equal(numerica.kpis.respuestas, 1000);
    assert.deepEqual(
      paginasDe().map((call) => call.range),
      ["0-999"]
    );

    for (const caso of [
      { nombre: "rango no coincide", header: "0-18/*", count: 18 },
      { nombre: "content-range invalido", header: "*/*", count: 19 },
      { nombre: "error http", status: 500, count: 19 },
    ]) {
      reset({
        lecturaMensajes: {
          secuencia: [{ start: 0, header: caso.header, count: caso.count, status: caso.status }],
        },
        salientes: 11,
        conversaciones: 4,
      });
      await assert.rejects(
        () => computeResumen(USER_PEQUENO, query),
        (error) => error && error.code === "METRICAS_LECTURA_INCOMPLETA",
        caso.nombre
      );
      assert.deepEqual(
        paginasDe().map((call) => call.range),
        ["0-999"]
      );
      assert.equal(postsRpc().length, 0);
    }
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("paginación estricta: rangos reales, 416 y tope sin parcial", async () => {
  delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  installStub();
  try {
    const query = { periodo: "7d", conexion_whatsapp_id: LINE_A };

    reset({
      lecturaMensajes: {
        secuencia: [
          { start: 0, header: "0-399/1200", count: 400 },
          { start: 400, header: "400-799/1200", count: 400 },
          { start: 800, header: "800-999/1200", count: 200 },
          { start: 1000, header: "1000-1199/1200", count: 200 },
        ],
      },
      salientes: 11,
      conversaciones: 4,
    });
    const completas = await computeResumen(USER_PEQUENO, query);
    const paginas = calls.filter(
      (call) => call.url.includes("/mensajes") && call.url.includes("cliente_numero")
    );
    assert.equal(completas.kpis.respuestas, 1200);
    assert.equal(paginas.length, 4);
    assert.ok(paginas.every((call) => call.url.includes("order=id.asc")));
    assert.deepEqual(
      paginas.map((call) => call.range),
      ["0-999", "400-1399", "800-1799", "1000-1999"]
    );
    assert.equal(postsRpc().length, 0);
    assert.equal(completas.kpis.ventas, 0);
    assert.equal(completas.kpis.ingresos, 0);
    assert.equal(completas.kpis.seguimientosActivos, 0);

    const rechazos = [
      {
        nombre: "hueco",
        secuencia: [
          { start: 0, header: "0-499/1000", count: 500 },
          { start: 500, header: "600-999/1000", count: 400 },
        ],
      },
      {
        nombre: "repetido",
        secuencia: [
          { start: 0, header: "0-399/1200", count: 400 },
          { start: 400, header: "0-399/1200", count: 400 },
        ],
      },
      {
        nombre: "inicio",
        secuencia: [{ start: 0, header: "800-999/1200", count: 200 }],
      },
      {
        nombre: "cuerpo",
        secuencia: [{ start: 0, header: "0-999/1000", count: 999 }],
      },
      {
        nombre: "416 antes",
        secuencia: [
          { start: 0, header: "0-399/1200", count: 400 },
          { start: 400, status: 416, header: "*/1200" },
        ],
      },
      {
        nombre: "star con filas",
        secuencia: [{ start: 0, header: "*/0", count: 2 }],
      },
      {
        nombre: "header ausente",
        secuencia: [{ start: 0, header: null, count: 10 }],
      },
      {
        nombre: "pagina intermedia",
        secuencia: [
          { start: 0, header: "0-999/2500", count: 1000 },
          { start: 1000, status: 500 },
        ],
      },
      {
        nombre: "vacio contradice",
        secuencia: [
          { start: 0, header: "0-399/1200", count: 400 },
          { start: 400, header: "*/0", count: 0 },
        ],
      },
    ];
    for (const caso of rechazos) {
      reset({ lecturaMensajes: { secuencia: caso.secuencia }, salientes: 11, conversaciones: 4 });
      await assert.rejects(
        () => computeResumen(USER_PEQUENO, query),
        (error) => error && error.code === "METRICAS_LECTURA_INCOMPLETA",
        caso.nombre
      );
    }

    reset({
      lecturaMensajes: {
        secuencia: [
          { start: 0, header: "0-999/*", count: 1000 },
          { start: 1000, status: 416, header: "*/1000" },
        ],
      },
      salientes: 11,
      conversaciones: 4,
    });
    const despues = await computeResumen(USER_PEQUENO, query);
    assert.equal(despues.kpis.respuestas, 1000);

    reset({
      lecturaMensajes: { secuencia: [{ start: 0, header: "*/0", count: 0 }] },
      salientes: 0,
      conversaciones: 4,
    });
    const vacio = await computeResumen(USER_PEQUENO, query);
    assert.equal(vacio.kpis.respuestas, 0);

    reset({
      lecturaMensajes: { total: PAGINAS_MAX_METRICAS * PAGINA_FILAS_METRICAS + 1 },
      salientes: 11,
      conversaciones: 4,
    });
    const antes = calls.length;
    await assert.rejects(
      () => computeResumen(USER_PEQUENO, query),
      (error) => error.code === "METRICAS_LECTURA_INCOMPLETA"
    );
    const delTope = calls.slice(antes).filter(
      (call) => call.url.includes("/mensajes") && call.url.includes("cliente_numero")
    );
    assert.equal(delTope.length, PAGINAS_MAX_METRICAS);
    assert.ok(delTope.every((call) => call.url.includes("order=id.asc")));
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("embudo y diagnóstico usan la misma fuente que el resumen", async () => {
  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    reset({
      rpcFilas: [
        filaRpc(LINE_A, {
          salientes: 8,
          entrantes: 6,
          respuestas: 7,
          clientes_con_mensaje: 7,
          conversaciones: 9,
          conversaciones_anterior: 3,
        }),
      ],
    });
    const query = { periodo: "7d", conexion_whatsapp_id: LINE_A };
    const resumen = await computeResumen(USER_PEQUENO, query);
    const postsResumen = postsRpc().length;
    const funnel = await computeFunnel(USER_PEQUENO, query);
    const diagnostico = await computeDiagnostico(USER_PEQUENO, query);
    const respuestas = funnel.etapas.find((paso) => paso.nombre === "Respuestas");
    const conversaciones = funnel.etapas.find((paso) => paso.nombre === "Conversaciones");
    assert.equal(respuestas.cantidad, 7);
    assert.equal(conversaciones.cantidad, 9);
    assert.equal(resumen.kpis.respuestas, respuestas.cantidad);
    assert.equal(resumen.kpis.conversaciones, conversaciones.cantidad);
    assert.equal(resumen.kpis.mensajesEnviados, 8);
    assert.equal(postsRpc().length, postsResumen + 2);
    assert.ok(diagnostico.items.some((item) => item.texto === "Hay interés pero no hay cierre"));
    assert.ok(diagnostico.items.every((item) => item.texto !== "La respuesta del lead está baja"));

    reset({ rpc: "timeout", salientes: 11, entrantes: 7, conversaciones: 4 });
    const resumenLegacy = await computeResumen(USER_PEQUENO, query);
    const funnelLegacy = await computeFunnel(USER_PEQUENO, query);
    const respuestasLegacy = funnelLegacy.etapas.find((paso) => paso.nombre === "Respuestas");
    const conversacionesLegacy = funnelLegacy.etapas.find((paso) => paso.nombre === "Conversaciones");
    assert.equal(respuestasLegacy.cantidad, 2);
    assert.equal(resumenLegacy.kpis.respuestas, 2);
    assert.equal(conversacionesLegacy.cantidad, 4);
    assert.equal(resumenLegacy.kpis.conversaciones, 4);
    assert.equal(resumenLegacy.kpis.mensajesEnviados, 11);
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("todas las líneas con flujo no mezclan fuentes", async () => {
  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    reset({
      rpc: "incompleta",
      rpcFilas: [filaRpc(LINE_A, { salientes: 99, entrantes: 99, respuestas: 99, conversaciones: 99 })],
      salientes: 11,
      entrantes: 7,
    });
    const mezclada = await computeResumen(USER_GRANDE, { periodo: "7d", flujo_id: FLUJO });
    assert.equal(postsRpc().length, 0);
    assert.equal(mezclada.kpis.mensajesEnviados, 0);
    assert.equal(mezclada.kpis.respuestas, 0);
    assert.notEqual(mezclada.kpis.mensajesEnviados, 99);

    const queryTodas = { periodo: "7d" };
    reset({
      rpcFilas: [
        filaRpc(LINE_A, { salientes: 99, entrantes: 99, respuestas: 99, conversaciones: 99 }),
        filaRpc(LINE_B, { salientes: 99, entrantes: 99, respuestas: 99, conversaciones: 99 }),
      ],
      salientes: 11,
      entrantes: 7,
    });
    const resumenTodas = await computeResumen(USER_GRANDE, queryTodas);
    const funnelTodas = await computeFunnel(USER_GRANDE, queryTodas);
    const diagnosticoTodas = await computeDiagnostico(USER_GRANDE, queryTodas);
    assert.equal(postsRpc().length, 0);
    assert.equal(resumenTodas.kpis.mensajesEnviados, 22);
    assert.notEqual(resumenTodas.kpis.mensajesEnviados, 198);
    const respuestasFunnel = funnelTodas.etapas.find((paso) => paso.nombre === "Respuestas");
    assert.equal(respuestasFunnel.cantidad, 2);
    assert.notEqual(respuestasFunnel.cantidad, 99);
    assert.equal(diagnosticoTodas.ok, true);
    assert.equal(diagnosticoTodas.desde, funnelTodas.desde);
    assert.equal(diagnosticoTodas.hasta, funnelTodas.hasta);
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

test("el usuario de la sesión no se reemplaza por un id del cliente", async () => {
  const api = fs.readFileSync(path.join(__dirname, "..", "routes", "metricasApi.js"), "utf8");
  assert.match(api, /req\.session\.usuario\.id/);
  assert.doesNotMatch(api, /req\.query\.usuario_id/);
  assert.doesNotMatch(api, /req\.body\.usuario_id/);

  const ajeno = simularConteoLinea(
    [mensaje(USER_GRANDE, LINE_A, "999", "entrante", DESDE)],
    [],
    { usuarioId: USER_PEQUENO, conexionId: LINE_A, desde: DESDE, hasta: HASTA }
  );
  assert.equal(ajeno.entrantes, 0);
  assert.equal(ajeno.respuestas, 0);
  assert.equal(ajeno.conversaciones, 0);

  process.env.METRICAS_RPC_RESUMEN_CONTEOS = "1";
  installStub();
  try {
    reset({ rpcFilas: [] });
    const resumen = await computeResumen(USER_PEQUENO, {
      periodo: "7d",
      conexion_whatsapp_id: LINE_A,
      usuario_id: USER_GRANDE,
    });
    assert.equal(postsRpc().length, 1);
    assert.equal(postsRpc()[0].body.p_usuario_id, USER_PEQUENO);
    assert.notEqual(postsRpc()[0].body.p_usuario_id, USER_GRANDE);
    assert.equal(resumen.kpis.mensajesEnviados, 11);
    assert.notEqual(resumen.kpis.mensajesEnviados, 0);
  } finally {
    restoreStub();
    delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;
  }
});

function mensaje(usuarioId, conexionId, clienteNumero, direccion, creadoEn) {
  return {
    usuario_id: usuarioId,
    conexion_whatsapp_id: conexionId,
    cliente_numero: clienteNumero,
    direccion,
    creado_en: creadoEn,
  };
}

function conversacion(usuarioId, conexionId, clienteNumero, creadoEn) {
  return {
    usuario_id: usuarioId,
    conexion_whatsapp_id: conexionId,
    cliente_numero: clienteNumero,
    creado_en: creadoEn,
  };
}
