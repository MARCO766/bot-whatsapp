/**
 * Validación cancel-on-reply Seguimiento CRM V2 (multi-número).
 *
 * Uso:
 *   node scripts/validar-seguimiento-v2-cancel-on-reply.js
 *
 * Requiere .env con SUPABASE_URL y SUPABASE_SECRET_KEY.
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

async function crearCampanaDosPasos(conexionId, etiqueta) {
  const campanaId = crypto.randomUUID();
  const ahora = Date.now();

  const base = {
    usuario_id: TEST_USUARIO_ID,
    conexion_whatsapp_id: conexionId,
    cliente_numero: TEST_CLIENTE,
    flujo_id: "flujo_cancel_v2",
    nodo_id: "nodo_cancel_v2",
    campana_id: campanaId,
    tipo: "texto",
    checkpoint_at: nowUtc(),
    cancelar_si_responde: true,
  };

  const filas = await repo.insertarPasos([
    {
      ...base,
      paso_index: 0,
      paso_id: "paso_1",
      contenido: `[CANCEL_V2] ${etiqueta} paso 1`,
      estado: ESTADOS_SEGUIMIENTO_V2.ENVIADO,
      run_at: new Date(ahora - 60_000).toISOString(),
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

  return { campanaId, filas };
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

  console.log("\n── Cancel on reply — conexión A ──");
  const campanaA = await crearCampanaDosPasos(CONEXION_A, "linea_A");
  const campanaB = await crearCampanaDosPasos(CONEXION_B, "linea_B");

  const resA = await cancelarSeguimientosV2PorRespuesta({
    usuarioId: TEST_USUARIO_ID,
    numero: TEST_CLIENTE,
    conexionWhatsappId: CONEXION_A,
  });

  if (resA.cancelados !== 1) {
    fallo(`Conexión A: se esperaba 1 cancelado, obtuvo ${resA.cancelados}`);
  } else {
    ok("Conexión A: 1 paso pendiente cancelado");
  }

  const filasA = await obtenerPorCampana(campanaA.campanaId);
  const paso2A = filasA.find((f) => f.paso_index === 1);
  if (paso2A?.estado !== ESTADOS_SEGUIMIENTO_V2.RESPONDIDO) {
    fallo(`Conexión A paso 2: estado ${paso2A?.estado}, esperado respondido`);
  } else if (paso2A.error_detalle !== "lead_respondio") {
    fallo(`Conexión A paso 2: error_detalle ${paso2A.error_detalle}`);
  } else {
    ok("Conexión A paso 2: respondido + lead_respondio");
  }

  const filasB = await obtenerPorCampana(campanaB.campanaId);
  const paso2B = filasB.find((f) => f.paso_index === 1);
  if (paso2B?.estado !== ESTADOS_SEGUIMIENTO_V2.PENDIENTE) {
    fallo(`Conexión B paso 2: estado ${paso2B?.estado}, esperado pendiente (aislamiento multi-número)`);
  } else {
    ok("Conexión B paso 2: sigue pendiente (multi-número OK)");
  }

  console.log("\n── Cancel on reply — conexión B ──");
  const resB = await cancelarSeguimientosV2PorRespuesta({
    usuarioId: TEST_USUARIO_ID,
    numero: TEST_CLIENTE,
    conexionWhatsappId: CONEXION_B,
  });

  if (resB.cancelados !== 1) {
    fallo(`Conexión B: se esperaba 1 cancelado, obtuvo ${resB.cancelados}`);
  } else {
    ok("Conexión B: 1 paso pendiente cancelado");
  }

  await limpiarCampana(campanaA.campanaId, CONEXION_A);
  await limpiarCampana(campanaB.campanaId, CONEXION_B);
  ok("Limpieza completada");
}

main().catch((err) => {
  fallo(err.response?.data?.message || err.message);
});
