/**
 * Recorrido diario de limpieza.
 * Comando del Cron, una vez al día:
 *   node scripts/limpieza-media-cron.js
 * Sin LIMPIEZA_MEDIA_BORRAR=true no borra objetos ni filas: un candidato
 * revalidado no abre marca durable ni llama a Storage.
 * Si la revalidación falla, la referencia queda ambigua o se pierde el
 * candado, la pasada se detiene: no se mira el siguiente objeto y el
 * proceso sale con código 1. El finally suelta el candado global.
 * Con la variable en true, cada objeto pasa por la planificación existente:
 * marca durable, último entrante, protección JSON y un solo DELETE.
 * Cada ejecución borra como máximo un objeto. El cupo es interno: no sale de
 * variables de entorno, parámetros ni argumentos. Se consume inmediatamente
 * antes del DELETE a Storage. Si ese intento falla o queda incierto, la
 * pasada se detiene. El candidato siguiente no abre marca ni llega a Storage.
 * Una marca incierto no se reintenta.
 * No define LIMPIEZA_MEDIA_ACTIVA en la plataforma:
 * la bandera solo entra como argumento de esta ejecución.
 *
 * Los jsonb grandes se leen una vez en el inventario. Flujos, campañas e IA
 * se vuelven a leer justo antes de revalidar. La eliminación, si la variable
 * la autoriza, repite esa lectura viva inmediatamente antes de Storage.
 * Las menciones de todos los candidatos salen de una lectura paginada por
 * (creado_en, id). Cada id visto se recuerda. La pasada se repite desde el
 * inicio hasta que dos recorridos no encuentran mensajes nuevos.
 * Un ilike con página llena excluye el objeto. El candado se vuelve a
 * comprobar después de esa lectura. Si se pierde, el proceso sale con código 1.
 */
require("dotenv").config();
const reglas = require("../services/limpiezaMedia/reglas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
const loteMedia = require("../services/limpiezaMedia/limpiezaMediaRevalidarLote");
const {
  RENOVACION_MS,
  adquirirLockLimpiezaMedia,
  liberarLockLimpiezaMedia,
  renovarLockLimpiezaMedia,
} = require("../services/limpiezaMedia/limpiezaMediaLock");

function marcarPerdida(estado, renovacion) {
  estado.perdido = renovacion;
}

async function vigilar(estado, workerId) {
  if (estado.perdido) return;
  const renovacion = await renovarLockLimpiezaMedia(workerId);
  if (!renovacion.ok) marcarPerdida(estado, renovacion);
}

function exigirCandado(estado) {
  if (!estado.perdido) return;
  const error = new Error(`Candado perdido: ${estado.perdido.motivo}`);
  error.motivo = estado.perdido.motivo;
  throw error;
}

function eliminacionSigueBloqueada() {
  return servicio.borradoRealAutorizado() !== true;
}

function debeDetenerPasada(motivo) {
  return motivo === "consulta_fallida" || reglas.esReferenciaAmbigua(motivo);
}

const LIMITE_OBJETOS_POR_EJECUCION = 1;

function crearCupo() {
  return { usados: 0 };
}

function cupoAgotado(cupo) {
  return cupo.usados >= LIMITE_OBJETOS_POR_EJECUCION;
}

function debeDetenerPorBorrado(paso) {
  if (!paso || paso.modo !== "real" || paso.motivo === "limite_ejecucion") return false;
  if (paso.eliminado === true) return false;
  if (paso.incierto === true) return true;
  if (paso.motivo === "resultado_incierto" || paso.motivo === "supabase_error") return true;
  return paso.storage === true;
}

function paradaBorrado(paso, candidato, porMotivo, aptos, cupo, extra = {}) {
  console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
    motivo: paso.motivo || "resultado_incierto",
    clave: candidato.clave,
  });
  return {
    detener: true,
    abortar: paso.abortar === true,
    codigo: 1,
    motivo: paso.motivo || "resultado_incierto",
    clave: candidato.clave,
    porMotivo,
    aptos,
    storage: paso.storage === true,
    marca: paso.marca === true,
    paso,
    borrados: cupo.usados,
    ...extra,
  };
}

