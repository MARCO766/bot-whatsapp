/**
 * GET /api/flujos/bandeja — solo id y nombre, con sesión y dueño de la línea.
 * Mocks HTTP, sin Supabase real.
 * Ejecutar: node tests/flujosBandejaApi.test.js
 */
const assert = require("assert");
const http = require("http");
const express = require("express");
const axios = require("axios");

process.env.SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SECRET_KEY = "test-key";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONN_A = "11111111-1111-4111-8111-111111111111";
const CONN_B = "22222222-2222-4222-8222-222222222222";
const CONN_VACIA = "33333333-3333-4333-8333-333333333333";

const conexiones = [
  { id: CONN_A, usuario_id: USER_A },
  { id: CONN_B, usuario_id: USER_B },
  { id: CONN_VACIA, usuario_id: USER_A },
];

const filas = [
  {
    id: "flujo-vasos",
    nombre: "VASOS",
    usuario_id: USER_A,
    conexion_whatsapp_id: CONN_A,
    data: { nodos: [{ id: "n1" }] },
  },
  {
    id: "flujo-bubble",
    nombre: "BUBBLE ARGENTINA",
    usuario_id: USER_A,
    conexion_whatsapp_id: CONN_A,
    data: { secreto: true },
  },
  {
    id: "flujo-ajeno",
    nombre: "NO DEBE SALIR",
    usuario_id: USER_B,
    conexion_whatsapp_id: CONN_A,
    data: { nodos: [] },
  },
];

const llamadas = [];
const axiosGetOriginal = axios.get.bind(axios);

function param(url, key) {
  const match = new RegExp(`[?&]${key}=eq\\.([^&]*)`).exec(url);
  return match ? decodeURIComponent(match[1]) : "";
}

axios.get = async (url) => {
  llamadas.push(url);
  if (/seguimientos|\/mensajes|crm_conversiones|activadores/.test(url)) {
    throw new Error("consulta ajena a los chips: " + url);
  }
  if (/select=[^&]*\bdata\b/.test(url)) {
    throw new Error("select incluye data: " + url);
  }

  if (url.includes("/rest/v1/conexiones_whatsapp")) {
    const id = param(url, "id");
    const usuarioId = param(url, "usuario_id");
    const row = conexiones.find((c) => c.id === id && c.usuario_id === usuarioId);
    return { data: row ? [{ id: row.id }] : [] };
  }

  if (url.includes("/rest/v1/flujos_builder")) {
    assert.ok(url.includes("select=id,nombre"), "select debe ser solo id,nombre");
    const usuarioId = param(url, "usuario_id");
    const conexionId = param(url, "conexion_whatsapp_id");
    const rows = filas
      .filter((f) => f.usuario_id === usuarioId && f.conexion_whatsapp_id === conexionId)
      .map((f) => ({
        id: f.id,
        nombre: f.nombre,
        data: f.data,
        metricas: { ventas: 4 },
      }));
    return { data: rows };
  }

  throw new Error("url no esperada: " + url);
};

const flujosRouter = require("../routes/flujosApi");

let session = null;
const app = express();
app.use((req, _res, next) => {
  req.session = session;
  next();
});
app.use(flujosRouter);

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

function soloIdNombre(flow) {
  return Object.keys(flow).sort().join(",") === "id,nombre";
}

(async () => {
  session = null;
  llamadas.length = 0;
  const anon = await pedir(
    `/api/flujos/bandeja?conexion_whatsapp_id=${CONN_A}`
  );
  assert.strictEqual(anon.status, 401);
  assert.strictEqual(anon.json.ok, false);
  assert.strictEqual(llamadas.length, 0, "sin sesión no consulta Supabase");

  session = { usuario: { id: USER_A } };

  const sinLinea = await pedir("/api/flujos/bandeja");
  assert.strictEqual(sinLinea.status, 400);

  const todas = await pedir("/api/flujos/bandeja?conexion_whatsapp_id=__todas__");
  assert.strictEqual(todas.status, 400);

  llamadas.length = 0;
  const invalida = await pedir("/api/flujos/bandeja?conexion_whatsapp_id=no-es-uuid");
  assert.strictEqual(invalida.status, 400);
  assert.strictEqual(invalida.json.error, "Línea WhatsApp no válida");
  assert.strictEqual(llamadas.length, 0, "un id inválido no consulta Supabase");

  llamadas.length = 0;
  const ajena = await pedir(`/api/flujos/bandeja?conexion_whatsapp_id=${CONN_B}`);
  assert.strictEqual(ajena.status, 400);
  assert.strictEqual(ajena.json.error, "Línea WhatsApp no válida");
  assert.ok(
    llamadas.every((url) => !url.includes("/flujos_builder")),
    "no lista flujos de una línea de otro usuario"
  );

  llamadas.length = 0;
  const inexistente = await pedir(
    "/api/flujos/bandeja?conexion_whatsapp_id=44444444-4444-4444-8444-444444444444"
  );
  assert.strictEqual(inexistente.status, 400);
  assert.ok(llamadas.every((url) => !url.includes("/flujos_builder")));

  const vacia = await pedir(`/api/flujos/bandeja?conexion_whatsapp_id=${CONN_VACIA}`);
  assert.strictEqual(vacia.status, 200);
  assert.strictEqual(vacia.json.ok, true);
  assert.deepStrictEqual(vacia.json.flows, []);

  const ok = await pedir(`/api/flujos/bandeja?conexion_whatsapp_id=${CONN_A}`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.ok, true);
  assert.ok(ok.json.flows.every(soloIdNombre), "cada flujo solo tiene id y nombre");
  assert.deepStrictEqual(
    ok.json.flows.map((f) => f.id).sort(),
    ["flujo-bubble", "flujo-vasos"]
  );
  assert.ok(!ok.json.flows.some((f) => f.nombre === "NO DEBE SALIR"));
  assert.ok(!("data" in ok.json));
  assert.ok(!("metricas" in ok.json));

  const consultaFlujos = llamadas.filter((url) => url.includes("/flujos_builder"));
  assert.ok(consultaFlujos.length >= 1);
  assert.ok(
    consultaFlujos.every((url) => url.includes(`usuario_id=eq.${encodeURIComponent(USER_A)}`))
  );

  axios.get = axiosGetOriginal;
  console.log("flujosBandejaApi: ok");
})().catch((err) => {
  axios.get = axiosGetOriginal;
  console.error(err);
  process.exit(1);
});
