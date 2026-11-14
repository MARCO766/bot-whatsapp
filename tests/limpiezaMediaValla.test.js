/**
 * Coordinación webhook ↔ limpieza. No llama a Supabase ni a Storage.
 * Ejecutar: node tests/limpiezaMediaValla.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const valla = require("../services/limpiezaMedia/limpiezaMediaValla");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

const AHORA = new Date("2026-11-11T22:46:10.000Z");
const URL = "https://proj.supabase.co";
const KEY = "test-key";
let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function memoriaValla(inicio = AHORA) {
  let reloj = new Date(inicio.getTime());
  const hilos = new Map();
  const objetos = new Map();
  const llamadas = [];
  function ahora() {
    return new Date(reloj.getTime()).toISOString();
  }
  function vigente(fila) {
    return Boolean(fila && fila.locked_by && Date.parse(fila.locked_until) > reloj.getTime());
  }
  function textoInvalido(valor) {
    return valor == null || String(valor).trim() === "";
  }
  function modoInvalido(modo) {
    return textoInvalido(modo) || (modo !== "entrante" && modo !== "limpieza");
  }
  function ttlInvalido(body) {
    const ttl = Number(body?.p_ttl_seconds);
    return !Number.isFinite(ttl) || ttl <= 0;
  }
  function aplicar(nombre, body) {
    const now = ahora();
    const ttl = Number(body?.p_ttl_seconds) * 1000;
    const until = Number.isFinite(ttl)
      ? new Date(reloj.getTime() + ttl).toISOString()
      : ahora();
    if (nombre === "limpieza_media_hilo_adquirir") {
      if (textoInvalido(body?.p_hilo) || textoInvalido(body?.p_owner) || modoInvalido(body?.p_modo) || ttlInvalido(body)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      const actual = hilos.get(body.p_hilo);
      if (!actual || !vigente(actual)) {
        const fila = { hilo: body.p_hilo, modo: body.p_modo, locked_by: body.p_owner, locked_until: until };
        hilos.set(body.p_hilo, fila);
        return { ok: true, motivo: "adquirida", ...fila, ahora: now };
      }
      if (actual.locked_by === body.p_owner && actual.modo === body.p_modo) {
        actual.locked_until = until;
        return { ok: true, motivo: "adquirida", ...actual, ahora: now };
      }
      return { ok: false, motivo: "valla_ocupada", ...actual, ahora: now };
    }
    if (nombre === "limpieza_media_hilo_renovar" || nombre === "limpieza_media_hilo_verificar") {
      if (textoInvalido(body?.p_hilo) || textoInvalido(body?.p_owner) || modoInvalido(body?.p_modo)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      if (nombre === "limpieza_media_hilo_renovar" && ttlInvalido(body)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      const actual = hilos.get(body.p_hilo);
      if (!actual || actual.locked_by !== body.p_owner || actual.modo !== body.p_modo || !vigente(actual)) {
        return { ok: false, motivo: "valla_perdida", ahora: now };
      }
      if (nombre === "limpieza_media_hilo_renovar") actual.locked_until = until;
      return { ok: true, motivo: nombre.endsWith("renovar") ? "renovada" : "vigente", ...actual, ahora: now };
    }
    if (nombre === "limpieza_media_hilo_liberar") {
      if (textoInvalido(body?.p_hilo) || textoInvalido(body?.p_owner) || modoInvalido(body?.p_modo)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      const actual = hilos.get(body.p_hilo);
      if (actual && actual.modo === "limpieza" && body.p_modo !== "limpieza") {
        return { ok: false, motivo: "marca_de_limpieza", ahora: now, locked_by: actual.locked_by, modo: actual.modo };
      }
      if (!actual || actual.locked_by !== body.p_owner || actual.modo !== body.p_modo) {
        return { ok: false, motivo: "valla_ajena", ahora: now, locked_by: actual?.locked_by, modo: actual?.modo };
      }
      actual.modo = null;
      actual.locked_by = null;
      actual.locked_until = now;
      return { ok: true, motivo: "liberada", ahora: now };
    }
    if (nombre === "limpieza_media_objeto_adquirir") {
      if (textoInvalido(body?.p_clave) || textoInvalido(body?.p_hilo) || textoInvalido(body?.p_owner) || ttlInvalido(body)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      const actual = objetos.get(body.p_clave);
      if (!actual || !vigente(actual)) {
        const fila = { clave: body.p_clave, hilo: body.p_hilo, locked_by: body.p_owner, locked_until: until };
        objetos.set(body.p_clave, fila);
        return { ok: true, motivo: "adquirida", ...fila, ahora: now };
      }
      if (actual.locked_by === body.p_owner) {
        actual.locked_until = until;
        return { ok: true, motivo: "adquirida", ...actual, ahora: now };
      }
      return { ok: false, motivo: "objeto_ocupado", ...actual, ahora: now };
    }
    if (nombre === "limpieza_media_objeto_renovar" || nombre === "limpieza_media_objeto_verificar") {
      if (textoInvalido(body?.p_clave) || textoInvalido(body?.p_owner)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      if (nombre === "limpieza_media_objeto_renovar" && ttlInvalido(body)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      const actual = objetos.get(body.p_clave);
      if (!actual || actual.locked_by !== body.p_owner || !vigente(actual)) {
        return { ok: false, motivo: "valla_perdida", ahora: now };
      }
      if (nombre === "limpieza_media_objeto_renovar") actual.locked_until = until;
      return { ok: true, motivo: "vigente", ...actual, ahora: now };
    }
    if (nombre === "limpieza_media_objeto_liberar") {
      if (textoInvalido(body?.p_clave) || textoInvalido(body?.p_owner)) {
        return { ok: false, motivo: "parametro_invalido", ahora: now };
      }
      if (String(body.p_owner).startsWith("wh:")) {
        return { ok: false, motivo: "marca_de_limpieza", ahora: now };
      }
      const actual = objetos.get(body.p_clave);
      if (!actual || actual.locked_by !== body.p_owner) {
        return { ok: false, motivo: "valla_ajena", ahora: now };
      }
      actual.locked_by = null;
      actual.locked_until = now;
      return { ok: true, motivo: "liberada", ahora: now };
    }
    return { ok: false, motivo: "rpc_desconocida", ahora: now };
  }
  return {
    llamadas,
    hilos,
    objetos,
    adelantar(ms) {
      reloj = new Date(reloj.getTime() + ms);
    },
    async post(url, body) {
      llamadas.push({ url, body });
      return { data: aplicar(String(url).split("/rpc/")[1], body) };
    },
  };
}

function opciones(mem) {
  return { cliente: mem, url: URL, key: KEY, permitirRed: true };
}

function testSqlYFuente() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/limpieza_media_valla.sql"),
    "utf8"
  );
  assert.ok(sql.includes("clock_timestamp()"));
  assert.ok(sql.includes("for update"));
  assert.ok(sql.includes("valla_ocupada"));
  assert.ok(sql.includes("objeto_ocupado"));
  assert.ok(/grant execute on function public\.limpieza_media_hilo_adquirir\(text, text, text, integer\) to service_role/i.test(sql));
  assert.ok(sql.includes("on conflict (hilo) do nothing"));
  assert.ok(sql.includes("on conflict (clave) do nothing"));
  assert.ok((sql.match(/p_modo is null/g) || []).length >= 4);
  assert.ok(sql.includes("marca_de_limpieza"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(/revoke all on function public\.limpieza_media_hilo_liberar\(text, text, text\) from public, anon, authenticated/i.test(sql));
  assert.ok(!/delete\s+from\s+public\.mensajes/i.test(sql));
  assert.ok(!/delete\s+from\s+public\.conversaciones/i.test(sql));
  const webhook = fs.readFileSync(path.join(__dirname, "../routes/webhook.js"), "utf8");
  const cron = fs.readFileSync(path.join(__dirname, "../scripts/limpieza-media-cron.js"), "utf8");
  const ruta = fs.readFileSync(path.join(__dirname, "../routes/internalCronApi.js"), "utf8");
  const llamada = webhook.indexOf("const coordinado = await coordinarPersistenciaEntrante");
  assert.ok(llamada > 0 && llamada < webhook.indexOf("reclamarMensajeEntrantePorWamid({"));
  const ack = webhook.indexOf("ACK temprano");
  const soltar = webhook.indexOf("await soltarVallaEntrante();", ack);
  assert.ok(soltar > ack);
  assert.ok(soltar < webhook.indexOf("procesarMensajeEntrante("));
  assert.ok(webhook.indexOf("permiteConfirmacionEntrante") < webhook.indexOf("registrarRespuestaBotonSeguimiento({"));
  assert.ok(webhook.includes("sendStatus(503)"));
  assert.ok(webhook.includes("mensajesProcesados.delete(messageIdEntrante)"));
  assert.ok(!cron.includes("limpiezaMediaValla"));
  assert.ok(!cron.includes("eliminarSoloObjetoStorage"));
  assert.ok(!ruta.includes("eliminarSoloObjetoStorage"));
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  ok("sql, webhook y cron conservan la valla sin borrado real");
}

async function testWebhookNoInsertaSiLimpiezaTieneLaConversacion() {
  const mem = memoriaValla();
  const limpieza = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  assert.strictEqual(limpieza.bloqueaInsertos, true);
  let inserts = 0;
  const bloqueado = await valla.ejecutarPersistenciaEntrante({
    ...opciones(mem),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.NUEVO",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(bloqueado.status, 503);
  assert.strictEqual(bloqueado.reintentar, true);
  assert.strictEqual(bloqueado.guardado, false);
  assert.strictEqual(inserts, 0);
  assert.strictEqual(mem.hilos.get("u|c|591").modo, "limpieza");

  const otra = await valla.ejecutarPersistenciaEntrante({
    ...opciones(mem),
    usuarioId: "u",
    conexionId: "c",
    numero: "592",
    wamid: "wamid.OTRA",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(otra.guardado, true);
  assert.strictEqual(inserts, 1);
  await valla.liberarHilo({ ...opciones(mem), ...otra.valla });
  await limpieza.cerrar();
  ok("la limpieza de una conversación no bloquea otra ni confirma un entrante");
}

async function testReintentoIdempotenteYFuncionAusente() {
  const mem = memoriaValla();
  let inserts = 0;
  const ocupada = await valla.ejecutarPersistenciaEntrante({
    ...opciones(mem),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.1",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(ocupada.guardado, true);
  const paralelo = await valla.ejecutarPersistenciaEntrante({
    ...opciones(mem),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.2",
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(paralelo.status, 503);
  assert.strictEqual(inserts, 1);
  await valla.liberarHilo({ ...opciones(mem), ...ocupada.valla });

  const duplicado = await valla.ejecutarPersistenciaEntrante({
    ...opciones(mem),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.1",
    persistir: async () => ({ claimed: false, duplicate: true }),
  });
  assert.strictEqual(duplicado.status, 200);
  assert.strictEqual(duplicado.duplicado, true);
  assert.strictEqual(mem.hilos.get("u|c|591").locked_by, null);

  const caido = {
    async post() {
      const error = new Error("relation does not exist");
      error.response = { status: 404, data: { code: "PGRST202" } };
      throw error;
    },
  };
  let guardados = 0;
  const sinFuncion = await valla.ejecutarPersistenciaEntrante({
    ...opciones(caido),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.3",
    persistir: async () => {
      guardados += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(sinFuncion.status, 200);
  assert.strictEqual(sinFuncion.guardado, true);
  assert.strictEqual(sinFuncion.degradada, true);
  assert.strictEqual(guardados, 1);

  const timeout = {
    async post() {
      const error = new Error("timeout");
      error.code = "ECONNABORTED";
      throw error;
    },
  };
  let no = 0;
  const sinRed = await valla.ejecutarPersistenciaEntrante({
    ...opciones(timeout),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.4",
    persistir: async () => {
      no += 1;
      return { claimed: true };
    },
  });
  assert.strictEqual(sinRed.status, 503);
  assert.strictEqual(sinRed.reintentar, true);
  assert.strictEqual(no, 0);

  const explota = memoriaValla();
  const roto = await valla.ejecutarPersistenciaEntrante({
    ...opciones(explota),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid: "wamid.5",
    persistir: async () => {
      throw new Error("supabase caido");
    },
  });
  assert.strictEqual(roto.status, 503);
  assert.strictEqual(roto.guardado, false);
  assert.strictEqual(explota.hilos.get("u|c|591").locked_by, null);
  ok("reintento, duplicado, función ausente, timeout y error no confirman de más");
}

async function testEntranteInmediatoYVallaPerdida() {
  const mem = memoriaValla();
  let entrante = 1000;
  const limpieza = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => entrante,
  });
  entrante = 2000;
  const plan = await eliminar.planificarEliminacion("archivos/whatsapp/u/foto.jpg", {
    workerId: "w1",
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo: "u|c|591" }),
    abrirValla: async () => limpieza,
  });
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(plan.motivo, "entrante_inmediato");
  assert.strictEqual(limpieza.sesionAbierta, false);
  assert.strictEqual(mem.hilos.get("u|c|591").locked_by, null);

  const mem2 = memoriaValla();
  const sostenida = await valla.abrirVallaLimpieza({
    ...opciones(mem2),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  let restaurados = 0;
  let storage = 0;
  const perdido = await eliminar.ejecutarBorradoSobrePlan(
    { eliminar: true, motivo: "candidato", valla: sostenida, entranteMs: 1000 },
    "archivos/whatsapp/u/foto.jpg",
    {
      async borrarObjeto() {
        storage += 1;
        mem2.adelantar(120000);
        return { eliminado: true, status: 200 };
      },
      async restaurarObjeto() {
        restaurados += 1;
        return { ok: true };
      },
    }
  );
  assert.strictEqual(perdido.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(perdido.abortar, true);
  assert.strictEqual(perdido.eliminado, false);
  assert.strictEqual(perdido.storage, false);
  assert.strictEqual(storage, 0);
  assert.strictEqual(restaurados, 0);
  assert.strictEqual(mem2.hilos.get("u|c|591").locked_by, null);

  let siguiente = 0;
  if (!perdido.abortar) siguiente += 1;
  assert.strictEqual(siguiente, 0);
  ok("un entrante inmediato o una valla perdida detienen la limpieza");
}

async function testObjetoExclusivoYBorradoSigueBloqueado() {
  const mem = memoriaValla();
  const primero = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  const mismo = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w2",
    leerUltimoEntrante: async () => 1000,
  });
  assert.strictEqual(mismo.bloqueaInsertos, false);
  assert.strictEqual(mismo.motivo, "valla_ocupada");
  await primero.cerrar();

  const dueno = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  await valla.liberarHilo({
    ...opciones(mem),
    hilo: "u|c|591",
    modo: "limpieza",
    owner: valla.ownerLimpieza("w1"),
  });
  const otro = await valla.abrirVallaLimpieza({
    ...opciones(mem),
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w2",
    leerUltimoEntrante: async () => 1000,
  });
  assert.strictEqual(otro.bloqueaInsertos, false);
  assert.strictEqual(otro.motivo, "objeto_ocupado");
  assert.strictEqual(mem.hilos.get("u|c|591").locked_by, null);
  await dueno.cerrar();

  const cliente = { llamadas: [], async delete() { this.llamadas.push("delete"); } };
  const bloqueado = await eliminar.eliminarSoloObjetoStorage("archivos/whatsapp/u/foto.jpg", {
    url: URL,
    cliente,
    permitirRed: true,
    borrarObjeto: async () => { throw new Error("no"); },
  });
  assert.strictEqual(bloqueado.motivo, "bloqueada");
  assert.strictEqual(bloqueado.storage, false);
  assert.strictEqual(cliente.llamadas.length, 0);
  assert.strictEqual(valla.margenSuficiente({ ahora: AHORA.toISOString(), locked_until: new Date(AHORA.getTime() + 1000).toISOString() }), false);
  ok("el objeto es exclusivo y el borrado real sigue bloqueado");
}

function tablaAtomica() {
  const filas = new Map();
  const puertas = new Map();
  return {
    filas,
    async adquirir(clave, owner) {
      while (puertas.has(clave)) await puertas.get(clave);
      if (!filas.has(clave)) {
        let abrir;
        const espera = new Promise((resolver) => {
          abrir = resolver;
        });
        puertas.set(clave, espera);
        await Promise.resolve();
        if (!filas.has(clave)) filas.set(clave, owner);
        abrir();
        puertas.delete(clave);
      }
      return filas.get(clave) === owner
        ? { ok: true, motivo: "adquirida" }
        : { ok: false, motivo: "valla_ocupada" };
    },
  };
}

async function testCarreraYNulos() {
  const hilos = tablaAtomica();
  const objetos = tablaAtomica();
  const [hiloA, hiloB] = await Promise.all([
    hilos.adquirir("u|c|591", "wh:a"),
    hilos.adquirir("u|c|591", "wh:b"),
  ]);
  const [objetoA, objetoB] = await Promise.all([
    objetos.adquirir("archivos/whatsapp/u/foto.jpg", "cl:w1"),
    objetos.adquirir("archivos/whatsapp/u/foto.jpg", "cl:w2"),
  ]);
  assert.strictEqual([hiloA, hiloB].filter((fila) => fila.ok).length, 1);
  assert.strictEqual([objetoA, objetoB].filter((fila) => fila.ok).length, 1);
  assert.strictEqual(hilos.filas.size, 1);
  assert.strictEqual(objetos.filas.size, 1);
  assert.ok([hiloA, hiloB].some((fila) => fila.motivo === "valla_ocupada"));
  assert.ok([objetoA, objetoB].some((fila) => fila.motivo === "valla_ocupada"));

  const mem = memoriaValla();
  const opt = opciones(mem);
  const modoNulo = await valla.adquirirHilo({ ...opt, hilo: "u|c|1", modo: null, owner: "wh:1", ttlSeconds: 45 });
  const hiloVacio = await valla.adquirirHilo({ ...opt, hilo: "  ", modo: "entrante", owner: "wh:1", ttlSeconds: 45 });
  const renovarNulo = await valla.renovarHilo({ ...opt, hilo: "u|c|1", modo: null, owner: "wh:1", ttlSeconds: 45 });
  const objetoNulo = await valla.adquirirObjeto({ ...opt, clave: null, hilo: "u|c|1", owner: "cl:1", ttlSeconds: 90 });
  assert.strictEqual(modoNulo.motivo, "parametro_invalido");
  assert.strictEqual(hiloVacio.motivo, "parametro_invalido");
  assert.strictEqual(renovarNulo.motivo, "parametro_invalido");
  assert.strictEqual(objetoNulo.motivo, "parametro_invalido");
  assert.strictEqual(mem.hilos.size, 0);
  assert.strictEqual(mem.objetos.size, 0);

  const tomada = await valla.adquirirHilo({ ...opt, hilo: "u|c|1", modo: "limpieza", owner: "cl:w1", ttlSeconds: 90 });
  assert.strictEqual(tomada.ok, true);
  const webhook = await valla.liberarHilo({ ...opt, hilo: "u|c|1", modo: "entrante", owner: "wh:wamid" });
  assert.strictEqual(webhook.motivo, "marca_de_limpieza");
  assert.strictEqual(mem.hilos.get("u|c|1").locked_by, "cl:w1");
  assert.strictEqual(mem.hilos.get("u|c|1").modo, "limpieza");
  await valla.adquirirObjeto({ ...opt, clave: "archivos/whatsapp/u/foto.jpg", hilo: "u|c|1", owner: "cl:w1", ttlSeconds: 90 });
  const sueltaWebhook = await valla.liberarObjeto({ ...opt, clave: "archivos/whatsapp/u/foto.jpg", owner: "wh:wamid" });
  assert.strictEqual(sueltaWebhook.motivo, "marca_de_limpieza");
  assert.strictEqual(mem.objetos.get("archivos/whatsapp/u/foto.jpg").locked_by, "cl:w1");
  ok("carrera de alta, nulos y el webhook no suelta la valla de limpieza");
}

async function testTtlNoCubreElDelete() {
  assert.strictEqual(valla.TTL_LIMPIEZA_S, 90);
  assert.strictEqual(valla.ownerLimpieza("w1"), "cl:w1");
  assert.strictEqual(valla.ownerWebhook("wamid.1", "u|c|591"), "wh:wamid.1");
  const mem = memoriaValla();
  const opt = opciones(mem);
  const limpieza = await valla.abrirVallaLimpieza({
    ...opt,
    hilo: "u|c|591",
    clave: "archivos/whatsapp/u/foto.jpg",
    workerId: "w1",
    leerUltimoEntrante: async () => 1000,
  });
  assert.strictEqual(limpieza.bloqueaInsertos, true);
  assert.notStrictEqual(limpieza.sinVencimiento, true);
  let storage = 0;
  const plan = await eliminar.planificarEliminacion("archivos/whatsapp/u/foto.jpg", {
    workerId: "w1",
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo: "u|c|592" }),
    abrirValla: () => valla.abrirVallaLimpieza({
      ...opt,
      hilo: "u|c|592",
      clave: "archivos/whatsapp/u/otra.jpg",
      workerId: "w1",
      leerUltimoEntrante: async () => 1000,
    }),
    io: { leerUltimoEntrante: async () => 1000 },
  });
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(plan.motivo, "proteccion_con_vencimiento");
  mem.adelantar((valla.TTL_LIMPIEZA_S + 1) * 1000);
  const vigencia = await limpieza.asegurarVigencia();
  assert.strictEqual(vigencia.ok, false);
  assert.strictEqual(vigencia.motivo, "valla_perdida");
  const vencido = await eliminar.ejecutarBorradoSobrePlan(
    { eliminar: true, valla: limpieza },
    "archivos/whatsapp/u/foto.jpg",
    {
      borrarObjeto: async () => {
        storage += 1;
        return { eliminado: true };
      },
    }
  );
  assert.strictEqual(vencido.motivo, "proteccion_con_vencimiento");
  assert.strictEqual(vencido.storage, false);
  assert.strictEqual(storage, 0);
  const mem2 = memoriaValla();
  const opt2 = opciones(mem2);
  await valla.adquirirObjeto({ ...opt2, clave: "archivos/whatsapp/u/foto.jpg", hilo: "u|c|591", owner: "cl:w1", ttlSeconds: 90 });
  const sueltaWebhook = await valla.liberarObjeto({ ...opt2, clave: "archivos/whatsapp/u/foto.jpg", owner: "wh:wamid" });
  assert.strictEqual(sueltaWebhook.motivo, "marca_de_limpieza");
  assert.strictEqual(mem2.objetos.get("archivos/whatsapp/u/foto.jpg").locked_by, "cl:w1");
  const sueltaLimpieza = await valla.liberarObjeto({ ...opt2, clave: "archivos/whatsapp/u/foto.jpg", owner: "cl:w1" });
  assert.strictEqual(sueltaLimpieza.ok, true);
  assert.strictEqual(mem2.objetos.get("archivos/whatsapp/u/foto.jpg").locked_by, null);
  ok("el TTL de 90 s no autoriza el DELETE y cl: sigue pudiendo soltar el objeto");
}

async function main() {
  testSqlYFuente();
  await testCarreraYNulos();
  await testWebhookNoInsertaSiLimpiezaTieneLaConversacion();
  await testReintentoIdempotenteYFuncionAusente();
  await testEntranteInmediatoYVallaPerdida();
  await testObjetoExclusivoYBorradoSigueBloqueado();
  await testTtlNoCubreElDelete();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