async function pasoTrasLimite(candidato, opciones) {
  const seco = {
    eliminado: false,
    storage: false,
    abortar: false,
    marca: false,
    modo: "real",
  };
  if (!candidato || candidato.categoria !== "candidato" || candidato.motivo !== "candidato") {
    return { ...seco, motivo: "no_candidato", modo: "dry-run" };
  }
  const validar = opciones.validar || servicio.validarInmediatoEliminacion.bind(servicio);
  let veredicto;
  try {
    veredicto = await validar(candidato.clave, {
      protegidas: opciones.protegidas,
      nombresProtegidos: opciones.nombresProtegidos,
      workerId: opciones.workerId,
      io: opciones.io,
    });
  } catch (error) {
    return {
      ...seco,
      detener: true,
      motivo: "consulta_fallida",
      detalle: reglas.detalleConsultaFallida(error).mensaje,
      modo: "dry-run",
    };
  }
  if (veredicto?.abortar) {
    return { ...seco, abortar: true, motivo: veredicto.motivo || "candado_perdido", modo: "dry-run" };
  }
  if (veredicto?.apto !== true) {
    const motivo = veredicto?.motivo || "no_apto";
    return {
      ...seco,
      motivo,
      detener: debeDetenerPasada(motivo),
      detalle: veredicto?.detalle || null,
      modo: "dry-run",
    };
  }
  return { ...seco, motivo: "limite_ejecucion" };
}

/**
 * Solo entra un objeto ya clasificado como candidato y revalidado como apto.
 * En dry-run no abre marca durable y no llama a Storage.
 * La rama real conserva la planificación: marca, entrante nuevo y un solo objeto.
 */
async function procesarCandidatoRevalidado(candidato, opciones = {}, cupo = crearCupo()) {
  const seco = { eliminado: false, storage: false, abortar: false, marca: false, modo: "dry-run" };
  if (!candidato || candidato.categoria !== "candidato" || candidato.motivo !== "candidato") {
    return { ...seco, motivo: "no_candidato" };
  }
  const validar = opciones.validar || servicio.validarInmediatoEliminacion.bind(servicio);
  let veredicto;
  try {
    veredicto = await validar(candidato.clave, {
      protegidas: opciones.protegidas,
      nombresProtegidos: opciones.nombresProtegidos,
      workerId: opciones.workerId,
      io: opciones.io,
    });
  } catch (error) {
    return {
      ...seco,
      detener: true,
      motivo: "consulta_fallida",
      detalle: reglas.detalleConsultaFallida(error).mensaje,
    };
  }
  if (veredicto?.abortar) {
    return { ...seco, abortar: true, motivo: veredicto.motivo || "candado_perdido" };
  }
  if (veredicto?.apto !== true) {
    const motivo = veredicto?.motivo || "no_apto";
    return {
      ...seco,
      motivo,
      detener: debeDetenerPasada(motivo),
      detalle: veredicto?.detalle || null,
    };
  }
  if (eliminacionSigueBloqueada()) {
    return { ...seco, motivo: "bloqueada" };
  }
  if (cupoAgotado(cupo)) {
    return { ...seco, motivo: "limite_ejecucion", modo: "real" };
  }

  const plan = await eliminar.planificarEliminacion(candidato.clave, {
    protegidas: opciones.protegidas,
    nombresProtegidos: opciones.nombresProtegidos,
    workerId: opciones.workerId,
    permitirRed: opciones.permitirRed === true,
    cliente: opciones.cliente,
    url: opciones.url,
    key: opciones.key,
    io: opciones.io,
    leerUltimoEntrante: opciones.leerUltimoEntrante,
    validar: opciones.validar,
    abrirValla: opciones.abrirValla,
  });
  if (!plan || plan.eliminar !== true) {
    return {
      eliminado: false,
      storage: false,
      marca: false,
      abortar: plan?.abortar === true,
      motivo: plan?.motivo || "no_apto",
      modo: "real",
    };
  }
  const hecho = await eliminar.ejecutarBorradoSobrePlan(plan, candidato.clave, {
    url: opciones.url,
    cliente: opciones.cliente,
    exigirJsonVivo: true,
    protegidas: opciones.protegidas,
    nombresProtegidos: opciones.nombresProtegidos,
    workerId: opciones.workerId,
    io: opciones.io,
    ahora: opciones.ahora,
    borrarObjeto: () => {
      if (cupoAgotado(cupo)) {
        return { eliminado: false, storage: false, motivo: "limite_ejecucion" };
      }
      cupo.usados += 1;
      return eliminar.borrarObjetoStorage(candidato.clave, {
        url: opciones.url || process.env.SUPABASE_URL,
        cliente: opciones.cliente,
        marca: plan.valla,
      });
    },
  });
  return { ...hecho, marca: true, modo: "real" };
}

