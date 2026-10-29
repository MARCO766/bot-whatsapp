/**
 * Integración aislada del enrutador CTWA real (buscarYEjecutarActivador /
 * procesarMensajeEntrante) con Supabase y sesiones simuladas.
 *
 * No envía WhatsApp ni usa credenciales. No es el webhook HTTP.
 * Ejecutar: node scripts/test-ctwa-session-priority-integration.js
 */
"use strict";

process.env.SUPABASE_URL = "http://ctwa-session-priority.test";
process.env.SUPABASE_SECRET_KEY = "clave-de-prueba-no-es-secreto";

const BASE = process.env.SUPABASE_URL;

const USUARIO = "11111111-1111-4111-8111-111111111111";
const CONN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONN_OTRA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NUM = "5491110000001";
const NUM_OTRO = "5491110000002";
const FLOW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FLOW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const FLOW_KW = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const FLOW_IA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const AD_B = "222";

const FUTURO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PASADO = new Date(Date.now() - 60 * 1000).toISOString();

const state = {
  sesionMode: "valor",
  sesiones: new Map(),
  iaPendiente: null,
  activadores: [],
  lecturas: [],
  iaConsultas: [],
  posts: [],
  gets: [],
};

function claveSesion(payload) {
  return [
    String(payload.usuarioId || ""),
    String(payload.conexionWhatsappId || ""),
    String(payload.clienteNumero || ""),
  ].join("|");
}

function filaSesion(status, expiresAt, extra = {}) {
  return {
    id: extra.id || "sesion-simulada",
    usuario_id: extra.usuario_id || USUARIO,
    conexion_whatsapp_id: extra.conexion_whatsapp_id || CONN,
    cliente_numero: extra.cliente_numero || NUM,
    flujo_id: extra.flujo_id || FLOW_A,
    current_node_id: "nodo_inicio",
    status,
    started_at: extra.started_at || new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    expires_at: expiresAt,
    finished_at: status === "finished" ? new Date().toISOString() : null,
  };
}

function flujoMinimo(id, adIds) {
  return {
    id,
    nombre: id,
    usuario_id: USUARIO,
    conexion_whatsapp_id: CONN,
    data: {
      macbot_meta: {
        estado: "activo",
        meta_ads: { ad_ids: adIds },
      },
      nodos: [{ id: "nodo_inicio", tipo: "inicio", data: {} }],
      conexiones: [],
    },
  };
}

const flujos = {
  [FLOW_A]: flujoMinimo(FLOW_A, ["111"]),
  [FLOW_B]: flujoMinimo(FLOW_B, [AD_B]),
  [FLOW_KW]: flujoMinimo(FLOW_KW, []),
  [FLOW_IA]: {
    id: FLOW_IA,
    nombre: "ia-pendiente",
    usuario_id: USUARIO,
    conexion_whatsapp_id: CONN,
    data: { macbot_meta: { estado: "activo" } },
  },
};

function activadoresBase() {
  return [
    {
      id: "act-kw",
      frase: "hola",
      flujo_id: FLOW_KW,
      activo: true,
      prioridad: 100,
      coincidencia: "contiene",
      tipo_activador: "palabra_unica",
      palabras_clave_array: [],
      conexion_whatsapp_id: CONN,
    },
    {
      id: "act-b",
      frase: "*",
      flujo_id: FLOW_B,
      activo: true,
      prioridad: 10,
      tipo_activador: "primer_mensaje",
      palabras_clave_array: [],
      conexion_whatsapp_id: CONN,
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
    },
  ];
}

