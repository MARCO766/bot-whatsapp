/**
 * La limpieza reserva la marca durable y el webhook no inserta mientras dura.
 * El doble HTTP no es PostgreSQL ni Storage.
 * Ejecutar: node tests/limpiezaMediaMarcaDurable.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const entrante = require("../services/limpiezaMedia/limpiezaMediaEntrante");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("ok", name);
}

function sqlFalso() {
  const filas = new Map();
  const auditoria = [];
  let seq = 1;
  const clave = (body) => `${body.p_usuario_id}|${body.p_conexion_id}|${body.p_cliente_numero}`;
  const ahora = () => new Date().toISOString();
  return {
    filas,
    auditoria,
    llamadas: [],
    async post(url, body) {
      const nombre = String(url).split("/rpc/")[1];
      this.llamadas.push(nombre);
      assert.ok(!String(url).includes("/storage/"));
      assert.ok(!String(url).includes("/mensajes"));
      const k = clave(body);
      const fila = filas.get(k);
      const reloj = ahora();
      if (nombre === "limpieza_media_marca_reservar") {
        if (fila && fila.resultado === "incierto") {
          return { data: { ok: false, motivo: "resultado_incierto", reintentar: false, estado: fila.estado, ahora: reloj } };
        }
        if (fila && ["reservado", "entrante", "borrando"].includes(fila.estado)) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, owner: fila.owner, ahora: reloj } };
        }
        filas.set(k, {
          id: fila?.id || seq++,
          estado: "reservado",
          owner: body.p_owner,
          resultado: null,
          clave_archivo: null,
          verificacion: null,
        });
        return { data: { ok: true, motivo: "reservado", estado: "reservado", owner: body.p_owner, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando" || (fila.estado === "entrante" && fila.owner !== body.p_owner))) {
          return { data: { ok: false, motivo: "valla_ocupada", estado: fila.estado, ahora: reloj } };
        }
        filas.set(k, {
          ...(fila || {}),
          id: fila?.id || seq++,
          estado: "entrante",
          owner: body.p_owner,
        });
        return { data: { ok: true, estado: "entrante", owner: body.p_owner, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_soltar_entrante") {
        if (fila && (fila.estado === "reservado" || fila.estado === "borrando")) {
          return { data: { ok: false, motivo: "marca_de_limpieza", liberada: false, storage: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "entrante" || fila.owner !== body.p_owner) {
          return { data: { ok: false, motivo: "valla_ajena", liberada: false, storage: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        return { data: { ok: true, motivo: "soltada", estado: null, liberada: true, storage: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_soltar_reservado") {
        if (fila && (fila.estado === "entrante" || fila.estado === "borrando" || fila.resultado != null)) {
          return { data: { ok: false, motivo: "marca_de_limpieza", liberada: false, storage: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "reservado" || fila.owner !== body.p_owner || fila.resultado != null) {
          return { data: { ok: false, motivo: "valla_ajena", liberada: false, storage: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        return { data: { ok: true, motivo: "soltada", estado: null, liberada: true, storage: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_borrando") {
        if (!fila || fila.estado !== "reservado" || fila.owner !== body.p_owner || fila.resultado === "incierto") {
          return { data: { ok: false, motivo: "resultado_incierto", reintentar: false, ahora: reloj } };
        }
        fila.estado = "borrando";
        fila.clave_archivo = body.p_clave_archivo;
        fila.resultado = null;
        return { data: { ok: true, estado: "borrando", reintentar: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_resultado") {
        if (!fila || fila.estado !== "borrando" || fila.owner !== body.p_owner || fila.resultado) {
          return { data: { ok: false, motivo: "resultado_incierto", reintentar: false, ahora: reloj } };
        }
        fila.resultado = body.p_resultado;
        return { data: { ok: true, resultado: body.p_resultado, reintentar: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_consultar") {
        return { data: { ok: true, marca: fila ? { ...fila } : null, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_verificar") {
        const resultado = body.p_resultado_verificado == null ? "" : String(body.p_resultado_verificado).trim();
        if (body.p_resultado_verificado == null || !["eliminado_confirmado", "no_eliminado_confirmado", "incierto"].includes(resultado)) {
          return { data: { ok: false, motivo: "verificacion_invalida", storage: false, liberada: false, ahora: reloj } };
        }
        if (!fila || fila.estado !== "borrando" || fila.resultado == null) {
          const motivo = fila?.estado === "borrando" && fila?.resultado == null ? "storage_en_curso" : "marca_no_resoluble";
          return { data: { ok: false, motivo, storage: false, liberada: false, ahora: reloj } };
        }
        fila.verificacion = { resultadoVerificado: resultado };
        auditoria.push("verificar");
        return { data: { ok: true, storage: false, liberada: false, ahora: reloj } };
      }
      if (nombre === "limpieza_media_marca_liberar") {
        if (!fila || fila.estado === "reservado" || fila.estado === "entrante") {
          return { data: { ok: false, motivo: "marca_no_resoluble", storage: false, liberada: false, ahora: reloj } };
        }
        if (fila.estado !== "borrando") {
          return { data: { ok: false, motivo: "marca_ausente", storage: false, liberada: false, ahora: reloj } };
        }
        if (fila.resultado == null) {
          return { data: { ok: false, motivo: "storage_en_curso", storage: false, liberada: false, ahora: reloj } };
        }
        if (!fila.verificacion) {
          return { data: { ok: false, motivo: "verificacion_requerida", storage: false, liberada: false, ahora: reloj } };
        }
        fila.estado = null;
        fila.owner = null;
        auditoria.push("liberar");
        return { data: { ok: true, storage: false, liberada: true, ahora: reloj } };
      }
      throw new Error(`rpc no simulada ${nombre}`);
    },
  };
}

function red(sql) {
  return { permitirRed: true, url: "http://marca-falsa.test", key: "test", cliente: sql };
}

const CLAVE = "archivos/whatsapp/u/foto.jpg";
const ENTRANTE = 1000;

function planBase(sql, lectura) {
  return {
    ...red(sql),
    workerId: "w1",
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo: "u|c|591" }),
    io: { leerUltimoEntrante: lectura },
  };
}

async function intentarEntrante(sql, wamid) {
  let inserts = 0;
  const respuesta = await entrante.coordinarPersistenciaEntrante({
    ...red(sql),
    usuarioId: "u",
    conexionId: "c",
    numero: "591",
    wamid,
    persistir: async () => {
      inserts += 1;
      return { claimed: true };
    },
  });
  return { respuesta, inserts };
}

async function testLaReservaFrenaElEntranteYElCierreLoSuelta() {
  const sql = sqlFalso();
  const plan = await eliminar.planificarEliminacion(CLAVE, planBase(sql, async () => ENTRANTE));
  assert.strictEqual(plan.eliminar, true);
  assert.strictEqual(plan.valla.sobreviveDesconexion, true);
  assert.strictEqual(plan.valla.sinVencimiento, true);
  const durante = await intentarEntrante(sql, "wamid.durante");
  assert.strictEqual(durante.respuesta.status, 503);
  assert.strictEqual(durante.respuesta.motivo, "valla_ocupada");
  assert.strictEqual(durante.inserts, 0);

  let storage = 0;
  const hecho = await eliminar.ejecutarBorradoSobrePlan(plan, CLAVE, {
    borrarObjeto: async () => {
      storage += 1;
      const ocupado = await intentarEntrante(sql, "wamid.storage");
      assert.strictEqual(ocupado.respuesta.status, 503);
      assert.strictEqual(ocupado.inserts, 0);
      assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
      return { eliminado: true };
    },
  });
  assert.strictEqual(hecho.motivo, "eliminado");
  assert.strictEqual(hecho.storage, true);
  assert.strictEqual(storage, 1);
  assert.strictEqual(sql.filas.get("u|c|591").estado, null);
  assert.deepStrictEqual(sql.auditoria, ["verificar", "liberar"]);
  const despues = await intentarEntrante(sql, "wamid.despues");
  assert.strictEqual(despues.respuesta.guardado, true);
  assert.strictEqual(despues.inserts, 1);
  ok("la marca durable frena el entrante durante el borrado y lo suelta al confirmar");
}

async function testEntranteNuevoCancelaSinStorage() {
  const sql = sqlFalso();
  let lecturas = 0;
  const plan = await eliminar.planificarEliminacion(CLAVE, planBase(sql, async () => {
    lecturas += 1;
    return lecturas === 1 ? ENTRANTE : ENTRANTE + 1;
  }));
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(plan.motivo, "entrante_inmediato");
  assert.strictEqual(sql.filas.get("u|c|591").estado, null);
  assert.ok(sql.llamadas.includes("limpieza_media_marca_soltar_reservado"));
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_verificar"));
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_liberar"));
  const seguido = await intentarEntrante(sql, "wamid.nuevo");
  assert.strictEqual(seguido.respuesta.guardado, true);
  assert.strictEqual(seguido.inserts, 1);
  ok("un entrante nuevo cancela la reserva y no llama a Storage");
}

async function testFalloDeStorageDejaLaMarcaYNoReintenta() {
  const sql = sqlFalso();
  const plan = await eliminar.planificarEliminacion(CLAVE, planBase(sql, async () => ENTRANTE));
  let storage = 0;
  const incierto = await eliminar.ejecutarBorradoSobrePlan(plan, CLAVE, {
    borrarObjeto: async () => {
      storage += 1;
      throw new Error("storage cayo");
    },
  });
  assert.strictEqual(incierto.motivo, "resultado_incierto");
  assert.strictEqual(incierto.reintentar, false);
  assert.strictEqual(storage, 1);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|591").resultado, "incierto");
  const bloqueado = await intentarEntrante(sql, "wamid.incierto");
  assert.strictEqual(bloqueado.respuesta.status, 503);
  assert.strictEqual(bloqueado.inserts, 0);
  const segundo = await eliminar.ejecutarBorradoSobrePlan(plan, CLAVE, {
    borrarObjeto: async () => {
      storage += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(segundo.motivo, "resultado_incierto");
  assert.strictEqual(storage, 1);
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_liberar"));
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_verificar"));
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  ok("un fallo de storage deja la marca incierta y no autoriza otro borrado");
}

async function testTimeoutNoConfirmaNiSuelta() {
  marca.olvidarMemoriaDeProceso();
  const sql = sqlFalso();
  const plan = await eliminar.planificarEliminacion(CLAVE, planBase(sql, async () => ENTRANTE));
  let storage = 0;
  const incierto = await eliminar.ejecutarBorradoSobrePlan(plan, CLAVE, {
    borrarObjeto: async () => {
      storage += 1;
      return { eliminado: false, motivo: "supabase_error", storage: true };
    },
  });
  assert.strictEqual(incierto.motivo, "resultado_incierto");
  assert.strictEqual(incierto.reintentar, false);
  assert.strictEqual(incierto.storage, true);
  assert.strictEqual(storage, 1);
  assert.strictEqual(sql.filas.get("u|c|591").estado, "borrando");
  assert.strictEqual(sql.filas.get("u|c|591").resultado, "incierto");
  assert.ok(!sql.llamadas.includes("limpieza_media_marca_liberar"));
  const bloqueado = await intentarEntrante(sql, "wamid.timeout");
  assert.strictEqual(bloqueado.respuesta.status, 503);
  assert.strictEqual(bloqueado.inserts, 0);
  const segundo = await eliminar.ejecutarBorradoSobrePlan(plan, CLAVE, {
    borrarObjeto: async () => {
      storage += 1;
      return { eliminado: true };
    },
  });
  assert.strictEqual(segundo.motivo, "resultado_incierto");
  assert.strictEqual(storage, 1);
  assert.strictEqual(sql.filas.get("u|c|591").owner, "cl:w1");
  ok("un timeout de storage deja la marca en borrando y no suelta la conversación");
}

async function testSinFuncionYBorradoBloqueado() {
  const ausente = {
    llamadas: [],
    async post(url) {
      this.llamadas.push(url);
      const error = new Error("not found");
      error.response = { status: 404, data: { code: "PGRST202" } };
      throw error;
    },
  };
  const plan = await eliminar.planificarEliminacion(CLAVE, planBase(ausente, async () => ENTRANTE));
  assert.strictEqual(plan.eliminar, false);
  assert.strictEqual(plan.motivo, "marca_no_instalada");
  const quieto = sqlFalso();
  const bloqueado = await eliminar.eliminarSoloObjetoStorage(CLAVE, {
    ...red(quieto),
    borrarObjeto: async () => {
      throw new Error("no debe borrar");
    },
  });
  assert.strictEqual(bloqueado.motivo, "bloqueada");
  assert.strictEqual(bloqueado.storage, false);
  assert.strictEqual(quieto.llamadas.length, 0);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  const cron = fs.readFileSync(path.join(__dirname, "../scripts/limpieza-media-cron.js"), "utf8");
  assert.ok(cron.includes('modo: "dry-run"'));
  assert.ok(!cron.includes("limpiezaMediaMarca"));
  ok("sin la función no hay storage, y el cron sigue en dry-run con el borrado bloqueado");
}

async function main() {
  await testLaReservaFrenaElEntranteYElCierreLoSuelta();
  await testEntranteNuevoCancelaSinStorage();
  await testFalloDeStorageDejaLaMarcaYNoReintenta();
  await testTimeoutNoConfirmaNiSuelta();
  await testSinFuncionYBorradoBloqueado();
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