async function inventario(estado) {
  const progreso = servicio.crearEstado();
  let anterior = "";
  let result = null;
  for (let vuelta = 0; vuelta < 8000; vuelta += 1) {
    exigirCandado(estado);
    result = await servicio.ejecutarLimpiezaMedia({
      env: { ...process.env, LIMPIEZA_MEDIA_ACTIVA: "true" },
      estado: progreso,
      informe: true,
      maxMs: 45000,
      maxPaginas: 25,
      pageSize: 1000,
    });
    exigirCandado(estado);
    const marca = [
      result.fase,
      progreso.fuenteIndex,
      progreso.offset,
      progreso.jsonCursor || "",
      progreso.mensajeCursor || "",
      progreso.carpetaIndex,
      progreso.listadoOffset,
      result.paginasEnEstaPasada,
    ].join(":");
    console.log("[LIMPIEZA_MEDIA_CRON]", {
      vuelta,
      fase: result.fase,
      completo: result.completo,
      proteccionIncompleta: result.proteccionIncompleta,
      candidatos: result.candidatos,
    });
    if (result.completo || result.proteccionIncompleta) {
      result.referenciasJson = progreso.referenciasJson;
      return result;
    }
    if (marca === anterior) throw new Error("La pasada no avanzó");
    anterior = marca;
  }
  throw new Error("El inventario superó el máximo de pasadas");
}

function anotarPaso(porMotivo, paso, candidato) {
  const motivo = paso?.motivo || "no_apto";
  porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
  console.log("[LIMPIEZA_MEDIA_CRON] revalidado", {
    clave: candidato.clave,
    bytes: candidato.bytes,
    motivo,
    apto: motivo === "bloqueada" || paso?.eliminado === true,
    borrado: paso?.eliminado === true ? "eliminado" : (motivo === "bloqueada" ? "bloqueado" : "omitido"),
    storage: paso?.storage === true,
  });
}

async function recorrerCandidatosUnoAUno(candidatos, opciones = {}, cupo = crearCupo()) {
  const porMotivo = {};
  let aptos = 0;
  const exigir = opciones.exigirCandado || (() => {});
  for (const candidato of candidatos) {
    exigir();
    const paso = cupoAgotado(cupo)
      ? await pasoTrasLimite(candidato, opciones)
      : await procesarCandidatoRevalidado(candidato, opciones, cupo);
    if (paso.abortar) {
      return {
        detener: true,
        abortar: true,
        codigo: 1,
        motivo: paso.motivo || "candado_perdido",
        clave: candidato.clave,
        porMotivo,
        aptos,
        storage: false,
        marca: false,
        paso,
        borrados: cupo.usados,
      };
    }
    if (paso.modo === "real" && paso.motivo === "bloqueada") {
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
        motivo: "bloqueada",
        clave: candidato.clave,
      });
      return {
        detener: true,
        abortar: false,
        codigo: 1,
        motivo: "bloqueada",
        clave: candidato.clave,
        porMotivo,
        aptos,
        storage: false,
        marca: false,
        paso,
      };
    }
    if (paso.detener === true || debeDetenerPasada(paso.motivo)) {
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
        motivo: paso.motivo || "consulta_fallida",
        clave: candidato.clave,
        detalle: paso.detalle || null,
      });
      return {
        detener: true,
        abortar: false,
        codigo: 1,
        motivo: paso.motivo || "consulta_fallida",
        detalle: paso.detalle || null,
        clave: candidato.clave,
        porMotivo,
        aptos,
        storage: false,
        marca: false,
        paso,
      };
    }
    if ((paso.storage === true || paso.eliminado === true) && eliminacionSigueBloqueada()) {
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", { motivo: "borrado_en_dry_run", clave: candidato.clave });
      return {
        detener: true,
        abortar: false,
        codigo: 1,
        motivo: "borrado_en_dry_run",
        clave: candidato.clave,
        porMotivo,
        aptos,
        paso,
        borrados: cupo.usados,
      };
    }
    if (debeDetenerPorBorrado(paso)) {
      return paradaBorrado(paso, candidato, porMotivo, aptos, cupo);
    }
    if (paso.motivo === "bloqueada" || paso.eliminado === true) aptos += 1;
    anotarPaso(porMotivo, paso.eliminado === true && !paso.motivo ? { ...paso, motivo: "eliminado" } : paso, candidato);
  }
  return { detener: false, abortar: false, codigo: 0, porMotivo, aptos, storage: false, marca: false, borrados: cupo.usados };
}

