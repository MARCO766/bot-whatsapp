/**
 * Elige el trabajo del Cron macbot-limpieza-media según la hora UTC.
 * No reemplaza scripts/limpieza-media-cron.js. A cualquier hora distinta
 * de las 06:00 UTC lanza ese comando en un proceso aparte y devuelve su
 * código. A las 06:00 UTC, las 02:00 de Bolivia, recorre el backfill M2.
 *
 * Sin --confirmar no abre red, no lanza la limpieza y no llama a Supabase.
 * Render no se cambia con este archivo. El comando activo sigue siendo
 * node scripts/limpieza-media-cron.js hasta que se autorice el turno.
 *
 * La ventana del backfill cierra a las 09:30 UTC para que la limpieza de
 * las 10:00 UTC no quede esperando. Si el proceso empieza después de las
 * 07:00 UTC, no es la hora del backfill y corre la limpieza.
 *
 * Al terminar con agotado y pendientes 0 registra la línea
 * [LIMPIEZA_MEDIA_M2] completado. La noche siguiente hace una sola llamada:
 * la función ve cero pendientes, no reescribe citas y el turno sale.
 * No borra filas ni objetos y no cambia ELIMINACION_REAL_BLOQUEADA.
 */
const { spawn } = require("child_process");
const path = require("path");
const backfill = require("./limpieza-media-backfill-m2");

const HORA_BACKFILL_UTC = 6;
const CORTE_HORA_UTC = 9;
const CORTE_MINUTO_UTC = 30;
const SCRIPT_LIMPIEZA = "limpieza-media-cron.js";

function corteUtc(ahora) {
  return Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate(),
    CORTE_HORA_UTC,
    CORTE_MINUTO_UTC,
    0,
    0
  );
}

function lanzarLimpiezaReal() {
  const script = path.join(__dirname, SCRIPT_LIMPIEZA);
  return new Promise((resolver) => {
    const hijo = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
    });
    let cerrado = false;
    function cerrar(resultado) {
      if (cerrado) return;
      cerrado = true;
      resolver(resultado);
    }
    hijo.on("error", () => cerrar({
      codigo: 1,
      motivo: "limpieza_no_arranque",
      tarea: "limpieza",
      red: false,
    }));
    hijo.on("exit", (codigo) => cerrar({
      codigo: codigo == null ? 1 : codigo,
      motivo: "limpieza",
      tarea: "limpieza",
      red: true,
    }));
  });
}

function anunciar(salida, texto) {
  if (typeof salida === "function") salida(texto);
  else console.log(texto);
}

async function ejecutarTurno(opciones = {}) {
  if (opciones.confirmar !== true) {
    return {
      codigo: 0,
      red: false,
      motivo: "sin_confirmar",
      tarea: null,
      llamadas: 0,
    };
  }

  const ahora = opciones.ahora instanceof Date ? opciones.ahora : new Date();
  if (ahora.getUTCHours() !== HORA_BACKFILL_UTC) {
    anunciar(opciones.salida, "[LIMPIEZA_MEDIA_TURNO] limpieza");
    const lanzar = typeof opciones.lanzarLimpieza === "function"
      ? opciones.lanzarLimpieza
      : lanzarLimpiezaReal;
    const resultado = await lanzar();
    return {
      codigo: resultado && Number.isInteger(resultado.codigo) ? resultado.codigo : 1,
      red: resultado ? resultado.red !== false : true,
      motivo: resultado && resultado.motivo ? resultado.motivo : "limpieza",
      tarea: "limpieza",
      llamadas: 0,
    };
  }

  const fin = corteUtc(ahora);
  const reloj = typeof opciones.ahoraMs === "function" ? opciones.ahoraMs : () => ahora.getTime();
  if (reloj() >= fin) {
    anunciar(opciones.salida, "[LIMPIEZA_MEDIA_M2] ventana_cerrada");
    return {
      codigo: 0,
      red: false,
      motivo: "ventana_cerrada",
      tarea: "backfill",
      llamadas: 0,
    };
  }

  anunciar(opciones.salida, "[LIMPIEZA_MEDIA_TURNO] backfill");
  const resultado = await backfill.ejecutarBackfillM2({
    confirmar: true,
    url: opciones.url,
    key: opciones.key,
    cliente: opciones.cliente,
    dormir: opciones.dormir,
    escribirLinea: opciones.escribirLinea,
    salida: opciones.salida,
    topeLlamadas: opciones.topeLlamadas,
    venceEn: fin,
    ahoraMs: reloj,
  });
  resultado.tarea = "backfill";
  if (resultado.motivo === "agotado") {
    resultado.completado = true;
    anunciar(opciones.salida, "[LIMPIEZA_MEDIA_M2] completado");
  } else if (resultado.motivo === "ventana_cerrada") {
    const ultima = resultado.lineas[resultado.lineas.length - 1];
    anunciar(opciones.salida, "[LIMPIEZA_MEDIA_M2] ventana_cerrada");
    if (ultima && Number.isInteger(ultima.pendientes)) {
      anunciar(opciones.salida, `[LIMPIEZA_MEDIA_M2] pendientes ${ultima.pendientes}`);
    }
  }
  return resultado;
}

async function main() {
  require("dotenv").config();
  const confirmar = process.argv.includes("--confirmar");
  if (!confirmar) {
    console.log("No se abrió red. Ni la limpieza ni el backfill se ejecutaron.");
    console.log("El Cron sigue en: node scripts/limpieza-media-cron.js");
    process.exit(0);
  }

  const resultado = await ejecutarTurno({
    confirmar: true,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
    cliente: require("axios"),
    salida(texto) {
      console.log(texto);
    },
  });
  process.exit(Number.isInteger(resultado.codigo) ? resultado.codigo : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  ejecutarTurno,
  lanzarLimpiezaReal,
  HORA_BACKFILL_UTC,
  CORTE_HORA_UTC,
  CORTE_MINUTO_UTC,
  SCRIPT_LIMPIEZA,
};