function instalarAxiosSimulado() {
  const axios = require("axios");
  axios.get = async (url) => {
    const texto = String(url || "");
    if (!texto.startsWith(BASE)) {
      throw new Error("la prueba intentó salir de la red simulada: " + texto);
    }
    state.gets.push(texto);
    if (texto.includes("/rest/v1/activadores")) {
      return { data: state.activadores };
    }
    if (texto.includes("/rest/v1/flujos_builder")) {
      const match = texto.match(/id=eq\.([^&]+)/);
      const id = match ? decodeURIComponent(match[1]) : "";
      const flujo = flujos[id];
      return { data: flujo ? [flujo] : [] };
    }
    return { data: [] };
  };
  axios.post = async (url, body) => {
    const texto = String(url || "");
    if (!texto.startsWith(BASE)) {
      throw new Error("la prueba intentó salir de la red simulada: " + texto);
    }
    if (texto.includes("/rest/v1/flow_sessions")) {
      state.posts.push(body);
      return { data: [{ id: "sesion-creada-" + state.posts.length, ...body }] };
    }
    return { data: [] };
  };
  axios.patch = async (url) => {
    const texto = String(url || "");
    if (!texto.startsWith(BASE)) {
      throw new Error("la prueba intentó salir de la red simulada: " + texto);
    }
    return { data: [] };
  };
  axios.delete = async (url) => {
    const texto = String(url || "");
    if (!texto.startsWith(BASE)) {
      throw new Error("la prueba intentó salir de la red simulada: " + texto);
    }
    return { data: null };
  };
}

function instalarSesionSimulada() {
  const sessionPath = require.resolve("../services/flowSessionService");
  const real = require(sessionPath);
  require.cache[sessionPath].exports = {
    ...real,
    async obtenerSesion(payload) {
      state.lecturas.push({ tipo: "reciente", payload });
      if (state.sesionMode === "error") {
        throw new Error("supabase simulado caido");
      }
      return state.sesiones.get(claveSesion(payload)) || null;
    },
    async obtenerSesionActiva(payload) {
      state.lecturas.push({ tipo: "activa", payload });
      if (state.sesionMode === "error") {
        throw new Error("supabase simulado caido");
      }
      const sesion = state.sesiones.get(claveSesion(payload));
      if (!sesion || String(sesion.status) !== "active") return null;
      return sesion;
    },
  };
}

function instalarIaSimulada() {
  const iaPath = require.resolve("../services/iaFlowSession");
  const real = require(iaPath);
  require.cache[iaPath].exports = {
    ...real,
    async obtenerSesionIAPendiente(usuarioId, conexionWhatsappId, numero) {
      state.iaConsultas.push({ usuarioId, conexionWhatsappId, numero });
      return state.iaPendiente;
    },
  };
}

instalarAxiosSimulado();
instalarSesionSimulada();
instalarIaSimulada();

const {
  buscarYEjecutarActivador,
  procesarMensajeEntrante,
} = require("../services/flowService");

function resetMediciones() {
  state.lecturas = [];
  state.iaConsultas = [];
  state.posts = [];
  state.gets = [];
  state.sesionMode = "valor";
  state.sesiones = new Map();
  state.iaPendiente = null;
  state.activadores = activadoresBase();
}

function guardarSesion(sesion) {
  state.sesiones.set(
    claveSesion({
      usuarioId: sesion.usuario_id,
      conexionWhatsappId: sesion.conexion_whatsapp_id,
      clienteNumero: sesion.cliente_numero,
    }),
    sesion
  );
}

let seq = 0;
async function enrutar({
  numero = NUM,
  conn = CONN,
  texto = "consulta del anuncio",
  esPrimerMensaje = false,
  ctwaAdId = AD_B,
} = {}) {
  seq += 1;
  return buscarYEjecutarActivador(
    numero,
    texto,
    USUARIO,
    "wamid.integracion." + seq,
    conn,
    { esPrimerMensaje, ctwaAdId }
  );
}

