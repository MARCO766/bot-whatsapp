/**
 * GET /api/inbox?flujo_id= — filtro por producto sin cambiar la bandeja sin ese parámetro.
 * Mocks HTTP, sin Supabase real.
 * Ejecutar: node tests/inboxFlujoFiltro.test.js
 */
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const axios = require("axios");

process.env.SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SECRET_KEY = "test-key";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONN = "11111111-1111-4111-8111-111111111111";
const CONN_B = "22222222-2222-4222-8222-222222222222";
const FLUJO_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FLUJO_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FLUJO_AJENO = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FLUJO_OTRA_LINEA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FLUJO_VACIO = "abababab-abab-4aba-8aba-abababababab";

function conv(id, numero, fecha, unread, texto) {
  return {
    id,
    usuario_id: USER,
    cliente_numero: numero,
    conexion_whatsapp_id: CONN,
    ultimo_mensaje: texto,
    ultimo_mensaje_en: fecha,
    unread_count: unread,
  };
}

const conversaciones = [
  conv("c999", "591999", "2026-05-07T10:00:00.000Z", 1, "ajeno-sesion"),
  conv("c500", "591500", "2026-05-06T10:00:00.000Z", 4, "sin-flujo"),
  conv("c100", "591100", "2026-05-05T10:00:00.000Z", 2, "hola-100"),
  conv("c200", "591200", "2026-05-04T10:00:00.000Z", 0, "hola-200"),
  conv("c300", "591300", "2026-05-03T10:00:00.000Z", 1, "hola-300"),
  conv("c400", "591400", "2026-05-02T10:00:00.000Z", 0, "otra-linea"),
  conv("c600", "591600", "2026-05-01T10:00:00.000Z", 0, "hola-600"),
  {
    id: "cx",
    usuario_id: OTHER,
    cliente_numero: "591100",
    conexion_whatsapp_id: CONN,
    ultimo_mensaje: "no-debe-salir",
    ultimo_mensaje_en: "2026-05-09T10:00:00.000Z",
    unread_count: 9,
  },
];

const sesiones = [];
for (let i = 0; i < 8; i += 1) {
  sesiones.push({
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591100",
    flujo_id: FLUJO_A,
    status: i === 0 ? "active" : "finished",
  });
}
sesiones.push(
  {
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591100",
    flujo_id: FLUJO_B,
    status: "finished",
  },
  {
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591200",
    flujo_id: FLUJO_A,
    status: "expired",
  },
  {
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591300",
    flujo_id: FLUJO_B,
    status: "active",
  },
  {
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591600",
    flujo_id: FLUJO_A,
    status: "finished",
  },
  {
    usuario_id: USER,
    conexion_whatsapp_id: CONN_B,
    cliente_numero: "591400",
    flujo_id: FLUJO_A,
    status: "active",
  },
  {
    usuario_id: OTHER,
    conexion_whatsapp_id: CONN,
    cliente_numero: "591999",
    flujo_id: FLUJO_A,
    status: "active",
  }
);

const flujos = [
  { id: FLUJO_A, usuario_id: USER, conexion_whatsapp_id: CONN },
  { id: FLUJO_B, usuario_id: USER, conexion_whatsapp_id: CONN },
  { id: FLUJO_AJENO, usuario_id: OTHER, conexion_whatsapp_id: CONN_B },
  { id: FLUJO_OTRA_LINEA, usuario_id: USER, conexion_whatsapp_id: CONN_B },
  { id: FLUJO_VACIO, usuario_id: USER, conexion_whatsapp_id: CONN },
];

const etiquetas = [
  { usuario_id: USER, cliente_numero: "591100", conexion_whatsapp_id: CONN, etiqueta: "VIP" },
  { usuario_id: USER, cliente_numero: "591300", conexion_whatsapp_id: CONN, etiqueta: "VIP" },
  { usuario_id: USER, cliente_numero: "591500", conexion_whatsapp_id: CONN, etiqueta: "VIP" },
  { usuario_id: OTHER, cliente_numero: "591100", conexion_whatsapp_id: CONN, etiqueta: "VIP" },
];

const clientes = [
  { usuario_id: USER, numero: "591100", nombre: "Ana", estado: "activo" },
  { usuario_id: USER, numero: "591200", nombre: "Beto", estado: "activo" },
  { usuario_id: USER, numero: "591500", nombre: "Eva", estado: "activo" },
];

