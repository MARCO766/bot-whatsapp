/**
 * Proceso hijo de las pruebas. No abre Storage ni una URL de Supabase.
 * Lo arranca limpiezaMediaProceso.js; no es un script de producción.
 */
const local = require("./limpiezaMediaPgLocal");

local.cortarProduccion();

const URL_FICTICIA = "http://127.0.0.1:9";
const LLAVE_FICTICIA = "prueba-local";

function servicios() {
  return {
    admin: require("../../services/limpiezaMedia/limpiezaMediaMarcaAdmin"),
    eliminar: require("../../services/limpiezaMedia/limpiezaMediaEliminar"),
    marca: require("../../services/limpiezaMedia/limpiezaMediaMarca"),
    servicio: require("../../services/limpiezaMedia/limpiezaMediaService"),
    store: require("../../services/limpiezaMedia/limpiezaMediaMarcaStore"),
    valla: require("../../services/limpiezaMedia/limpiezaMediaValla"),
  };
}

function baseDe(mensaje, client, funciones) {
  return {
    ...local.opcionesSql(client, funciones),
    usuarioId: mensaje.usuarioId,
    conexionId: mensaje.conexionId,
    numero: mensaje.numero,
    owner: mensaje.owner,
    claveArchivo: mensaje.clave,
    resultado: mensaje.resultado,
    actor: mensaje.actor || mensaje.owner,
    nota: mensaje.nota || null,
  };
}