function postsDeFlujo(flujoId) {
  return state.posts.filter((row) => row && row.flujo_id === flujoId);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
async function check(name, fn) {
  resetMediciones();
  await fn();
  passed += 1;
  console.log("OK:", name);
}

(async () => {
  await check("1. sesión active vigente: A sigue y B no crea sesión", async () => {
    guardarSesion(filaSesion("active", FUTURO));
    const ejecuto = await enrutar();
    assert(ejecuto === false, "no debe ejecutar un activador");
    assert(state.posts.length === 0, "no debe crear otra sesión");
    assert(
      state.lecturas.some((l) => l.tipo === "reciente" && l.payload.clienteNumero === NUM),
      "debe leer la sesión de este contacto"
    );
  });

  await check("2. sesión finished vigente: A sigue y B no crea sesión", async () => {
    guardarSesion(filaSesion("finished", FUTURO));
    const ejecuto = await enrutar();
    assert(ejecuto === false, "finished vigente no cede el turno");
    assert(state.posts.length === 0, "no debe crear otra sesión");
  });

  await check("3. sesión vencida: B puede iniciar y se crea su sesión", async () => {
    guardarSesion(filaSesion("finished", PASADO));
    const ejecuto = await enrutar({ esPrimerMensaje: false });
    assert(ejecuto === true, "B debe ejecutarse");
    assert(postsDeFlujo(FLOW_B).length === 1, "la sesión nueva es de B");
    assert(postsDeFlujo(FLOW_A).length === 0, "no reabre A");
  });

  await check("4. sesión inexistente confirmada: la excepción sigue pudiendo iniciar B", async () => {
    const ejecuto = await enrutar({ esPrimerMensaje: false });
    assert(ejecuto === true, "sin fila, el hard-match de B sigue vigente");
    assert(postsDeFlujo(FLOW_B).length === 1, "se crea la sesión de B");
    assert(
      state.lecturas.some((l) => l.tipo === "reciente" && l.payload.clienteNumero === NUM),
      "la ausencia se consulta para este contacto"
    );
  });

  await check("5. error de Supabase: la excepción no cambia de flujo ni crea sesión", async () => {
    state.sesionMode = "error";
    guardarSesion(filaSesion("active", FUTURO));
    const ejecuto = await enrutar();
    assert(ejecuto === false, "el error no debe dejar pasar B");
    assert(state.posts.length === 0, "no debe crear sesión si la lectura falló");
  });

  await check("6. sesión de otro contacto o conexión no bloquea a este lead", async () => {
    guardarSesion(
      filaSesion("active", FUTURO, {
        id: "otro-numero",
        cliente_numero: NUM_OTRO,
      })
    );
    guardarSesion(
      filaSesion("active", FUTURO, {
        id: "otra-linea",
        conexion_whatsapp_id: CONN_OTRA,
      })
    );
    const ejecuto = await enrutar({ numero: NUM, conn: CONN });
    assert(ejecuto === true, "este contacto no tiene sesión y B puede entrar");
    assert(postsDeFlujo(FLOW_B).length === 1, "la sesión creada es de B");
    assert(
      state.posts.every((row) => row.cliente_numero === NUM && row.conexion_whatsapp_id === CONN),
      "la sesión nueva queda en el contacto y la línea probados"
    );
    assert(
      state.lecturas.every(
        (l) =>
          l.payload.clienteNumero === NUM && l.payload.conexionWhatsappId === CONN
      ),
      "la lectura no usa la clave del otro contacto"
    );
  });

  await check("7. palabra clave ya coincidente no queda bloqueada por la protección CTWA", async () => {
    guardarSesion(filaSesion("active", FUTURO));
    const ejecuto = await enrutar({ texto: "hola, vengo del anuncio", ctwaAdId: AD_B });
    assert(ejecuto === true, "el activador normal debe ejecutarse");
    assert(postsDeFlujo(FLOW_KW).length === 1, "el flujo elegido es el de la palabra");
    assert(postsDeFlujo(FLOW_B).length === 0, "B no se cuela por el anuncio");
    assert(
      state.lecturas.length === 0,
      "un match normal no consulta la protección de la excepción"
    );
  });

  await check("8. IA pendiente se reanuda antes de evaluar activadores", async () => {
    guardarSesion(filaSesion("finished", PASADO));
    state.iaPendiente = {
      flujoId: FLOW_IA,
      nodoId: "nodo_ia",
      flowContext: { numero: NUM },
      visitados: [],
    };
    seq += 1;
    const ejecuto = await procesarMensajeEntrante(
      NUM,
      "consulta del anuncio",
      USUARIO,
      "wamid.integracion.ia." + seq,
      {
        conexionWhatsappId: CONN,
        esPrimerMensaje: true,
        ctwaAdId: AD_B,
        messageType: "text",
      }
    );
    assert(ejecuto === true, "la reanudación absorbe el mensaje");
    assert(state.iaConsultas.length >= 1, "busca la sesión de IA");
    assert(
      state.gets.every((url) => !url.includes("/rest/v1/activadores")),
      "no llega a cargar activadores"
    );
    assert(state.posts.length === 0, "no abre el flujo B ni crea su sesión");
  });

  console.log(`\nIntegración CTWA sesión/anuncio OK (${passed})`);
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
