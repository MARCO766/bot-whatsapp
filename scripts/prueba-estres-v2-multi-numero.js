/**
 * Prueba de estrés multi-número V2 — detección inmediata de mezcla A/B
 *
 * Uso:
 *   node scripts/prueba-estres-v2-multi-numero.js
 *
 * Variables requeridas (.env):
 *   TEST_V2_USUARIO_ID
 *   TEST_V2_CONEXION_A
 *   TEST_V2_CONEXION_B
 *   TEST_V2_NUMERO
 *
 * Opcional:
 *   TEST_V2_FORZAR_RUN_AT=true — forzar run_at al vencer (default true)
 */
require("dotenv").config();
const axios = require("axios");
const {
  crearNodoSeguimientoV2Test,
  NODO_SEGUIMIENTO_V2_TEST_ID,
  FLUJO_SEGUIMIENTO_V2_TEST_ID,
  contenidoPasoTestV2,
} = require("../services/seguimientoV2/seguimientoV2TestNode");
const { programarSeguimientoV2EnFlujo } = require("../services/seguimientoV2/seguimientoV2Service");
const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");
const { resolverConexionV2 } = require("../services/seguimientoV2/seguimientoV2Guards");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const USUARIO_ID = process.env.TEST_V2_USUARIO_ID || process.env.VALIDAR_V2_USUARIO_ID;
const CONEXION_A = process.env.TEST_V2_CONEXION_A || process.env.VALIDAR_V2_CONEXION_A;
const CONEXION_B = process.env.TEST_V2_CONEXION_B || process.env.VALIDAR_V2_CONEXION_B;
const NUMERO_LEAD = process.env.TEST_V2_NUMERO || process.env.DIAG_SEG_NUMERO;
const FORZAR_RUN_AT = process.env.TEST_V2_FORZAR_RUN_AT !== "false";

const CONTENIDO_A_PASO_0 = contenidoPasoTestV2(0, "A");
const CONTENIDO_A_PASO_1 = contenidoPasoTestV2(1, "A");
const CONTENIDO_B_PASO_0 = contenidoPasoTestV2(0, "B");
const CONTENIDO_B_PASO_1 = contenidoPasoTestV2(1, "B");

const campanasLimpieza = [];

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
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
  console.log("\n══════════════════════════════════════════════");
  console.log(" ", titulo);
  console.log("══════════════════════════════════════════════");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAtVencido(runAt) {
  return new Date(runAt).getTime() <= Date.now();
}

function letraVariante(contenido) {
  const match = String(contenido || "").match(/^SEGUIMIENTO V2 \d([AB])$/);
  return match ? match[1] : null;
}

function detectarMezcla(contenido, lineaEsperada) {
  const letra = letraVariante(contenido);
  if (!letra) return { mezcla: false, motivo: "contenido_no_variante" };
  if (letra !== lineaEsperada) {
    return {
      mezcla: true,
      motivo: `linea_${lineaEsperada}_recibio_${letra}`,
      detalle: `esperado sufijo ${lineaEsperada}, obtuvo "${contenido}"`,
    };
  }
  return { mezcla: false };
}

