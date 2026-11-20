/**
 * Recorrido diario de limpieza.
 * Comando del Cron, una vez al día, a las 03:00 de Bolivia (UTC-4):
 *   node scripts/limpieza-media-cron.js
 * Expresión UTC: 0 7 * * *
 * Sin LIMPIEZA_MEDIA_BORRAR=true no borra objetos ni filas: un candidato
 * revalidado no abre marca durable ni llama a Storage.
 * Un archivo ambiguo o protegido se salta y la pasada sigue con el resto.
 * Si la consulta falla, se pierde el candado o un DELETE queda incierto,
 * la pasada se detiene: no se mira el siguiente objeto y el proceso sale
 * con código 1. El finally suelta el candado global.
 * Una marca ya incierta no abre otro DELETE: se salta y la pasada sigue.
 * Un DELETE incierto de esta pasada no se reintenta.
 * No define LIMPIEZA_MEDIA_ACTIVA en la plataforma:
 * la bandera solo entra como argumento de esta ejecución.
 *
 * Los candidatos se recorren en pasadas de 50 y se sigue solo hasta
 * terminarlos. Cada pasada revalida de a 8, el máximo de la función SQL.
 * Render corta el Cron a las 12 horas. Esta pasada deja de empezar trabajo
 * 15 minutos antes. Lo ya borrado queda en Storage; lo pendiente lo retoma
 * la ejecución siguiente. No hay cupo por variables, parámetros ni argumentos.
 *
 * Los jsonb grandes se leen una vez en el inventario. Flujos, campañas e IA
 * se vuelven a leer justo antes de revalidar. La eliminación, si la variable
 * la autoriza, repite esa lectura viva inmediatamente antes de Storage.
 * Las menciones de todos los candidatos salen de una lectura paginada por
 * (creado_en, id). Cada id visto se recuerda. La pasada se repite desde el
 * inicio hasta que dos recorridos no encuentran mensajes nuevos.
 * Un archivo ambiguo o protegido se salta y la pasada sigue. Una lectura
 * fallida detiene la pasada. El candado se vuelve a comprobar después de
 * esa lectura. Si se pierde, el proceso sale con código 1.
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
  return motivo === "consulta_fallida";
}

function seSaltaSinBorrar(motivo) {
  return reglas.esReferenciaAmbigua(motivo) || reglas.categoriaDeMotivo(motivo) === "protegido";
}

const TOPE_RENDER_MS = 12 * 60 * 60 * 1000;
const MARGEN_RENDER_MS = 15 * 60 * 1000;
const PRESUPUESTO_MS = TOPE_RENDER_MS - MARGEN_RENDER_MS;
const TAMANO_PASADA = 50;

function crearReloj(opciones = {}) {
  const ahora = typeof opciones.ahoraMs === "function" ? opciones.ahoraMs : () => Date.now();
  const inicio = Number.isFinite(opciones.inicioMs) ? opciones.inicioMs : ahora();
  const presupuesto = Number.isFinite(opciones.presupuestoMs) ? opciones.presupuestoMs : PRESUPUESTO_MS;
  return {
    ahora,
    limiteMs: inicio + presupuesto,
    agotado() {
      return this.ahora() >= this.limiteMs;
    },
  };
}

function crearCuenta() {
  return { borrados: 0 };
}

function debeDetenerPorBorrado(paso) {
  if (!paso || paso.modo !== "real" || paso.previo === true) return false;
  if (paso.eliminado === true) return false;
  if (paso.incierto === true) return true;
  if (paso.motivo === "resultado_incierto" || paso.motivo === "supabase_error") return true;
  return paso.storage === true;
}

function parada(motivo, candidato, porMotivo, aptos, cuenta, paso, extra = {}) {
  const registro = {
    motivo: motivo || "resultado_incierto",
    clave: candidato?.clave || null,
    detalle: paso?.detalle || extra.detalle || null,
  };
  if (motivo === "tiempo_agotado") console.log("[LIMPIEZA_MEDIA_CRON] detenido", registro);
  else console.error("[LIMPIEZA_MEDIA_CRON] detenido", registro);
  return {
    detener: true,
    abortar: paso?.abortar === true && motivo !== "tiempo_agotado",
    codigo: motivo === "tiempo_agotado" ? 0 : 1,
    motivo: registro.motivo,
    clave: registro.clave,
    detalle: paso?.detalle || extra.detalle || null,
    porMotivo,
    aptos,
    storage: paso?.storage === true,
    marca: paso?.marca === true,
    paso,
    borrados: cuenta.borrados,
    pendientes: extra.pendientes,
    pasadas: extra.pasadas,
    ...extra,
  };
}

function inciertoPrevio(paso) {
  return paso?.previo === true && paso.storage !== true && paso.eliminado !== true;
}

/**
 * Solo entra un objeto ya clasificado como candidato y revalidado como apto.
 * En dry-run no abre marca durable y no llama a Storage.
 * La rama real conserva la planificación: marca, entrante nuevo y el DELETE
 * de ese único objeto. Los buckets de flujos y remarketing no llegan ahí.
 */