function esperarCmd(cmd) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó la orden ${cmd}`)), 20000);
    function onMessage(mensaje) {
      if (mensaje && mensaje.cmd === cmd) {
        clearTimeout(timer);
        process.off("message", onMessage);
        resolve(mensaje);
      }
    }
    process.on("message", onMessage);
  });
}

async function accion(mensaje, client, funciones) {
  const { admin, store } = servicios();
  const base = baseDe(mensaje, client, funciones);
  if (mensaje.accion === "reservar") return store.reservar(base);
  if (mensaje.accion === "borrando") return store.pasarABorrando(base);
  if (mensaje.accion === "consultar") return store.consultar(base);
  if (mensaje.accion === "resultado") return store.registrarResultado(base);
  if (mensaje.accion === "liberar") return admin.liberarMarcaDurable(base);
  throw new Error(`Acción de prueba desconocida: ${mensaje.accion}`);
}

async function planDe(mensaje, client, funciones, workerId) {
  const { eliminar } = servicios();
  const hilo = `${mensaje.usuarioId}|${mensaje.conexionId}|${mensaje.numero}`;
  return eliminar.planificarEliminacion(mensaje.clave, {
    ...local.opcionesSql(client, funciones),
    workerId,
    validar: async () => ({ apto: true, abortar: false, motivo: "candidato", hilo }),
    io: { leerUltimoEntrante: async () => 1000 },
  });
}

async function colgarEnStorage(mensaje, client, funciones) {
  const { eliminar } = servicios();
  const plan = await planDe(mensaje, client, funciones, mensaje.workerId);
  if (plan.eliminar !== true) {
    throw new Error(`El proceso A no reservó la conversación: ${plan.motivo}`);
  }
  await eliminar.ejecutarBorradoSobrePlan(plan, mensaje.clave, {
    borrarObjeto: () => new Promise(() => {
      process.send({ evento: "storage-en-curso", pid: process.pid });
    }),
  });
}

async function guardarIncerto(mensaje, client, funciones) {
  const { eliminar } = servicios();
  const plan = await planDe(mensaje, client, funciones, mensaje.workerId);
  if (plan.eliminar !== true) {
    throw new Error(`El proceso A no reservó la conversación: ${plan.motivo}`);
  }
  const hecho = await eliminar.ejecutarBorradoSobrePlan(plan, mensaje.clave, {
    borrarObjeto: async () => ({ eliminado: false, incierto: true }),
  });
  process.send({
    evento: "incierto-guardado",
    pid: process.pid,
    motivo: hecho.motivo,
    reintentar: hecho.reintentar,
    eliminado: hecho.eliminado,
    storage: hecho.storage,
  });
  await new Promise(() => {});
}

function marcaQueLee(store, base) {
  return {
    sobreviveDesconexion: true,
    sinVencimiento: true,
    async leer() {
      const visto = await store.consultar(base);
      const fila = visto?.marca;
      if (!fila) return null;
      return {
        estado: fila.estado,
        owner: fila.owner,
        resultado: fila.resultado,
        claveArchivo: fila.clave_archivo,
      };
    },
    async confirmar(estado) {
      const fila = await this.leer();
      return { ok: Boolean(fila) && fila.estado === estado && fila.owner != null };
    },
    async promoverABorrando() {
      return { ok: false, motivo: "resultado_incierto" };
    },
    async fijar() {
      return { ok: false };
    },
    async cerrar() {
      return { ok: false, motivo: "resultado_incierto" };
    },
    async soltarTrasExito() {
      return { ok: false, motivo: "resultado_incierto" };
    },
  };
}

async function rechazarDelete(mensaje, client, funciones) {
  const { admin, eliminar, marca, servicio, store } = servicios();
  const base = baseDe(mensaje, client, funciones);
  const antes = marca.esIncierto(mensaje.clave);
  const visto = await store.consultar(base);
  const lectura = marcaQueLee(store, base);
  let storage = 0;
  const segundo = await marca.ejecutarBajoMarca({
    clave: mensaje.clave,
    marca: lectura,
    borrarObjeto: async () => {
      storage += 1;
      throw new Error("segundo DELETE");
    },
  });
  let deletes = 0;
  const directo = await eliminar.borrarObjetoStorage(mensaje.clave, {
    url: URL_FICTICIA,
    marca: lectura,
    cliente: {
      async delete() {
        deletes += 1;
        throw new Error("Storage real prohibido");
      },
    },
  });
  const plan = await planDe(mensaje, client, funciones, mensaje.workerId);
  const reserva = await store.reservar({ ...base, owner: mensaje.owner });
  const promover = await store.pasarABorrando({ ...base, owner: mensaje.owner, claveArchivo: mensaje.clave });
  const suelta = await admin.liberarMarcaDurable({
    ...base,
    actor: mensaje.owner,
    nota: "intento posterior al resultado incierto",
  });
  const despues = await store.consultar(base);
  return {
    pid: process.pid,
    esInciertoAntes: antes,
    esInciertoDespues: marca.esIncierto(mensaje.clave),
    estado: visto?.marca?.estado || null,
    resultado: visto?.marca?.resultado ?? null,
    owner: visto?.marca?.owner || null,
    storage,
    deletes,
    motivoSegundo: segundo.motivo,
    reintentar: segundo.reintentar,
    eliminado: segundo.eliminado,
    storageSegundo: segundo.storage,
    motivoDirecto: directo.motivo,
    eliminadoDirecto: directo.eliminado,
    storageDirecto: directo.storage,
    planEliminar: plan.eliminar,
    planMotivo: plan.motivo,
    reservaOk: reserva.ok,
    reservaMotivo: reserva.motivo,
    promoverOk: promover.ok,
    promoverMotivo: promover.motivo,
    liberada: suelta.liberada,
    liberarOk: suelta.ok,
    liberarMotivo: suelta.motivo,
    estadoFinal: despues?.marca?.estado || null,
    resultadoFinal: despues?.marca?.resultado ?? null,
    borradoReal: servicio.eliminacionRealPermitida(),
    bloqueoGlobal: servicio.ELIMINACION_REAL_BLOQUEADA,
  };
}

async function adquirir(mensaje, client, funciones) {
  const { valla } = servicios();
  const opciones = {
    ...local.opcionesSql(client, funciones),
    hilo: mensaje.hilo,
    clave: mensaje.clave,
    owner: mensaje.owner,
    modo: "limpieza",
    ttlSeconds: mensaje.ttl || 60,
  };
  const ya = esperarCmd("ya");
  process.send({ evento: "listo", pid: process.pid });
  await ya;

  let ok = false;
  let motivo = "";
  let lockedBy = null;
  async function soltar() {}

  if (mensaje.tipo === "hilo") {
    const tomada = await valla.adquirirHilo(opciones);
    ok = tomada.ok === true;
    motivo = tomada.motivo;
    lockedBy = tomada.locked_by || null;
    soltar = async () => {
      if (ok) await valla.liberarHilo(opciones);
    };
  } else if (mensaje.tipo === "objeto") {
    const tomada = await valla.adquirirObjeto(opciones);
    ok = tomada.ok === true;
    motivo = tomada.motivo;
    lockedBy = tomada.locked_by || null;
    soltar = async () => {
      if (ok) await valla.liberarObjeto(opciones);
    };
  } else if (mensaje.tipo === "conversacion") {
    const hilo = await valla.adquirirHilo(opciones);
    const objeto = hilo.ok === true ? await valla.adquirirObjeto(opciones) : { ok: false, motivo: hilo.motivo };
    ok = hilo.ok === true && objeto.ok === true;
    motivo = ok ? "adquirida" : objeto.motivo || hilo.motivo;
    lockedBy = hilo.locked_by || null;
    soltar = async () => {
      if (objeto.ok === true) await valla.liberarObjeto(opciones);
      if (hilo.ok === true) await valla.liberarHilo(opciones);
    };
  } else {
    throw new Error(`Tipo de valla desconocido: ${mensaje.tipo}`);
  }

  const soltarOrden = esperarCmd("soltar");
  process.send({ evento: "tomada", ok, motivo, locked_by: lockedBy, pid: process.pid });
  await soltarOrden;
  await soltar();
}

async function ejecutar(mensaje) {
  local.describir(mensaje.pgUrl);
  const pg = local.cargarPg();
  const funciones = require("./limpiezaMediaFirmas").leerFunciones();
  const client = await local.conectar(pg, mensaje.pgUrl);
  client.on("error", () => {});
  try {
    if (mensaje.cmd === "colgar-en-storage") {
      await colgarEnStorage(mensaje, client, funciones);
      return;
    }
    if (mensaje.cmd === "guardar-incierto") {
      await guardarIncerto(mensaje, client, funciones);
      return;
    }
    if (mensaje.cmd === "rechazar-delete") {
      const informe = await rechazarDelete(mensaje, client, funciones);
      process.send({ fin: true, ...informe });
      return;
    }
    if (mensaje.cmd === "accion") {
      const fila = await accion(mensaje, client, funciones);
      process.send({ fin: true, pid: process.pid, fila });
      return;
    }
    if (mensaje.cmd === "adquirir") {
      await adquirir(mensaje, client, funciones);
      process.send({ fin: true, pid: process.pid });
      return;
    }
    throw new Error(`Comando de prueba desconocido: ${mensaje.cmd}`);
  } finally {
    try { await client.end(); } catch (error) { /* el proceso puede morir durante storage */ }
  }
}

if (!process.send) {
  console.log("NO EJECUTADA: este archivo solo corre como proceso hijo de las pruebas.");
  process.exit(2);
}

process.once("message", (mensaje) => {
  ejecutar(mensaje).catch((error) => {
    try {
      process.send({ fin: true, error: error.stack || error.message });
    } catch (envio) {
      console.error(error);
    }
    process.exit(1);
  });
});