const mensajesHilo = [
  {
    id: "m1",
    usuario_id: USER,
    cliente_numero: "591100",
    conexion_whatsapp_id: CONN,
    contenido: "primero",
    creado_en: "2026-04-01T00:00:00.000Z",
  },
  {
    id: "m2",
    usuario_id: USER,
    cliente_numero: "591100",
    conexion_whatsapp_id: CONN,
    contenido: "despues-de-cambiar-flujo",
    creado_en: "2026-05-05T00:00:00.000Z",
  },
];

let fuenteConversaciones = conversaciones;
let fuenteSesiones = sesiones;
let fuenteEtiquetas = etiquetas;

const llamadas = [];
const rpcs = [];
const axiosGetOriginal = axios.get.bind(axios);
const axiosPostOriginal = axios.post.bind(axios);

function param(url, key) {
  const match = new RegExp(`[?&]${key}=eq\\.([^&]*)`).exec(url);
  return match ? decodeURIComponent(match[1]) : "";
}

function queryNum(url, key) {
  const match = new RegExp(`[?&]${key}=(\\d+)`).exec(url);
  return match ? Number(match[1]) : null;
}

function parseIn(url) {
  const match = /cliente_numero=in\.\(([^)]*)\)/.exec(url);
  if (!match) return null;
  return match[1]
    .split(",")
    .map((parte) => parte.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function parseOrPares(url) {
  const pares = [];
  const decoded = decodeURIComponent(url);
  const re = /cliente_numero\.eq\.([^,&)]+).*?conexion_whatsapp_id\.eq\.([^,&)]+)/g;
  let match = re.exec(decoded);
  while (match) {
    pares.push({ cliente_numero: match[1], conexion: match[2] });
    match = re.exec(decoded);
  }
  return pares;
}

function filtraConversaciones(url) {
  const usuarioId = param(url, "usuario_id");
  const conexionId = param(url, "conexion_whatsapp_id");
  let rows = conversaciones.filter((c) => c.usuario_id === usuarioId);
  if (conexionId) {
    rows = rows.filter((c) => c.conexion_whatsapp_id === conexionId);
  }
  if (url.includes("or=(")) {
    const pares = parseOrPares(url);
    rows = rows.filter((c) =>
      pares.some(
        (p) =>
          p.cliente_numero === c.cliente_numero &&
          p.conexion === c.conexion_whatsapp_id
      )
    );
    return rows;
  }
  rows = rows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.ultimo_mensaje_en).getTime() -
        new Date(a.ultimo_mensaje_en).getTime()
    );
  const numero = param(url, "cliente_numero");
  if (numero) rows = rows.filter((c) => c.cliente_numero === numero);
  return rows;
}

axios.get = async (url) => {
  llamadas.push(url);

  if (url.includes("/rest/v1/flow_sessions")) {
    throw new Error("el filtro no debe consultar flow_sessions por contacto: " + url);
  }

  if (url.includes("/rest/v1/flujos_builder")) {
    assert.ok(url.includes("select=id"), url);
    const row = flujos.find(
      (f) =>
        f.id === param(url, "id") &&
        f.usuario_id === param(url, "usuario_id") &&
        f.conexion_whatsapp_id === param(url, "conexion_whatsapp_id")
    );
    return { data: row ? [{ id: row.id }] : [], headers: {} };
  }

  if (url.includes("/rest/v1/conversaciones")) {
    const rows = filtraConversaciones(url);
    if (url.includes("select=id")) {
      return {
        data: [],
        headers: { "content-range": `0-0/${rows.length}` },
      };
    }
    if (url.includes("or=(")) {
      return { data: rows, headers: {} };
    }
    const limit = queryNum(url, "limit");
    const offset = queryNum(url, "offset") || 0;
    const page = limit == null ? rows : rows.slice(offset, offset + limit);
    return { data: page, headers: {} };
  }

  if (url.includes("/rest/v1/clientes_etiquetas")) {
    const usuarioId = param(url, "usuario_id");
    const etiqueta = param(url, "etiqueta");
    let rows = etiquetas.filter((e) => e.usuario_id === usuarioId);
    if (etiqueta) rows = rows.filter((e) => e.etiqueta === etiqueta);
    const limit = queryNum(url, "limit");
    const offset = queryNum(url, "offset") || 0;
    if (limit != null) rows = rows.slice(offset, offset + limit);
    return { data: rows, headers: {} };
  }

  if (url.includes("/rest/v1/etiquetas?")) {
    return {
      data: [{ nombre: "VIP", color: "#ff0000", conexion_whatsapp_id: CONN }],
      headers: {},
    };
  }

  if (url.includes("/rest/v1/clientes?")) {
    const usuarioId = param(url, "usuario_id");
    return {
      data: clientes.filter((c) => c.usuario_id === usuarioId),
      headers: {},
    };
  }

  if (url.includes("/rest/v1/conexiones_whatsapp")) {
    return {
      data: [{ id: CONN, nombre: "Ventas", numero: "591700", activo: true }],
      headers: {},
    };
  }

  if (url.includes("/rest/v1/mensajes")) {
    assert.ok(!url.includes("flujo_id"), url);
    const numero = param(url, "cliente_numero");
    const rows = mensajesHilo.filter(
      (m) => !numero || m.cliente_numero === numero
    );
    return { data: rows, headers: {} };
  }

  throw new Error("url no esperada: " + url);
};

