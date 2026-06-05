/**
 * Pruebas reales multi-número — Seguimiento CRM V2
 *
 * Uso:
 *   node scripts/prueba-real-seguimiento-v2-multi-numero.js
 *   node scripts/prueba-real-seguimiento-v2-multi-numero.js --solo 4
 *
 * Variables requeridas (.env):
 *   TEST_V2_USUARIO_ID
 *   TEST_V2_CONEXION_A
 *   TEST_V2_CONEXION_B
 *   TEST_V2_NUMERO          — número WhatsApp del lead (recibe mensajes)
 *
 * Opcional:
 *   TEST_V2_REPETICIONES=10 — pruebas A y B (default 10)
 *   TEST_V2_FORZAR_RUN_AT=true — forzar run_at al vencer (default true)
 */
require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const { parseSeguimientoV2Node } = require("../services/seguimientoV2/seguimientoV2Parser");
const {
  crearNodoSeguimientoV2Test,
  NODO_SEGUIMIENTO_V2_TEST_ID,
  FLUJO_SEGUIMIENTO_V2_TEST_ID,
  configSeguimientoV2Test,
  contenidoPasoTestV2,
} = require("../services/seguimientoV2/seguimientoV2TestNode");
const { programarSeguimientoV2EnFlujo } = require("../services/seguimientoV2/seguimientoV2Service");
const { procesarSeguimientosV2Vencidos } = require("../services/seguimientoV2/seguimientoV2Worker");
const { logSegV2Test } = require("../services/seguimientoV2/seguimientoV2TestLog");
const repo = require("../services/seguimientoV2/seguimientoV2Repository");
const { ESTADOS_SEGUIMIENTO_V2 } = require("../services/seguimientoV2/constants");
const { resolverConexionV2 } = require("../services/seguimientoV2/seguimientoV2Guards");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const USUARIO_ID = process.env.TEST_V2_USUARIO_ID || process.env.VALIDAR_V2_USUARIO_ID;
const CONEXION_A = process.env.TEST_V2_CONEXION_A || process.env.VALIDAR_V2_CONEXION_A;
const CONEXION_B = process.env.TEST_V2_CONEXION_B || process.env.VALIDAR_V2_CONEXION_B;
const NUMERO_LEAD = process.env.TEST_V2_NUMERO || process.env.DIAG_SEG_NUMERO;
const REPETICIONES = parseInt(process.env.TEST_V2_REPETICIONES || "10", 10);
const FORZAR_RUN_AT = process.env.TEST_V2_FORZAR_RUN_AT !== "false";

function contenidoEsperadoPorLinea(linea, pasoIndex) {
  return contenidoPasoTestV2(pasoIndex, linea);
}

const campanasLimpieza = [];

const resultados = {
  pruebaA: { paso0: 0, paso1: 0, campanasOk: 0, fallos: 0, mezclas: 0 },
  pruebaB: { paso0: 0, paso1: 0, campanasOk: 0, fallos: 0, mezclas: 0 },
  prueba4: false,
  prueba5: false,
  prueba6: false,
};

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

