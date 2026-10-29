/**
 * Recorrido real de POST /webhook (router de routes/webhook.js) con un payload
 * de Meta simulado. Supabase y los envíos a graph.facebook.com quedan en
 * memoria: no hay red, no hay WhatsApp real y no se carga server.js.
 *
 * Secuencia: el contacto abre el flujo A con el Ad ID A; después llega otro
 * mensaje con el Ad ID B.
 *   1. A vigente (sesión active y expires_at en el futuro): sigue en A.
 *   2. A vencido (esa sesión con expires_at ya pasado): B puede entrar por
 *      primer mensaje normal si el Ad ID coincide.
 *
 * El flujo de prueba solo tiene el nodo Inicio y una salida a un nodo que no
 * está en el grafo. Así la sesión queda active, sin enviar WhatsApp y sin
 * tocar la configuración de vencimiento de producción.
 *
 * Ejecutar: node scripts/test-ctwa-webhook-session-priority.js
 */
"use strict";

const http = require("http");
const { randomUUID } = require("crypto");

const BASE = "http://ctwa-webhook-mock.test";
process.env.SUPABASE_URL = BASE;
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-es-secreto";
delete process.env.OPENAI_API_KEY;
delete process.env.TOKEN;
delete process.env.PHONE_ID;

const fetchOriginal = global.fetch;
global.fetch = async (url) => {
  throw new Error("fetch bloqueado en la prueba: " + String(url));
};

const axios = require("axios");

const USUARIO = "11111111-1111-4111-8111-111111111111";
const CONN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FLOW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FLOW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PHONE = "109900000000001";
const FROM = "5491110000099";
const AD_A = "111111111111111";
const AD_B = "222222222222222";
const NODO_AUSENTE = "nodo_fuera_del_grafo";

const store = {
  sesiones: [],
  mensajes: [],
  leads: [],
  conversaciones: [],
  whatsapp: [],
  http: [],
  llamadas: [],
  logs: [],
};

const flujos = {};
const activadores = [];

function flujoDe(id, adId) {
  return {
    id,
    nombre: id === FLOW_A ? "Flujo A" : "Flujo B",
    usuario_id: USUARIO,
    conexion_whatsapp_id: CONN,
    data: {
      macbot_meta: {
        estado: "activo",
        meta_ads: { ad_ids: [adId] },
      },
      nodos: [
        {
          id: "nodo_inicio",
          tipo: "inicio",
          data: {
            lifecycle: { enabled: true, value: 1, unit: "hours" },
          },
        },
      ],
      conexiones: [{ desde: "nodo_inicio", hasta: NODO_AUSENTE }],
    },
  };
}

function activadoresDePrueba() {
  return [
    {
      id: "act-b",
      frase: "*",
      flujo_id: FLOW_B,
      activo: true,
      prioridad: 10,
      tipo_activador: "primer_mensaje",
      palabras_clave_array: [],
      conexion_whatsapp_id: CONN,
      veces_usado: 0,
    },
    {
      id: "act-a",
      frase: "*",
      flujo_id: FLOW_A,
      activo: true,
      prioridad: 0,
      tipo_activador: "primer_mensaje",
      palabras_clave_array: [],
      conexion_whatsapp_id: CONN,
      veces_usado: 0,
    },
  ];
}

function resetEscenario() {
  store.sesiones.length = 0;
  store.mensajes.length = 0;
  store.leads.length = 0;
  store.conversaciones.length = 0;
  store.whatsapp.length = 0;
  store.http.length = 0;
  store.llamadas.length = 0;
  store.logs.length = 0;
  flujos[FLOW_A] = flujoDe(FLOW_A, AD_A);
  flujos[FLOW_B] = flujoDe(FLOW_B, AD_B);
  activadores.splice(0, activadores.length, ...activadoresDePrueba());
}

function paramsDe(url) {
  const texto = String(url);
  const q = texto.includes("?") ? texto.slice(texto.indexOf("?") + 1) : "";
  const out = {};
  for (const part of q.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
    const v = decodeURIComponent(i < 0 ? "" : part.slice(i + 1));
    out[k] = v;
  }
  return out;
}

function rutaDe(url) {
  return new URL(String(url)).pathname;
}

