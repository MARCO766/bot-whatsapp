/**
 * Ingresos de crm_conversiones con todas las páginas.
 * No consulta Supabase de producción: axios queda sustituido.
 * Ejecutar: node --test tests/metricasIngresosPaginacion.test.js
 */
const assert = require("assert");
const test = require("node:test");
const axios = require("axios");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-key";
delete process.env.METRICAS_RPC_RESUMEN_CONTEOS;

const { computeResumen } = require("../services/metricasService");

const USER = "usuario-ingresos";
const OTRO = "usuario-ajeno";
const LINE_A = "linea-a";
const LINE_B = "linea-b";
const FLUJO = "flujo-1";
const DESDE = "2026-11-01T04:00:00.000Z";
const HASTA = "2026-11-08T03:59:59.999Z";

const originalGet = axios.get;
const originalPost = axios.post;
const calls = [];
const state = {
  ventas: [],
  modo: "normal",
};

function httpError(status, message) {
  const err = new Error(message);
  err.response = { status, data: { message }, headers: {} };
  return err;
}

function counted(n) {
  return { data: [], headers: { "content-range": `*/${n}` } };
}

function vacio() {
  return { data: [], headers: { "content-range": "*/0" } };
}

function queryDe(url) {
  return new URL(String(url), "https://example.supabase.co").searchParams;
}

function rangoDe(config) {
  const raw = String(config?.headers?.Range || "0-999");
  const [ini, fin] = raw.split("-");
  const start = parseInt(ini, 10) || 0;
  const end = parseInt(fin, 10);
  const pedido = Number.isFinite(end) ? end - start + 1 : 1000;
  return { start, pedido };
}

function periodoActual(url) {
  return String(url).includes(`creado_en=gte.${encodeURIComponent(DESDE)}`);
}

function ventasDeUrl(url) {
  const q = queryDe(url);
  const usuario = q.get("usuario_id")?.replace(/^eq\./, "");
  const conexion = q.get("conexion_whatsapp_id")?.replace(/^eq\./, "");
  const flujo = q.get("flujo_id")?.replace(/^eq\./, "");
  const actual = periodoActual(url);
  return state.ventas.filter((venta) => {
    if (usuario && venta.usuario !== usuario) return false;
    if (conexion && venta.conexion !== conexion) return false;
    if (flujo && venta.flujo !== flujo) return false;
    if (actual && venta.fuera) return false;
    return true;
  });
}

function servirVentas(url, config) {
  const lista = ventasDeUrl(url);
  const { start, pedido } = rangoDe(config);
  if (state.modo === "fallar" && start >= state.fallarDesde) {
    throw httpError(500, "fallo de pagina");
  }
  if (start >= lista.length) {
    const err = httpError(416, "range");
    err.response.headers = { "content-range": `*/${lista.length}` };
    throw err;
  }
  let slice = lista.slice(start, start + pedido);
  if (state.modo === "duplicar" && start > 0 && slice.length) {
    slice = slice.map((row, i) => (i === 0 ? { ...row, id: lista[0].id } : row));
  }
  if (state.modo === "acortar" && start === 0) {
    return {
      data: slice.slice(0, 10),
      headers: { "content-range": `${start}-${start + pedido - 1}/${lista.length}` },
    };
  }
  const last = start + slice.length - 1;
  return { data: slice, headers: { "content-range": `${start}-${last}/${lista.length}` } };
}

function venta(id, valor, moneda, extra = {}) {
  return {
    id: String(id),
    valor,
    moneda,
    usuario: extra.usuario || USER,
    conexion: extra.conexion || LINE_A,
    flujo: extra.flujo || FLUJO,
    fuera: extra.fuera === true,
  };
}

function serie(total, moneda, extra = {}) {
  return Array.from({ length: total }, (_, i) =>
    venta(`${extra.prefijo || moneda}-${i}`, 1, moneda, extra)
  );
}

