/**
 * Operación de borrado de un solo objeto de Storage.
 * No actualiza ni borra filas de mensajes, conversaciones, contactos, flujos
 * ni seguimientos, y no modifica URLs guardadas.
 *
 * Ni una fila con vencimiento ni un candado de sesión autorizan el DELETE.
 * Antes de Storage hay que reservar la marca durable de la conversación.
 * El webhook no inserta mientras esa marca está en reservado o borrando.
 * Si la función no existe o la reserva falla, no se llama a Storage.
 *
 * ELIMINACION_REAL_BLOQUEADA y eliminacionRealPermitida() impiden llamar a
 * Storage aunque la valla, en una prueba, diga que el intervalo está cerrado.
 *
 * borrarObjetoStorage comprueba dentro de sí misma que la marca durable está
 * en borrando. Si no puede verificarla, no llama a client.delete.
 */
const servicio = require("./limpiezaMediaService");
const reglas = require("./reglas");
const vallaMedia = require("./limpiezaMediaValla");
const marcaMedia = require("./limpiezaMediaMarca");
const marcaDurable = require("./limpiezaMediaMarcaDurable");

function destinoStorage(clave) {
  if (!clave || reglas.esBucketExcluido(clave)) return null;
  const ruta = reglas.sinBucket(clave);
  if (!reglas.esObjetoCandidato({ bucket: reglas.bucketDeClave(clave), path: ruta })) return null;
  if (ruta.split("/").some((parte) => !parte || parte === "." || parte === "..")) return null;
  if (reglas.esCopiaSegv2(clave)) {
    const partes = ruta.split("/");
    if (partes.length !== 6 || partes[0] !== "whatsapp" || partes[2] !== "segv2") return null;
  }
  return ruta;
}

function solicitudBorradoStorage(clave, baseUrl) {
  const ruta = destinoStorage(clave);
  if (!ruta || !baseUrl) return null;
  const encoded = ruta.split("/").map((parte) => encodeURIComponent(parte)).join("/");
  return {
    method: "DELETE",
    url: `${String(baseUrl).replace(/\/+$/, "")}/storage/v1/object/archivos/${encoded}`,
    bucket: "archivos",
    ruta,
  };
}

function borradoRealBloqueado() {
  return servicio.ELIMINACION_REAL_BLOQUEADA === true || servicio.eliminacionRealPermitida() !== true;
}

function abrirVallaReal(peticion = {}) {
  return vallaMedia.abrirVallaLimpieza(peticion);
}

async function cerrarValla(valla) {
  if (valla && typeof valla.cerrar === "function") await valla.cerrar();
}

async function planificarEliminacion(clave, opciones = {}) {
  const validar = opciones.validar || servicio.validarInmediatoEliminacion.bind(servicio);
  let veredicto;
  try {
    veredicto = await validar(clave, opciones);
  } catch (error) {
    return { eliminar: false, abortar: false, motivo: "consulta_fallida" };
  }
  if (!veredicto || veredicto.abortar) {
    return { eliminar: false, abortar: true, motivo: veredicto?.motivo || "candado_perdido" };
  }
  if (veredicto.apto !== true) {
    return { eliminar: false, abortar: false, motivo: veredicto.motivo || "no_apto" };
  }

  const abrir = opciones.abrirValla || marcaDurable.abrirMarcaDurable;
  let valla;
  try {
    valla = await abrir({
      clave,
      workerId: opciones.workerId,
      hilo: veredicto.hilo,
      leerUltimoEntrante: opciones.leerUltimoEntrante || opciones.io?.leerUltimoEntrante,
      cliente: opciones.cliente,
      url: opciones.url,
      key: opciones.key,
      permitirRed: opciones.permitirRed === true,
    });
  } catch (error) {
    return { eliminar: false, abortar: false, motivo: "intervalo_no_garantizado" };
  }
  if (!valla || valla.bloqueaInsertos !== true || valla.sesionAbierta !== true) {
    await cerrarValla(valla);
    return { eliminar: false, abortar: false, motivo: valla?.motivo || "intervalo_no_garantizado" };
  }

  try {
    if (await valla.hayEspera()) {
      await cerrarValla(valla);
      return { eliminar: false, abortar: false, motivo: "entrante_en_curso" };
    }
    const antes = await valla.leerUltimoEntrante();
    if (antes == null || valla.entranteObservadoMs == null || antes !== valla.entranteObservadoMs) {
      await cerrarValla(valla);
      return { eliminar: false, abortar: false, motivo: "entrante_inmediato" };
    }
    const inmediato = await valla.leerUltimoEntrante();
    if (inmediato !== antes || (await valla.hayEspera())) {
      await cerrarValla(valla);
      return { eliminar: false, abortar: false, motivo: "entrante_inmediato" };
    }
    if (valla.sobreviveDesconexion !== true || valla.sinVencimiento !== true) {
      await cerrarValla(valla);
      return {
        eliminar: false,
        abortar: false,
        motivo: valla.sinVencimiento === true ? "proteccion_no_durable" : "proteccion_con_vencimiento",
      };
    }
    return { eliminar: true, abortar: false, motivo: "candidato", valla, entranteMs: inmediato };
  } catch (error) {
    await cerrarValla(valla);
    return { eliminar: false, abortar: false, motivo: "consulta_fallida" };
  }
}