function coincide(row, params) {
  for (const [k, v] of Object.entries(params)) {
    if (k === "select" || k === "order" || k === "limit" || k === "on_conflict") {
      continue;
    }
    if (k === "or") return false;
    if (v.startsWith("eq.")) {
      if (String(row[k] ?? "") !== v.slice(3)) return false;
    } else if (v.startsWith("in.(") && v.endsWith(")")) {
      const lista = v.slice(4, -1).split(",");
      if (!lista.includes(String(row[k] ?? ""))) return false;
    } else if (v.startsWith("is.")) {
      const quiereNull = v.slice(3) === "null";
      if (quiereNull && row[k] != null) return false;
    }
  }
  return true;
}

function ordenarYLimitar(rows, params) {
  let lista = rows.slice();
  const order = params.order || "";
  if (order.endsWith(".desc")) {
    const campo = order.slice(0, -5);
    lista.sort((a, b) => String(b[campo] || "").localeCompare(String(a[campo] || "")));
  }
  const limite = parseInt(params.limit, 10);
  if (Number.isFinite(limite)) lista = lista.slice(0, limite);
  return lista.map((row) => ({ ...row }));
}

function responder(data, extraHeaders) {
  return {
    status: 200,
    data,
    headers: { "content-range": "0-0/0", ...(extraHeaders || {}) },
  };
}

function aplicarPatch(rows, body) {
  const ahora = new Date().toISOString();
  for (const row of rows) {
    Object.assign(row, body || {}, { updated_at: ahora });
  }
  return rows.map((row) => ({ ...row }));
}

async function despachar(method, url, body) {
  const href = String(url || "");
  let parsed;
  try {
    parsed = new URL(href);
  } catch (err) {
    throw new Error("URL no despachable: " + href);
  }

  if (parsed.hostname === "graph.facebook.com") {
    store.whatsapp.push({ method, url: href, body: body || null });
    return responder({ messages: [{ id: "wamid.simulado.no-enviado" }] });
  }

  if (parsed.origin !== BASE) {
    throw new Error("salida de red bloqueada: " + href);
  }

  const path = rutaDe(href);
  const params = paramsDe(href);
  store.http.push({ method, path, params });

  if (path === "/rest/v1/conexiones_whatsapp" && method === "GET") {
    if (params.phone_id === "eq." + PHONE || params.id === "eq." + CONN) {
      return responder([
        {
          id: CONN,
          usuario_id: USUARIO,
          phone_id: PHONE,
          token: "token-simulado-no-real",
          indicador_escritura: false,
          demora_respuesta_activa: false,
        },
      ]);
    }
    return responder([]);
  }

  if (path === "/rest/v1/crm_usuarios" && method === "GET") {
    return responder([
      {
        id: USUARIO,
        plan: "agency",
        estado_plan: "activo",
        max_contactos: null,
        max_whatsapp: null,
        max_flujos: null,
        fecha_vencimiento: null,
      },
    ]);
  }

  if (path === "/rest/v1/clientes" && method === "GET") {
    return responder([{ id: "cli-prueba", numero: FROM, estado: "nuevo", nombre: "Prueba" }]);
  }
  if (path === "/rest/v1/clientes" && method === "POST") {
    return responder([]);
  }

  if (path === "/rest/v1/activadores" && method === "GET") {
    return responder(activarSiLinea(params));
  }
  if (path === "/rest/v1/activadores" && method === "PATCH") {
    return responder([]);
  }

  if (path === "/rest/v1/flujos_builder" && method === "GET") {
    const id = (params.id || "").replace(/^eq\./, "");
    const flujo = flujos[id];
    return responder(flujo ? [flujo] : []);
  }

  if (path === "/rest/v1/flow_sessions" && method === "GET") {
    const filas = store.sesiones.filter((row) => coincide(row, params));
    return responder(ordenarYLimitar(filas, params));
  }
  if (path === "/rest/v1/flow_sessions" && method === "POST") {
    const row = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(body || {}),
    };
    store.sesiones.push(row);
    return responder([{ ...row }]);
  }
  if (path === "/rest/v1/flow_sessions" && method === "PATCH") {
    const filas = store.sesiones.filter((row) => coincide(row, params));
    return responder(aplicarPatch(filas, body));
  }

  if (path === "/rest/v1/macbot_ctwa_leads" && method === "GET") {
    const filas = store.leads.filter((row) => coincide(row, params));
    return responder(ordenarYLimitar(filas, params));
  }
  if (path === "/rest/v1/macbot_ctwa_leads" && method === "POST") {
    const row = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...(body || {}),
    };
    store.leads.push(row);
    return responder([{ ...row }]);
  }

  if (path === "/rest/v1/mensajes" && method === "GET") {
    const filas = store.mensajes.filter((row) => coincide(row, params));
    return responder(ordenarYLimitar(filas, params));
  }
  if (path === "/rest/v1/mensajes" && method === "POST") {
    const row = { id: randomUUID(), creado_en: new Date().toISOString(), ...(body || {}) };
    store.mensajes.push(row);
    return responder([{ ...row }]);
  }

  if (path === "/rest/v1/conversaciones" && method === "GET") {
    const filas = store.conversaciones.filter((row) => coincide(row, params));
    return responder(ordenarYLimitar(filas, params));
  }
  if (path === "/rest/v1/conversaciones" && method === "POST") {
    const row = { id: randomUUID(), ...(body || {}) };
    store.conversaciones.push(row);
    return responder([{ ...row }]);
  }
  if (path === "/rest/v1/conversaciones" && method === "PATCH") {
    const filas = store.conversaciones.filter((row) => coincide(row, params));
    if (!filas.length && body) {
      const row = { id: randomUUID(), ...(body || {}) };
      store.conversaciones.push(row);
      return responder([{ ...row }]);
    }
    return responder(aplicarPatch(filas, body));
  }

  if (path === "/rest/v1/meta_capi_leads_enviados" && method === "POST") {
    return responder([]);
  }

  if (method === "GET") return responder([]);
  if (method === "POST") return responder([]);
  if (method === "PATCH" || method === "DELETE" || method === "PUT") return responder([]);
  throw new Error("método no simulado: " + method + " " + href);
}