function installStub() {
  axios.get = async (url, config) => {
    const target = String(url);
    calls.push({ url: target, headers: config?.headers || {} });
    if (target.includes("/crm_conversiones") && target.includes("valor")) {
      return servirVentas(target, config);
    }
    if (target.includes("/conexiones_whatsapp") && target.includes("select=id")) {
      return { data: [{ id: LINE_A }, { id: LINE_B }], headers: { "content-range": "0-1/2" } };
    }
    if (target.includes("/crm_conversiones") && target.includes("select=id")) {
      const head = String(config?.headers?.Range) === "0-0";
      const actual = periodoActual(target);
      if (head && actual && state.fallarHeadActual) throw httpError(500, "fallo head actual");
      if (head && !actual && state.fallarHeadAnterior) throw httpError(500, "fallo head anterior");
      if (head) return counted(actual ? ventasDeUrl(target).length : 0);
      return vacio();
    }
    if (target.includes("select=id")) return counted(0);
    return vacio();
  };
  axios.post = async () => ({ data: 0, headers: {} });
}

function restoreStub() {
  axios.get = originalGet;
  axios.post = originalPost;
}

function reset(extra = {}) {
  calls.length = 0;
  state.ventas = [];
  state.modo = "normal";
  state.fallarDesde = 1000;
  state.fallarHeadActual = false;
  state.fallarHeadAnterior = false;
  Object.assign(state, extra);
}

function queryLinea() {
  return {
    periodo: "custom",
    desde: DESDE,
    hasta: HASTA,
    conexion_whatsapp_id: LINE_A,
    flujo_id: FLUJO,
  };
}

function lecturasValor() {
  return calls.filter((call) => call.url.includes("/crm_conversiones") && call.url.includes("valor"));
}

test("menos de 1000 ventas conserva el importe y la moneda de una línea", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("1", 10, "BOB"),
        venta("2", 5.5, "BOB"),
        venta("3", 4, "USD", { flujo: "otro" }),
        venta("4", 100, "BOB", { conexion: LINE_B }),
        venta("5", 50, "BOB", { usuario: OTRO }),
      ],
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresos, 15.5);
    assert.equal(resumen.kpis.moneda, "BOB");
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 15.5);
    assert.equal(resumen.kpis.ingresosDesglose.USD, undefined);
    assert.equal(lecturasValor().length, 1);
  } finally {
    restoreStub();
  }
});

test("más de 1000 ventas suma también la página siguiente", async () => {
  installStub();
  try {
    reset({ ventas: serie(1001, "USD") });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 1001);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 1001);
    assert.equal(resumen.kpis.ingresos, 1001);
    assert.deepEqual(
      lecturasValor().map((call) => call.headers.Range),
      ["0-999", "1000-1999"]
    );
  } finally {
    restoreStub();
  }
});

test("más de 50000 ventas no se queda en la primera página", async () => {
  installStub();
  try {
    reset({ ventas: serie(50001, "CLP") });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 50001);
    assert.equal(resumen.kpis.ingresosDesglose.CLP, 50001);
    assert.equal(lecturasValor().length, 51);
    assert.equal(lecturasValor()[50].headers.Range, "50000-50999");
  } finally {
    restoreStub();
  }
});

test("varias monedas no se mezclan ni se convierten", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("1", 10, "BOB"),
        venta("2", 4, "USD"),
        venta("3", 7, "ARS"),
        venta("4", 2.5, "BOB"),
        venta("5", 20, null),
      ],
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 32.5);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 4);
    assert.equal(resumen.kpis.ingresosDesglose.ARS, 7);
    assert.equal(resumen.kpis.ingresos, 32.5);
    assert.notEqual(
      resumen.kpis.ingresos,
      32.5 + 4 + 7
    );
  } finally {
    restoreStub();
  }
});

