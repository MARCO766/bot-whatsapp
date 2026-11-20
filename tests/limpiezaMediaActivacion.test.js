/**
 * Activación controlada. No abre red y no borra objetos reales.
 *
 * Ejecutar: node tests/limpiezaMediaActivacion.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const reglas = require("../services/limpiezaMedia/reglas");
const cron = require("../scripts/limpieza-media-cron");
const admin = require("../services/limpiezaMedia/limpiezaMediaMarcaAdmin");
const marca = require("../services/limpiezaMedia/limpiezaMediaMarca");

const UNO = "archivos/whatsapp/u/uno.jpg";
const DOS = "archivos/whatsapp/u/dos.jpg";

let passed = 0;
function ok(nombre) {
  passed += 1;
  console.log("ok", nombre);
}

function candidato(clave) {
  return { clave, categoria: "candidato", motivo: "candidato", bytes: 12 };
}

function marcaBorrando() {
  return {
    sobreviveDesconexion: true,
    sinVencimiento: true,
    async leer() {
      return { estado: "borrando", resultado: null };
    },
    async confirmar() {
      return { ok: true };
    },
  };
}

async function conVariable(valor, tarea) {
  const previo = process.env.LIMPIEZA_MEDIA_BORRAR;
  if (valor == null) delete process.env.LIMPIEZA_MEDIA_BORRAR;
  else process.env.LIMPIEZA_MEDIA_BORRAR = valor;
  try {
    return await tarea();
  } finally {
    if (previo == null) delete process.env.LIMPIEZA_MEDIA_BORRAR;
    else process.env.LIMPIEZA_MEDIA_BORRAR = previo;
  }
}

async function testSinVariableNoHayDelete() {
  const llamadas = [];
  const cliente = {
    async delete(url) {
      llamadas.push(url);
    },
  };
  await conVariable(null, async () => {
    assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
    assert.strictEqual(servicio.eliminacionRealPermitida(), false);
    assert.strictEqual(servicio.borradoRealAutorizado(), false);
    const directo = await eliminar.borrarObjetoStorage(UNO, {
      url: "https://proj.supabase.co",
      cliente,
      marca: marcaBorrando(),
    });
    assert.strictEqual(directo.motivo, "bloqueada");
    assert.strictEqual(directo.storage, false);
    assert.strictEqual(llamadas.length, 0);

    let planes = 0;
    const originalPlan = eliminar.planificarEliminacion;
    const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
    eliminar.planificarEliminacion = async () => {
      planes += 1;
      return { eliminar: true, valla: marcaBorrando() };
    };
    eliminar.ejecutarBorradoSobrePlan = async () => {
      planes += 1;
      return { eliminado: true, storage: true };
    };
    try {
      const vistos = [];
      const recorrido = await cron.recorrerCandidatos([candidato(UNO), candidato(DOS)], {
        workerId: "limpieza-activacion",
        validar: async (clave) => {
          vistos.push(clave);
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        },
      });
      assert.deepStrictEqual(vistos, [UNO, DOS]);
      assert.strictEqual(recorrido.detener, false);
      assert.strictEqual(recorrido.codigo, 0);
      assert.strictEqual(recorrido.storage, false);
      assert.strictEqual(recorrido.porMotivo.bloqueada, 2);
      assert.strictEqual(planes, 0);
    } finally {
      eliminar.planificarEliminacion = originalPlan;
      eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
    }
  });
  assert.strictEqual(llamadas.length, 0);
  ok("sin LIMPIEZA_MEDIA_BORRAR no hay DELETE");
}

async function testSoloTrueAutorizaYLaConstanteFrena() {
  for (const valor of ["", "1", "yes", "truee", " false "]) {
    assert.strictEqual(servicio.eliminacionRealPermitida({ LIMPIEZA_MEDIA_BORRAR: valor }), false, valor);
  }
  assert.strictEqual(servicio.eliminacionRealPermitida({ LIMPIEZA_MEDIA_BORRAR: "true" }), true);
  assert.strictEqual(servicio.eliminacionRealPermitida({ LIMPIEZA_MEDIA_BORRAR: " TRUE " }), true);

  const llamadas = [];
  const cliente = {
    async delete(url) {
      llamadas.push(url);
      return { status: 200 };
    },
  };
  const original = servicio.ELIMINACION_REAL_BLOQUEADA;
  try {
    await conVariable("true", async () => {
      servicio.ELIMINACION_REAL_BLOQUEADA = false;
      assert.strictEqual(servicio.borradoRealAutorizado(), false);
      const cerrado = await eliminar.borrarObjetoStorage(UNO, {
        url: "https://proj.supabase.co",
        cliente,
        marca: marcaBorrando(),
      });
      assert.strictEqual(cerrado.motivo, "bloqueada");
      assert.strictEqual(llamadas.length, 0);
    });
  } finally {
    servicio.ELIMINACION_REAL_BLOQUEADA = original;
  }
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(llamadas.length, 0);
  ok("solo true autoriza, y la constante en false sigue sin DELETE");
}

async function testParadaPorAmbiguoConsultaYCandado() {
  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  let planes = 0;
  let storage = 0;
  eliminar.planificarEliminacion = async () => {
    planes += 1;
    throw new Error("no debe planificar");
  };
  eliminar.ejecutarBorradoSobrePlan = async () => {
    storage += 1;
    throw new Error("no debe borrar");
  };
  try {
    const ambiguos = [];
    const ambiguo = await cron.recorrerCandidatos([candidato(UNO), candidato(DOS)], {
      workerId: "limpieza-activacion",
      validar: async (clave) => {
        ambiguos.push(clave);
        if (clave === UNO) return { apto: false, motivo: "compartida", abortar: false };
        return { apto: true, motivo: "candidato", abortar: false };
      },
    });
    assert.deepStrictEqual(ambiguos, [UNO, DOS]);
    assert.strictEqual(ambiguo.detener, false);
    assert.strictEqual(ambiguo.codigo, 0);
    assert.strictEqual(ambiguo.motivo, undefined);
    assert.strictEqual(ambiguo.porMotivo.compartida, 1);
    assert.strictEqual(ambiguo.porMotivo.bloqueada, 1);
    assert.strictEqual(ambiguo.storage, false);

    const fallos = [];
    const fallo = await cron.recorrerCandidatos([candidato(UNO), candidato(DOS)], {
      workerId: "limpieza-activacion",
      validar: async (clave) => {
        fallos.push(clave);
        return { apto: false, motivo: "consulta_fallida", abortar: false, detalle: "timeout" };
      },
    });
    assert.deepStrictEqual(fallos, [UNO]);
    assert.strictEqual(fallo.codigo, 1);
    assert.strictEqual(fallo.motivo, "consulta_fallida");
    assert.strictEqual(fallo.storage, false);

    const candados = [];
    const candado = await cron.recorrerCandidatos([candidato(UNO), candidato(DOS)], {
      workerId: "limpieza-activacion",
      validar: async (clave) => {
        candados.push(clave);
        return { apto: false, motivo: "candado_perdido", abortar: true };
      },
    });
    assert.deepStrictEqual(candados, [UNO]);
    assert.strictEqual(candado.abortar, true);
    assert.strictEqual(candado.codigo, 1);
    assert.strictEqual(candado.motivo, "candado_perdido");
    assert.strictEqual(candado.storage, false);
    assert.strictEqual(planes, 0);
    assert.strictEqual(storage, 0);
  } finally {
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
  }
  ok("el ambiguo se salta; la consulta fallida y el candado perdido detienen sin borrar");
}

async function testInciertoNoSeReintenta() {
  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  let planes = 0;
  let borrados = 0;
  eliminar.planificarEliminacion = async () => {
    planes += 1;
    return { eliminar: true, valla: marcaBorrando() };
  };
  eliminar.ejecutarBorradoSobrePlan = async () => {
    borrados += 1;
    return {
      eliminado: false,
      incierto: true,
      reintentar: false,
      abortar: true,
      storage: false,
      motivo: "resultado_incierto",
    };
  };
  try {
    await conVariable("true", async () => {
      const vistos = [];
      const recorrido = await cron.recorrerCandidatos([candidato(UNO), candidato(DOS)], {
        workerId: "limpieza-activacion",
        validar: async (clave) => {
          vistos.push(clave);
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        },
      });
      assert.deepStrictEqual(vistos, [UNO]);
      assert.strictEqual(recorrido.abortar, true);
      assert.strictEqual(recorrido.codigo, 1);
      assert.strictEqual(recorrido.motivo, "resultado_incierto");
      assert.strictEqual(planes, 1);
      assert.strictEqual(borrados, 1);
      assert.strictEqual(recorrido.paso.reintentar, false);
      assert.strictEqual(recorrido.storage, false);
    });
  } finally {
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
  }
  const reintento = await admin.intentarReanudarBorrado();
  assert.strictEqual(reintento.reintentar, false);
  assert.strictEqual(reintento.storage, false);
  assert.strictEqual(reintento.eliminado, false);
  ok("un resultado incierto detiene la pasada y no se reintenta");
}

async function testResolucionManualNoBorra() {
  const registro = marca.crearRegistroDePrueba();
  const hilo = "u|c|591";
  registro.porHilo.set(hilo, {
    owner: "cl:1",
    estado: "borrando",
    resultado: "incierto",
    usuarioId: "u",
    conexionId: "c",
    clienteNumero: "591",
    claveArchivo: UNO,
  });
  const ocupada = await registro.tomar({ hilo, owner: "wh:nuevo", estado: "entrante" });
  assert.strictEqual(ocupada.ok, false);
  assert.strictEqual(ocupada.motivo, "resultado_incierto");
  const prematura = await admin.liberarMarca({ registro, hilo, actor: "ops" });
  assert.strictEqual(prematura.liberada, false);
  assert.strictEqual(prematura.motivo, "verificacion_requerida");
  assert.strictEqual(prematura.storage, false);
  const verificada = admin.verificarMarca({
    registro,
    hilo,
    resultadoVerificado: "no_eliminado_confirmado",
    actor: "ops",
    nota: "el objeto sigue en el bucket",
  });
  assert.strictEqual(verificada.ok, true);
  assert.strictEqual(verificada.storage, false);
  assert.strictEqual(verificada.liberada, false);
  const suelta = await admin.liberarMarca({ registro, hilo, actor: "ops" });
  assert.strictEqual(suelta.liberada, true);
  assert.strictEqual(suelta.reintentar, false);
  assert.strictEqual(suelta.storage, false);
  assert.strictEqual(registro.porHilo.get(hilo).estado, null);
  assert.strictEqual(registro.porHilo.get(hilo).resultado, "incierto");
  const reserva = await registro.tomar({ hilo, owner: "cl:2", estado: "reservado" });
  assert.strictEqual(reserva.ok, false);
  assert.strictEqual(reserva.motivo, "resultado_incierto");
  assert.strictEqual(reserva.reintentar, false);
  const entrante = await registro.tomar({ hilo, owner: "wh:nuevo", estado: "entrante" });
  assert.strictEqual(entrante.ok, true);
  assert.strictEqual(entrante.estado, "entrante");
  assert.strictEqual(registro.porHilo.get(hilo).resultado, "incierto");
  ok("la resolución manual suelta la conversación sin otro DELETE");
}

async function testEndpointSigueEnDryRun() {
  const lock = require("../services/limpiezaMedia/limpiezaMediaLock");
  const router = require("../routes/internalCronApi");
  const layer = router.stack.find((item) => item.route && item.route.path === "/limpieza-media");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const originalAdquirir = lock.adquirirLockLimpiezaMedia;
  const originalLiberar = lock.liberarLockLimpiezaMedia;
  const originalEjecutar = servicio.ejecutarLimpiezaMedia;
  const originalPlan = eliminar.planificarEliminacion;
  let ejecuciones = 0;
  let planes = 0;
  lock.adquirirLockLimpiezaMedia = async () => ({ acquired: true, workerId: "manual" });
  lock.liberarLockLimpiezaMedia = async () => ({ ok: true });
  lock.renovarLockLimpiezaMedia = async () => ({ ok: true });
  servicio.ejecutarLimpiezaMedia = async () => {
    ejecuciones += 1;
    return { modo: "simulacion", eliminacionReal: "bloqueada", completo: true };
  };
  eliminar.planificarEliminacion = async () => {
    planes += 1;
    throw new Error("el endpoint no planifica un borrado");
  };
  try {
    await conVariable("true", async () => {
      const respuesta = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      await handler({ body: { eliminar: true } }, respuesta);
      assert.strictEqual(respuesta.statusCode, 200);
      assert.strictEqual(respuesta.body.modo, "dry-run");
      assert.strictEqual(respuesta.body.eliminacionReal, "bloqueada");
      assert.strictEqual(ejecuciones, 1);
      assert.strictEqual(planes, 0);
    });
  } finally {
    lock.adquirirLockLimpiezaMedia = originalAdquirir;
    lock.liberarLockLimpiezaMedia = originalLiberar;
    servicio.ejecutarLimpiezaMedia = originalEjecutar;
    eliminar.planificarEliminacion = originalPlan;
    global.__limpiezaMediaCronRunning = false;
  }
  ok("el endpoint manual sigue en dry-run con la variable encendida");
}

async function escenarioLimite(rama, resultadoDelete) {
  const lote = require("../services/limpiezaMedia/limpiezaMediaRevalidarLote");
  const originalPlan = eliminar.planificarEliminacion;
  const originalEjecutar = eliminar.ejecutarBorradoSobrePlan;
  const originalBorrar = eliminar.borrarObjetoStorage;
  const originalValidar = servicio.validarInmediatoEliminacion;
  const originalLote = lote.revalidarLote;
  const planes = [];
  let deletes = 0;
  const vistos = [];
  eliminar.planificarEliminacion = async (clave) => {
    planes.push(clave);
    return { eliminar: true, valla: marcaBorrando() };
  };
  eliminar.borrarObjetoStorage = async () => {
    deletes += 1;
    return resultadoDelete();
  };
  eliminar.ejecutarBorradoSobrePlan = async (_plan, _clave, opcionesEjecucion) => opcionesEjecucion.borrarObjeto();
  servicio.validarInmediatoEliminacion = async (clave) => {
    vistos.push(clave);
    return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
  };
  lote.revalidarLote = async (claves) => ({
    abortar: false,
    tiempos: {},
    resultados: claves.map((clave) => ({ clave, apto: true, motivo: "candidato" })),
  });
  try {
    return await conVariable("true", async () => {
      const opciones = {
        workerId: "limpieza-limite",
        limite: 9,
        cupo: { usados: 0 },
      };
      if (rama === "uno") {
        opciones.validar = async (clave) => {
          vistos.push(clave);
          return { apto: true, motivo: "candidato", abortar: false, hilo: "u|c|591" };
        };
      }
      const recorrido = await cron.recorrerCandidatos(
        [candidato(UNO), candidato(DOS)],
        opciones
      );
      return { recorrido, planes: planes.slice(), deletes, vistos: vistos.slice() };
    });
  } finally {
    eliminar.planificarEliminacion = originalPlan;
    eliminar.ejecutarBorradoSobrePlan = originalEjecutar;
    eliminar.borrarObjetoStorage = originalBorrar;
    servicio.validarInmediatoEliminacion = originalValidar;
    lote.revalidarLote = originalLote;
  }
}

function afirmarSinTope(resultado) {
  assert.strictEqual(resultado.deletes, 2);
  assert.deepStrictEqual(resultado.planes, [UNO, DOS]);
  assert.strictEqual(resultado.recorrido.detener, false);
  assert.strictEqual(resultado.recorrido.codigo, 0);
  assert.strictEqual(resultado.recorrido.borrados, 2);
  assert.strictEqual(resultado.recorrido.porMotivo.limite_ejecucion, undefined);
}

function afirmarDetenidoEnElPrimero(resultado) {
  assert.strictEqual(resultado.deletes, 1);
  assert.deepStrictEqual(resultado.planes, [UNO]);
  assert.strictEqual(resultado.recorrido.detener, true);
  assert.strictEqual(resultado.recorrido.codigo, 1);
  assert.strictEqual(resultado.recorrido.porMotivo.limite_ejecucion, undefined);
}

async function testSinTopeDeUnObjeto() {
  const exito = () => ({ eliminado: true, storage: true, status: 200 });
  const ausente = () => ({ eliminado: true, storage: true, status: 404, idempotente: true });
  const error = () => ({
    eliminado: false,
    incierto: true,
    storage: true,
    motivo: "supabase_error",
  });
  const incierto = () => ({
    eliminado: false,
    incierto: true,
    abortar: true,
    reintentar: false,
    storage: true,
    motivo: "resultado_incierto",
  });

  afirmarSinTope(await escenarioLimite("uno", exito));
  afirmarSinTope(await escenarioLimite("lote", ausente));
  afirmarDetenidoEnElPrimero(await escenarioLimite("uno", error));
  afirmarDetenidoEnElPrimero(await escenarioLimite("lote", error));
  afirmarDetenidoEnElPrimero(await escenarioLimite("uno", incierto));
  afirmarDetenidoEnElPrimero(await escenarioLimite("lote", incierto));
  ok("no hay tope de un objeto; un DELETE incierto detiene y el cupo ajeno no entra");
}

function testContratoDeArchivos() {
  const cronSrc = fs.readFileSync(path.join(__dirname, "../scripts/limpieza-media-cron.js"), "utf8");
  const servicioSrc = fs.readFileSync(
    path.join(__dirname, "../services/limpiezaMedia/limpiezaMediaService.js"),
    "utf8"
  );
  const reglasSrc = fs.readFileSync(path.join(__dirname, "../services/limpiezaMedia/reglas.js"), "utf8");
  assert.ok(servicioSrc.includes("const ELIMINACION_REAL_BLOQUEADA = true;"));
  assert.ok(!servicioSrc.includes("ELIMINACION_REAL_BLOQUEADA = false"));
  assert.ok(servicioSrc.includes("LIMPIEZA_MEDIA_BORRAR"));
  assert.ok(cronSrc.includes("node scripts/limpieza-media-cron.js"));
  assert.ok(!cronSrc.includes("|| servicio.eliminacionRealPermitida()"));
  assert.ok(cronSrc.includes("bloqueo_alterado"));
  assert.ok(cronSrc.includes("esReferenciaAmbigua"));
  assert.strictEqual(reglas.DIAS_INACTIVIDAD, 30);
  assert.strictEqual(cron.TAMANO_PASADA, 50);
  assert.strictEqual(cron.TOPE_RENDER_MS, 12 * 60 * 60 * 1000);
  assert.strictEqual(cron.MARGEN_RENDER_MS, 15 * 60 * 1000);
  assert.strictEqual(cron.PRESUPUESTO_MS, cron.TOPE_RENDER_MS - cron.MARGEN_RENDER_MS);
  assert.ok(cronSrc.includes("0 7 * * *"));
  assert.ok(cronSrc.includes("tiempo_agotado"));
  assert.ok(cronSrc.includes("TAMANO_PASADA"));
  assert.ok(!cronSrc.includes("LIMITE_OBJETOS_POR_EJECUCION"));
  assert.ok(!/PRESUPUESTO_MS\s*=\s*process\.env/.test(cronSrc));
  assert.ok(!/TAMANO_PASADA\s*=\s*process\.env/.test(cronSrc));
  assert.ok(!cronSrc.includes("opciones.limite"));
  assert.ok(!cronSrc.includes("opciones.cupo"));
  assert.ok(!cronSrc.includes("req.body"));
  const uno = cronSrc.slice(
    cronSrc.indexOf("async function recorrerCandidatosUnoAUno"),
    cronSrc.indexOf("function sumarTiempos")
  );
  const lote = cronSrc.slice(
    cronSrc.indexOf("async function recorrerCandidatosEnLote"),
    cronSrc.indexOf("async function recorrerCandidatos(")
  );
  assert.ok(uno.includes("TAMANO_PASADA"));
  assert.ok(lote.includes("TAMANO_PASADA"));
  assert.ok(lote.includes("loteMedia.TAMANO_LOTE"));
  assert.ok(uno.includes("tiempo_agotado") || uno.includes("reloj.agotado"));
  assert.ok(lote.includes("reloj.agotado"));
  assert.ok(!cronSrc.includes("cupo.usados += 1"));
  assert.ok(reglasSrc.includes("if (fila?.direccion && fila.direccion !== \"entrante\") return;"));
  assert.ok(reglas.MOTIVOS_AMBIGUOS.has("compartida"));
  assert.strictEqual(reglas.esReferenciaAmbigua("hilo_activo"), false);
  ok("la constante, el comando y los 30 días siguen iguales");
}

async function main() {
  await testSinVariableNoHayDelete();
  await testSoloTrueAutorizaYLaConstanteFrena();
  await testParadaPorAmbiguoConsultaYCandado();
  await testInciertoNoSeReintenta();
  await testResolucionManualNoBorra();
  await testEndpointSigueEnDryRun();
  await testSinTopeDeUnObjeto();
  testContratoDeArchivos();
  assert.strictEqual(process.env.LIMPIEZA_MEDIA_BORRAR, undefined);
  assert.strictEqual(servicio.ELIMINACION_REAL_BLOQUEADA, true);
  assert.strictEqual(servicio.eliminacionRealPermitida(), false);
  console.log(`${passed} pruebas ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