function activarSiLinea(params) {
  const uid = (params.usuario_id || "").replace(/^eq\./, "");
  const conn = (params.conexion_whatsapp_id || "").replace(/^eq\./, "");
  if (uid !== USUARIO || conn !== CONN) return [];
  return activadores.map((a) => ({ ...a }));
}

axios.get = (url) => despachar("GET", url);
axios.post = (url, body) => despachar("POST", url, body);
axios.patch = (url, body) => despachar("PATCH", url, body);
axios.put = (url, body) => despachar("PUT", url, body);
axios.delete = (url) => despachar("DELETE", url);
axios.request = (cfg) =>
  despachar(String(cfg?.method || "GET").toUpperCase(), cfg?.url, cfg?.data);
axios.defaults.adapter = async (cfg) => {
  throw new Error("adapter real bloqueado: " + (cfg && cfg.url));
};

const logOriginal = console.log;
console.log = (...args) => {
  store.logs.push(
    args
      .map((item) => {
        if (typeof item === "string") return item;
        try {
          return JSON.stringify(item);
        } catch (_err) {
          return String(item);
        }
      })
      .join(" ")
  );
};

const flowService = require("../services/flowService");
const procesarOriginal = flowService.procesarMensajeEntrante;
let enCurso = Promise.resolve();
flowService.procesarMensajeEntrante = async (...args) => {
  const pendiente = procesarOriginal.apply(flowService, args);
  enCurso = pendiente;
  const registro = { args, result: undefined };
  store.llamadas.push(registro);
  registro.result = await pendiente;
  return registro.result;
};

const webhookRoutes = require("../routes/webhook");
const express = require("express");
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(webhookRoutes);

