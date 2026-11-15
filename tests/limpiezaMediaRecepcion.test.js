/**
 * Recepción del webhook frente a la marca de limpieza.
 * No abre red, no usa Supabase ni Meta.
 * Ejecutar: node tests/limpiezaMediaRecepcion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const entrante = require("../services/limpiezaMedia/limpiezaMediaEntrante");
const { reclamarMensajeEntrantePorWamid } = require("../services/webhookInboundClaim");
const store = require("../services/limpiezaMedia/limpiezaMediaMarcaStore");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function sqlFalso() {
  const filas = new Map();
  return {
    filas,
    llamadas: [],
    async post(url, body, config) {
      this.ultimoTimeout = config?.timeout;
      const nombre = String(url).split("/rpc/")[1];
      this.llamadas.push(nombre);
      const clave = `${body.p_usuario_id}|${body.p_conexion_id}|${body.p_cliente_numero}`;
      const ahora = new Date().toISOString();
      const fila = filas.get(clave);
      if (nombre === "limpieza_media_marca_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando")) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, owner: fila.owner, ahora } };
        }
        if (fila && fila.estado === "entrante" && fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: "entrante", owner: fila.owner, ahora } };
        }
        filas.set(clave, {
          estado: "entrante",
          owner: body.p_owner,
          resultado: null,
        });
        return { data: { ok: true, estado: "entrante", owner: body.p_owner, ahora } };
      }
      if (nombre === "limpieza_media_marca_reservar") {
        if (fila && ["entrante", "reservado", "borrando"].includes(fila.estado)) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, owner: fila.owner, ahora } };
        }
        filas.set(clave, { estado: "reservado", owner: body.p_owner, resultado: null });
        return { data: { ok: true, estado: "reservado", owner: body.p_owner, ahora } };
      }
      if (nombre === "limpieza_media_marca_soltar_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando")) {
          return {
            data: { ok: false, motivo: "marca_de_limpieza", estado: fila.estado, liberada: false, ahora },
          };
        }
        if (!fila || fila.estado !== "entrante" || fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "valla_ajena", liberada: false, ahora } };
        }
        fila.estado = null;
        fila.owner = null;
        return { data: { ok: true, motivo: "soltada", liberada: true, ahora } };
      }
      throw new Error(`rpc no simulada ${nombre}`);
    },
  };
}

function opciones(sql) {
  return { permitirRed: true, url: "http://marca-falsa.test", key: "test", cliente: sql, timeoutMs: entrante.TOPE_CONSULTA_MS };
}

function ocupar(sql, estado, owner, numero = "591") {
  sql.filas.set(`u|c|${numero}`, { estado, owner, resultado: null });
}

async function recibir(sql, wamid, extra = {}) {
  let inserts = 0;
  const respuesta = await entrante.coordinarPersistenciaEntrante({
    ...opciones(sql),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
    ...extra,
  });
  return { respuesta, inserts };
}

async function testLimpiezaDesactivada() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const recibido = await recibir(sql, "wamid.off", { activa: false });
  assert.strictEqual(sql.llamadas.length, 0);
  assert.strictEqual(recibido.inserts, 1);
  assert.strictEqual(recibido.respuesta.guardado, true);
  assert.strictEqual(recibido.respuesta.motivoDurable, "limpieza_inactiva");
  ok("limpieza desactivada: cero RPC y el mensaje se guarda");
}

async function testTablasAusentes() {
  entrante.olvidarEsquemaAusente();
  const sql = {
    llamadas: [],
    async post(url) {
      this.llamadas.push(String(url));
      const error = new Error("not found");
      error.response = { status: 404, data: { code: "PGRST202" } };
      throw error;
    },
  };
  const primero = await recibir(sql, "wamid.ausente", { cachearAusencia: true });
  assert.strictEqual(primero.inserts, 1);
  assert.strictEqual(primero.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas.length, 1);
  assert.ok(!sql.llamadas.some((url) => url.includes("limpieza_media_hilo")));
  const segundo = await recibir(sql, "wamid.ausente-2", { cachearAusencia: true });
  assert.strictEqual(segundo.inserts, 1);
  assert.strictEqual(segundo.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas.length, 1);
  entrante.olvidarEsquemaAusente();
  ok("tablas ausentes: el mensaje se guarda y no se consulta la valla");
}

async function testTimeoutConBorradoBloqueado() {
  entrante.olvidarEsquemaAusente();
  const sql = {
    async post() {
      const error = new Error("timeout of 500ms exceeded");
      error.code = "ECONNABORTED";
      throw error;
    },
  };
  const recibido = await recibir(sql, "wamid.timeout");
  assert.strictEqual(recibido.inserts, 1);
  assert.strictEqual(recibido.respuesta.guardado, true);
  assert.strictEqual(recibido.respuesta.degradada, true);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("timeout con borrado bloqueado: el mensaje se guarda");
}

async function testTimeoutConBorradoHabilitado() {
  entrante.olvidarEsquemaAusente();
  const original = servicio.ELIMINACION_REAL_BLOQUEADA;
  servicio.ELIMINACION_REAL_BLOQUEADA = false;
  try {
    const sql = {
      async post() {
        const error = new Error("timeout of 500ms exceeded");
        error.code = "ECONNABORTED";
        throw error;
      },
    };
    const recibido = await recibir(sql, "wamid.timeout-real");
    assert.strictEqual(recibido.inserts, 0);
    assert.strictEqual(recibido.respuesta.status, 503);
    assert.strictEqual(recibido.respuesta.falloSeguro, true);
    assert.strictEqual(recibido.respuesta.guardado, false);
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = original;
  }
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("timeout con borrado habilitado: no se guarda el mensaje");
}

async function testReservadoYBorrando() {
  entrante.olvidarEsquemaAusente();
  const reservado = sqlFalso();
  ocupar(reservado, "reservado", "cl:limpieza");
  const duranteReserva = await recibir(reservado, "wamid.reservado");
  assert.strictEqual(duranteReserva.inserts, 0);
  assert.strictEqual(duranteReserva.respuesta.status, 503);
  assert.strictEqual(duranteReserva.respuesta.estado, "reservado");

  const borrando = sqlFalso();
  ocupar(borrando, "borrando", "cl:limpieza");
  const duranteBorrado = await recibir(borrando, "wamid.borrando");
  assert.strictEqual(duranteBorrado.inserts, 0);
  assert.strictEqual(duranteBorrado.respuesta.status, 503);
  assert.strictEqual(duranteBorrado.respuesta.estado, "borrando");
  ok("reservado y borrando confirmados no guardan el mensaje");
}

async function testEntranteAjeno() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  ocupar(sql, "entrante", "wh:wamid.anterior");
  const recibido = await recibir(sql, "wamid.nuevo");
  assert.strictEqual(recibido.inserts, 1);
  assert.strictEqual(recibido.respuesta.guardado, true);
  assert.strictEqual(sql.filas.get("u|c|591").owner, "wh:wamid.anterior");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "entrante");
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_soltar_entrante"));
  ok("entrante de otro mensaje no bloquea la recepción ni suelta esa marca");
}

async function testLiberacionFallidaSigueAlBot() {
  entrante.olvidarEsquemaAusente();
  const lineas = [];
  const original = console.log;
  console.log = (...args) => {
    lineas.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" "));
  };
  try {
    const recibido = await recibir(sqlFalso(), "wamid.suelta");
    assert.strictEqual(recibido.respuesta.guardado, true);
    const suelta = await entrante.soltarMarcaEntrante({
      ok: true,
      owner: "wh:wamid.suelta",
      estado: "entrante",
      modo: "entrante",
      liberar: async () => ({ ok: false, motivo: "marca_no_disponible" }),
    });
    assert.strictEqual(suelta.retenida, true);
    assert.strictEqual(suelta.owner, "wh:wamid.suelta");
    const status = entrante.statusSiMensajeGuardado(true, suelta, 200);
    assert.strictEqual(status, 200);
    let bot = 0;
    if (recibido.respuesta.guardado && status === 200) bot += 1;
    assert.strictEqual(bot, 1);
    const texto = lineas.join("\n");
    assert.ok(texto.includes("[LIMPIEZA_MEDIA] marca entrante retenida"));
    assert.ok(texto.includes("wh:wamid.suelta"));
    assert.ok(texto.includes("marca_no_disponible"));
    assert.ok(texto.includes('"liberaMarcaAjena":false'));
    assert.ok(texto.includes('"eliminaMarcaBorrando":false'));
  } finally {
    console.log = original;
  }
  ok("liberación fallida después del insert deja seguir al bot y queda registrada");
}

async function testDuplicadoMismoProceso() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const procesados = new Set();
  const guardados = new Set();
  let bots = 0;
  let filas = 0;
  async function entregar(wamid) {
    if (procesados.has(wamid)) return { bot: false, atajo: true };
    procesados.add(wamid);
    const recibido = await recibir(sql, wamid, {
      persistir: async () => {
        if (guardados.has(wamid)) return { claimed: false, duplicate: true };
        guardados.add(wamid);
        filas += 1;
        return { claimed: true };
      },
    });
    if (recibido.respuesta.guardado) {
      bots += 1;
      if (recibido.respuesta.valla) await recibido.respuesta.valla.liberar();
      return { bot: true, atajo: false };
    }
    return { bot: false, atajo: false, duplicado: recibido.respuesta.duplicado === true };
  }
  const primero = await entregar("wamid.dup");
  const segundo = await entregar("wamid.dup");
  assert.strictEqual(primero.bot, true);
  assert.strictEqual(segundo.atajo, true);
  assert.strictEqual(segundo.bot, false);
  assert.strictEqual(filas, 1);
  assert.strictEqual(bots, 1);
  ok("duplicado en el mismo proceso: una fila y una sola ejecución");
}

async function testReinicioConEntranteNoAutorizaBorrado() {
  entrante.olvidarEsquemaAusente();
  marca.olvidarMemoriaDeProceso();
  const sql = sqlFalso();
  const tomado = await recibir(sql, "wamid.retenida");
  assert.strictEqual(tomado.respuesta.guardado, true);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "entrante");
  marca.olvidarMemoriaDeProceso();
  let deletes = 0;
  const plan = await eliminar.planificarEliminacion("archivos/whatsapp/u/foto.jpg", {
    ...opciones(sql),
    workerId: "w-reinicio",
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo: "u|c|591" }),
    io: { leerUltimoEntrante: async () => 1000 },
    borrarObjeto: async () => {
      deletes += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(plan.eliminar, false);
  const directo = await eliminar.borrarObjetoStorage("archivos/whatsapp/u/foto.jpg", {
    url: "http://127.0.0.1:9",
    marca: {
      sobreviveDesconexion: true,
      sinVencimiento: true,
      leer: async () => ({ estado: "entrante", resultado: null, owner: "wh:wamid.retenida" }),
      confirmar: async () => ({ ok: true }),
    },
    cliente: {
      async delete() {
        deletes += 1;
      },
    },
  });
  assert.strictEqual(deletes, 0);
  assert.strictEqual(directo.storage, false);
  assert.notStrictEqual(directo.motivo, "bloqueada");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "entrante");
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("reinicio con entrante retenido no autoriza un borrado");
}

function errorHttp(status, data, message) {
  const error = new Error(message || "fallo");
  error.response = { status, data };
  return error;
}

function clienteQueFalla(error) {
  return {
    llamadas: 0,
    async post() {
      this.llamadas += 1;
      throw error;
    },
  };
}

function sinBot(respuesta, suelta) {
  const status = entrante.statusHttpEntrante(respuesta, suelta);
  return { status, bot: respuesta.guardado === true && status === 200 };
}

async function testClaimFallidoConLimpiezaApagada() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const lanzado = await recibir(sql, "wamid.claim-off", {
    activa: false,
    persistir: async () => {
      throw new Error("insert fallo");
    },
  });
  const devuelto = await recibir(sql, "wamid.claim-off-2", {
    activa: false,
    persistir: async () => ({ claimed: false, error: true, reason: "no_supabase" }),
  });
  for (const recibido of [lanzado, devuelto]) {
    const decision = sinBot(recibido.respuesta, { retenida: true });
    assert.strictEqual(recibido.respuesta.guardado, false);
    assert.strictEqual(recibido.respuesta.reintentar, false);
    assert.strictEqual(recibido.respuesta.proteccion, false);
    assert.strictEqual(decision.status, 200);
    assert.strictEqual(decision.bot, false);
  }
  assert.strictEqual(sql.llamadas.length, 0);
  ok("claim fallido con limpieza apagada: 200 y sin bot");
}

async function testClaimFallidoConLimpiezaActiva() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const recibido = await recibir(sql, "wamid.claim-on", {
    activa: true,
    persistir: async () => {
      throw new Error("insert fallo");
    },
  });
  const decision = sinBot(recibido.respuesta, { retenida: true });
  assert.strictEqual(recibido.inserts, 0);
  assert.strictEqual(recibido.respuesta.guardado, false);
  assert.strictEqual(recibido.respuesta.proteccion, false);
  assert.strictEqual(recibido.respuesta.persistencia, true);
  assert.strictEqual(recibido.respuesta.motivo, "persistencia_fallida");
  assert.strictEqual(decision.status, 503);
  assert.strictEqual(decision.bot, false);
  assert.strictEqual(sql.filas.get("u|c|591").estado, null);
  const reservado = sqlFalso();
  ocupar(reservado, "reservado", "cl:limpieza");
  const bloqueado = await recibir(reservado, "wamid.reservado-seguro", { activa: true });
  assert.strictEqual(bloqueado.respuesta.proteccion, true);
  assert.strictEqual(bloqueado.respuesta.motivo, "valla_ocupada");
  assert.strictEqual(bloqueado.inserts, 0);
  ok("claim fallido con limpieza activada: no se guarda y no se confunde con la protección");
}

async function testFuncionAusenteMemoriza() {
  entrante.olvidarEsquemaAusente();
  const sql = clienteQueFalla(errorHttp(404, {
    code: "PGRST202",
    message: "Could not find the function public.limpieza_media_marca_entrante in the schema cache",
  }));
  const env = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto.test" };
  const primero = await recibir(sql, "wamid.pgrst", { cachearAusencia: true, activa: true, env });
  const segundo = await recibir(sql, "wamid.pgrst-2", { cachearAusencia: true, activa: true, env });
  assert.strictEqual(primero.respuesta.guardado, true);
  assert.strictEqual(primero.respuesta.motivoDurable, "marca_no_instalada");
  assert.strictEqual(segundo.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas, 1);
  entrante.olvidarEsquemaAusente();
  ok("función ausente de PostgREST queda en caché");
}

async function testHttp404GenericoNoMemoriza() {
  entrante.olvidarEsquemaAusente();
  const sql = clienteQueFalla(errorHttp(404, { message: "Not Found" }, "Not Found"));
  const env = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto.test" };
  const primero = await recibir(sql, "wamid.404", { cachearAusencia: true, activa: true, env });
  const segundo = await recibir(sql, "wamid.404-2", { cachearAusencia: true, activa: true, env });
  assert.strictEqual(primero.respuesta.guardado, true);
  assert.notStrictEqual(primero.respuesta.motivoDurable, "marca_no_instalada");
  assert.strictEqual(segundo.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas, 2);
  ok("un HTTP 404 genérico no queda memorizado como función ausente");
}

async function testTimeoutYPermisoNoMemorizan() {
  entrante.olvidarEsquemaAusente();
  const env = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto.test" };
  const timeout = clienteQueFalla(Object.assign(new Error("timeout of 500ms exceeded"), { code: "ECONNABORTED" }));
  await recibir(timeout, "wamid.to-1", { cachearAusencia: true, activa: true, env });
  await recibir(timeout, "wamid.to-2", { cachearAusencia: true, activa: true, env });
  assert.strictEqual(timeout.llamadas, 2);

  const permiso = clienteQueFalla(errorHttp(403, {
    code: "42501",
    message: "permission denied for function limpieza_media_marca_entrante",
  }));
  const primero = await recibir(permiso, "wamid.perm-1", { cachearAusencia: true, activa: true, env });
  await recibir(permiso, "wamid.perm-2", { cachearAusencia: true, activa: true, env });
  assert.strictEqual(primero.respuesta.motivoDurable, "permiso_denegado");
  assert.strictEqual(primero.respuesta.guardado, true);
  assert.strictEqual(permiso.llamadas, 2);
  ok("timeout y permiso denegado no quedan memorizados como esquema ausente");
}

async function testCambioDeConfiguracionInvalidaCache() {
  entrante.olvidarEsquemaAusente();
  const sql = clienteQueFalla(errorHttp(404, { code: "PGRST202", message: "Could not find the function" }));
  const proyectoA = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto-a.test" };
  const proyectoB = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto-b.test" };
  await recibir(sql, "wamid.cfg-1", { cachearAusencia: true, activa: true, env: proyectoA });
  await recibir(sql, "wamid.cfg-2", { cachearAusencia: true, activa: true, env: proyectoA });
  assert.strictEqual(sql.llamadas, 1);
  await recibir(sql, "wamid.cfg-3", { cachearAusencia: true, activa: true, env: proyectoB });
  assert.strictEqual(sql.llamadas, 2);
  await recibir(sql, "wamid.cfg-off", { cachearAusencia: true, activa: false, env: proyectoB });
  assert.strictEqual(sql.llamadas, 2);
  await recibir(sql, "wamid.cfg-4", { cachearAusencia: true, activa: true, env: proyectoB });
  assert.strictEqual(sql.llamadas, 3);

  const original = servicio.ELIMINACION_REAL_BLOQUEADA;
  servicio.ELIMINACION_REAL_BLOQUEADA = false;
  try {
    const conBorrado = await recibir(sql, "wamid.cfg-real", { cachearAusencia: true, activa: true, env: proyectoB });
    assert.strictEqual(conBorrado.inserts, 0);
    assert.strictEqual(conBorrado.respuesta.falloSeguro, true);
    assert.strictEqual(conBorrado.respuesta.guardado, false);
    assert.strictEqual(sql.llamadas, 4);
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = original;
  }
  const despues = await recibir(sql, "wamid.cfg-5", { cachearAusencia: true, activa: true, env: proyectoB });
  assert.strictEqual(despues.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas, 5);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  entrante.olvidarEsquemaAusente();
  ok("un cambio de configuración invalida el caché y el borrado real no continúa a ciegas");
}

async function testDuplicadoConLiberacionFallida() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const original = sql.post.bind(sql);
  sql.post = async function post(url, body, config) {
    const nombre = String(url).split("/rpc/")[1];
    if (nombre === "limpieza_media_marca_soltar_entrante") {
      this.llamadas.push(nombre);
      this.ultimoTimeout = config?.timeout;
      return { data: { ok: false, motivo: "marca_no_disponible", liberada: false, ahora: new Date().toISOString() } };
    }
    return original(url, body, config);
  };
  const guardados = new Set();
  let filas = 0;
  let bots = 0;
  async function entregar(wamid) {
    const recibido = await recibir(sql, wamid, {
      activa: true,
      persistir: async () => {
        if (guardados.has(wamid)) return { claimed: false, duplicate: true };
        guardados.add(wamid);
        filas += 1;
        return { claimed: true };
      },
    });
    const decision = sinBot(recibido.respuesta, { retenida: true });
    if (decision.bot) bots += 1;
    return decision;
  }
  const primero = await entregar("wamid.dup-suelta");
  const segundo = await entregar("wamid.dup-suelta");
  assert.strictEqual(primero.status, 200);
  assert.strictEqual(primero.bot, true);
  assert.strictEqual(segundo.status, 200);
  assert.strictEqual(segundo.bot, false);
  assert.strictEqual(filas, 1);
  assert.strictEqual(bots, 1);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "entrante");
  ok("duplicado con liberación fallida responde 200 y no ejecuta otro bot");
}

async function testEntregasSimultaneas() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  let filas = 0;
  let reclamado = false;
  let bots = 0;
  async function entregar(wamid) {
    const recibido = await entrante.coordinarPersistenciaEntrante({
      ...opciones(sql),
      usuarioId: "u",
      conexionId: "c",
      numero: "591",
      wamid,
      activa: true,
      persistir: async () => {
        if (reclamado) return { claimed: false, duplicate: true };
        reclamado = true;
        await Promise.resolve();
        filas += 1;
        return { claimed: true };
      },
    });
    const decision = sinBot(recibido, { retenida: true });
    if (decision.bot) bots += 1;
    return { recibido, decision };
  }
  const entregas = await Promise.all([entregar("wamid.sim"), entregar("wamid.sim")]);
  assert.strictEqual(filas, 1);
  assert.strictEqual(bots, 1);
  assert.strictEqual(entregas.filter((item) => item.recibido.guardado).length, 1);
  assert.strictEqual(entregas.filter((item) => item.recibido.duplicado).length, 1);
  assert.ok(entregas.every((item) => item.decision.status === 200));
  ok("dos entregas simultáneas del mismo wamid dejan una fila y una ejecución");
}

async function testMarcaAjenaNoSeLibera() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  ocupar(sql, "entrante", "wh:wamid.anterior");
  const recibido = await recibir(sql, "wamid.nuevo-ajeno", { activa: true });
  assert.strictEqual(recibido.respuesta.guardado, true);
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_soltar_entrante"));
  await store.soltarEntrante({
    ...opciones(sql),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    owner: "wh:wamid.nuevo-ajeno",
  });
  assert.strictEqual(sql.filas.get("u|c|591").owner, "wh:wamid.anterior");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "entrante");
  let liberaciones = 0;
  const suelta = await entrante.soltarMarcaEntrante({
    ok: true,
    estado: "entrante",
    owner: "cl:limpieza",
    modo: "limpieza",
    liberar: async () => {
      liberaciones += 1;
      return { ok: true };
    },
  });
  assert.strictEqual(liberaciones, 0);
  assert.strictEqual(suelta.omitida, true);
  ok("una marca ajena no se libera");
}

async function testBorrandoNoSeLiberaNiBorra() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  ocupar(sql, "borrando", "cl:limpieza");
  const recibido = await recibir(sql, "wamid.sobre-borrando", { activa: true });
  assert.strictEqual(recibido.inserts, 0);
  assert.strictEqual(recibido.respuesta.proteccion, true);
  assert.strictEqual(recibido.respuesta.estado, "borrando");
  const suelto = await store.soltarEntrante({
    ...opciones(sql),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    owner: "wh:wamid.sobre-borrando",
  });
  assert.strictEqual(suelto.motivo, "marca_de_limpieza");
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|591").owner, "cl:limpieza");
  let liberaciones = 0;
  const suelta = await entrante.soltarMarcaEntrante({
    ok: true,
    estado: "borrando",
    owner: "cl:limpieza",
    modo: "limpieza",
    liberar: async () => {
      liberaciones += 1;
      return { ok: true, motivo: "soltada" };
    },
  });
  assert.strictEqual(liberaciones, 0);
  assert.strictEqual(suelta.omitida, true);
  let deletes = 0;
  const directo = await eliminar.borrarObjetoStorage("archivos/whatsapp/u/foto.jpg", {
    url: "http://127.0.0.1:9",
    marca: {
      sobreviveDesconexion: true,
      sinVencimiento: true,
      leer: async () => ({ estado: "borrando", resultado: null, owner: "cl:limpieza" }),
      confirmar: async () => ({ ok: true }),
    },
    cliente: {
      async delete() {
        deletes += 1;
      },
    },
  });
  assert.strictEqual(deletes, 0);
  assert.strictEqual(directo.storage, false);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("una marca borrando no se libera ni autoriza un DELETE");
}

async function testCacheVenceYUnaSolaRevalidacion() {
  entrante.olvidarEsquemaAusente();
  const reloj = { ahora: 0 };
  const env = { LIMPIEZA_MEDIA_ACTIVA: "true", SUPABASE_URL: "http://proyecto.test" };
  const extra = {
    cachearAusencia: true,
    activa: true,
    env,
    cacheAusenciaMs: 1000,
    ahoraMs: () => reloj.ahora,
  };
  const sql = clienteQueFalla(errorHttp(404, {
    code: "PGRST202",
    message: "Could not find the function public.limpieza_media_marca_entrante in the schema cache",
  }));
  await recibir(sql, "wamid.vence-1", extra);
  await recibir(sql, "wamid.vence-2", extra);
  assert.strictEqual(sql.llamadas, 1);
  reloj.ahora = 1000;
  let abiertas = 0;
  let soltar;
  const puerta = new Promise((resolve) => {
    soltar = resolve;
  });
  sql.post = async function postConPuerta() {
    this.llamadas += 1;
    abiertas += 1;
    if (abiertas === 1) await puerta;
    throw errorHttp(404, { code: "PGRST202", message: "Could not find the function" });
  };
  const tanda = Promise.all([
    recibir(sql, "wamid.vence-3", extra),
    recibir(sql, "wamid.vence-4", extra),
    recibir(sql, "wamid.vence-5", extra),
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(sql.llamadas, 2);
  soltar();
  await tanda;
  assert.strictEqual(sql.llamadas, 2);
  reloj.ahora = 1500;
  await recibir(sql, "wamid.vence-6", extra);
  assert.strictEqual(sql.llamadas, 2);
  reloj.ahora = 2500;
  sql.post = async function postPresente() {
    this.llamadas += 1;
    return {
      data: { ok: true, estado: "entrante", owner: "wh:wamid.vence-7", ahora: new Date().toISOString() },
    };
  };
  const reactivado = await recibir(sql, "wamid.vence-7", extra);
  const siguiente = await recibir(sql, "wamid.vence-8", extra);
  assert.strictEqual(reactivado.respuesta.guardado, true);
  assert.strictEqual(siguiente.respuesta.guardado, true);
  assert.strictEqual(sql.llamadas, 4);
  entrante.olvidarEsquemaAusente();
  ok("el caché vence, una sola solicitud revalida y la respuesta correcta reactiva la protección");
}

async function testClaimInciertoNoEjecutaBot() {
  entrante.olvidarEsquemaAusente();
  const sql = sqlFalso();
  const recibido = await recibir(sql, "wamid.incierto", {
    activa: true,
    persistir: async () => ({
      claimed: false,
      incierto: true,
      guardado: null,
      reason: "claim_incierto",
      fase: "insert",
    }),
  });
  const decision = sinBot(recibido.respuesta, { retenida: true });
  assert.strictEqual(recibido.respuesta.incierto, true);
  assert.strictEqual(recibido.respuesta.guardado, null);
  assert.strictEqual(recibido.respuesta.reintentar, true);
  assert.strictEqual(recibido.respuesta.recuperacion, false);
  assert.notStrictEqual(recibido.respuesta.guardado, false);
  assert.strictEqual(decision.status, 503);
  assert.strictEqual(decision.bot, false);
  assert.strictEqual(sql.filas.get("u|c|591").estado, null);
  ok("un claim incierto no afirma que no se guardó y no ejecuta el bot");
}

function almacenClaim() {
  const filas = new Map();
  return {
    filas,
    axios: {
      async get(url) {
        const coincidencia = /whatsapp_message_id=eq\.([^&]+)/.exec(url);
        const wamid = coincidencia ? decodeURIComponent(coincidencia[1]) : "";
        const fila = filas.get(wamid);
        return { data: fila ? [fila] : [] };
      },
      async post(_url, body) {
        if (filas.has(body.whatsapp_message_id)) {
          const error = new Error("duplicate");
          error.response = { status: 409, data: { code: "23505" } };
          throw error;
        }
        const fila = { id: `id-${filas.size + 1}`, ...body };
        filas.set(body.whatsapp_message_id, fila);
        return { data: [fila] };
      },
    },
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "key",
  };
}

async function decidirClaim(deps, wamid, extra = {}) {
  const respuesta = await entrante.coordinarPersistenciaEntrante({
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid,
    permitirRed: true,
    url: "http://marca-falsa.test",
    key: "test",
    cliente: extra.cliente,
    timeoutMs: entrante.TOPE_CONSULTA_MS,
    activa: extra.activa,
    persistir: () => reclamarMensajeEntrantePorWamid({
      cliente_numero: "591",
      usuario_id: "u",
      conexion_whatsapp_id: "c",
      direccion: "entrante",
      contenido: "hola",
      whatsapp_message_id: wamid,
    }, deps),
  });
  const status = entrante.statusHttpEntrante(respuesta);
  return {
    respuesta,
    status,
    bot: respuesta.guardado === true && status === 200,
  };
}

async function testCincoEscenariosDeClaim() {
  entrante.olvidarEsquemaAusente();
  const deps = almacenClaim();

  const nuevo = await decidirClaim(deps, "wamid.nuevo", { activa: false });
  assert.strictEqual(nuevo.respuesta.guardado, true);
  assert.strictEqual(nuevo.status, 200);
  assert.strictEqual(nuevo.bot, true);
  assert.strictEqual(deps.filas.size, 1);

  const duplicado = await decidirClaim(deps, "wamid.nuevo", { activa: false });
  assert.strictEqual(duplicado.respuesta.duplicado, true);
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.bot, false);
  assert.strictEqual(deps.filas.size, 1);

  const red = almacenClaim();
  red.axios.post = async () => {
    const error = new Error("socket hang up");
    error.code = "ECONNRESET";
    throw error;
  };
  const porRed = await decidirClaim(red, "wamid.red", { activa: false });
  assert.strictEqual(porRed.respuesta.incierto, true);
  assert.strictEqual(porRed.respuesta.reintentar, true);
  assert.strictEqual(porRed.respuesta.guardado, null);
  assert.strictEqual(porRed.status, 503);
  assert.strictEqual(porRed.bot, false);
  assert.strictEqual(red.filas.size, 0);

  const caido = almacenClaim();
  caido.axios.get = async () => {
    const error = new Error("timeout of 500ms exceeded");
    error.code = "ECONNABORTED";
    throw error;
  };
  caido.axios.post = async () => {
    const error = new Error("bad gateway");
    error.response = { status: 502, data: { message: "bad gateway" } };
    throw error;
  };
  const por5xx = await decidirClaim(caido, "wamid.5xx", { activa: false });
  assert.strictEqual(por5xx.respuesta.incierto, true);
  assert.strictEqual(por5xx.respuesta.fase, "insert");
  assert.strictEqual(por5xx.respuesta.reintentar, true);
  assert.strictEqual(por5xx.status, 503);
  assert.strictEqual(por5xx.bot, false);

  const limpieza = sqlFalso();
  ocupar(limpieza, "reservado", "cl:limpieza");
  const bloqueado = await decidirClaim(almacenClaim(), "wamid.limpieza", {
    activa: true,
    cliente: limpieza,
  });
  assert.strictEqual(bloqueado.respuesta.status, 503);
  assert.strictEqual(bloqueado.respuesta.estado, "reservado");
  assert.strictEqual(bloqueado.respuesta.guardado, false);
  assert.strictEqual(bloqueado.bot, false);
  assert.strictEqual(limpieza.filas.get("u|c|591").estado, "reservado");

  const durante = sqlFalso();
  const inestable = almacenClaim();
  inestable.axios.post = async () => {
    const error = new Error("socket hang up");
    error.code = "ECONNRESET";
    throw error;
  };
  const activoIncierto = await decidirClaim(inestable, "wamid.limpieza-red", {
    activa: true,
    cliente: durante,
  });
  assert.strictEqual(activoIncierto.status, 503);
  assert.strictEqual(activoIncierto.respuesta.incierto, true);
  assert.strictEqual(activoIncierto.respuesta.reintentar, true);
  assert.strictEqual(activoIncierto.bot, false);
  assert.strictEqual(durante.filas.get("u|c|591").estado, null);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("nuevo, duplicado, red, 5xx y limpieza activa");
}

function falloDeInsert(error) {
  const deps = almacenClaim();
  deps.axios.post = async () => {
    throw error;
  };
  return deps;
}

function errorDeCodigo(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function errorDeHttp(status, data, message) {
  const error = new Error(message || `HTTP ${status}`);
  error.response = { status, data: data || { message: message || `HTTP ${status}` } };
  return error;
}

async function testEstadoHttpPorCodigo(code) {
  entrante.olvidarEsquemaAusente();
  const decision = await decidirClaim(falloDeInsert(errorDeCodigo(code)), `wamid.${code}`, { activa: false });
  assert.strictEqual(decision.respuesta.incierto, true, code);
  assert.strictEqual(decision.respuesta.reintentar, true, code);
  assert.strictEqual(decision.status, 503, code);
  assert.strictEqual(decision.bot, false, code);
  ok(`${code} responde 503 con la limpieza apagada`);
}

async function testEstadoHttp5xx(status) {
  entrante.olvidarEsquemaAusente();
  const decision = await decidirClaim(
    falloDeInsert(errorDeHttp(status, { message: "duplicate unique whatsapp_message_id" })),
    `wamid.http${status}`,
    { activa: false }
  );
  assert.strictEqual(decision.respuesta.incierto, true, String(status));
  assert.strictEqual(decision.respuesta.duplicado, false, String(status));
  assert.strictEqual(decision.status, 503, String(status));
  assert.strictEqual(decision.bot, false, String(status));
  ok(`HTTP ${status} responde 503 aunque el texto parezca un duplicado`);
}

async function testEstadoHttp4xx(status) {
  entrante.olvidarEsquemaAusente();
  const decision = await decidirClaim(
    falloDeInsert(errorDeHttp(status, { message: "timeout duplicate whatsapp_message_id" }, `HTTP ${status}`)),
    `wamid.rechazo${status}`,
    { activa: false }
  );
  assert.strictEqual(decision.respuesta.incierto, false, String(status));
  assert.strictEqual(decision.respuesta.duplicado, false, String(status));
  assert.strictEqual(decision.respuesta.reintentar, false, String(status));
  assert.strictEqual(decision.status, 200, String(status));
  assert.strictEqual(decision.bot, false, String(status));
  ok(`HTTP ${status} responde 200 y no reintenta`);
}

async function testDuplicadosConfirmadosResponden200() {
  entrante.olvidarEsquemaAusente();
  const conflicto = await decidirClaim(
    falloDeInsert(errorDeHttp(409, { message: "conflict" })),
    "wamid.solo409",
    { activa: false }
  );
  assert.strictEqual(conflicto.respuesta.duplicado, true);
  assert.strictEqual(conflicto.status, 200);
  assert.strictEqual(conflicto.bot, false);

  const sql = await decidirClaim(
    falloDeInsert(errorDeHttp(500, { code: "23505", message: "unique violation" })),
    "wamid.sql23505",
    { activa: false }
  );
  assert.strictEqual(sql.respuesta.duplicado, true);
  assert.strictEqual(sql.respuesta.incierto, false);
  assert.strictEqual(sql.status, 200);
  assert.strictEqual(sql.bot, false);
  ok("409 y 23505 responden 200");
}

async function testLimpiezaActivaConservaProteccion() {
  entrante.olvidarEsquemaAusente();
  const limpieza = sqlFalso();
  ocupar(limpieza, "reservado", "cl:codigos");
  const bloqueado = await decidirClaim(almacenClaim(), "wamid.activa-reservado", {
    activa: true,
    cliente: limpieza,
  });
  assert.strictEqual(bloqueado.status, 503);
  assert.strictEqual(bloqueado.respuesta.estado, "reservado");
  assert.strictEqual(bloqueado.respuesta.guardado, false);
  assert.strictEqual(bloqueado.bot, false);
  assert.strictEqual(limpieza.filas.get("u|c|591").estado, "reservado");

  const durante = sqlFalso();
  const rechazado = await decidirClaim(
    falloDeInsert(errorDeHttp(400, { message: "bad request" })),
    "wamid.activa-400",
    { activa: true, cliente: durante }
  );
  assert.strictEqual(rechazado.status, 200);
  assert.strictEqual(rechazado.respuesta.incierto, false);
  assert.strictEqual(rechazado.bot, false);
  assert.strictEqual(durante.filas.get("u|c|591").estado, null);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  ok("la limpieza activa bloquea reservado y un 4xx no queda en 503");
}

function testWebhookNoEsperaNiCortaElBot() {
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");
  assert.ok(webhook.includes("activa: proteccionEntranteActiva()"));
  assert.ok(webhook.includes("timeoutMs: TOPE_CONSULTA_MS"));
  assert.ok(webhook.includes("permitirRed: true"));
  const ack = webhook.indexOf("statusSiMensajeGuardado(entranteConfirmado, sueltaAck, 200)");
  const bot = webhook.indexOf("procesarMensajeEntrante(");
  assert.ok(ack > 0 && ack < bot);
  assert.ok(webhook.includes("statusHttpEntrante(coordinado, sueltaDuplicado)"));
  assert.ok(webhook.includes("[WEBHOOK] claim incierto"));
  assert.ok(webhook.includes("if (statusIncierto === 503 && messageIdEntrante) mensajesProcesados.delete(messageIdEntrante);"));
  assert.ok(webhook.indexOf("[WEBHOOK] claim incierto") < webhook.indexOf("procesarMensajeEntrante("));
  assert.ok(webhook.includes("proteccionEntranteActiva() && intentoPersistencia"));
  assert.ok(webhook.indexOf("mensajesProcesados.has(message.id)") < webhook.indexOf("await coordinarPersistenciaEntrante"));
  assert.strictEqual(webhook.split("reclamarMensajeEntrantePorWamid({").length, 2);
  assert.strictEqual(entrante.TOPE_CONSULTA_MS <= 500, true);
  ok("el webhook no consulta si la limpieza está apagada y no corta el bot si soltar falla");
}

(async () => {
  await testLimpiezaDesactivada();
  await testTablasAusentes();
  await testTimeoutConBorradoBloqueado();
  await testTimeoutConBorradoHabilitado();
  await testReservadoYBorrando();
  await testEntranteAjeno();
  await testLiberacionFallidaSigueAlBot();
  await testDuplicadoMismoProceso();
  await testReinicioConEntranteNoAutorizaBorrado();
  await testClaimFallidoConLimpiezaApagada();
  await testClaimFallidoConLimpiezaActiva();
  await testFuncionAusenteMemoriza();
  await testHttp404GenericoNoMemoriza();
  await testTimeoutYPermisoNoMemorizan();
  await testCambioDeConfiguracionInvalidaCache();
  await testDuplicadoConLiberacionFallida();
  await testEntregasSimultaneas();
  await testMarcaAjenaNoSeLibera();
  await testBorrandoNoSeLiberaNiBorra();
  await testCacheVenceYUnaSolaRevalidacion();
  await testClaimInciertoNoEjecutaBot();
  await testCincoEscenariosDeClaim();
  for (const code of ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNABORTED"]) {
    await testEstadoHttpPorCodigo(code);
  }
  for (const status of [500, 502, 503, 504]) {
    await testEstadoHttp5xx(status);
  }
  for (const status of [400, 401, 403, 404, 408, 422, 429]) {
    await testEstadoHttp4xx(status);
  }
  await testDuplicadosConfirmadosResponden200();
  await testLimpiezaActivaConservaProteccion();
  testWebhookNoEsperaNiCortaElBot();
  console.log(`${passed} pruebas ok`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