test("todas las líneas agrupan por moneda sin duplicar la venta de cada conexión", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("a1", 10, "BOB", { conexion: LINE_A, flujo: "fa" }),
        venta("b1", 3, "USD", { conexion: LINE_B, flujo: "fb" }),
        venta("b2", 1, "BOB", { conexion: LINE_B, flujo: "fb" }),
      ],
    });
    const resumen = await computeResumen(USER, {
      periodo: "custom",
      desde: DESDE,
      hasta: HASTA,
    });
    assert.equal(resumen.kpis.ventas, 3);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 11);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 3);
    const urls = lecturasValor().map((call) => call.url);
    assert.equal(urls.length, 2);
    assert.ok(urls.some((url) => url.includes(`conexion_whatsapp_id=eq.${LINE_A}`)));
    assert.ok(urls.some((url) => url.includes(`conexion_whatsapp_id=eq.${LINE_B}`)));
    assert.ok(urls.every((url) => !url.includes("flujo_id=")));
  } finally {
    restoreStub();
  }
});

test("los filtros de usuario, conexión, flujo y fechas van en cada página", async () => {
  installStub();
  try {
    reset({ ventas: serie(1001, "USD") });
    await computeResumen(USER, queryLinea());
    assert.ok(lecturasValor().length >= 2);
    lecturasValor().forEach((call) => {
      const url = call.url;
      assert.ok(url.includes(`usuario_id=eq.${encodeURIComponent(USER)}`));
      assert.ok(!url.includes(OTRO));
      assert.ok(url.includes(`conexion_whatsapp_id=eq.${encodeURIComponent(LINE_A)}`));
      assert.ok(url.includes(`flujo_id=eq.${encodeURIComponent(FLUJO)}`));
      assert.ok(url.includes(`creado_en=gte.${encodeURIComponent(DESDE)}`));
      assert.ok(url.includes(`creado_en=lte.${encodeURIComponent(HASTA)}`));
      assert.ok(url.includes("order=id.asc"));
      assert.equal(call.headers.Prefer, "count=exact");
    });
  } finally {
    restoreStub();
  }
});

test("una página con un id repetido no publica el importe parcial", async () => {
  installStub();
  try {
    reset({ ventas: serie(1001, "USD"), modo: "duplicar" });
    await assert.rejects(computeResumen(USER, queryLinea()), (error) => {
      assert.equal(error.code, "METRICAS_LECTURA_INCOMPLETA");
      return true;
    });
  } finally {
    restoreStub();
  }
});

test("una página incompleta no publica el importe parcial", async () => {
  installStub();
  try {
    reset({ ventas: serie(1001, "USD"), modo: "acortar" });
    await assert.rejects(computeResumen(USER, queryLinea()), (error) => {
      assert.equal(error.code, "METRICAS_LECTURA_INCOMPLETA");
      return true;
    });
  } finally {
    restoreStub();
  }
});

test("un error en una página posterior no publica el importe de la primera", async () => {
  installStub();
  try {
    reset({ ventas: serie(1001, "USD"), modo: "fallar", fallarDesde: 1000 });
    await assert.rejects(computeResumen(USER, queryLinea()), (error) => {
      assert.equal(error.code, "METRICAS_LECTURA_INCOMPLETA");
      return true;
    });
  } finally {
    restoreStub();
  }
});

test("una conexión sin flujo cuenta todas sus ventas del periodo", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("1", 10, "BOB", { flujo: "fa" }),
        venta("2", 5, "USD", { flujo: "fb" }),
        venta("3", 99, "BOB", { conexion: LINE_B, flujo: "fa" }),
      ],
    });
    const resumen = await computeResumen(USER, {
      periodo: "custom",
      desde: DESDE,
      hasta: HASTA,
      conexion_whatsapp_id: LINE_A,
    });
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 10);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 5);
    assert.ok(lecturasValor().every((call) => !call.url.includes("flujo_id=")));
  } finally {
    restoreStub();
  }
});