function payloadMeta(wamid, sourceId, texto) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: PHONE },
              contacts: [{ profile: { name: "Prueba" }, wa_id: FROM }],
              messages: [
                {
                  from: FROM,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: texto },
                  referral: {
                    source_url: "https://fb.me/anuncio-simulado",
                    source_type: "ad",
                    source_id: sourceId,
                    ctwa_clid: "CLICK-NO-ES-AD-ID",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function postWebhook(body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/webhook",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            server.close(() => {
              resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
            });
          });
        }
      );
      req.on("error", (err) => {
        server.close(() => reject(err));
      });
      req.end(JSON.stringify(body));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarYEsperar(body) {
  const antes = store.llamadas.length;
  const httpRes = await postWebhook(body);
  const inicio = Date.now();
  while (store.llamadas.length === antes) {
    if (Date.now() - inicio > 4000) {
      throw new Error(
        "el webhook respondió " +
          httpRes.status +
          " sin llegar a procesarMensajeEntrante"
      );
    }
    await sleep(20);
  }
  await enCurso;
  await sleep(50);
  return httpRes;
}

async function esperarSesionActivaDeA() {
  const inicio = Date.now();
  let firma = "";
  let quietoDesde = 0;
  while (Date.now() - inicio < 4000) {
    const row = store.sesiones.find(
      (s) => s.flujo_id === FLOW_A && s.cliente_numero === FROM && s.status === "active"
    );
    if (row && row.expires_at && new Date(row.expires_at).getTime() > Date.now()) {
      const actual = JSON.stringify(row);
      if (actual === firma) {
        if (Date.now() - quietoDesde > 120) return row;
      } else {
        firma = actual;
        quietoDesde = Date.now();
      }
    }
    await sleep(20);
  }
  throw new Error(
    "A no quedó active con expires_at futuro: " + JSON.stringify(store.sesiones)
  );
}

function optsDe(llamada) {
  return llamada.args[4] || {};
}

function assert(cond, msg) {
  if (!cond) {
    const cola = store.logs.slice(-40).join("\n");
    throw new Error(msg + (cola ? "\n--- log reciente ---\n" + cola : ""));
  }
}

function sesionesDe(flujoId) {
  return store.sesiones.filter((s) => s.flujo_id === flujoId);
}

function lineasDesde(inicio, marca) {
  return store.logs.slice(inicio).filter((linea) => linea.includes(marca));
}

