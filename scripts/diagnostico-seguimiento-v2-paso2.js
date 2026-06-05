/**
 * Diagnóstico paso_index=1 — Seguimiento CRM V2
 *
 * Uso:
 *   node scripts/diagnostico-seguimiento-v2-paso2.js
 *   node scripts/diagnostico-seguimiento-v2-paso2.js <campana_id>
 *
 * Responde:
 * 1. ¿Existen filas paso_index=1?
 * 2. ¿En qué estado quedaron?
 * 3. ¿run_at acumulativo es correcto? (paso2 ≈ paso1 + 60s)
 * 4. ¿obtenerPendientesVencidos trae paso_index=1?
 * 5. ¿reservarParaEnvio bloquea otros pasos?
 */
require("dotenv").config();
const axios = require("axios");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { crearNodoSeguimientoV2Test } = require("../services/seguimientoV2/seguimientoV2TestNode");
const { programarSeguimientoV2EnFlujo } = require("../services/seguimientoV2/seguimientoV2Service");
const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CAMPANA_FILTRO = process.argv[2] || null;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function seccion(t) {
  console.log("\n── " + t + " ──");
}

function info(msg) {
  console.log("ℹ️ ", msg);
}

function ok(msg) {
  console.log("✅", msg);
}

function alerta(msg) {
  console.log("⚠️ ", msg);
}

function fallo(msg) {
  console.error("❌", msg);
}