async function procesarCandidatoRevalidado(candidato, opciones = {}) {
  const seco = { eliminado: false, storage: false, abortar: false, marca: false, modo: "dry-run" };
  if (!candidato || candidato.categoria !== "candidato" || candidato.motivo !== "candidato") {
    return { ...seco, motivo: "no_candidato" };
  }
  if (reglas.esBucketExcluido(candidato.clave)) {
    return { ...seco, motivo: "bucket_protegido" };
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
    const motivo = plan?.motivo || "no_apto";
    return {
      eliminado: false,
      storage: false,
      marca: false,
      abortar: plan?.abortar === true,
      motivo,
      detener: debeDetenerPasada(motivo),
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
    borrarObjeto: () => eliminar.borrarObjetoStorage(candidato.clave, {
      url: opciones.url || process.env.SUPABASE_URL,
      cliente: opciones.cliente,
      marca: plan.valla,
    }),
  });
  return { ...hecho, marca: true, modo: "real" };
}

async function inventario(estado, reloj) {
  const progreso = servicio.crearEstado();
  let anterior = "";
  let result = null;
  for (let vuelta = 0; vuelta < 8000; vuelta += 1) {
    if (reloj && reloj.agotado()) {
      const error = new Error("tiempo_agotado");
      error.motivo = "tiempo_agotado";
      throw error;
    }
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
    saltado: seSaltaSinBorrar(motivo) || motivo === "bucket_protegido" || paso?.previo === true,
  });
}

function aplicarPaso(paso, candidato, porMotivo, aptos, cuenta, extra) {
  if (inciertoPrevio(paso)) {
    anotarPaso(porMotivo, paso, candidato);
    return { aptos, parada: null };
  }
  if (paso?.abortar) {
    return {
      aptos,
      parada: parada(paso.motivo || "candado_perdido", candidato, porMotivo, aptos, cuenta, paso, extra),
    };
  }
  if (paso?.modo === "real" && paso?.motivo === "bloqueada") {
    return { aptos, parada: parada("bloqueada", candidato, porMotivo, aptos, cuenta, paso, extra) };
  }
  if (paso?.detener === true || debeDetenerPasada(paso?.motivo)) {
    return {
      aptos,
      parada: parada(paso?.motivo || "consulta_fallida", candidato, porMotivo, aptos, cuenta, paso, extra),
    };
  }
  if ((paso?.storage === true || paso?.eliminado === true) && eliminacionSigueBloqueada()) {
    return { aptos, parada: parada("borrado_en_dry_run", candidato, porMotivo, aptos, cuenta, paso, extra) };
  }
  if (paso?.eliminado === true && seSaltaSinBorrar(paso?.motivo)) {
    return { aptos, parada: parada("borrado_en_dry_run", candidato, porMotivo, aptos, cuenta, paso, extra) };
  }
  if (debeDetenerPorBorrado(paso)) {
    return {
      aptos,
      parada: parada(paso.motivo || "resultado_incierto", candidato, porMotivo, aptos, cuenta, paso, extra),
    };
  }
  let siguientes = aptos;
  if (paso?.motivo === "bloqueada" || paso?.eliminado === true) siguientes += 1;
  if (paso?.eliminado === true) cuenta.borrados += 1;
  const visible = paso?.eliminado === true && !paso?.motivo ? { ...paso, motivo: "eliminado" } : paso;
  anotarPaso(porMotivo, visible, candidato || { clave: null, bytes: 0 });
  return { aptos: siguientes, parada: null };
}