(async () => {
  resetEscenario();

  const altaVigente = await enviarYEsperar(
    payloadMeta("wamid.A.vigente", "  " + AD_A + "  ", "vengo del anuncio A")
  );
  const sesionA = await esperarSesionActivaDeA();
  const apertura = store.llamadas[0];

  assert(altaVigente.status === 200, "alta A vigente: HTTP " + altaVigente.status);
  assert(optsDe(apertura).esPrimerMensaje === true, "abrir A debe calcular esPrimerMensaje true");
  assert(optsDe(apertura).ctwaAdId === AD_A, "abrir A debe recibir source_id recortado, no el ctwa_clid");
  assert(optsDe(apertura).ctwaAdId !== "CLICK-NO-ES-AD-ID", "ctwa_clid no es el Ad ID");
  assert(apertura.result === true, "el anuncio A debe ejecutar el flujo A");
  assert(sesionA.flujo_id === FLOW_A, "la sesión creada es de A");
  assert(sesionA.status === "active", "A sigue active");
  assert(store.whatsapp.length === 0, "abrir A no debe llamar a graph.facebook.com");

  const antesB = store.sesiones.map((s) => ({ ...s }));
  const logAntesB = store.logs.length;
  const llegaB = await enviarYEsperar(
    payloadMeta("wamid.B.vigente", "  " + AD_B + "  ", "ahora el anuncio B")
  );
  const segunda = store.llamadas[1];
  const sigueA = store.sesiones.find((s) => s.id === sesionA.id);

  assert(llegaB.status === 200, "mensaje B vigente: HTTP " + llegaB.status);
  assert(optsDe(segunda).esPrimerMensaje === false, "con A vigente esPrimerMensaje debe ser false");
  assert(optsDe(segunda).ctwaAdId === AD_B, "el router debe recibir el source_id de B");
  assert(segunda.result === false, "B no debe ejecutar un activador mientras A está vigente");
  assert(
    store.logs.some((linea) => linea.includes("sesion_vigente_bloquea_reingreso")),
    "la excepción CTWA debe rechazar el cambio de flujo"
  );
  assert(sesionesDe(FLOW_B).length === 0, "no se crea sesión de B");
  assert(sigueA && sigueA.flujo_id === FLOW_A, "la sesión de A sigue siendo A");
  assert(sigueA.status === "active", "A no se reemplaza ni se cancela");
  assert(
    store.sesiones.length === antesB.length,
    "no aparece ninguna flow_session nueva"
  );
  assert(store.whatsapp.length === 0, "el mensaje B vigente no debe llamar a graph.facebook.com");

  const resumenVigente = {
    http: llegaB.status,
    esPrimerMensaje: optsDe(segunda).esPrimerMensaje,
    ctwaAdId: optsDe(segunda).ctwaAdId,
    activadorEjecutado: segunda.result,
    sesiones: store.sesiones.map((s) => ({
      flujo_id: s.flujo_id,
      status: s.status,
      expires_at: s.expires_at,
    })),
    whatsapp: store.whatsapp.length,
    firstMessage: lineasDesde(logAntesB, "[FIRST_MESSAGE_CHECK]"),
    excepcion: lineasDesde(logAntesB, "[CTWA_PRIMER_MENSAJE_EXCEPTION]"),
  };

  resetEscenario();

  const altaVencido = await enviarYEsperar(
    payloadMeta("wamid.A.vencido", AD_A, "vengo del anuncio A")
  );
  const sesionPorVencer = await esperarSesionActivaDeA();
  assert(altaVencido.status === 200, "alta A vencido: HTTP " + altaVencido.status);
  assert(store.llamadas[0].result === true, "A también arranca en el escenario vencido");

  sesionPorVencer.expires_at = new Date(Date.now() - 60 * 1000).toISOString();
  const logAntesBVencido = store.logs.length;

  const llegaBVencido = await enviarYEsperar(
    payloadMeta("wamid.B.vencido", AD_B, "ahora el anuncio B")
  );
  const llamadaB = store.llamadas[1];
  const filaA = store.sesiones.find((s) => s.id === sesionPorVencer.id);
  const filasB = sesionesDe(FLOW_B).filter((s) => s.status === "active");

  assert(llegaBVencido.status === 200, "mensaje B vencido: HTTP " + llegaBVencido.status);
  assert(optsDe(llamadaB).esPrimerMensaje === true, "con A vencido esPrimerMensaje debe ser true");
  assert(optsDe(llamadaB).ctwaAdId === AD_B, "el router debe recibir el source_id de B");
  assert(llamadaB.result === true, "B debe ejecutarse por el activador normal");
  assert(
    store.logs.some((linea) => linea.includes("[FIRST_MESSAGE_MATCH]") && linea.includes("primer_mensaje")),
    "B entra por primer mensaje normal"
  );
  assert(
    !store.logs.some((linea) => linea.includes("primer_mensaje_ctwa_ad_id")),
    "con esPrimerMensaje true no usa la excepción CTWA"
  );
  assert(filasB.length === 1, "se crea una sesión active de B");
  assert(filasB[0].cliente_numero === FROM, "la sesión de B es de este contacto");
  assert(filasB[0].conexion_whatsapp_id === CONN, "la sesión de B es de esta línea");
  assert(filaA && filaA.flujo_id === FLOW_A, "la fila de A no se reescribe como B");
  assert(filaA.status === "expired", "el ciclo de vida marca A como expired");
  assert(store.whatsapp.length === 0, "abrir B no debe llamar a graph.facebook.com");

  const resumenVencido = {
    http: llegaBVencido.status,
    esPrimerMensaje: optsDe(llamadaB).esPrimerMensaje,
    ctwaAdId: optsDe(llamadaB).ctwaAdId,
    activadorEjecutado: llamadaB.result,
    sesiones: store.sesiones.map((s) => ({
      flujo_id: s.flujo_id,
      status: s.status,
      expires_at: s.expires_at,
    })),
    whatsapp: store.whatsapp.length,
    firstMessage: lineasDesde(logAntesBVencido, "[FIRST_MESSAGE_CHECK]"),
    match: lineasDesde(logAntesBVencido, "ACTIVADOR ENCONTRADO"),
  };

  logOriginal("VIGENTE", JSON.stringify(resumenVigente));
  logOriginal("VENCIDO", JSON.stringify(resumenVencido));
  logOriginal("OK webhook CTWA: A vigente bloquea B; A vencido deja entrar a B");
  global.fetch = fetchOriginal;
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
