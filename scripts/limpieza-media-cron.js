/**
 * Recorrido diario de limpieza en DRY-RUN.
 * Comando previsto para Render Cron Job, una vez al día:
 *   node scripts/limpieza-media-cron.js
 * No borra objetos ni filas. No define LIMPIEZA_MEDIA_ACTIVA en la plataforma:
 * la bandera solo entra como argumento de esta ejecución.
 *
 * Las columnas jsonb de flujos, sesiones y logs no admiten un ilike seguro por
 * PostgREST. Esas fuentes se releen completas con el mismo lector del inventario.
 * Si esa relectura falla o queda incompleta, el proceso sale con código 1.
 */
require("dotenv").config();
const reglas = require("../services/limpiezaMedia/reglas");
const servicio = require("../services/limpiezaMedia/limpiezaMediaService");
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
    if (result.completo || result.proteccionIncompleta) return result;
    if (marca === anterior) throw new Error("La pasada no avanzó");
    anterior = marca;
  }
  throw new Error("El inventario superó el máximo de pasadas");
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

    const fresca = await servicio.cargarProteccion({ pageSize: 1000 });
    exigirCandado(estado);
    if (fresca.proteccionIncompleta || fresca.fuenteIlegible) {
      console.error("[LIMPIEZA_MEDIA_CRON] relectura de proteccion incompleta", {
        fuenteIlegible: fresca.fuenteIlegible,
      });
      return 1;
    }

    const candidatos = (result.informe?.objetos || []).filter(
      (objeto) => objeto.categoria === "candidato" && objeto.motivo === "candidato"
    );
    const porMotivo = {};
    let aptos = 0;
    for (const candidato of candidatos) {
      exigirCandado(estado);
      let veredicto;
      try {
        veredicto = await servicio.revalidarCandidato(candidato.clave, {
          protegidas: fresca.protegidas,
          nombresProtegidos: fresca.nombresProtegidos,
        });
      } catch (error) {
        veredicto = { motivo: "consulta_fallida", apto: false };
        console.error("[LIMPIEZA_MEDIA_CRON] revalidacion fallida", error.message);
      }
      if (veredicto.apto && !servicio.ELIMINACION_REAL_BLOQUEADA) {
        servicio.solicitarBorradoReal();
      }
      porMotivo[veredicto.motivo] = (porMotivo[veredicto.motivo] || 0) + 1;
      if (veredicto.apto) aptos += 1;
      console.log("[LIMPIEZA_MEDIA_CRON] revalidado", {
        clave: candidato.clave,
        bytes: candidato.bytes,
        motivo: veredicto.motivo,
        apto: veredicto.apto === true,
        borrado: "bloqueado",
      });
    }

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
    if (!estado.perdido) {
      const liberado = await liberarLockLimpiezaMedia(candado.workerId);
      console.log("[LIMPIEZA_MEDIA_CRON] candado", {
        liberado: liberado.ok,
        motivo: liberado.motivo || null,
      });
    }
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error("[LIMPIEZA_MEDIA_CRON] error", error.message);
    process.exit(1);
  });