function sumarTiempos(total, parte) {
  if (!parte) return total;
  for (const fase of Object.keys(total)) total[fase] += parte[fase] || 0;
  return total;
}

async function recorrerCandidatosEnLote(candidatos, opciones = {}, cupo = crearCupo()) {
  const porMotivo = {};
  let aptos = 0;
  const exigir = opciones.exigirCandado || (() => {});
  const tamano = opciones.tamanoLote || loteMedia.TAMANO_LOTE;
  const inventarioStorage = opciones.inventarioStorage instanceof Map
    ? opciones.inventarioStorage
    : loteMedia.crearInventarioStorage();
  const lecturaMenciones = opciones.lecturaMenciones || loteMedia.crearLecturaMenciones();
  if (!Array.isArray(lecturaMenciones.universo)) {
    const universo = [];
    for (const candidato of candidatos) {
      if (candidato && candidato.categoria === "candidato" && candidato.motivo === "candidato") {
        universo.push(candidato.clave);
      }
    }
    lecturaMenciones.universo = universo;
  }
  const lecturaTexto = opciones.lecturaTexto || loteMedia.crearLecturaTexto();
  if (!Array.isArray(lecturaTexto.universo)) {
    lecturaTexto.universo = lecturaMenciones.universo.slice();
  }
  const tiempos = {
    storageMs: 0,
    mencionesMs: 0,
    referenciasMs: 0,
    menciones2Ms: 0,
    entrantesMs: 0,
  };
  for (let inicio = 0; inicio < candidatos.length; inicio += tamano) {
    exigir();
    const grupo = candidatos.slice(inicio, inicio + tamano);
    const reales = [];
    for (const candidato of grupo) {
      if (!candidato || candidato.categoria !== "candidato" || candidato.motivo !== "candidato") {
        const paso = { motivo: "no_candidato" };
        if (paso.motivo === "bloqueada") aptos += 1;
        anotarPaso(porMotivo, paso, candidato || { clave: null, bytes: 0 });
        continue;
      }
      reales.push(candidato);
    }
    if (!reales.length) continue;
    let lote;
    try {
      lote = await loteMedia.revalidarLote(reales.map((candidato) => candidato.clave), {
        protegidas: opciones.protegidas,
        nombresProtegidos: opciones.nombresProtegidos,
        workerId: opciones.workerId,
        ahora: opciones.ahora,
        dias: opciones.dias,
        listarStorage: opciones.listarStorage,
        inventarioStorage,
        lecturaMenciones,
        lecturaTexto,
        leerPaginaMensajes: opciones.leerPaginaMensajes,
        leerPaginaFuente: opciones.leerPaginaFuente,
        contarMensajes: opciones.contarMensajes,
        efectos: opciones.efectos,
        mundo: opciones.mundo,
        alFase: opciones.alFase,
        consultar: opciones.consultar,
        candado: opciones.candado,
      });
    } catch (error) {
      sumarTiempos(tiempos, error?.tiempos);
      console.log("[LIMPIEZA_MEDIA_CRON] fases", {
        desde: inicio,
        claves: reales.length,
        ...(error?.tiempos || {}),
      });
      const detalle = reglas.detalleConsultaFallida(error);
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
        motivo: "consulta_fallida",
        clave: reales[0].clave,
        detalle,
      });
      return {
        detener: true,
        abortar: false,
        codigo: 1,
        motivo: "consulta_fallida",
        detalle,
        clave: reales[0].clave,
        porMotivo,
        aptos,
        storage: false,
        marca: false,
        tiempos,
      };
    }
    sumarTiempos(tiempos, lote.tiempos);
    console.log("[LIMPIEZA_MEDIA_CRON] fases", {
      desde: inicio,
      claves: reales.length,
      ...lote.tiempos,
    });
    if (lote.abortar) {
      return {
        detener: true,
        abortar: true,
        codigo: 1,
        motivo: lote.motivo || "candado_perdido",
        clave: lote.clave,
        porMotivo,
        aptos,
        storage: false,
        marca: false,
        tiempos,
      };
    }
    for (const item of lote.resultados) {
      const candidato = reales.find((entrada) => entrada.clave === item.clave);
      if (item.detener || debeDetenerPasada(item.motivo)) {
        console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
          motivo: item.motivo || "consulta_fallida",
          clave: item.clave,
          detalle: item.detalle || null,
        });
        return {
          detener: true,
          abortar: false,
          codigo: 1,
          motivo: item.motivo || "consulta_fallida",
          detalle: item.detalle || null,
          clave: item.clave,
          porMotivo,
          aptos,
          storage: false,
          marca: false,
          tiempos,
        };
      }
      if (item.apto === true && !eliminacionSigueBloqueada()) {
        if (cupoAgotado(cupo)) {
          anotarPaso(porMotivo, { motivo: "limite_ejecucion", eliminado: false, storage: false }, candidato);
          continue;
        }
        const paso = await procesarCandidatoRevalidado(candidato, opciones, cupo);
        if (paso.abortar) {
          return {
            detener: true,
            abortar: true,
            codigo: 1,
            motivo: paso.motivo || "candado_perdido",
            clave: candidato.clave,
            porMotivo,
            aptos,
            storage: false,
            marca: paso.marca === true,
            tiempos,
            borrados: cupo.usados,
          };
        }
        if (paso.modo === "real" && paso.motivo === "bloqueada") {
          console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
            motivo: "bloqueada",
            clave: candidato.clave,
          });
          return {
            detener: true,
            abortar: false,
            codigo: 1,
            motivo: "bloqueada",
            clave: candidato.clave,
            porMotivo,
            aptos,
            storage: paso.storage === true,
            marca: paso.marca === true,
            tiempos,
          };
        }
        if (paso.detener === true || debeDetenerPasada(paso.motivo)) {
          console.error("[LIMPIEZA_MEDIA_CRON] detenido", {
            motivo: paso.motivo || "consulta_fallida",
            clave: candidato.clave,
            detalle: paso.detalle || null,
          });
          return {
            detener: true,
            abortar: false,
            codigo: 1,
            motivo: paso.motivo || "consulta_fallida",
            detalle: paso.detalle || null,
            clave: candidato.clave,
            porMotivo,
            aptos,
            storage: paso.storage === true,
            marca: paso.marca === true,
            tiempos,
          };
        }
        if (debeDetenerPorBorrado(paso)) {
          return paradaBorrado(paso, candidato, porMotivo, aptos, cupo, { tiempos });
        }
        if (paso.eliminado === true) aptos += 1;
        anotarPaso(porMotivo, {
          motivo: paso.eliminado === true ? "eliminado" : paso.motivo,
          eliminado: paso.eliminado === true,
          storage: paso.storage === true,
        }, candidato);
        continue;
      }
      const motivo = item.motivo === "candidato" && eliminacionSigueBloqueada()
        ? "bloqueada"
        : item.motivo;
      if (motivo === "bloqueada") aptos += 1;
      anotarPaso(porMotivo, { motivo }, candidato);
    }
  }
  return { detener: false, abortar: false, codigo: 0, porMotivo, aptos, storage: false, marca: false, tiempos, borrados: cupo.usados };
}