function paradaPorTiempo(candidato, porMotivo, aptos, cuenta, extra) {
  return parada("tiempo_agotado", candidato, porMotivo, aptos, cuenta, null, extra);
}

async function recorrerCandidatosUnoAUno(candidatos, opciones, cuenta, reloj) {
  const porMotivo = {};
  let aptos = 0;
  let pasadas = 0;
  const exigir = opciones.exigirCandado || (() => {});
  for (let inicio = 0; inicio < candidatos.length; inicio += TAMANO_PASADA) {
    const pendiente = candidatos[inicio];
    if (reloj.agotado()) {
      return paradaPorTiempo(pendiente, porMotivo, aptos, cuenta, {
        pendientes: candidatos.length - inicio,
        pasadas,
      });
    }
    exigir();
    pasadas += 1;
    const bloque = candidatos.slice(inicio, inicio + TAMANO_PASADA);
    if (typeof opciones.alPasada === "function") {
      opciones.alPasada({ inicio, tamano: bloque.length, pasada: pasadas });
    }
    for (let cursor = 0; cursor < bloque.length; cursor += 1) {
      const candidato = bloque[cursor];
      if (reloj.agotado()) {
        return paradaPorTiempo(candidato, porMotivo, aptos, cuenta, {
          pendientes: candidatos.length - inicio - cursor,
          pasadas,
        });
      }
      exigir();
      const paso = await procesarCandidatoRevalidado(candidato, opciones);
      const resuelto = aplicarPaso(paso, candidato, porMotivo, aptos, cuenta, { pasadas });
      if (resuelto.parada) return resuelto.parada;
      aptos = resuelto.aptos;
    }
  }
  return {
    detener: false,
    abortar: false,
    codigo: 0,
    porMotivo,
    aptos,
    storage: false,
    marca: false,
    borrados: cuenta.borrados,
    pendientes: 0,
    pasadas,
  };
}

function sumarTiempos(total, parte) {
  if (!parte) return total;
  for (const fase of Object.keys(total)) total[fase] += parte[fase] || 0;
  return total;
}