function compararComoSql(a, b) {
  const aNull = a.ultimo_mensaje_en == null || a.ultimo_mensaje_en === "";
  const bNull = b.ultimo_mensaje_en == null || b.ultimo_mensaje_en === "";
  if (aNull !== bNull) return aNull ? -1 : 1;
  if (!aNull) {
    const delta = new Date(b.ultimo_mensaje_en) - new Date(a.ultimo_mensaje_en);
    if (delta !== 0) return delta;
  }
  return String(b.cliente_numero).localeCompare(String(a.cliente_numero));
}

function paginaRpc(body) {
  const flujoPropio = flujos.some(
    (f) =>
      f.id === body.p_flujo_id &&
      f.usuario_id === body.p_usuario_id &&
      f.conexion_whatsapp_id === body.p_conexion_whatsapp_id
  );
  if (!flujoPropio) return [];
  const etiqueta = body.p_etiqueta == null ? "" : String(body.p_etiqueta);
  const coinciden = fuenteConversaciones.filter((c) => {
    if (c.usuario_id !== body.p_usuario_id) return false;
    if (c.conexion_whatsapp_id !== body.p_conexion_whatsapp_id) return false;
    if (!c.cliente_numero) return false;
    const haySesion = fuenteSesiones.some(
      (s) =>
        s.usuario_id === c.usuario_id &&
        s.conexion_whatsapp_id === c.conexion_whatsapp_id &&
        s.cliente_numero === c.cliente_numero &&
        s.flujo_id === body.p_flujo_id
    );
    if (!haySesion) return false;
    if (!etiqueta) return true;
    return fuenteEtiquetas.some(
      (e) =>
        e.usuario_id === c.usuario_id &&
        e.conexion_whatsapp_id === c.conexion_whatsapp_id &&
        e.cliente_numero === c.cliente_numero &&
        e.etiqueta === etiqueta
    );
  });
  coinciden.sort(compararComoSql);
  const limit = Number(body.p_limit) || 0;
  const offset = Number(body.p_offset) || 0;
  return coinciden.slice(offset, offset + limit);
}

axios.post = async (url, body) => {
  rpcs.push({ url, body });
  if (!url.includes("/rpc/inbox_conversaciones_por_flujo")) {
    throw new Error("post no esperado: " + url);
  }
  assert.ok(body.p_usuario_id && body.p_conexion_whatsapp_id && body.p_flujo_id);
  return { data: paginaRpc(body), headers: {} };
};

const { loadInboxData, loadChatMessages } = require("../services/inboxService");
const inboxRouter = require("../routes/inboxApi");

let session = null;
const app = express();
app.use((req, _res, next) => {
  req.session = session;
  next();
});
app.use(inboxRouter);

function pedir(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            server.close();
            const text = Buffer.concat(chunks).toString("utf8");
            let json = null;
            try {
              json = JSON.parse(text);
            } catch {
              json = { raw: text };
            }
            resolve({ status: res.statusCode, json });
          });
        })
        .on("error", (err) => {
          server.close();
          reject(err);
        });
    });
  });
}

function numeros(json) {
  return (json.chats || []).map((c) => c.cliente_numero);
}

function sinSesiones(urls) {
  return (
    rpcs.length === 0 &&
    urls.every(
      (url) =>
        !url.includes("/flow_sessions") &&
        !url.includes("/flujos_builder") &&
        !url.includes("/rpc/")
    )
  );
}

