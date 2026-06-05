/**
 * Validación DB + Repository Seguimiento CRM V2 (sin WhatsApp, sin tocar V1).
 *
 * Uso:
 *   node scripts/validar-seguimiento-v2-db.js
 *
 * Requiere .env con SUPABASE_URL y SUPABASE_SECRET_KEY.
 * Opcional: VALIDAR_V2_USUARIO_ID, VALIDAR_V2_CONEXION_ID (UUIDs reales del tenant).
 */
require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");
const { nowUtc } = require("../services/seguimientoV2/timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TEST_USUARIO_ID =
  process.env.VALIDAR_V2_USUARIO_ID || crypto.randomUUID();
const TEST_CONEXION_ID =
  process.env.VALIDAR_V2_CONEXION_ID || crypto.randomUUID();
const TEST_CLIENTE = "5491199990001";
const TEST_FLUJO_ID = "flujo_validacion_v2";
const TEST_NODO_ID = "nodo_validacion_v2";
const TEST_CAMPANA_ID = crypto.randomUUID();

let filasPrueba = [];

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

async function verificarTabla(nombre, select = "id") {
  try {
    await axios.get(
      `${SUPABASE_URL}/rest/v1/${nombre}?select=${select}&limit=1`,
      { headers: headers() }
    );
    ok(`Tabla ${nombre} accesible`);
    return true;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "";
    fallo(`Tabla ${nombre} no accesible: ${msg}`);
    return false;
  }
}

async function verificarColumnaMensajesV2() {
  try {
    await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?select=id,seguimiento_v2_id&limit=1`,
      { headers: headers() }
    );
    ok("Columna mensajes.seguimiento_v2_id accesible");
    return true;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "";
    if (String(msg).includes("seguimiento_v2_id")) {
      fallo(
        "Columna mensajes.seguimiento_v2_id ausente — ejecuta supabase/migrations/add_mensajes_seguimiento_v2_id.sql"
      );
      return false;
    }
    throw err;
  }
}

function filasPruebaPayload() {
  const pasado = new Date(Date.now() - 60_000).toISOString();
  const checkpoint = nowUtc();

  return [
    {
      usuario_id: TEST_USUARIO_ID,
      conexion_whatsapp_id: TEST_CONEXION_ID,
      cliente_numero: TEST_CLIENTE,
      flujo_id: TEST_FLUJO_ID,
      nodo_id: TEST_NODO_ID,
      campana_id: TEST_CAMPANA_ID,
      paso_index: 0,
      paso_id: "paso_1",
      tipo: "texto",
      contenido: "[VALIDACION_V2] paso 1 — no enviar",
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: pasado,
      checkpoint_at: checkpoint,
      cancelar_si_responde: true,
    },
    {
      usuario_id: TEST_USUARIO_ID,
      conexion_whatsapp_id: TEST_CONEXION_ID,
      cliente_numero: TEST_CLIENTE,
      flujo_id: TEST_FLUJO_ID,
      nodo_id: TEST_NODO_ID,
      campana_id: TEST_CAMPANA_ID,
      paso_index: 1,
      paso_id: "paso_2",
      tipo: "texto",
      contenido: "[VALIDACION_V2] paso 2 — no enviar",
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      run_at: pasado,
      checkpoint_at: checkpoint,
      cancelar_si_responde: true,
    },
  ];
}

async function limpiarPrueba() {
  if (!filasPrueba.length) return;

  seccion("Limpieza — cancelar filas de prueba");
  try {
    const cancelados = await repo.cancelarCampana(TEST_CAMPANA_ID, {
      usuarioId: TEST_USUARIO_ID,
      numero: TEST_CLIENTE,
      conexionWhatsappId: TEST_CONEXION_ID,
      motivo: "validacion_v2_db_cleanup",
    });

    for (const fila of filasPrueba) {
      if (fila.id) {
        await repo.actualizarEstado(fila.id, ESTADOS_SEGUIMIENTO_V2.CANCELADO, {
          error_detalle: "validacion_v2_db_cleanup",
        });
      }
    }

    ok(
      `Campaña de prueba limpiada (${cancelados} pendiente(s) cancelados + todas las filas marcadas cancelado)`
    );
  } catch (err) {
    fallo(
      "No se pudo limpiar campaña de prueba: " +
        (err.response?.data?.message || err.message)
    );
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Validación Seguimiento CRM V2 — DB + Repository");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  seccion("1. Verificar tablas y columna mensajes");
  const tablasOk = await Promise.all([
    verificarTabla("seguimientos_v2"),
    verificarTabla("seguimientos_v2_logs"),
    verificarTabla("seguimiento_v2_worker_lock", "id,locked_until"),
    verificarColumnaMensajesV2(),
  ]);

  if (tablasOk.some((v) => !v)) {
    info(
      "Ejecuta las migraciones en Supabase SQL Editor (orden):\n" +
        "  1. create_seguimientos_v2.sql\n" +
        "  2. create_seguimientos_v2_logs.sql\n" +
        "  3. create_seguimiento_v2_worker_lock.sql\n" +
        "  4. add_mensajes_seguimiento_v2_id.sql"
    );
    process.exit(process.exitCode || 1);
  }

  seccion("2. Insertar 2 filas de prueba");
  info(`campana_id=${TEST_CAMPANA_ID}`);
  info(`usuario_id=${TEST_USUARIO_ID}`);
  info(`conexion_whatsapp_id=${TEST_CONEXION_ID}`);

  try {
    filasPrueba = await repo.insertarPasos(filasPruebaPayload());
    ok(`Insertadas ${filasPrueba.length} fila(s) en seguimientos_v2`);
    filasPrueba.forEach((f) => {
      info(`  id=${f.id} paso_index=${f.paso_index} estado=${f.estado}`);
    });
  } catch (err) {
    fallo("insertarPasos falló: " + (err.response?.data?.message || err.message));
    process.exit(1);
  }

  seccion("3. Leer por campana_id");
  try {
    const porCampana = await repo.listarPorCampana(TEST_CAMPANA_ID);
    ok(`listarPorCampana → ${porCampana.length} fila(s)`);
    if (porCampana.length !== 2) {
      fallo(`Se esperaban 2 filas, se obtuvieron ${porCampana.length}`);
    }
  } catch (err) {
    fallo("listarPorCampana falló: " + (err.response?.data?.message || err.message));
  }

  seccion("4. Reservar fila pendiente (lock atómico)");
  const idReservar = filasPrueba[0]?.id;
  let reservada = null;
  try {
    reservada = await repo.reservarParaEnvio(idReservar);
    if (!reservada || reservada.estado !== ESTADOS_SEGUIMIENTO_V2.PROCESANDO) {
      fallo("reservarParaEnvio no devolvió fila en estado procesando");
    } else {
      ok(`reservarParaEnvio → id=${reservada.id} estado=${reservada.estado}`);
    }
  } catch (err) {
    fallo("reservarParaEnvio falló: " + (err.response?.data?.message || err.message));
  }

  seccion("5. Actualizar a enviado");
  try {
    await repo.actualizarEstado(idReservar, ESTADOS_SEGUIMIENTO_V2.ENVIADO, {
      meta_message_id: "wamid_validacion_v2_fake",
    });
    ok(`actualizarEstado → enviado (id=${idReservar})`);
  } catch (err) {
    fallo("actualizarEstado falló: " + (err.response?.data?.message || err.message));
  }

  seccion("6. Insertar logs");
  try {
    const log1 = await repo.insertarLog({
      seguimientoId: idReservar,
      usuarioId: TEST_USUARIO_ID,
      conexionWhatsappId: TEST_CONEXION_ID,
      numero: TEST_CLIENTE,
      evento: "validacion_reservado",
      detalle: { script: "validar-seguimiento-v2-db" },
    });
    const log2 = await repo.insertarLog({
      seguimientoId: idReservar,
      usuarioId: TEST_USUARIO_ID,
      conexionWhatsappId: TEST_CONEXION_ID,
      numero: TEST_CLIENTE,
      evento: "validacion_enviado",
      detalle: { fake_meta_id: "wamid_validacion_v2_fake" },
    });
    ok(`insertarLog → 2 eventos (ids: ${log1?.id}, ${log2?.id})`);
  } catch (err) {
    fallo("insertarLog falló: " + (err.response?.data?.message || err.message));
  }

  seccion("7. Consultas adicionales del repository");
  try {
    const pendientes = await repo.listarPendientesPorClaveTriple({
      usuarioId: TEST_USUARIO_ID,
      numero: TEST_CLIENTE,
      conexionWhatsappId: TEST_CONEXION_ID,
    });
    ok(`listarPendientesPorClaveTriple → ${pendientes.length} pendiente(s) activo(s)`);

    const campanaActiva = await repo.obtenerCampanaActiva({
      usuarioId: TEST_USUARIO_ID,
      numero: TEST_CLIENTE,
      conexionWhatsappId: TEST_CONEXION_ID,
      flujoId: TEST_FLUJO_ID,
      nodoId: TEST_NODO_ID,
    });
    ok(
      `obtenerCampanaActiva → campana_id=${campanaActiva?.campana_id ?? "null"} estado=${campanaActiva?.estado ?? "—"}`
    );

    const vencidos = await repo.obtenerPendientesVencidos({ limite: 5 });
    const nuestros = (vencidos || []).filter((r) => r.campana_id === TEST_CAMPANA_ID);
    ok(
      `obtenerPendientesVencidos → ${vencidos.length} total, ${nuestros.length} de esta campaña`
    );
  } catch (err) {
    fallo("Consultas adicionales fallaron: " + (err.response?.data?.message || err.message));
  }

  await limpiarPrueba();

  seccion("Resultado final");
  if (process.exitCode) {
    console.log("❌ Validación V2 con errores — revisa mensajes arriba.");
  } else {
    console.log("✅ Validación V2 DB + Repository completada sin errores.");
    console.log("   No se envió ningún mensaje WhatsApp.");
    console.log("   Filas de prueba marcadas como canceladas.");
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err.response?.data || err.message);
  process.exit(1);
});