async function recorrerCandidatosEnLote(candidatos, opciones, cuenta, reloj) {
  const porMotivo = {};
  let aptos = 0;
  let pasadas = 0;
  const exigir = opciones.exigirCandado || (() => {});
  const tamano = loteMedia.TAMANO_LOTE;
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
  for (let pasadaInicio = 0; pasadaInicio < candidatos.length; pasadaInicio += TAMANO_PASADA) {
    const primero = candidatos[pasadaInicio];
    if (reloj.agotado()) {
      return paradaPorTiempo(primero, porMotivo, aptos, cuenta, {
        pendientes: candidatos.length - pasadaInicio,
        pasadas,
        tiempos,
      });
    }
    exigir();
    pasadas += 1;
    const bloque = candidatos.slice(pasadaInicio, pasadaInicio + TAMANO_PASADA);
    if (typeof opciones.alPasada === "function") {
      opciones.alPasada({ inicio: pasadaInicio, tamano: bloque.length, pasada: pasadas });
    }
    for (let offset = 0; offset < bloque.length; offset += tamano) {
      const inicio = pasadaInicio + offset;
      if (reloj.agotado()) {
        return paradaPorTiempo(bloque[offset], porMotivo, aptos, cuenta, {
          pendientes: candidatos.length - inicio,
          pasadas,
          tiempos,
        });
      }
      exigir();
      const grupo = bloque.slice(offset, offset + tamano);
      const reales = [];
      for (const candidato of grupo) {
        if (!candidato || candidato.categoria !== "candidato" || candidato.motivo !== "candidato") {
          const resuelto = aplicarPaso({ motivo: "no_candidato" }, candidato || { clave: null, bytes: 0 }, porMotivo, aptos, cuenta, { tiempos, pasadas });
          if (resuelto.parada) return resuelto.parada;
          aptos = resuelto.aptos;
          continue;
        }
        if (reglas.esBucketExcluido(candidato.clave)) {
          const resuelto = aplicarPaso({ motivo: "bucket_protegido" }, candidato, porMotivo, aptos, cuenta, { tiempos, pasadas });
          if (resuelto.parada) return resuelto.parada;
          aptos = resuelto.aptos;
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
        const fallo = parada("consulta_fallida", reales[0], porMotivo, aptos, cuenta, { detalle }, {
          tiempos,
          pasadas,
          detalle,
          pendientes: candidatos.length - inicio,
        });
        return fallo;
      }
      sumarTiempos(tiempos, lote.tiempos);
      console.log("[LIMPIEZA_MEDIA_CRON] fases", {
        desde: inicio,
        claves: reales.length,
        ...lote.tiempos,
      });
      if (lote.abortar) {
        return parada(lote.motivo || "candado_perdido", { clave: lote.clave }, porMotivo, aptos, cuenta, {
          abortar: true,
          motivo: lote.motivo || "candado_perdido",
        }, { tiempos, pasadas, pendientes: candidatos.length - inicio });
      }
      for (let indice = 0; indice < lote.resultados.length; indice += 1) {
        const item = lote.resultados[indice];
        const candidato = reales.find((entrada) => entrada.clave === item.clave) || { clave: item.clave, bytes: 0 };
        if (reloj.agotado()) {
          return paradaPorTiempo(candidato, porMotivo, aptos, cuenta, {
            pendientes: candidatos.length - inicio - indice,
            pasadas,
            tiempos,
          });
        }
        if (item.apto === true && !eliminacionSigueBloqueada()) {
          if (reloj.agotado()) {
            return paradaPorTiempo(candidato, porMotivo, aptos, cuenta, {
              pendientes: candidatos.length - inicio - indice,
              pasadas,
              tiempos,
            });
          }
          const paso = await procesarCandidatoRevalidado(candidato, opciones);
          const resuelto = aplicarPaso(paso, candidato, porMotivo, aptos, cuenta, { tiempos, pasadas });
          if (resuelto.parada) return resuelto.parada;
          aptos = resuelto.aptos;
          continue;
        }
        const motivo = item.motivo === "candidato" && eliminacionSigueBloqueada()
          ? "bloqueada"
          : item.motivo;
        const resuelto = aplicarPaso({
          motivo,
          detener: item.detener === true || debeDetenerPasada(motivo),
          detalle: item.detalle || null,
          eliminado: false,
          storage: false,
          abortar: false,
          modo: "dry-run",
        }, candidato, porMotivo, aptos, cuenta, { tiempos, pasadas });
        if (resuelto.parada) return resuelto.parada;
        aptos = resuelto.aptos;
      }
    }
  }
  return {
    detener: false,
    abortar: false,
    codigo: 0,
    porMotivo,
    aptos,
    storage: false,
    marca: false,
    tiempos,
    borrados: cuenta.borrados,
    pendientes: 0,
    pasadas,
  };
}

async function recorrerCandidatos(candidatos, opciones = {}) {
  const cuenta = crearCuenta();
  const reloj = opciones.reloj || crearReloj(opciones);
  const lista = Array.isArray(candidatos) ? candidatos : [];
  if (typeof opciones.validar === "function" || opciones.io) {
    return recorrerCandidatosUnoAUno(lista, opciones, cuenta, reloj);
  }
  return recorrerCandidatosEnLote(lista, opciones, cuenta, reloj);
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

  const reloj = crearReloj();
  try {
    const inicioInventario = Date.now();
    const result = await inventario(estado, reloj);
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
      reloj,
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
      tamanoPasada: TAMANO_PASADA,
      presupuestoMs: PRESUPUESTO_MS,
      borrados: recorrido.borrados || 0,
      pasadas: recorrido.pasadas || 0,
      pendientes: recorrido.pendientes || 0,
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
    if (error.motivo === "tiempo_agotado") {
      console.log("[LIMPIEZA_MEDIA_CRON] detenido", { motivo: "tiempo_agotado" });
      return 0;
    }
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
  MARGEN_RENDER_MS,
  PRESUPUESTO_MS,
  TAMANO_PASADA,
  TOPE_RENDER_MS,
  finalizarCandado,
  procesarCandidatoRevalidado,
  recorrerCandidatos,
};