function assertUnaRpc({ flujoId, limit, offset, etiqueta = null, conexion = CONN }) {
  assert.strictEqual(rpcs.length, 1);
  assert.ok(String(rpcs[0].url).includes("/rpc/inbox_conversaciones_por_flujo"));
  assert.strictEqual(rpcs[0].body.p_usuario_id, USER);
  assert.strictEqual(rpcs[0].body.p_conexion_whatsapp_id, conexion);
  assert.strictEqual(rpcs[0].body.p_flujo_id, flujoId);
  assert.strictEqual(rpcs[0].body.p_limit, limit);
  assert.strictEqual(rpcs[0].body.p_offset, offset);
  assert.strictEqual(rpcs[0].body.p_etiqueta, etiqueta);
  assert.ok(llamadas.every((url) => !url.includes("/flow_sessions")));
}

(async () => {
  session = null;
  llamadas.length = 0;
  const anon = await pedir(`/api/inbox?conexion_whatsapp_id=${CONN}`);
  assert.strictEqual(anon.status, 401);
  assert.strictEqual(llamadas.length, 0);

  session = { usuario: { id: USER } };

  llamadas.length = 0;
  const todos = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&limit=20&offset=0`
  );
  assert.strictEqual(todos.status, 200);
  assert.strictEqual(todos.json.ok, true);
  assert.ok(!("flujoId" in todos.json));
  assert.ok(sinSesiones(llamadas), "Todos no consulta sesiones ni flujos");
  assert.deepStrictEqual(numeros(todos.json), [
    "591999",
    "591500",
    "591100",
    "591200",
    "591300",
    "591400",
    "591600",
  ]);
  assert.ok(numeros(todos.json).includes("591500"));
  assert.ok(numeros(todos.json).includes("591999"));
  const urlLista = llamadas.find(
    (url) => url.includes("/conversaciones") && url.includes("select=*")
  );
  assert.ok(urlLista.includes("order=ultimo_mensaje_en.desc"));
  assert.ok(urlLista.includes("limit=20"));
  assert.ok(urlLista.includes("offset=0"));

  llamadas.length = 0;
  const todosVacio = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=&limit=20&offset=0`
  );
  assert.strictEqual(todosVacio.status, 200);
  assert.deepStrictEqual(numeros(todosVacio.json), numeros(todos.json));
  assert.strictEqual(todosVacio.json.totalNoLeidos, todos.json.totalNoLeidos);
  assert.ok(sinSesiones(llamadas));

  const ejs = await loadInboxData(USER, { etiquetaFiltro: "" });
  assert.ok(ejs.chats.length >= 1);
  assert.ok(!ejs.flujoId);

  llamadas.length = 0;
  rpcs.length = 0;
  const paginaA = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=0`
  );
  assert.strictEqual(paginaA.status, 200);
  assert.strictEqual(paginaA.json.flujoId, FLUJO_A);
  assert.deepStrictEqual(numeros(paginaA.json), ["591100", "591200"]);
  assert.strictEqual(paginaA.json.hasMore, true);
  assert.strictEqual(paginaA.json.chats[0].noLeidos, 2);
  assert.strictEqual(paginaA.json.chats[0].nombre, "Ana");
  assert.strictEqual(new Set(numeros(paginaA.json)).size, numeros(paginaA.json).length);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 3, offset: 0 });

  llamadas.length = 0;
  rpcs.length = 0;
  const paginaA2 = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=2`
  );
  assertUnaRpc({ flujoId: FLUJO_A, limit: 3, offset: 2 });
  assert.deepStrictEqual(numeros(paginaA2.json), ["591600"]);
  assert.strictEqual(paginaA2.json.hasMore, false);
  const unidos = [...numeros(paginaA.json), ...numeros(paginaA2.json)];
  assert.deepStrictEqual(unidos, ["591100", "591200", "591600"]);
  assert.strictEqual(new Set(unidos).size, unidos.length);
  assert.ok(!unidos.includes("591400"));
  assert.ok(!unidos.includes("591999"));
  assert.ok(
    paginaA.json.chats.every((chat) => chat.conexion_whatsapp_id === CONN)
  );
  assert.ok(
    paginaA2.json.chats.every((chat) => chat.conexion_whatsapp_id === CONN)
  );

  const paginaB = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_B}&limit=20&offset=0`
  );
  assert.deepStrictEqual(numeros(paginaB.json), ["591100", "591300"]);
  assert.ok(numeros(paginaA.json).includes("591100"));
  assert.ok(numeros(paginaB.json).includes("591100"));

  llamadas.length = 0;
  rpcs.length = 0;
  const soloEtiqueta = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&etiqueta=VIP&limit=20&offset=0`
  );
  assert.strictEqual(soloEtiqueta.status, 200);
  assert.deepStrictEqual(numeros(soloEtiqueta.json), ["591500", "591100", "591300"]);
  assert.ok(sinSesiones(llamadas), "la etiqueta sola no usa flow_sessions");

  llamadas.length = 0;
  rpcs.length = 0;
  const interseccion = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&etiqueta=VIP&flujo_id=${FLUJO_A}&limit=20&offset=0`
  );
  assert.strictEqual(interseccion.status, 200);
  assert.deepStrictEqual(numeros(interseccion.json), ["591100"]);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 0, etiqueta: "VIP" });

  llamadas.length = 0;
  rpcs.length = 0;
  const etiquetaVacia = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&etiqueta=&limit=2&offset=0`
  );
  assert.strictEqual(etiquetaVacia.status, 200);
  assert.deepStrictEqual(numeros(etiquetaVacia.json), ["591100", "591200"]);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 3, offset: 0, etiqueta: null });

  llamadas.length = 0;
  rpcs.length = 0;
  const etiquetaEspacios = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&etiqueta=${encodeURIComponent("   ")}&limit=20&offset=0`
  );
  assert.strictEqual(etiquetaEspacios.status, 200);
  assert.deepStrictEqual(numeros(etiquetaEspacios.json), []);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 0, etiqueta: "   " });

  llamadas.length = 0;
  rpcs.length = 0;
  const etiquetaConBorde = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&etiqueta=${encodeURIComponent(" VIP ")}&limit=20&offset=0`
  );
  assert.strictEqual(etiquetaConBorde.status, 200);
  assert.deepStrictEqual(numeros(etiquetaConBorde.json), []);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 0, etiqueta: " VIP " });

  llamadas.length = 0;
  rpcs.length = 0;
  const soloEspacios = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&etiqueta=${encodeURIComponent("   ")}&limit=20&offset=0`
  );
  assert.strictEqual(soloEspacios.status, 200);
  assert.deepStrictEqual(numeros(soloEspacios.json), []);
  assert.ok(sinSesiones(llamadas), "etiqueta con espacios y sin producto no usa el RPC");

  llamadas.length = 0;
  rpcs.length = 0;
  const vacio = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_VACIO}&limit=20&offset=0`
  );
  assert.strictEqual(vacio.status, 200);
  assert.deepStrictEqual(numeros(vacio.json), []);
  assert.strictEqual(vacio.json.hasMore, false);
  assertUnaRpc({ flujoId: FLUJO_VACIO, limit: 21, offset: 0 });
  assert.ok(
    llamadas.every((url) => !url.includes("/conversaciones")),
    "un producto sin sesiones no pagina conversaciones en Node"
  );

  llamadas.length = 0;
  rpcs.length = 0;
  const ajeno = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_AJENO}`
  );
  assert.strictEqual(ajeno.status, 400);
  assert.strictEqual(ajeno.json.ok, false);
  assert.strictEqual(rpcs.length, 0);
  assert.ok(llamadas.every((url) => !url.includes("/flow_sessions")));
  assert.ok(llamadas.every((url) => !url.includes("/conversaciones")));

  llamadas.length = 0;
  rpcs.length = 0;
  const otraLinea = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_OTRA_LINEA}`
  );
  assert.strictEqual(otraLinea.status, 400);
  assert.strictEqual(rpcs.length, 0);
  assert.ok(llamadas.every((url) => !url.includes("/flow_sessions")));

  llamadas.length = 0;
  const uuidMal = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=no-es-uuid`
  );
  assert.strictEqual(uuidMal.status, 400);
  assert.strictEqual(llamadas.length, 0);

  llamadas.length = 0;
  const sinLinea = await pedir(`/api/inbox?flujo_id=${FLUJO_A}`);
  assert.strictEqual(sinLinea.status, 400);
  assert.strictEqual(sinLinea.json.error, "Selecciona una línea WhatsApp");
  assert.strictEqual(llamadas.length, 0);

  llamadas.length = 0;
  rpcs.length = 0;
  const limiteExacto = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=100&offset=0`
  );
  assert.strictEqual(limiteExacto.status, 200);
  assert.deepStrictEqual(numeros(limiteExacto.json), ["591100", "591200", "591600"]);
  assert.strictEqual(limiteExacto.json.hasMore, false);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 101, offset: 0 });

  llamadas.length = 0;
  rpcs.length = 0;
  const offsetExacto = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=20&offset=100000`
  );
  assert.strictEqual(offsetExacto.status, 200);
  assert.deepStrictEqual(numeros(offsetExacto.json), []);
  assert.strictEqual(offsetExacto.json.hasMore, false);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 100000 });

  for (const consulta of [
    `limit=101&offset=0`,
    `limit=1000000&offset=0`,
    `limit=2147483648&offset=0`,
    `limit=20&offset=100001`,
    `limit=20&offset=10000000000000000`,
  ]) {
    llamadas.length = 0;
    rpcs.length = 0;
    const excesivo = await pedir(
      `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&${consulta}`
    );
    assert.strictEqual(excesivo.status, 400, consulta);
    assert.strictEqual(excesivo.json.error, "Página no válida", consulta);
    assert.strictEqual(rpcs.length, 0, consulta);
    assert.strictEqual(llamadas.length, 0, consulta);
  }

  llamadas.length = 0;
  rpcs.length = 0;
  const negativos = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=-5&offset=-3`
  );
  assert.strictEqual(negativos.status, 200);
  assert.deepStrictEqual(numeros(negativos.json), ["591100", "591200", "591600"]);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 0 });

  llamadas.length = 0;
  rpcs.length = 0;
  const noFinito = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=Infinity&offset=NaN`
  );
  assert.strictEqual(noFinito.status, 200);
  assertUnaRpc({ flujoId: FLUJO_A, limit: 21, offset: 0 });

  llamadas.length = 0;
  rpcs.length = 0;
  const sinFlujoAmplio = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&limit=500&offset=100001`
  );
  assert.strictEqual(sinFlujoAmplio.status, 200);
  assert.ok(!("flujoId" in sinFlujoAmplio.json));
  assert.strictEqual(rpcs.length, 0);
  const urlAmplia = llamadas.find(
    (url) => url.includes("/conversaciones") && url.includes("select=*")
  );
  assert.ok(urlAmplia.includes("limit=500"));
  assert.ok(urlAmplia.includes("offset=100001"));

  llamadas.length = 0;
  rpcs.length = 0;
  const sinFlujoNegativo = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&limit=-5&offset=-3`
  );
  assert.strictEqual(sinFlujoNegativo.status, 200);
  assert.ok(!("flujoId" in sinFlujoNegativo.json));
  assert.strictEqual(rpcs.length, 0);
  const urlNegativa = llamadas.find(
    (url) => url.includes("/conversaciones") && url.includes("select=*")
  );
  assert.ok(urlNegativa.includes("limit=20"));
  assert.ok(urlNegativa.includes("offset=0"));

  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../supabase/migrations/create_inbox_conversaciones_por_flujo_rpc.sql"
    ),
    "utf8"
  );
  const sqlEjecutable = sql
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("--"))
    .join("\n");
  assert.ok(/exists\s*\(/i.test(sqlEjecutable));
  assert.ok(sqlEjecutable.includes("public.flow_sessions"));
  assert.ok(sqlEjecutable.includes("public.flujos_builder"));
  assert.ok(sqlEjecutable.includes("fb.usuario_id = p_usuario_id"));
  assert.ok(sqlEjecutable.includes("fb.conexion_whatsapp_id = p_conexion_whatsapp_id"));
  assert.ok(sqlEjecutable.includes("fb.id = p_flujo_id"));
  assert.ok(sqlEjecutable.includes("ultimo_mensaje_en desc nulls first"));
  assert.ok(sqlEjecutable.includes("c.cliente_numero desc"));
  assert.ok(sqlEjecutable.includes("public.clientes_etiquetas"));
  assert.ok(sqlEjecutable.includes("p_etiqueta is null"));
  assert.ok(sqlEjecutable.includes("p_etiqueta = ''"));
  assert.ok(sqlEjecutable.includes("ce.etiqueta = p_etiqueta"));
  assert.ok(
    sqlEjecutable.includes("least(greatest(coalesce(p_limit, 0), 0), 101)")
  );
  assert.ok(
    sqlEjecutable.includes("least(greatest(coalesce(p_offset, 0), 0), 100000)")
  );
  assert.ok(sqlEjecutable.includes("where flujo_id is not null"));
  assert.ok(!/btrim\s*\(/i.test(sqlEjecutable));
  assert.ok(!/::\s*(uuid|text|integer)/i.test(sqlEjecutable));
  assert.ok(/security\s+invoker/i.test(sqlEjecutable));
  assert.ok(
    /revoke\s+execute\s+on\s+function\s+public\.inbox_conversaciones_por_flujo\(uuid,\s*uuid,\s*uuid,\s*integer,\s*integer,\s*text\)\s+from\s+public,\s*anon,\s*authenticated/i.test(
      sqlEjecutable
    )
  );
  assert.ok(
    /grant\s+execute\s+on\s+function\s+public\.inbox_conversaciones_por_flujo\(uuid,\s*uuid,\s*uuid,\s*integer,\s*integer,\s*text\)\s+to\s+service_role/i.test(
      sqlEjecutable
    )
  );
  assert.ok(!/grant\s+execute[\s\S]*\bto\s+anon\b/i.test(sqlEjecutable));
  assert.ok(!/grant\s+execute[\s\S]*\bto\s+authenticated\b/i.test(sqlEjecutable));
  assert.ok(!/grant\s+execute[\s\S]*\bto\s+public\b/i.test(sqlEjecutable));
  assert.ok(sql.includes("has_function_privilege"));
  assert.ok(sql.includes("drop function if exists public.inbox_conversaciones_por_flujo"));
  assert.ok(!/fs\.status/.test(sqlEjecutable));

  fuenteConversaciones = [
    {
      id: "empate-a",
      usuario_id: USER,
      cliente_numero: "591100",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "empate",
      ultimo_mensaje_en: "2026-05-01T00:00:00.000Z",
      unread_count: 0,
    },
    {
      id: "empate-b",
      usuario_id: USER,
      cliente_numero: "591300",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "empate",
      ultimo_mensaje_en: "2026-05-01T00:00:00.000Z",
      unread_count: 0,
    },
  ];
  fuenteSesiones = [
    {
      usuario_id: USER,
      conexion_whatsapp_id: CONN,
      cliente_numero: "591100",
      flujo_id: FLUJO_A,
      status: "active",
    },
    {
      usuario_id: USER,
      conexion_whatsapp_id: CONN,
      cliente_numero: "591100",
      flujo_id: FLUJO_A,
      status: "finished",
    },
    {
      usuario_id: USER,
      conexion_whatsapp_id: CONN,
      cliente_numero: "591300",
      flujo_id: FLUJO_A,
      status: "expired",
    },
  ];
  llamadas.length = 0;
  rpcs.length = 0;
  const empate = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=20&offset=0`
  );
  assert.deepStrictEqual(numeros(empate.json), ["591300", "591100"]);
  assert.strictEqual(empate.json.chats.length, 2);

  const mismaFecha = "2026-05-01T00:00:00.000Z";
  fuenteConversaciones = [
    {
      id: "n900",
      usuario_id: USER,
      cliente_numero: "591900",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "nulo",
      ultimo_mensaje_en: null,
      unread_count: 0,
    },
    {
      id: "n800",
      usuario_id: USER,
      cliente_numero: "591800",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "nulo",
      ultimo_mensaje_en: null,
      unread_count: 0,
    },
    {
      id: "e700",
      usuario_id: USER,
      cliente_numero: "591700",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "igual",
      ultimo_mensaje_en: mismaFecha,
      unread_count: 0,
    },
    {
      id: "e600",
      usuario_id: USER,
      cliente_numero: "591600",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "igual",
      ultimo_mensaje_en: mismaFecha,
      unread_count: 0,
    },
    {
      id: "ajeno-nulo",
      usuario_id: OTHER,
      cliente_numero: "591950",
      conexion_whatsapp_id: CONN,
      ultimo_mensaje: "ajeno",
      ultimo_mensaje_en: null,
      unread_count: 3,
    },
    {
      id: "otra-linea-nulo",
      usuario_id: USER,
      cliente_numero: "591990",
      conexion_whatsapp_id: CONN_B,
      ultimo_mensaje: "otra",
      ultimo_mensaje_en: null,
      unread_count: 1,
    },
  ];
  fuenteSesiones = ["591900", "591800", "591700", "591600"].map((numero) => ({
    usuario_id: USER,
    conexion_whatsapp_id: CONN,
    cliente_numero: numero,
    flujo_id: FLUJO_A,
    status: "finished",
  }));
  fuenteSesiones.push(
    {
      usuario_id: OTHER,
      conexion_whatsapp_id: CONN,
      cliente_numero: "591950",
      flujo_id: FLUJO_A,
      status: "active",
    },
    {
      usuario_id: USER,
      conexion_whatsapp_id: CONN_B,
      cliente_numero: "591990",
      flujo_id: FLUJO_A,
      status: "active",
    }
  );
  fuenteEtiquetas = [];
  llamadas.length = 0;
  rpcs.length = 0;
  const nulos1 = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=0`
  );
  assert.strictEqual(nulos1.status, 200);
  assert.deepStrictEqual(numeros(nulos1.json), ["591900", "591800"]);
  assert.strictEqual(nulos1.json.hasMore, true);
  assert.ok(nulos1.json.chats.every((chat) => chat.ultimoMensajeEn == null));
  llamadas.length = 0;
  rpcs.length = 0;
  const nulos2 = await pedir(
    `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=2`
  );
  assert.strictEqual(nulos2.status, 200);
  assert.deepStrictEqual(numeros(nulos2.json), ["591700", "591600"]);
  assert.strictEqual(nulos2.json.hasMore, false);
  assert.ok(
    nulos2.json.chats.every((chat) => chat.ultimoMensajeEn === mismaFecha)
  );
  const unidosNulos = [...numeros(nulos1.json), ...numeros(nulos2.json)];
  assert.deepStrictEqual(unidosNulos, ["591900", "591800", "591700", "591600"]);
  assert.strictEqual(new Set(unidosNulos).size, unidosNulos.length);
  assert.ok(!unidosNulos.includes("591950"));
  assert.ok(!unidosNulos.includes("591990"));

  function armarGranBandeja(total) {
    const convs = [];
    const sess = [];
    for (let i = 0; i < total; i += 1) {
      convs.push({
        id: `g${i}`,
        usuario_id: USER,
        cliente_numero: String(100000000 + i),
        conexion_whatsapp_id: CONN,
        ultimo_mensaje: "m",
        ultimo_mensaje_en: new Date(Date.UTC(2026, 0, 1) + (total - i) * 1000).toISOString(),
        unread_count: 0,
      });
    }
    for (const indice of [0, 10, 30, total - 1]) {
      sess.push({
        usuario_id: USER,
        conexion_whatsapp_id: CONN,
        cliente_numero: convs[indice].cliente_numero,
        flujo_id: FLUJO_A,
        status: "finished",
      });
    }
    for (let extra = 0; extra < 4; extra += 1) {
      sess.push({
        usuario_id: USER,
        conexion_whatsapp_id: CONN,
        cliente_numero: convs[0].cliente_numero,
        flujo_id: FLUJO_A,
        status: "active",
      });
    }
    return { convs, sess };
  }

  for (const total of [20000, 20001]) {
    const grande = armarGranBandeja(total);
    fuenteConversaciones = grande.convs;
    fuenteSesiones = grande.sess;
    fuenteEtiquetas = [];
    llamadas.length = 0;
    rpcs.length = 0;
    const p1 = await pedir(
      `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=0`
    );
    assert.strictEqual(p1.status, 200, `total ${total}`);
    assert.deepStrictEqual(numeros(p1.json), [
      String(100000000),
      String(100000010),
    ]);
    assert.strictEqual(p1.json.hasMore, true);
    assertUnaRpc({ flujoId: FLUJO_A, limit: 3, offset: 0 });

    llamadas.length = 0;
    rpcs.length = 0;
    const p2 = await pedir(
      `/api/inbox?conexion_whatsapp_id=${CONN}&flujo_id=${FLUJO_A}&limit=2&offset=2`
    );
    assert.strictEqual(p2.status, 200, `total ${total} pagina 2`);
    assert.deepStrictEqual(numeros(p2.json), [
      String(100000030),
      String(100000000 + total - 1),
    ]);
    assert.strictEqual(p2.json.hasMore, false);
    assertUnaRpc({ flujoId: FLUJO_A, limit: 3, offset: 2 });
    const unidosGrandes = [...numeros(p1.json), ...numeros(p2.json)];
    assert.strictEqual(new Set(unidosGrandes).size, unidosGrandes.length);
  }

  fuenteConversaciones = conversaciones;
  fuenteSesiones = sesiones;
  fuenteEtiquetas = etiquetas;

  llamadas.length = 0;
  rpcs.length = 0;
  const hilo = await loadChatMessages(USER, "591100", CONN);
  assert.deepStrictEqual(
    (hilo.mensajes || []).map((m) => m.contenido),
    ["primero", "despues-de-cambiar-flujo"]
  );
  assert.ok(llamadas.every((url) => !url.includes("flujo_id")));
  assert.strictEqual(rpcs.length, 0);

  axios.get = axiosGetOriginal;
  axios.post = axiosPostOriginal;
  console.log("inboxFlujoFiltro: ok");
})().catch((err) => {
  axios.get = axiosGetOriginal;
  axios.post = axiosPostOriginal;
  console.error(err);
  process.exit(1);
});
