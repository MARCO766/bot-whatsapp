/**
 * Validación programación Seguimiento CRM V2 (sin WhatsApp, sin worker).
 *
 * Uso:
 *   node scripts/validar-seguimiento-v2-programacion.js
 *
 * Requiere .env con SUPABASE_URL y SUPABASE_SECRET_KEY.
 * Opcional: VALIDAR_V2_USUARIO_ID, VALIDAR_V2_CONEXION_A, VALIDAR_V2_CONEXION_B
 */
require("dotenv").config();
const crypto = require("crypto");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { programarSeguimientoV2EnFlujo } = require("../services/seguimientoV2/seguimientoV2Service");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TEST_USUARIO_ID =
  process.env.VALIDAR_V2_USUARIO_ID || crypto.randomUUID();
const TEST_CONEXION_A =
  process.env.VALIDAR_V2_CONEXION_A || crypto.randomUUID();
const TEST_CONEXION_B =
  process.env.VALIDAR_V2_CONEXION_B || crypto.randomUUID();
const TEST_FLUJO_ID = "flujo_validacion_v2_programacion";
const TEST_NODO_ID = "nodo_validacion_v2_programacion";

const campanasCreadas = [];

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

function crearNodoMockV2() {
  return {
    id: TEST_NODO_ID,
    className: "follow-node-v2",
    data: {
      type: "seguimiento_crm_v2",
      version: 1,
      pasos: [
        {
          pasoId: "1",
          delay: { valor: 5, unidad: "minutos" },
          tipo: "texto",
          contenido: "[VALIDACION_V2_PROG] paso 1 — no enviar",
        },
        {
          pasoId: "2",
          delay: { valor: 10, unidad: "minutos" },
          tipo: "texto",
          contenido: "[VALIDACION_V2_PROG] paso 2 — no enviar",
        },
      ],
    },
  };
}

async function limpiarCampana(campanaId, numero, conexionId) {
  if (!campanaId) return;

  try {
    await repo.cancelarCampana(campanaId, {
      usuarioId: TEST_USUARIO_ID,
      numero,
      conexionWhatsappId: conexionId,
      motivo: "validacion_v2_programacion_cleanup",
    });

    const filas = await repo.listarPorCampana(campanaId);
    for (const fila of filas) {
      if (fila.id) {
        await repo.actualizarEstado(fila.id, ESTADOS_SEGUIMIENTO_V2.CANCELADO, {
          error_detalle: "validacion_v2_programacion_cleanup",
        });
      }
    }
  } catch (err) {
    fallo(
      `Limpieza campaña ${campanaId}: ` +
        (err.response?.data?.message || err.message)
    );
  }
}

function mostrarFilas(filas, etiqueta) {
  info(etiqueta);
  for (const fila of filas) {
    console.log(
      `   campana_id=${fila.campana_id} paso_index=${fila.paso_index} run_at=${fila.run_at} conexion_whatsapp_id=${fila.conexion_whatsapp_id}`
    );
  }
}

function verificarRunAtAcumulativo(filas) {
  if (filas.length < 2) return true;

  const ordenadas = [...filas].sort((a, b) => a.paso_index - b.paso_index);
  const t0 = new Date(ordenadas[0].run_at).getTime();
  const t1 = new Date(ordenadas[1].run_at).getTime();
  const diffMin = (t1 - t0) / 60_000;

  if (diffMin < 9 || diffMin > 11) {
    fallo(
      `run_at acumulativo incorrecto: diferencia paso 0→1 = ${diffMin.toFixed(1)} min (esperado ~10)`
    );
    return false;
  }

  ok(`run_at acumulativo OK (paso2 ≈ paso1 + 10 min, diff=${diffMin.toFixed(1)} min)`);
  return true;
}

