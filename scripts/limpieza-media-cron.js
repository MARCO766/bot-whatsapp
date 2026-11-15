/**
 * Recorrido diario de limpieza en DRY-RUN.
 * Comando previsto para Render Cron Job, una vez al día:
 *   node scripts/limpieza-media-cron.js
 * No borra objetos ni filas. Mientras el borrado real sigue bloqueado, un
 * candidato revalidado no abre marca durable ni llama a Storage.
 * Si la revalidación de un candidato falla, la pasada se detiene: no se
 * mira el siguiente objeto y el proceso sale con código 1. El finally
 * suelta el candado global.
 * La eliminación real, cuando deje de estar bloqueada, pasa por la
 * planificación existente: marca, nuevo entrante y un solo objeto.
 * No define LIMPIEZA_MEDIA_ACTIVA en la plataforma:
 * la bandera solo entra como argumento de esta ejecución.
 *
 * Las columnas jsonb se leen una sola vez en el inventario. La revalidación
 * reutiliza ese conjunto y no las vuelve a descargar.
 * Un ilike con página llena excluye el objeto. El candado se vuelve a
 * comprobar después de esa lectura. Si se pierde, el proceso sale con código 1.
 */
require("dotenv").config();
const reglas = require("../services/limpiezaMedia/reglas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
const eliminar = require("../services/limpiezaMedia/limpiezaMediaEliminar");
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
  return servicio.ELIMINACION_REAL_BLOQUEADA === true && servicio.eliminacionRealPermitida() !== true;
}

/**
 * Solo entra un objeto ya clasificado como candidato y revalidado como apto.
 * En dry-run no abre marca durable y no llama a Storage.
 * La rama real conserva la planificación: marca, entrante nuevo y un solo objeto.
 */
async function procesarCandidatoRevalidado(candidato, opciones = {}) {
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
      detener: motivo === "consulta_fallida",
      detalle: veredicto?.detalle || null,
    };
  }
  if (eliminacionSigueBloqueada()) {
    return { ...seco, motivo: "bloqueada" };
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
    borrarObjeto: () => eliminar.borrarObjetoStorage(candidato.clave, {
      url: opciones.url || process.env.SUPABASE_URL,
      cliente: opciones.cliente,
      marca: plan.valla,
    }),
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

async function recorrerCandidatos(candidatos, opciones = {}) {
  const porMotivo = {};
  let aptos = 0;
  const exigir = opciones.exigirCandado || (() => {});
  for (const candidato of candidatos) {
    exigir();
    const paso = await procesarCandidatoRevalidado(candidato, opciones);
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
      };
    }
    if (paso.detener === true || paso.motivo === "consulta_fallida") {
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
    if (paso.storage === true || paso.eliminado === true) {
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
      };
    }
    porMotivo[paso.motivo] = (porMotivo[paso.motivo] || 0) + 1;
    if (paso.motivo === "bloqueada") aptos += 1;
    console.log("[LIMPIEZA_MEDIA_CRON] revalidado", {
      clave: candidato.clave,
      bytes: candidato.bytes,
      motivo: paso.motivo,
      apto: paso.motivo === "bloqueada",
      borrado: "bloqueado",
      storage: false,
    });
  }
  return { detener: false, abortar: false, codigo: 0, porMotivo, aptos, storage: false, marca: false };
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
    exigirCandado(estado);
    if (fresca.proteccionIncompleta || fresca.fuenteIlegible) {
      console.error("[LIMPIEZA_MEDIA_CRON] relectura de proteccion incompleta", {
        fuenteIlegible: fresca.fuenteIlegible,
      });
      return 1;
    }

    if (servicio.ELIMINACION_REAL_BLOQUEADA !== true || servicio.eliminacionRealPermitida()) {
      console.error("[LIMPIEZA_MEDIA_CRON] detenido", { motivo: "borrado_real_bloqueado" });
      return 1;
    }

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
      modo: "dry-run",
      eliminacionReal: "bloqueada",
      dias: reglas.DIAS_INACTIVIDAD,
      inventarioMs,
      objetosRevisados: result.objetosRevisados,
      candidatosInventario: candidatos.length,
      protegidos: result.protegidos,
      ambiguos: result.ambiguos,
      porMotivoInventario: result.porMotivo,
      revalidadosAptos: aptos,
      porMotivo,
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
