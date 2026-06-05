/**
 * Validación worker Seguimiento CRM V2.
 *
 * Uso:
 *   node scripts/validar-seguimiento-v2-worker.js
 *
 * Requiere .env con SUPABASE_URL y SUPABASE_SECRET_KEY.
 * Opcional: VALIDAR_V2_USUARIO_ID, VALIDAR_V2_CONEXION_ID (UUID real para prueba enviado).
 */
require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");
const { nowUtc } = require("../services/seguimientoV2/timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TEST_USUARIO_ID =
  process.env.VALIDAR_V2_USUARIO_ID || crypto.randomUUID();
const TEST_CONEXION_REAL = process.env.VALIDAR_V2_CONEXION_ID || null;
const TEST_CONEXION_FAKE = crypto.randomUUID();
const TEST_CLIENTE = "5491199992001";
const TEST_FLUJO_ID = "flujo_validacion_v2_worker";
const TEST_NODO_ID = "nodo_validacion_v2_worker";

let filaPruebaId = null;
let campanaPruebaId = null;
let ultimaConexionPrueba = null;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function ok(msg) {
  console.log("✅", msg);
}

function info(msg) {
  console.log("ℹ️ ", msg);
}

function fallo(msg) {
  console.error("❌", msg);
  process.exitCode = 1;
}

function seccion(titulo) {
  console.log("\n── " + titulo + " ──");
}

async function obtenerFilaPorId(id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function crearFilaPendiente(conexionId, etiqueta) {
  campanaPruebaId = crypto.randomUUID();
  const pasado = new Date(Date.now() - 120_000).toISOString();

  const filas = await repo.insertarPasos([
    {
      usuario_id: TEST_USUARIO_ID,
      conexion_whatsapp_id: conexionId,
      cliente_numero: TEST_CLIENTE,
      flujo_id: TEST_FLUJO_ID,
      nodo_id: TEST_NODO_ID,
      campana_id: campanaPruebaId,
      paso_index: 0,
      paso_id: "paso_worker_1",
      tipo: "texto",
      contenido: `[VALIDACION_V2_WORKER] ${etiqueta} — no UI`,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: pasado,
      checkpoint_at: nowUtc(),
      cancelar_si_responde: true,
    },
  ]);

  filaPruebaId = filas[0]?.id || null;
  ultimaConexionPrueba = conexionId;
  return filas[0] || null;
}

async function limpiarPrueba() {
  if (!campanaPruebaId) return;

  try {
    await repo.cancelarCampana(campanaPruebaId, {
      usuarioId: TEST_USUARIO_ID,
      numero: TEST_CLIENTE,
      conexionWhatsappId: ultimaConexionPrueba || TEST_CONEXION_FAKE,
      motivo: "validacion_v2_worker_cleanup",
    });
    if (filaPruebaId) {
      await repo.actualizarEstado(filaPruebaId, ESTADOS_SEGUIMIENTO_V2.CANCELADO, {
        error_detalle: "validacion_v2_worker_cleanup",
      });
    }
    ok("Fila de prueba limpiada");
  } catch (err) {
    fallo("Limpieza: " + (err.response?.data?.message || err.message));
  }
}

async function ejecutarWorkerYVerificar(conexionId, esperado) {
  seccion(`Worker — conexión ${esperado.etiqueta}`);

  const fila = await crearFilaPendiente(conexionId, esperado.etiqueta);
  if (!fila?.id) {
    fallo("No se creó fila pendiente");
    return false;
  }

  info(`fila id=${fila.id} conexion=${conexionId} run_at=${fila.run_at}`);

  const resultado = await procesarSeguimientosV2Vencidos({ fromWorker: true });
  info(`worker tick: procesados=${resultado.procesados} enviados=${resultado.enviados}`);

  const actualizada = await obtenerFilaPorId(fila.id);
  if (!actualizada) {
    fallo("No se pudo leer fila después del worker");
    return false;
  }

  info(
    `estado=${actualizada.estado} error_detalle=${actualizada.error_detalle ?? "—"} meta_message_id=${actualizada.meta_message_id ?? "—"}`
  );

  if (!esperado.estados.includes(actualizada.estado)) {
    fallo(
      `Estado esperado ${esperado.estados.join("|")}, obtuvo ${actualizada.estado}`
    );
    return false;
  }

  if (esperado.errorDetalle && actualizada.error_detalle !== esperado.errorDetalle) {
    fallo(
      `error_detalle esperado ${esperado.errorDetalle}, obtuvo ${actualizada.error_detalle}`
    );
    return false;
  }

  if (actualizada.estado === ESTADOS_SEGUIMIENTO_V2.ENVIADO) {
    if (actualizada.conexion_whatsapp_id !== conexionId) {
      fallo(
        `conexion_whatsapp_id cambió: esperada ${conexionId}, obtuvo ${actualizada.conexion_whatsapp_id}`
      );
      return false;
    }
    ok(`Enviado por conexión exacta ${conexionId}`);
  } else {
    ok(`Estado ${actualizada.estado} correcto para ${esperado.etiqueta}`);
  }

  return true;
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Validación Seguimiento CRM V2 — Worker");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  seccion("1. Prueba conexión inexistente → fallido");
  const okFake = await ejecutarWorkerYVerificar(TEST_CONEXION_FAKE, {
    etiqueta: "conexion_fake",
    estados: [ESTADOS_SEGUIMIENTO_V2.FALLIDO],
    errorDetalle: "conexion_no_encontrada",
  });

  if (TEST_CONEXION_REAL) {
    seccion("2. Prueba conexión real → enviado o fallido");
    await ejecutarWorkerYVerificar(TEST_CONEXION_REAL, {
      etiqueta: "conexion_real",
      estados: [
        ESTADOS_SEGUIMIENTO_V2.ENVIADO,
        ESTADOS_SEGUIMIENTO_V2.FALLIDO,
        ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
      ],
    });
  } else {
    info("VALIDAR_V2_CONEXION_ID no definido — omitiendo prueba de envío real");
  }

  seccion("3. Limpieza");
  await limpiarPrueba();

  seccion("Resultado final");
  if (!okFake || process.exitCode) {
    console.log("❌ Validación worker V2 con errores.");
  } else {
    console.log("✅ Validación worker V2 completada.");
    if (!TEST_CONEXION_REAL) {
      console.log("   Tip: define VALIDAR_V2_CONEXION_ID para probar envío real.");
    }
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err.response?.data || err.message);
  process.exit(1);
});