async function ejecutarBorradoSobrePlan(plan, clave, opciones = {}) {
  const valla = plan?.valla;
  if (marcaMedia.esIncierto(clave)) {
    await cerrarValla(valla);
    return {
      eliminado: false,
      incierto: true,
      reintentar: false,
      motivo: "resultado_incierto",
      storage: false,
      abortar: true,
    };
  }
  if (!plan || plan.eliminar !== true || !valla) {
    await cerrarValla(valla);
    return { eliminado: false, motivo: plan?.motivo || "no_apto", storage: false, abortar: plan?.abortar === true };
  }
  const destino = destinoStorage(clave);
  if (!destino) {
    await cerrarValla(valla);
    return { eliminado: false, motivo: "ruta_protegida", storage: false };
  }
  if (typeof opciones.borrarObjeto !== "function") {
    await cerrarValla(valla);
    return { eliminado: false, motivo: "borrado_no_conectado", storage: false };
  }
  if (valla.sobreviveDesconexion !== true || valla.sinVencimiento !== true) {
    await cerrarValla(valla);
    return {
      eliminado: false,
      motivo: valla.sinVencimiento === true ? "proteccion_no_durable" : "proteccion_con_vencimiento",
      storage: false,
      abortar: true,
      reintentar: false,
    };
  }
  if (opciones.exigirJsonVivo === true) {
    const freno = await frenarSiDejoDeSerExclusivo(clave, opciones);
    if (freno) {
      await cerrarValla(valla);
      return freno;
    }
  }
  return marcaMedia.ejecutarBajoMarca({
    clave,
    marca: valla,
    borrarObjeto: () => opciones.borrarObjeto({ clave, ruta: destino, bucket: "archivos" }),
  });
}

async function frenarSiDejoDeSerExclusivo(clave, opciones) {
  let veredicto;
  try {
    veredicto = await servicio.validarInmediatoEliminacion(clave, opciones);
  } catch (error) {
    return { eliminado: false, motivo: "consulta_fallida", storage: false, abortar: false };
  }
  if (!veredicto || veredicto.abortar) {
    return {
      eliminado: false,
      motivo: veredicto?.motivo || "candado_perdido",
      storage: false,
      abortar: true,
    };
  }
  if (veredicto.apto !== true) {
    return {
      eliminado: false,
      motivo: veredicto.motivo || "no_apto",
      storage: false,
      abortar: veredicto.motivo === "consulta_fallida",
    };
  }
  let cita;
  try {
    cita = await servicio.buscarCitaJsonViva(clave, opciones);
  } catch (error) {
    return { eliminado: false, motivo: "consulta_fallida", storage: false, abortar: false };
  }
  if (!cita || cita.error) {
    return { eliminado: false, motivo: "consulta_fallida", storage: false, abortar: false };
  }
  if (cita.citada === true) {
    return { eliminado: false, motivo: "referenciada", storage: false, abortar: false };
  }
  return null;
}

async function borrarObjetoStorage(clave, opciones = {}) {
  const solicitud = solicitudBorradoStorage(clave, opciones.url || process.env.SUPABASE_URL || "");
  if (!solicitud) return { eliminado: false, motivo: "ruta_protegida", storage: false };
  let verificada;
  try {
    verificada = await marcaMedia.verificarMarcaBorrando(opciones.marca);
  } catch (error) {
    verificada = { ok: false, motivo: "marca_no_verificada" };
  }
  if (!verificada || verificada.ok !== true) {
    return {
      eliminado: false,
      motivo: verificada?.motivo || "marca_no_verificada",
      storage: false,
    };
  }
  if (borradoRealBloqueado()) return { eliminado: false, motivo: "bloqueada", storage: false };
  const cliente = opciones.cliente;
  if (!cliente || typeof cliente.delete !== "function") {
    return { eliminado: false, motivo: "borrado_no_conectado", storage: false };
  }
  try {
    await cliente.delete(solicitud.url, { timeout: 20000 });
    return { eliminado: true, status: 200, storage: true, ruta: solicitud.ruta };
  } catch (error) {
    if (error?.response?.status === 404) {
      return { eliminado: true, idempotente: true, status: 404, storage: true, ruta: solicitud.ruta };
    }
    return {
      eliminado: false,
      incierto: true,
      motivo: "supabase_error",
      storage: true,
      ruta: solicitud.ruta,
    };
  }
}

async function eliminarSoloObjetoStorage(clave, opciones = {}) {
  if (borradoRealBloqueado()) {
    return { eliminado: false, motivo: "bloqueada", storage: false, abortar: false };
  }
  const plan = await planificarEliminacion(clave, opciones);
  if (!plan.eliminar) {
    return {
      eliminado: false,
      motivo: plan.motivo,
      abortar: plan.abortar === true,
      storage: false,
    };
  }
  return ejecutarBorradoSobrePlan(plan, clave, opciones);
}

module.exports = {
  abrirVallaReal,
  borrarObjetoStorage,
  destinoStorage,
  ejecutarBorradoSobrePlan,
  eliminarSoloObjetoStorage,
  planificarEliminacion,
  solicitudBorradoStorage,
};