async function programarLead(numero, conexionId, etiqueta) {
  const nodo = crearNodoMockV2();

  const resultado = await programarSeguimientoV2EnFlujo({
    numero,
    usuarioId: TEST_USUARIO_ID,
    flujoId: TEST_FLUJO_ID,
    nodoId: TEST_NODO_ID,
    nodo,
    conexionWhatsappId: conexionId,
  });

  if (!resultado.campanaId || resultado.programados === 0) {
    fallo(`${etiqueta}: no se programó campaña (programados=${resultado.programados})`);
    return null;
  }

  campanasCreadas.push({
    campanaId: resultado.campanaId,
    numero,
    conexionId,
  });

  ok(`${etiqueta}: campaña ${resultado.campanaId} — ${resultado.programados} paso(s)`);
  return resultado.campanaId;
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Validación Seguimiento CRM V2 — Programación");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  seccion("1. Nodo mock V2");
  const nodo = crearNodoMockV2();
  info(`nodo_id=${nodo.id} pasos=${nodo.data.pasos.length} version=${nodo.data.version}`);
  ok("Nodo mock V2 creado");

  seccion("2. Programar Lead A (conexión A)");
  const leadA = "5491199991001";
  const campanaA = await programarLead(leadA, TEST_CONEXION_A, "Lead A");

  seccion("3. Programar Lead B (conexión B)");
  const leadB = "5491199991002";
  const campanaB = await programarLead(leadB, TEST_CONEXION_B, "Lead B");

  if (!campanaA || !campanaB) {
    process.exit(process.exitCode || 1);
  }

  seccion("4. Leer filas creadas");
  const filasA = await repo.listarPorCampana(campanaA);
  const filasB = await repo.listarPorCampana(campanaB);

  mostrarFilas(filasA, "Lead A → conexión A:");
  mostrarFilas(filasB, "Lead B → conexión B:");

  seccion("5. Verificar conexion_whatsapp_id por lead");
  const conexionesA = [...new Set(filasA.map((f) => f.conexion_whatsapp_id))];
  const conexionesB = [...new Set(filasB.map((f) => f.conexion_whatsapp_id))];

  if (conexionesA.length !== 1 || conexionesA[0] !== TEST_CONEXION_A) {
    fallo(
      `Lead A: conexion_whatsapp_id esperada ${TEST_CONEXION_A}, obtuvo ${conexionesA.join(", ")}`
    );
  } else {
    ok(`Lead A conserva conexion_whatsapp_id = ${TEST_CONEXION_A}`);
  }

  if (conexionesB.length !== 1 || conexionesB[0] !== TEST_CONEXION_B) {
    fallo(
      `Lead B: conexion_whatsapp_id esperada ${TEST_CONEXION_B}, obtuvo ${conexionesB.join(", ")}`
    );
  } else {
    ok(`Lead B conserva conexion_whatsapp_id = ${TEST_CONEXION_B}`);
  }

  seccion("6. Verificar run_at acumulativo (Lead A)");
  verificarRunAtAcumulativo(filasA);

  seccion("7. Verificar dedup — segunda programación mismo lead");
  const dup = await programarSeguimientoV2EnFlujo({
    numero: leadA,
    usuarioId: TEST_USUARIO_ID,
    flujoId: TEST_FLUJO_ID,
    nodoId: TEST_NODO_ID,
    nodo: crearNodoMockV2(),
    conexionWhatsappId: TEST_CONEXION_A,
  });

  if (dup.omitido && dup.campanaId === campanaA) {
    ok("Dedup OK — campaña activa reutilizada, sin duplicar");
  } else {
    fallo("Dedup falló — se creó campaña nueva para lead con campaña activa");
  }

  seccion("8. Limpieza");
  for (const c of campanasCreadas) {
    await limpiarCampana(c.campanaId, c.numero, c.conexionId);
  }
  ok("Filas de prueba canceladas");

  seccion("Resultado final");
  if (process.exitCode) {
    console.log("❌ Validación programación V2 con errores.");
  } else {
    console.log("✅ Validación programación V2 completada sin errores.");
    console.log("   No se envió ningún mensaje WhatsApp.");
    console.log("   No se usó worker.");
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err.response?.data || err.message);
  process.exit(1);
});