function parseSoloArg() {
  const idx = process.argv.indexOf("--solo");
  if (idx === -1) return null;
  return parseInt(process.argv[idx + 1], 10) || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAtVencido(runAt) {
  return new Date(runAt).getTime() <= Date.now();
}

async function obtenerFila(id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_v2?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function obtenerMensajePorSeguimientoV2Id(seguimientoV2Id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/mensajes?seguimiento_v2_id=eq.${encodeURIComponent(seguimientoV2Id)}` +
      `&select=id,seguimiento_v2_id,conexion_whatsapp_id,cliente_numero,whatsapp_message_id,creado_en&limit=1`,
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
  return pasado;
}

async function cancelarCampanaPrueba(campanaId, numero, conexionId) {
  if (!campanaId) return;
  try {
    await repo.cancelarCampana(campanaId, {
      usuarioId: USUARIO_ID,
      numero,
      conexionWhatsappId: conexionId,
      motivo: "prueba_real_v2_cleanup",
    });
  } catch (_err) {
    // ignorar
  }
}

async function limpiarTodasLasCampanas() {
  for (const c of campanasLimpieza) {
    await cancelarCampanaPrueba(c.campanaId, c.numero, c.conexionId);
  }
}

async function simularLeadEnLinea({ numero, conexionId, nodoId = NODO_SEGUIMIENTO_V2_TEST_ID }) {
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

async function ejecutarWorkerTick() {
  return procesarSeguimientosV2Vencidos({ fromWorker: true });
}

async function esperarRunAtVencido(filaId, maxEsperaMs = 120000) {
  const inicio = Date.now();

  while (Date.now() - inicio < maxEsperaMs) {
    const fila = await obtenerFila(filaId);
    if (!fila) {
      throw new Error(`Fila no encontrada: ${filaId}`);
    }

    if (fila.estado !== ESTADOS_SEGUIMIENTO_V2.PENDIENTE) {
      return fila;
    }

    if (runAtVencido(fila.run_at)) {
      return fila;
    }

    const restante = new Date(fila.run_at).getTime() - Date.now();
    info(`  run_at pendiente en ${Math.ceil(restante / 1000)}s (id=${filaId.slice(0, 8)}… paso_index=${fila.paso_index})`);
    await sleep(Math.min(2000, Math.max(500, restante)));
  }

  if (FORZAR_RUN_AT) {
    info(`  timeout espera run_at — forzando al pasado (id=${filaId.slice(0, 8)}…)`);
    await forzarRunAtPasado(filaId);
  }

  return obtenerFila(filaId);
}

async function ejecutarWorkerHastaEstadoFinal(filaId, maxTicks = 8) {
  for (let tick = 0; tick < maxTicks; tick++) {
    const fila = await obtenerFila(filaId);
    if (!fila) {
      return null;
    }

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
      await ejecutarWorkerTick();
    }

    if (fila.estado === ESTADOS_SEGUIMIENTO_V2.PROCESANDO) {
      await sleep(1500);
      await ejecutarWorkerTick();
    }

    await sleep(1000);
  }

  return obtenerFila(filaId);
}

async function verificarEnvioLinea({
  fila,
  conexionEsperada,
  phoneIdEsperado,
  contenidoEsperado,
  linea,
  pruebaNum,
}) {
  const actualizada = await obtenerFila(fila.id);
  if (!actualizada) {
    return { ok: false, motivo: "fila_no_encontrada" };
  }

  if (actualizada.conexion_whatsapp_id !== conexionEsperada) {
    return {
      ok: false,
      motivo: "mezcla_conexion",
      detalle: `esperada ${conexionEsperada}, obtuvo ${actualizada.conexion_whatsapp_id}`,
    };
  }

  const estadosOk = [
    ESTADOS_SEGUIMIENTO_V2.ENVIADO,
    ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
  ];
  if (!estadosOk.includes(actualizada.estado)) {
    return {
      ok: false,
      motivo: "estado_inesperado",
      detalle: `${actualizada.estado} / ${actualizada.error_detalle || "—"}`,
    };
  }

  if (contenidoEsperado && actualizada.contenido !== contenidoEsperado) {
    return {
      ok: false,
      motivo: "contenido_incorrecto",
      detalle: `esperado "${contenidoEsperado}", obtuvo "${actualizada.contenido}"`,
    };
  }

  let phoneIdUsado = null;
  if (actualizada.estado === ESTADOS_SEGUIMIENTO_V2.ENVIADO) {
    const mensaje = await obtenerMensajePorSeguimientoV2Id(actualizada.id);
    if (!mensaje) {
      return { ok: false, motivo: "sin_mensaje_inbox" };
    }
    if (mensaje.conexion_whatsapp_id !== conexionEsperada) {
      return {
        ok: false,
        motivo: "mezcla_inbox",
        detalle: `inbox conexion ${mensaje.conexion_whatsapp_id}`,
      };
    }
    if (mensaje.cliente_numero !== fila.cliente_numero) {
      return { ok: false, motivo: "mezcla_numero_inbox" };
    }

    const conexion = await resolverConexionV2(USUARIO_ID, conexionEsperada);
    phoneIdUsado = conexion?.phone_id || null;
    if (phoneIdEsperado && phoneIdUsado !== phoneIdEsperado) {
      return {
        ok: false,
        motivo: "mezcla_phone_id",
        detalle: `esperado ${phoneIdEsperado}, resuelto ${phoneIdUsado}`,
      };
    }
  }

  logSegV2Test({
    campana_id: actualizada.campana_id,
    seguimiento_v2_id: actualizada.id,
    conexion_whatsapp_id: conexionEsperada,
    phone_id: phoneIdUsado,
    estado: actualizada.estado,
    linea,
    prueba: `multi_${pruebaNum}`,
    paso_index: actualizada.paso_index,
    cliente_numero: actualizada.cliente_numero,
  });

  return { ok: true, fila: actualizada, phoneId: phoneIdUsado };
}

async function ejecutarCicloCampanaCompleta({
  prog,
  conexionId,
  phoneId,
  linea,
  pruebaNum,
  stats,
}) {
  const fila0 = prog.items.find((f) => f.paso_index === 0) || prog.items[0];
  const fila1 = prog.items.find((f) => f.paso_index === 1) || prog.items[1];

  if (!fila0 || !fila1) {
    fallo(`[${linea}${pruebaNum}] campaña sin 2 pasos (items=${prog.items?.length ?? 0})`);
    stats.fallos++;
    return false;
  }

  const contenidoPaso0 = contenidoEsperadoPorLinea(linea, 0);
  const contenidoPaso1 = contenidoEsperadoPorLinea(linea, 1);

  info(`[${linea}${pruebaNum}] campana_id=${prog.campanaId} — ciclo completo`);

  info(`[${linea}${pruebaNum}] Paso 0 — esperar y verificar "${contenidoPaso0}"`);
  await esperarRunAtVencido(fila0.id, 45000);
  await ejecutarWorkerHastaEstadoFinal(fila0.id);

  const ver0 = await verificarEnvioLinea({
    fila: fila0,
    conexionEsperada: conexionId,
    phoneIdEsperado: phoneId,
    contenidoEsperado: contenidoPaso0,
    linea,
    pruebaNum,
  });

  if (!ver0.ok) {
    if (ver0.motivo?.includes("mezcla")) stats.mezclas++;
    fallo(`[${linea}${pruebaNum}] paso 0: ${ver0.motivo} ${ver0.detalle || ""}`);
    stats.fallos++;
    return false;
  }

  ok(`[${linea}${pruebaNum}] paso 0 enviado — "${contenidoPaso0}" por conexión ${conexionId}`);
  stats.paso0++;

  info(`[${linea}${pruebaNum}] Paso 1 — esperar y verificar "${contenidoPaso1}"`);
  await esperarRunAtVencido(fila1.id, 120000);
  await ejecutarWorkerHastaEstadoFinal(fila1.id);

  const ver1 = await verificarEnvioLinea({
    fila: fila1,
    conexionEsperada: conexionId,
    phoneIdEsperado: phoneId,
    contenidoEsperado: contenidoPaso1,
    linea,
    pruebaNum,
  });

  if (!ver1.ok) {
    if (ver1.motivo?.includes("mezcla")) stats.mezclas++;
    fallo(`[${linea}${pruebaNum}] paso 1: ${ver1.motivo} ${ver1.detalle || ""}`);
    stats.fallos++;
    return false;
  }

  ok(`[${linea}${pruebaNum}] paso 1 enviado — "${contenidoPaso1}" por conexión ${conexionId}`);
  stats.paso1++;
  stats.campanasOk++;

  return true;
}

async function prueba1NodoHardcodeado() {
  seccion("PRUEBA 1 — Nodo temporal V2 hardcodeado");
  const nodo = crearNodoSeguimientoV2Test();
  const config = parseSeguimientoV2Node(nodo);

  info(`nodo_id=${nodo.id}`);
  info(`pasos=${config.pasos.length} version=${config.version}`);

  if (config.pasos.length !== 2) {
    fallo("Se esperaban 2 pasos");
    return false;
  }

  const esperado = configSeguimientoV2Test().pasos;
  if (config.pasos[0].contenido !== esperado[0].contenido) {
    fallo(`Paso 1 contenido incorrecto: ${config.pasos[0].contenido}`);
    return false;
  }
  if (config.pasos[1].contenido !== esperado[1].contenido) {
    fallo(`Paso 2 contenido incorrecto: ${config.pasos[1].contenido}`);
    return false;
  }
  if (config.pasos[0].segundos !== 30) {
    fallo(`Paso 1 delay: esperado 30s, obtuvo ${config.pasos[0].segundos}s`);
    return false;
  }
  if (config.pasos[1].segundos !== 60) {
    fallo(`Paso 2 delay: esperado 60s, obtuvo ${config.pasos[1].segundos}s`);
    return false;
  }

  ok("Nodo V2 test: 30s + 60s, variantes A/B por conexion_whatsapp_id (1A/2A o 1B/2B)");
  return true;
}

async function pruebaLineaRepetida({ conexionId, linea, phoneId, repeticiones }) {
  seccion(`PRUEBA ${linea === "A" ? "2" : "3"} — ${repeticiones} envíos línea ${linea}`);

  const stats = linea === "A" ? resultados.pruebaA : resultados.pruebaB;
  const nodoSufijo = linea === "A" ? "a" : "b";

  for (let i = 1; i <= repeticiones; i++) {
    const nodoId = `${NODO_SEGUIMIENTO_V2_TEST_ID}_${nodoSufijo}_${i}`;
    const numero = NUMERO_LEAD;

    const prog = await simularLeadEnLinea({ numero, conexionId, nodoId });
    if (!prog.campanaId || !prog.items?.length) {
      fallo(`[${linea}${i}] no programó campaña`);
      stats.fail++;
      continue;
    }

    campanasLimpieza.push({
      campanaId: prog.campanaId,
      numero,
      conexionId,
    });

    await ejecutarCicloCampanaCompleta({
      prog,
      conexionId,
      phoneId,
      linea,
      pruebaNum: i,
      stats,
    });

    await cancelarCampanaPrueba(prog.campanaId, numero, conexionId);
  }

  info(
    `Línea ${linea}: paso0=${stats.paso0}/${repeticiones} paso1=${stats.paso1}/${repeticiones} campanas=${stats.campanasOk}/${repeticiones} fallos=${stats.fallos} mezclas=${stats.mezclas}`
  );
  return (
    stats.paso0 === repeticiones &&
    stats.paso1 === repeticiones &&
    stats.campanasOk === repeticiones &&
    stats.mezclas === 0
  );
}

async function prueba4CampanasSeparadas() {
  seccion("PRUEBA 4 — Mismo lead A luego B (campañas separadas)");

  const numero = NUMERO_LEAD;
  const nodoA = `${NODO_SEGUIMIENTO_V2_TEST_ID}_prueba4_a`;
  const nodoB = `${NODO_SEGUIMIENTO_V2_TEST_ID}_prueba4_b`;

  const progA = await simularLeadEnLinea({ numero, conexionId: CONEXION_A, nodoId: nodoA });
  const progB = await simularLeadEnLinea({ numero, conexionId: CONEXION_B, nodoId: nodoB });

  if (!progA.campanaId || !progB.campanaId) {
    fallo("No se crearon ambas campañas");
    return false;
  }

  if (progA.campanaId === progB.campanaId) {
    fallo("Campañas mezcladas — mismo campana_id");
    return false;
  }

  campanasLimpieza.push(
    { campanaId: progA.campanaId, numero, conexionId: CONEXION_A },
    { campanaId: progB.campanaId, numero, conexionId: CONEXION_B }
  );

  const filasA = await repo.listarPorCampana(progA.campanaId);
  const filasB = await repo.listarPorCampana(progB.campanaId);

  const conexionesA = [...new Set(filasA.map((f) => f.conexion_whatsapp_id))];
  const conexionesB = [...new Set(filasB.map((f) => f.conexion_whatsapp_id))];

  if (conexionesA.length !== 1 || conexionesA[0] !== CONEXION_A) {
    fallo(`Campaña A con conexión incorrecta: ${conexionesA.join(", ")}`);
    return false;
  }
  if (conexionesB.length !== 1 || conexionesB[0] !== CONEXION_B) {
    fallo(`Campaña B con conexión incorrecta: ${conexionesB.join(", ")}`);
    return false;
  }

  const activaA = await repo.obtenerCampanaActiva({
    usuarioId: USUARIO_ID,
    numero,
    conexionWhatsappId: CONEXION_A,
    flujoId: FLUJO_SEGUIMIENTO_V2_TEST_ID,
    nodoId: nodoA,
  });
  const activaB = await repo.obtenerCampanaActiva({
    usuarioId: USUARIO_ID,
    numero,
    conexionWhatsappId: CONEXION_B,
    flujoId: FLUJO_SEGUIMIENTO_V2_TEST_ID,
    nodoId: nodoB,
  });

  if (!activaA?.campana_id || activaA.campana_id !== progA.campanaId) {
    fallo("Campaña activa A no coincide");
    return false;
  }
  if (!activaB?.campana_id || activaB.campana_id !== progB.campanaId) {
    fallo("Campaña activa B no coincide");
    return false;
  }

  const canceladosA = filasB.filter(
    (f) => f.conexion_whatsapp_id === CONEXION_A && f.estado === ESTADOS_SEGUIMIENTO_V2.CANCELADO
  );
  const canceladosB = filasA.filter(
    (f) => f.conexion_whatsapp_id === CONEXION_B && f.estado === ESTADOS_SEGUIMIENTO_V2.CANCELADO
  );
  if (canceladosA.length > 0 || canceladosB.length > 0) {
    fallo("Cancelación cruzada detectada entre líneas");
    return false;
  }

  logSegV2Test({
    campana_id: progA.campana_id,
    conexion_whatsapp_id: CONEXION_A,
    estado: "activa",
    prueba: "4_campana_a",
    cliente_numero: numero,
  });
  logSegV2Test({
    campana_id: progB.campana_id,
    conexion_whatsapp_id: CONEXION_B,
    estado: "activa",
    prueba: "4_campana_b",
    cliente_numero: numero,
  });

  ok(`Campañas separadas: A=${progA.campanaId} B=${progB.campanaId} — sin mezcla ni cancelación cruzada`);
  resultados.prueba4 = true;
  return true;
}

async function prueba5Duplicado() {
  seccion("PRUEBA 5 — Duplicado (omitido_duplicado, sin POST Meta)");

  const conexionId = CONEXION_A;
  const numero = NUMERO_LEAD;
  const nodoId = `${NODO_SEGUIMIENTO_V2_TEST_ID}_prueba5`;

  const prog = await simularLeadEnLinea({ numero, conexionId, nodoId });
  if (!prog.items?.length) {
    fallo("No se programó fila para duplicado");
    return false;
  }

  const fila = prog.items[0];
  campanasLimpieza.push({ campanaId: prog.campanaId, numero, conexionId });

  await axios.post(
    `${SUPABASE_URL}/rest/v1/mensajes`,
    {
      usuario_id: USUARIO_ID,
      cliente_numero: numero,
      direccion: "saliente",
      tipo: "texto",
      contenido: "[PRUEBA_V2_DUP] mensaje previo idempotente",
      conexion_whatsapp_id: conexionId,
      seguimiento_v2_id: fila.id,
      whatsapp_message_id: "wamid_prueba_v2_dup_fake",
      estado_envio: "sent",
    },
    { headers: headers({ Prefer: "return=minimal" }) }
  );

  await forzarRunAtPasado(fila.id);
  await procesarSeguimientosV2Vencidos({ fromWorker: true });

  const actualizada = await obtenerFila(fila.id);
  if (actualizada.estado !== ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO) {
    fallo(`Estado esperado omitido_duplicado, obtuvo ${actualizada.estado}`);
    return false;
  }

  const mensajes = await axios.get(
    `${SUPABASE_URL}/rest/v1/mensajes?seguimiento_v2_id=eq.${encodeURIComponent(fila.id)}&select=id`,
    { headers: headers() }
  );
  if ((mensajes.data || []).length !== 1) {
    fallo("Se creó más de un mensaje — posible POST Meta duplicado");
    return false;
  }

  logSegV2Test({
    campana_id: prog.campanaId,
    seguimiento_v2_id: fila.id,
    conexion_whatsapp_id: conexionId,
    estado: ESTADOS_SEGUIMIENTO_V2.OMITIDO_DUPLICADO,
    prueba: "5_duplicado",
    cliente_numero: numero,
  });

  ok("omitido_duplicado — 1 solo mensaje en inbox, sin POST Meta adicional");
  resultados.prueba5 = true;
  return true;
}

async function prueba6ConexionInexistente() {
  seccion("PRUEBA 6 — Conexión inexistente → fallido");

  const conexionFake = crypto.randomUUID();
  const numero = NUMERO_LEAD;
  const nodoId = `${NODO_SEGUIMIENTO_V2_TEST_ID}_prueba6`;

  const prog = await simularLeadEnLinea({
    numero,
    conexionId: conexionFake,
    nodoId,
  });

  if (!prog.items?.length) {
    fallo("No se insertó fila con conexión fake");
    return false;
  }

  const fila = prog.items[0];
  await forzarRunAtPasado(fila.id);
  await ejecutarWorkerTick();

  const actualizada = await obtenerFila(fila.id);
  if (actualizada.estado !== ESTADOS_SEGUIMIENTO_V2.FALLIDO) {
    fallo(`Estado esperado fallido, obtuvo ${actualizada.estado}`);
    return false;
  }
  if (actualizada.error_detalle !== "conexion_no_encontrada") {
    fallo(`error_detalle esperado conexion_no_encontrada, obtuvo ${actualizada.error_detalle}`);
    return false;
  }

  logSegV2Test({
    campana_id: prog.campanaId,
    seguimiento_v2_id: fila.id,
    conexion_whatsapp_id: conexionFake,
    estado: ESTADOS_SEGUIMIENTO_V2.FALLIDO,
    prueba: "6_conexion_inexistente",
    motivo: actualizada.error_detalle,
    cliente_numero: numero,
  });

  ok("fallido / conexion_no_encontrada — sin envío");
  resultados.prueba6 = true;
  return true;
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  PRUEBAS REALES — Seguimiento CRM V2 Multi-Número");
  console.log("═══════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
    process.exit(1);
  }
  const solo = parseSoloArg();
  const requiereEnvioReal = !solo || solo !== 1;

  if (requiereEnvioReal && (!USUARIO_ID || !CONEXION_A || !CONEXION_B || !NUMERO_LEAD)) {
    fallo(
      "Faltan variables: TEST_V2_USUARIO_ID, TEST_V2_CONEXION_A, TEST_V2_CONEXION_B, TEST_V2_NUMERO"
    );
    process.exit(1);
  }

  let conexionMetaA = null;
  let conexionMetaB = null;
  if (requiereEnvioReal) {
    conexionMetaA = await resolverConexionV2(USUARIO_ID, CONEXION_A);
    conexionMetaB = await resolverConexionV2(USUARIO_ID, CONEXION_B);
  }

  if (requiereEnvioReal) {
    info(`usuario_id=${USUARIO_ID}`);
    info(`conexion_A=${CONEXION_A} phone_id=${conexionMetaA?.phone_id ?? "NO ENCONTRADA"}`);
    info(`conexion_B=${CONEXION_B} phone_id=${conexionMetaB?.phone_id ?? "NO ENCONTRADA"}`);
    info(`numero_lead=${NUMERO_LEAD}`);
    info(`repeticiones=${REPETICIONES}`);

    if (!conexionMetaA?.phone_id || !conexionMetaB?.phone_id) {
      fallo("Conexiones A/B deben existir con token y phone_id para pruebas reales de envío");
      process.exit(1);
    }

    if (conexionMetaA.phone_id === conexionMetaB.phone_id) {
      fallo("A y B comparten el mismo phone_id — no es multi-número real");
      process.exit(1);
    }
  }

  try {
    if (!solo || solo === 1) await prueba1NodoHardcodeado();
    if (!solo || solo === 2) {
      await pruebaLineaRepetida({
        conexionId: CONEXION_A,
        linea: "A",
        phoneId: conexionMetaA.phone_id,
        repeticiones: REPETICIONES,
      });
    }
    if (!solo || solo === 3) {
      await pruebaLineaRepetida({
        conexionId: CONEXION_B,
        linea: "B",
        phoneId: conexionMetaB.phone_id,
        repeticiones: REPETICIONES,
      });
    }
    if (!solo || solo === 4) await prueba4CampanasSeparadas();
    if (!solo || solo === 5) await prueba5Duplicado();
    if (!solo || solo === 6) await prueba6ConexionInexistente();
  } finally {
    seccion("Limpieza");
    await limpiarTodasLasCampanas();
    ok("Campañas de prueba canceladas");
  }

  seccion("RESUMEN FINAL");
  const paso0Total = resultados.pruebaA.paso0 + resultados.pruebaB.paso0;
  const paso1Total = resultados.pruebaA.paso1 + resultados.pruebaB.paso1;
  const paso0Esperado = REPETICIONES * 2;
  const paso1Esperado = REPETICIONES * 2;
  const mezclas =
    resultados.pruebaA.mezclas + resultados.pruebaB.mezclas;
  const fallos =
    resultados.pruebaA.fallos + resultados.pruebaB.fallos;

  console.log(`  Paso 0 enviados:  ${paso0Total}/${paso0Esperado}  (A=${resultados.pruebaA.paso0} B=${resultados.pruebaB.paso0})`);
  console.log(`  Paso 1 enviados:  ${paso1Total}/${paso1Esperado}  (A=${resultados.pruebaA.paso1} B=${resultados.pruebaB.paso1})`);
  console.log(`  Mezclas detectadas: ${mezclas}`);
  console.log(`  Fallos detectados:  ${fallos}`);
  console.log(`  Prueba 4 (campañas separadas): ${resultados.prueba4 ? "OK" : "FAIL"}`);
  console.log(`  Prueba 5 (duplicado): ${resultados.prueba5 ? "OK" : "FAIL"}`);
  console.log(`  Prueba 6 (conexión inexistente): ${resultados.prueba6 ? "OK" : "FAIL"}`);

  const corrioEnvio = solo !== 1;
  const suiteCompleta = !solo;
  const pasoAOk =
    solo && solo !== 2
      ? true
      : resultados.pruebaA.paso0 === REPETICIONES &&
        resultados.pruebaA.paso1 === REPETICIONES;
  const pasoBOk =
    solo && solo !== 3
      ? true
      : resultados.pruebaB.paso0 === REPETICIONES &&
        resultados.pruebaB.paso1 === REPETICIONES;
  const aprobado =
    !process.exitCode &&
    (!corrioEnvio ||
      (pasoAOk &&
        pasoBOk &&
        mezclas === 0 &&
        fallos === 0 &&
        (!suiteCompleta ||
          (resultados.prueba4 && resultados.prueba5 && resultados.prueba6))));

  if (aprobado) {
    console.log("\n✅ SEGUIMIENTO CRM V2 APROBADO — ciclo completo validado.");
    console.log("   SEGUIMIENTO V2 1A/2A o 1B/2B según conexión — sin mezcla A/B");
    console.log("   0 mezclas | 0 fallback | strict conexión por línea");
  } else {
    console.log("\n❌ Pruebas con fallos — revisar logs [SEG_V2_TEST] y [SEG_V2_STEP] arriba.");
    process.exit(process.exitCode || 1);
  }
}

main().catch((err) => {
  console.error("❌ Error fatal:", err.response?.data || err.message);
  process.exit(1);
});