async function recorrerCandidatos(candidatos, opciones = {}) {
  const cupo = crearCupo();
  if (typeof opciones.validar === "function" || opciones.io) {
    return recorrerCandidatosUnoAUno(candidatos, opciones, cupo);
  }
  return recorrerCandidatosEnLote(candidatos, opciones, cupo);
}

async function finalizarCandado(estado, workerId, liberar = liberarLockLimpiezaMedia) {
  if (estado && estado.perdido) {
    return { liberado: false, motivo: estado.perdido.motivo || "candado_perdido" };
  }
  const liberado = await liberar(workerId);
  return { liberado: liberado?.ok === true, motivo: liberado?.motivo || null };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("[LIMPIEZA_MEDIA_CRON] detenido", { motivo: "sin_supabase" });
    return 1;
  }

  const candado = await adquirirLockLimpiezaMedia();
  if (!candado.acquired) {
    const linea = candado.motivo === "candado_ocupado" ? "omitido" : "detenido";
    console.error(`[LIMPIEZA_MEDIA_CRON] ${linea}`, { motivo: candado.motivo });
    return candado.motivo === "candado_ocupado" ? 0 : 1;
  }

  const estado = { perdido: null };
  const timer = setInterval(() => {
    vigilar(estado, candado.workerId).catch((error) => {
      marcarPerdida(estado, { ok: false, motivo: error.message || "renovacion_fallida" });
    });
  }, RENOVACION_MS);
  if (typeof timer.unref === "function") timer.unref();

  try {
    const inicioInventario = Date.now();
    const result = await inventario(estado);
    const inventarioMs = Date.now() - inicioInventario;
    if (!result.completo || result.proteccionIncompleta) {
      console.error("[LIMPIEZA_MEDIA_CRON] proteccion incompleta", {
        fuenteIlegible: result.fuenteIlegible,
        fuentesOmitidas: result.fuentesOmitidas,
      });
      return 1;
    }

    const fresca = await servicio.cargarProteccion({ pageSize: 1000, omitirJson: true });
    for (const clave of result.referenciasJson || []) fresca.protegidas.add(clave);
    const vivas = await servicio.cargarProteccion({
      pageSize: 1000,
      soloFuentes: servicio.FUENTES_JSON_VIVAS,
    });
    exigirCandado(estado);
    if (fresca.proteccionIncompleta || fresca.fuenteIlegible) {
      console.error("[LIMPIEZA_MEDIA_CRON] relectura de proteccion incompleta", {
        fuenteIlegible: fresca.fuenteIlegible,
      });
      return 1;
    }
    if (vivas.proteccionIncompleta || vivas.fuenteIlegible) {
      console.error("[LIMPIEZA_MEDIA_CRON] relectura de flujos incompleta", {
        fuenteIlegible: vivas.fuenteIlegible,
      });
      return 1;
    }
    for (const clave of vivas.protegidas) fresca.protegidas.add(clave);

    if (servicio.ELIMINACION_REAL_BLOQUEADA !== true) {
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", { motivo: "bloqueo_alterado" });
      return 1;
    }
    const borradoAutorizado = servicio.borradoRealAutorizado() === true;

    const candidatos = (result.informe?.objetos || []).filter(
      (objeto) => objeto.categoria === "candidato" && objeto.motivo === "candidato"
    );
    const recorrido = await recorrerCandidatos(candidatos, {
      protegidas: fresca.protegidas,
      nombresProtegidos: fresca.nombresProtegidos,
      workerId: candado.workerId,
      leerUltimoEntrante: servicio.leerUltimoEntranteReal,
      exigirCandado: () => exigirCandado(estado),
    });
    if (recorrido.abortar) {
      marcarPerdida(estado, { ok: false, motivo: recorrido.motivo || "candado_perdido" });
      exigirCandado(estado);
    }
    if (recorrido.detener) return recorrido.codigo;
    const porMotivo = recorrido.porMotivo;
    const aptos = recorrido.aptos;

    console.log("[LIMPIEZA_MEDIA_CRON] resumen", {
      modo: borradoAutorizado ? "real" : "dry-run",
      eliminacionReal: borradoAutorizado ? "autorizada" : "bloqueada",
      dias: reglas.DIAS_INACTIVIDAD,
      limiteObjetos: LIMITE_OBJETOS_POR_EJECUCION,
      borrados: recorrido.borrados || 0,
      inventarioMs,
      objetosRevisados: result.objetosRevisados,
      candidatosInventario: candidatos.length,
      protegidos: result.protegidos,
      ambiguos: result.ambiguos,
      porMotivoInventario: result.porMotivo,
      revalidadosAptos: aptos,
      porMotivo,
      fasesMs: recorrido.tiempos,
      coberturaSegv2: result.coberturaSegv2,
    });
    return 0;
  } catch (error) {
    console.error("[LIMPIEZA_MEDIA_CRON] error", error.motivo || error.message);
    return 1;
  } finally {
    clearInterval(timer);
    const cierre = await finalizarCandado(estado, candado.workerId);
    if (!estado.perdido) {
      console.log("[LIMPIEZA_MEDIA_CRON] candado", {
        liberado: cierre.liberado,
        motivo: cierre.motivo,
      });
    }
  }
}

if (require.main === module) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((error) => {
      console.error("[LIMPIEZA_MEDIA_CRON] error", error.message);
      process.exit(1);
    });
}

module.exports = {
  finalizarCandado,
  procesarCandidatoRevalidado,
  recorrerCandidatos,
};
