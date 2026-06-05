/**
 * Validación cancel-on-reply Seguimiento CRM V2 (checkpoint + multi-número).
 *
 * Uso:
 *   node scripts/validar-seguimiento-v2-cancel-on-reply.js
 */
require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const {
  cancelarSeguimientosV2PorRespuesta,
} = require("../services/seguimientoV2/seguimientoV2CancelOnReply");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");
const { nowUtc } = require("../services/seguimientoV2/timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TEST_USUARIO_ID = process.env.VALIDAR_V2_USUARIO_ID || crypto.randomUUID();
const TEST_CLIENTE = "5491199993001";
const CONEXION_A = crypto.randomUUID();
const CONEXION_B = crypto.randomUUID();

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function ok(msg) {
  console.log("✅", msg);
}

function fallo(msg) {
  console.error("❌", msg);
  process.exitCode = 1;
}

async function obtenerPorCampana(campanaId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?campana_id=eq.${encodeURIComponent(campanaId)}&order=paso_index.asc&select=*`,
    { headers: headers() }
  );
  return res.data || [];
}

async function crearCampanaDosPasos(conexionId, etiqueta, opts = {}) {
  const campanaId = crypto.randomUUID();
  const ahora = Date.now();
  const checkpointAt =
    opts.checkpointAt || new Date(ahora + 2000).toISOString();

  const base = {
    usuario_id: TEST_USUARIO_ID,
    conexion_whatsapp_id: conexionId,
    cliente_numero: TEST_CLIENTE,
    flujo_id: "flujo_cancel_v2",
    nodo_id: "nodo_cancel_v2",
    campana_id: campanaId,
    tipo: "texto",
    checkpoint_at: checkpointAt,
    cancelar_si_responde: true,
  };

  const filas = await repo.insertarPasos([
    {
      ...base,
      paso_index: 0,
      paso_id: "paso_1",
      contenido: `[CANCEL_V2] ${etiqueta} paso 1`,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: new Date(ahora + 10_000).toISOString(),
    },
    {
      ...base,
      paso_index: 1,
      paso_id: "paso_2",
      contenido: `[CANCEL_V2] ${etiqueta} paso 2`,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: new Date(ahora + 30_000).toISOString(),
    },
  ]);

  return { campanaId, filas, checkpointAt };
}

async function limpiarCampana(campanaId, conexionId) {
  try {
    await repo.cancelarCampana(campanaId, {
      usuarioId: TEST_USUARIO_ID,
      numero: TEST_CLIENTE,
      conexionWhatsappId: conexionId,
      motivo: "validacion_cancel_v2_cleanup",
    });
  } catch (_err) {
    /* ignore */
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    return;
  }

  console.log("\n── Activador: mensaje antes de checkpoint ──");
  const activador = await crearCampanaDosPasos(CONEXION_A, "activador");
  const mensajeActivador = new Date().toISOString();

  const resActivador = await cancelarSeguimientosV2PorRespuesta({
    usuarioId: TEST_USUARIO_ID,
    numero: TEST_CLIENTE,
    conexionWhatsappId: CONEXION_A,
    mensajeAt: mensajeActivador,
  });

  if (resActivador.cancelados !== 0) {
    fallo(`Activador: se esperaba 0 cancelados, obtuvo ${resActivador.cancelados}`);
  } else {
    ok("Activador: 0 cancelados (checkpoint protege campaña nueva)");
  }

  const filasActivador = await obtenerPorCampana(activador.campanaId);
  const pendientesActivador = filasActivador.filter(
    (f) => f.estado === ESTADOS_SEGUIMIENTO_V2.PENDIENTE
  );
  if (pendientesActivador.length !== 2) {
    fallo(`Activador: se esperaban 2 pendientes, hay ${pendientesActivador.length}`);
  } else {
    ok("Activador: ambos pasos siguen pendientes");
  }

  await limpiarCampana(activador.campanaId, CONEXION_A);

  console.log("\n── Respuesta real: mensaje después de checkpoint ──");
  const campanaA = await crearCampanaDosPasos(CONEXION_A, "linea_A", {
    checkpointAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const campanaB = await crearCampanaDosPasos(CONEXION_B, "linea_B", {
    checkpointAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const mensajeRespuesta = new Date().toISOString();
  const resA = await cancelarSeguimientosV2PorRespuesta({
    usuarioId: TEST_USUARIO_ID,
    numero: TEST_CLIENTE,
    conexionWhatsappId: CONEXION_A,
    mensajeAt: mensajeRespuesta,
  });

  if (resA.cancelados !== 2) {
    fallo(`Conexión A: se esperaban 2 cancelados, obtuvo ${resA.cancelados}`);
  } else {
    ok("Conexión A: 2 pasos pendientes cancelados");
  }

  const filasB = await obtenerPorCampana(campanaB.campanaId);
  const pendientesB = filasB.filter(
    (f) => f.estado === ESTADOS_SEGUIMIENTO_V2.PENDIENTE
  );
  if (pendientesB.length !== 2) {
    fallo(`Conexión B: se esperaban 2 pendientes, hay ${pendientesB.length}`);
  } else {
    ok("Conexión B: sigue intacta (multi-número OK)");
  }

  const resB = await cancelarSeguimientosV2PorRespuesta({
    usuarioId: TEST_USUARIO_ID,
    numero: TEST_CLIENTE,
    conexionWhatsappId: CONEXION_B,
    mensajeAt: mensajeRespuesta,
  });

  if (resB.cancelados !== 2) {
    fallo(`Conexión B: se esperaban 2 cancelados, obtuvo ${resB.cancelados}`);
  } else {
    ok("Conexión B: 2 pasos cancelados tras respuesta");
  }

  await limpiarCampana(campanaA.campanaId, CONEXION_A);
  await limpiarCampana(campanaB.campanaId, CONEXION_B);
  ok("Limpieza completada");
}

main().catch((err) => {
  fallo(err.response?.data?.message || err.message);
});