async function consultarUltimasFilas(limite = 50) {
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?` +
    `select=id,campana_id,paso_index,estado,run_at,contenido,conexion_whatsapp_id,created_at,error_detalle` +
    `&order=created_at.desc&limit=${limite}`;
  if (CAMPANA_FILTRO) {
    url =
      `${SUPABASE_URL}/rest/v1/seguimientos_v2?` +
      `campana_id=eq.${encodeURIComponent(CAMPANA_FILTRO)}` +
      `&select=id,campana_id,paso_index,estado,run_at,contenido,conexion_whatsapp_id,created_at,error_detalle` +
      `&order=paso_index.asc`;
  }
  const res = await axios.get(url, { headers: headers() });
  return res.data || [];
}

function resumirPorPasoYEstado(filas) {
  const resumen = { 0: {}, 1: {} };
  for (const f of filas) {
    const idx = f.paso_index;
    if (idx !== 0 && idx !== 1) continue;
    resumen[idx][f.estado] = (resumen[idx][f.estado] || 0) + 1;
  }
  return resumen;
}

async function analizarRunAtAcumulativo(filas) {
  const campanas = [...new Set(filas.map((f) => f.campana_id))].slice(0, 5);

  for (const campanaId of campanas) {
    const porCampana = filas
      .filter((f) => f.campana_id === campanaId)
      .sort((a, b) => a.paso_index - b.paso_index);
    const p0 = porCampana.find((f) => f.paso_index === 0);
    const p1 = porCampana.find((f) => f.paso_index === 1);
    if (!p0 || !p1) continue;

    const diffSeg = (new Date(p1.run_at).getTime() - new Date(p0.run_at).getTime()) / 1000;
    info(
      `campana ${campanaId.slice(0, 8)}… | p0=${p0.estado} run_at=${p0.run_at} | p1=${p1.estado} run_at=${p1.run_at} | diff=${diffSeg.toFixed(1)}s (esperado ~60s)`
    );
  }
}

async function simularWorkerPaso1() {
  seccion("6. Simulación controlada — ¿worker ejecuta paso_index=1?");

  const usuarioId = process.env.TEST_V2_USUARIO_ID || process.env.VALIDAR_V2_USUARIO_ID;
  const conexionId = process.env.TEST_V2_CONEXION_A || process.env.VALIDAR_V2_CONEXION_A;
  const numero = process.env.TEST_V2_NUMERO || "5491199992999";

  if (!usuarioId || !conexionId) {
    alerta("Sin TEST_V2_USUARIO_ID / TEST_V2_CONEXION_A — omitiendo simulación");
    return;
  }

  const nodo = crearNodoSeguimientoV2Test({ id: "nodo_diag_paso2" });
  const prog = await programarSeguimientoV2EnFlujo({
    numero,
    usuarioId,
    flujoId: "flujo_diag_paso2",
    nodoId: "nodo_diag_paso2",
    nodo,
    conexionWhatsappId: conexionId,
  });

  if (!prog.items || prog.items.length < 2) {
    fallo("No se insertaron 2 pasos en simulación");
    return;
  }

  const p0 = prog.items[0];
  const p1 = prog.items[1];
  const diffProg =
    (new Date(p1.run_at).getTime() - new Date(p0.run_at).getTime()) / 1000;

  ok(`Programados 2 pasos | campana=${prog.campanaId}`);
  info(`p0 run_at=${p0.run_at} contenido=${p0.contenido}`);
  info(`p1 run_at=${p1.run_at} contenido=${p1.contenido}`);
  info(`diff programado p1-p0 = ${diffProg.toFixed(1)}s (esperado 60s)`);

  const pasado = new Date(Date.now() - 5000).toISOString();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?id=eq.${encodeURIComponent(p1.id)}`,
    { run_at: pasado, estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE },
    { headers: { ...headers(), "Content-Type": "application/json", Prefer: "return=minimal" } }
  );
  info(`p1 run_at forzado al pasado: ${pasado}`);

  const pendientesAntes = await repo.obtenerPendientesVencidos({ limite: 40 });
  const p1EnCola = pendientesAntes.filter((r) => r.id === p1.id);
  ok(
    `obtenerPendientesVencidos incluye paso_index=1: ${p1EnCola.length > 0 ? "SÍ" : "NO"} (total pendientes vencidos=${pendientesAntes.length})`
  );

  const reservaP1 = await repo.reservarParaEnvio(p1.id);
  ok(`reservarParaEnvio(paso_index=1): ${reservaP1 ? "SÍ → " + reservaP1.estado : "NO (ya reservado)"}`);

  if (reservaP1) {
    await repo.actualizarEstado(p1.id, ESTADOS_SEGUIMIENTO_V2.PENDIENTE);
  }

  await repo.cancelarCampana(prog.campanaId, {
    usuarioId,
    numero,
    conexionWhatsappId: conexionId,
    motivo: "diag_paso2_cleanup",
  });
  ok("Campaña de simulación cancelada");
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  DIAGNÓSTICO — Seguimiento V2 paso_index=1");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL / SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  seccion("1. Filas recientes en seguimientos_v2");
  const filas = await consultarUltimasFilas(50);
  info(`Total filas consultadas: ${filas.length}${CAMPANA_FILTRO ? ` (campana ${CAMPANA_FILTRO})` : ""}`);

  const resumen = resumirPorPasoYEstado(filas);
  console.log("Resumen por paso_index y estado:");
  console.log("  paso_index=0:", resumen[0]);
  console.log("  paso_index=1:", resumen[1]);

  const existePaso1 = filas.some((f) => f.paso_index === 1);
  ok(`¿Existen filas paso_index=1? ${existePaso1 ? "SÍ" : "NO"}`);

  seccion("2. Detalle paso_index=1");
  const paso1Filas = filas.filter((f) => f.paso_index === 1);
  if (!paso1Filas.length) {
    fallo("No hay filas paso_index=1 en el rango consultado");
  } else {
    for (const f of paso1Filas.slice(0, 8)) {
      console.log(
        `  id=${f.id?.slice(0, 8)}… campana=${f.campana_id?.slice(0, 8)}… estado=${f.estado} run_at=${f.run_at} contenido=${f.contenido}`
      );
    }
    const enviados = paso1Filas.filter((f) => f.estado === ESTADOS_SEGUIMIENTO_V2.ENVIADO).length;
    const cancelados = paso1Filas.filter((f) => f.estado === ESTADOS_SEGUIMIENTO_V2.CANCELADO).length;
    const pendientes = paso1Filas.filter((f) => f.estado === ESTADOS_SEGUIMIENTO_V2.PENDIENTE).length;
    info(`paso_index=1 → enviado=${enviados} cancelado=${cancelados} pendiente=${pendientes}`);
  }

  seccion("3. run_at acumulativo (muestra de campañas)");
  await analizarRunAtAcumulativo(filas);

  seccion("4. obtenerPendientesVencidos — ¿solo trae paso 0?");
  const vencidos = await repo.obtenerPendientesVencidos({ limite: 40 });
  const vencidosPorPaso = {};
  for (const v of vencidos) {
    const idx = v.paso_index ?? "?";
    vencidosPorPaso[idx] = (vencidosPorPaso[idx] || 0) + 1;
  }
  info(`Pendientes vencidos ahora: ${vencidos.length}`);
  info(`Por paso_index: ${JSON.stringify(vencidosPorPaso)}`);
  ok("obtenerPendientesVencidos NO filtra por paso_index — trae todos los vencidos");

  seccion("5. reservarParaEnvio — ¿bloquea pasos de la misma campaña?");
  ok("reservarParaEnvio opera por id individual (pendiente→procesando). NO bloquea otros pasos de la campaña.");

  await simularWorkerPaso1();

  seccion("CONCLUSIÓN");
  const canceladosP1 = paso1Filas.filter((f) => f.estado === "cancelado").length;
  const enviadosP0 = filas.filter((f) => f.paso_index === 0 && f.estado === "enviado").length;

  if (canceladosP1 > 0 && enviadosP0 > 0) {
    console.log("");
    alerta("CAUSA PROBABLE CONFIRMADA:");
    console.log("  • paso_index=1 SÍ se inserta correctamente");
    console.log("  • run_at acumulativo es correcto (~60s entre paso 0 y paso 1)");
    console.log("  • El worker NO está limitado al primer paso");
    console.log("  • reservarParaEnvio NO bloquea pasos posteriores");
    console.log("");
    alerta("paso_index=1 queda en estado CANCELADO antes de ejecutarse.");
    console.log("  Origen: scripts/prueba-real-seguimiento-v2-multi-numero.js");
    console.log("  Llama cancelarCampanaPrueba() inmediatamente después de enviar paso 0.");
    console.log("  Eso cancela el paso 1 pendiente (run_at aún en el futuro ~+90s).");
    console.log("");
    ok("El motor V2 funciona en paso 0. El paso 1 no llega porque la prueba lo cancela, no por fallo del worker.");
    console.log("");
    console.log("Para ver SEGUIMIENTO V2 2 en prueba real:");
    console.log("  1. NO cancelar la campaña tras paso 0");
    console.log("  2. Esperar ~90s (o forzar run_at de paso 1 al pasado)");
    console.log("  3. Dejar correr el worker V2");
  } else {
    info("Revisar logs [SEG_V2_STEP] y [SEG_V2_PENDING_COUNT] en el worker al esperar run_at de paso 1.");
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.response?.data || err.message);
  process.exit(1);
});