async function obtenerFila(id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function forzarRunAtPasado(id) {
  const pasado = new Date(Date.now() - 5000).toISOString();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?id=eq.${encodeURIComponent(id)}`,
    { run_at: pasado, estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE, updated_at: new Date().toISOString() },
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarCampanaPrueba(campanaId, numero, conexionId) {
  if (!campanaId) return;
  try {
    await repo.cancelarCampana(campanaId, {
      usuarioId: USUARIO_ID,
      numero,
      conexionWhatsappId: conexionId,
      motivo: "prueba_estres_v2_cleanup",
    });
  } catch (_err) {
    // ignorar
  }
}

async function simularLeadEnLinea({ numero, conexionId, nodoId }) {
  const nodo = crearNodoSeguimientoV2Test({ id: nodoId });
  return programarSeguimientoV2EnFlujo({
    numero,
    usuarioId: USUARIO_ID,
    flujoId: FLUJO_SEGUIMIENTO_V2_TEST_ID,
    nodoId,
    nodo,
    conexionWhatsappId: conexionId,
  });
}

async function esperarRunAtVencido(filaId, maxEsperaMs = 120000) {
  const inicio = Date.now();

  while (Date.now() - inicio < maxEsperaMs) {
    const fila = await obtenerFila(filaId);
    if (!fila) throw new Error(`Fila no encontrada: ${filaId}`);

    if (fila.estado !== ESTADOS_SEGUIMIENTO_V2.PENDIENTE) {
      return fila;
    }

    if (runAtVencido(fila.run_at)) {
      return fila;
    }

    const restante = new Date(fila.run_at).getTime() - Date.now();
    info(`  run_at pendiente en ${Math.ceil(restante / 1000)}s (paso_index=${fila.paso_index})`);
    await sleep(Math.min(2000, Math.max(500, restante)));
  }

  if (FORZAR_RUN_AT) {
    await forzarRunAtPasado(filaId);
  }

  return obtenerFila(filaId);
}

async function ejecutarWorkerHastaEstadoFinal(filaId, maxTicks = 10) {
  for (let tick = 0; tick < maxTicks; tick++) {
    const fila = await obtenerFila(filaId);
    if (!fila) return null;

    const estadosFinales = [
      ESTADOS_SEGUIMIENTO_V2.ENVIADO,
      ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
      ESTADOS_SEGUIMIENTO_V2.FALLIDO,
      ESTADOS_SEGUIMIENTO_V2.CANCELADO,
    ];

    if (estadosFinales.includes(fila.estado)) {
      return fila;
    }

    if (fila.estado === ESTADOS_SEGUIMIENTO_V2.PENDIENTE) {
      if (!runAtVencido(fila.run_at)) {
        await esperarRunAtVencido(filaId);
      } else if (FORZAR_RUN_AT) {
        await forzarRunAtPasado(filaId);
      }
      await procesarSeguimientosV2Vencidos({ fromWorker: true });
    }

    if (fila.estado === ESTADOS_SEGUIMIENTO_V2.PROCESANDO) {
      await sleep(1500);
      await procesarSeguimientosV2Vencidos({ fromWorker: true });
    }

    await sleep(1000);
  }

  return obtenerFila(filaId);
}

async function verificarPaso({
  filaId,
  conexionEsperada,
  contenidoEsperado,
  linea,
  pasoIndex,
}) {
  const fila = await obtenerFila(filaId);
  if (!fila) {
    return { ok: false, motivo: "fila_no_encontrada" };
  }

  if (fila.conexion_whatsapp_id !== conexionEsperada) {
    return {
      ok: false,
      mezcla: true,
      motivo: "mezcla_conexion",
      detalle: `esperada ${conexionEsperada}, obtuvo ${fila.conexion_whatsapp_id}`,
    };
  }

  const estadosOk = [ESTADOS_SEGUIMIENTO_V2.ENVIADO, ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO];
  if (!estadosOk.includes(fila.estado)) {
    return {
      ok: false,
      motivo: "estado_inesperado",
      detalle: `${fila.estado} / ${fila.error_detalle || "—"}`,
    };
  }

  if (fila.contenido !== contenidoEsperado) {
    const mezclaLetra = detectarMezcla(fila.contenido, linea);
    return {
      ok: false,
      mezcla: mezclaLetra.mezcla,
      motivo: mezclaLetra.mezcla ? "mezcla_variante" : "contenido_incorrecto",
      detalle: mezclaLetra.detalle || `esperado "${contenidoEsperado}", obtuvo "${fila.contenido}"`,
    };
  }

  const mezclaLetra = detectarMezcla(fila.contenido, linea);
  if (mezclaLetra.mezcla) {
    return {
      ok: false,
      mezcla: true,
      motivo: "mezcla_variante",
      detalle: mezclaLetra.detalle,
    };
  }

  ok(`[${linea}] paso_index=${pasoIndex} — "${fila.contenido}" por conexión ${conexionEsperada}`);
  return { ok: true, fila };
}

async function ejecutarCampanaLinea({ prog, conexionId, linea, contenidos }) {
  const fila0 = prog.items.find((f) => f.paso_index === 0) || prog.items[0];
  const fila1 = prog.items.find((f) => f.paso_index === 1) || prog.items[1];

  if (!fila0 || !fila1) {
    return { ok: false, mezclas: 0, motivo: "campana_sin_2_pasos" };
  }

  info(`[${linea}] campana_id=${prog.campanaId} — ciclo completo`);

  await esperarRunAtVencido(fila0.id, 45000);
  await ejecutarWorkerHastaEstadoFinal(fila0.id);
  const ver0 = await verificarPaso({
    filaId: fila0.id,
    conexionEsperada: conexionId,
    contenidoEsperado: contenidos.paso0,
    linea,
    pasoIndex: 0,
  });

  if (!ver0.ok) {
    return {
      ok: false,
      mezclas: ver0.mezcla ? 1 : 0,
      motivo: ver0.motivo,
      detalle: ver0.detalle,
    };
  }

  await esperarRunAtVencido(fila1.id, 120000);
  await ejecutarWorkerHastaEstadoFinal(fila1.id);
  const ver1 = await verificarPaso({
    filaId: fila1.id,
    conexionEsperada: conexionId,
    contenidoEsperado: contenidos.paso1,
    linea,
    pasoIndex: 1,
  });

  if (!ver1.ok) {
    return {
      ok: false,
      mezclas: ver1.mezcla ? 1 : 0,
      motivo: ver1.motivo,
      detalle: ver1.detalle,
    };
  }

  return { ok: true, mezclas: 0 };
}

async function pruebaEstresParalela() {
  seccion("PRUEBA DE ESTRÉS V2 — Campañas A y B en paralelo");

  const numero = NUMERO_LEAD;
  const nodoA = `${NODO_SEGUIMIENTO_V2_TEST_ID}_estres_a`;
  const nodoB = `${NODO_SEGUIMIENTO_V2_TEST_ID}_estres_b`;

  info("Paso 1 — Lanzar campaña A");
  const progA = await simularLeadEnLinea({ numero, conexionId: CONEXION_A, nodoId: nodoA });

  info("Paso 2 — Lanzar campaña B");
  const progB = await simularLeadEnLinea({ numero, conexionId: CONEXION_B, nodoId: nodoB });

  if (!progA.campanaId || !progB.campanaId) {
    fallo("No se crearon ambas campañas");
    return false;
  }

  if (progA.campanaId === progB.campanaId) {
    fallo("MEZCLA CONFIRMADA — mismo campana_id para A y B");
    return false;
  }

  campanasLimpieza.push(
    { campanaId: progA.campanaId, numero, conexionId: CONEXION_A },
    { campanaId: progB.campanaId, numero, conexionId: CONEXION_B }
  );

  ok(`Campañas lanzadas: A=${progA.campanaId} B=${progB.campanaId}`);
  info("Paso 3 — Esperar ejecución completa de ambas líneas en paralelo");

  const [resA, resB] = await Promise.all([
    ejecutarCampanaLinea({
      prog: progA,
      conexionId: CONEXION_A,
      linea: "A",
      contenidos: { paso0: CONTENIDO_A_PASO_0, paso1: CONTENIDO_A_PASO_1 },
    }),
    ejecutarCampanaLinea({
      prog: progB,
      conexionId: CONEXION_B,
      linea: "B",
      contenidos: { paso0: CONTENIDO_B_PASO_0, paso1: CONTENIDO_B_PASO_1 },
    }),
  ]);

  const mezclas = (resA.mezclas || 0) + (resB.mezclas || 0);

  if (!resA.ok) {
    fallo(`[A] ${resA.motivo} ${resA.detalle || ""}`);
  }
  if (!resB.ok) {
    fallo(`[B] ${resB.motivo} ${resB.detalle || ""}`);
  }

  seccion("RESULTADO ESPERADO");
  console.log("  Número A:");
  console.log(`    ${CONTENIDO_A_PASO_0}`);
  console.log(`    ${CONTENIDO_A_PASO_1}`);
  console.log("  Número B:");
  console.log(`    ${CONTENIDO_B_PASO_0}`);
  console.log(`    ${CONTENIDO_B_PASO_1}`);

  if (mezclas > 0) {
    fallo(`MEZCLA CONFIRMADA — ${mezclas} paso(s) con letra incorrecta`);
    console.log("\n❌ V2 NO validado — revisar logs [SEG_V2_TEST_VARIANT]");
    return false;
  }

  if (!resA.ok || !resB.ok) {
    console.log("\n❌ Prueba con fallos — revisar logs [SEG_V2_TEST_VARIANT]");
    return false;
  }

  console.log("\n✅ V2 validado como multi-número seguro — A→A, B→B durante toda la campaña");
  console.log("   Revisar logs [SEG_V2_TEST_VARIANT] para trazabilidad por conexion_whatsapp_id");
  return true;
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  PRUEBA DE ESTRÉS MULTI-NÚMERO V2");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  if (!USUARIO_ID || !CONEXION_A || !CONEXION_B || !NUMERO_LEAD) {
    fallo("Faltan variables: TEST_V2_USUARIO_ID, TEST_V2_CONEXION_A, TEST_V2_CONEXION_B, TEST_V2_NUMERO");
    process.exit(1);
  }

  const conexionMetaA = await resolverConexionV2(USUARIO_ID, CONEXION_A);
  const conexionMetaB = await resolverConexionV2(USUARIO_ID, CONEXION_B);

  info(`usuario_id=${USUARIO_ID}`);
  info(`conexion_A=${CONEXION_A} phone_id=${conexionMetaA?.phone_id ?? "NO ENCONTRADA"}`);
  info(`conexion_B=${CONEXION_B} phone_id=${conexionMetaB?.phone_id ?? "NO ENCONTRADA"}`);
  info(`numero_lead=${NUMERO_LEAD}`);

  if (!conexionMetaA?.phone_id || !conexionMetaB?.phone_id) {
    fallo("Conexiones A/B deben existir con token y phone_id");
    process.exit(1);
  }

  if (conexionMetaA.phone_id === conexionMetaB.phone_id) {
    fallo("A y B comparten el mismo phone_id — no es multi-número real");
    process.exit(1);
  }

  try {
    const aprobado = await pruebaEstresParalela();
    if (!aprobado) {
      process.exit(process.exitCode || 1);
    }
  } finally {
    seccion("Limpieza");
    for (const c of campanasLimpieza) {
      await cancelarCampanaPrueba(c.campanaId, c.numero, c.conexionId);
    }
    ok("Campañas de prueba canceladas");
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err.response?.data || err.message);
  process.exit(1);
});