test("una conexión con flujo solo cuenta las ventas de ese flujo", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("1", 10, "BOB"),
        venta("2", 4, "USD", { flujo: "otro" }),
      ],
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 1);
    assert.equal(resumen.kpis.ingresos, 10);
    assert.equal(resumen.kpis.ingresosDesglose.USD, undefined);
  } finally {
    restoreStub();
  }
});

test("todas las líneas con flujo suman el conteo de cada conexión", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("a1", 10, "BOB", { conexion: LINE_A, flujo: FLUJO }),
        venta("a2", 40, "BOB", { conexion: LINE_A, flujo: "otro" }),
        venta("b1", 3, "USD", { conexion: LINE_B, flujo: FLUJO }),
      ],
    });
    const resumen = await computeResumen(USER, {
      periodo: "custom",
      desde: DESDE,
      hasta: HASTA,
      flujo_id: FLUJO,
    });
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 10);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 3);
    const urls = lecturasValor().map((call) => call.url);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => url.includes(`flujo_id=eq.${FLUJO}`)));
  } finally {
    restoreStub();
  }
});

test("un HEAD del periodo actual en cero no cambia el conteo de las filas", async () => {
  installStub();
  try {
    reset({
      ventas: [venta("1", 10, "BOB"), venta("2", 5.5, "BOB")],
      fallarHeadActual: true,
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresos, 15.5);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 15.5);
  } finally {
    restoreStub();
  }
});

test("una venta con valor no numérico cuenta y no suma importe", async () => {
  installStub();
  try {
    reset({
      ventas: [venta("1", 10, "BOB"), venta("2", "no-numero", "USD")],
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresos, 10);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 10);
    assert.equal(resumen.kpis.ingresosDesglose.USD, undefined);
  } finally {
    restoreStub();
  }
});

test("quedan fuera ventas de otro usuario, conexión, flujo o fecha", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("ok", 8, "BOB"),
        venta("user", 100, "BOB", { usuario: OTRO }),
        venta("line", 100, "BOB", { conexion: LINE_B }),
        venta("flow", 100, "BOB", { flujo: "otro" }),
        venta("fecha", 100, "BOB", { fuera: true }),
      ],
    });
    const resumen = await computeResumen(USER, queryLinea());
    assert.equal(resumen.kpis.ventas, 1);
    assert.equal(resumen.kpis.ingresos, 8);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 8);
  } finally {
    restoreStub();
  }
});

test("un fallo del HEAD anterior no cambia las ventas del periodo actual", async () => {
  installStub();
  try {
    reset({
      ventas: [venta("1", 10, "BOB"), venta("2", 5.5, "BOB")],
      fallarHeadAnterior: true,
    });
    const resumen = await computeResumen(USER, queryLinea());
    const anteriores = calls.filter(
      (call) =>
        call.url.includes("/crm_conversiones") &&
        call.headers.Range === "0-0" &&
        !periodoActual(call.url)
    );
    assert.ok(anteriores.length >= 1);
    assert.equal(resumen.kpis.ventas, 2);
    assert.equal(resumen.kpis.ingresos, 15.5);
  } finally {
    restoreStub();
  }
});

test("todas las líneas sin flujo conservan el conteo de las filas", async () => {
  installStub();
  try {
    reset({
      ventas: [
        venta("a1", 10, "BOB", { conexion: LINE_A, flujo: "fa" }),
        venta("b1", 3, "USD", { conexion: LINE_B, flujo: "fb" }),
        venta("b2", 1, "BOB", { conexion: LINE_B, flujo: "fb" }),
      ],
      fallarHeadActual: true,
    });
    const resumen = await computeResumen(USER, {
      periodo: "custom",
      desde: DESDE,
      hasta: HASTA,
    });
    assert.equal(resumen.kpis.ventas, 3);
    assert.equal(resumen.kpis.ingresosDesglose.BOB, 11);
    assert.equal(resumen.kpis.ingresosDesglose.USD, 3);
    assert.ok(lecturasValor().every((call) => !call.url.includes("flujo_id=")));
  } finally {
    restoreStub();
  }
});
