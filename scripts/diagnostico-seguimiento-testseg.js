/**
 * Prueba controlada Seguimiento CRM (sin RM24H / resetbot / UI).
 * Uso: node scripts/diagnostico-seguimiento-testseg.js [numero] [usuarioId]
 *
 * Capas 1-2: ejecuta nodo seguimiento de prueba (1 min, mensaje test).
 * Capa 3-4: consulta Supabase + un tick del worker (envío real si hay credenciales WA).
 */
require("dotenv").config();

const axios = require("axios");
const { detectarTipoNodo } = require("../services/seguimiento/detectarTipoNodo");
const { ejecutarSeguimientoEnFlujo } = require("../services/seguimiento/ejecutarSeguimientoEnFlujo");
const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const NUMERO = process.argv[2] || process.env.DIAG_SEG_NUMERO || "5490000000000";
const USUARIO_ID = process.argv[3] || process.env.DIAG_SEG_USUARIO_ID || null;
const FLUJO_ID =
  process.argv[4] ||
  process.env.DIAG_SEG_FLUJO_ID ||
  "564b49a4-f1e5-4751-9851-05e3e101a6d3";
const NODO_ID = "nodo_seguimiento_testseg";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function nodoSeguimientoTest() {
  const config = {
    version: 2,
    soloSiNoRespondio: false,
    detenerSiResponde: false,
    pasos: [
      {
        id: "paso_1",
        delay: { valor: 1, unidad: "minutos" },
        mensaje: { tipo: "texto", texto: "seguimiento test ok" },
      },
    ],
  };
  const json = JSON.stringify(config);
  return {
    id: NODO_ID,
    className: "node follow-node node-seguimiento",
    html: `
      <div class="follow-header"><span>⏱️ Seguimiento CRM</span></div>
      <textarea class="seguimiento-data" style="display:none;">${json}</textarea>
    `,
    data: { label: "Seguimiento testseg" },
  };
}

async function buscarActivadorTestseg(usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId) return null;
  const url =
    `${SUPABASE_URL}/rest/v1/activadores?frase=eq.testseg&activo=eq.true` +
    `&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id,frase,flujo_id&limit=1`;
  const res = await axios.get(url, { headers: headers() });
  return res.data?.[0] || null;
}

async function listarSeguimientosCliente(numero, usuarioId) {
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}` +
    "&order=creado_en.desc&limit=10&select=id,estado,run_at,creado_en,enviado_en,mensaje_payload,nodo_id,flujo_id,usuario_id,error_detalle";
  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }
  const res = await axios.get(url, { headers: headers() });
  return res.data || [];
}

async function forzarRunAtPasado(id) {
  const pasado = new Date(Date.now() - 5000).toISOString();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${id}`,
    { run_at: pasado, estado: "pendiente" },
    { headers: { ...headers(), "Content-Type": "application/json", Prefer: "return=minimal" } }
  );
  return pasado;
}

async function main() {
  console.log("=== DIAGNÓSTICO SEGUIMIENTO testseg ===");
  console.log("numero:", NUMERO, "| usuarioId:", USUARIO_ID || "(sin filtro)");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  const nodo = nodoSeguimientoTest();
  const tipo = detectarTipoNodo(nodo);
  console.log("\n--- CAPA 1: detección tipo nodo ---");
  console.log("tipo detectado:", tipo);
  if (tipo !== "seguimiento") {
    console.error("FALLO CAPA 1: no se detectó como seguimiento");
    process.exit(2);
  }

  if (USUARIO_ID) {
    const act = await buscarActivadorTestseg(USUARIO_ID);
    console.log("activador testseg en Supabase:", act || "(no encontrado — crea flujo con frase exacta testseg)");
  }

  console.log("\n--- CAPA 2: programar + insert ---");
  const result = await ejecutarSeguimientoEnFlujo({
    numero: NUMERO,
    usuarioId: USUARIO_ID,
    flujoId: FLUJO_ID,
    nodoId: NODO_ID,
    nodo,
  });

  console.log("resultado programar:", result);

  const filas = await listarSeguimientosCliente(NUMERO, USUARIO_ID);
  console.log("\n--- Filas en seguimientos_programados (últimas 10) ---");
  console.log(JSON.stringify(filas, null, 2));

  const ultima = filas[0];
  if (!ultima) {
    console.error("FALLO CAPA 2: no hay fila en Supabase tras insert");
    process.exit(3);
  }

  console.log("\n--- CAPA 3-4: worker (run_at forzado al pasado para no esperar 1 min) ---");
  if (ultima.estado === "pendiente") {
    const runAt = await forzarRunAtPasado(ultima.id);
    console.log("run_at forzado a:", runAt, "| id:", ultima.id);
  }

  const workerRes = await procesarSeguimientosVencidos(null);
  console.log("worker resultado:", workerRes);

  const filasPost = await listarSeguimientosCliente(NUMERO, USUARIO_ID);
  console.log("\n--- Estado final ---");
  console.log(JSON.stringify(filasPost[0], null, 2));

  console.log("\n=== CHECKLIST A-G (revisa también logs del servidor si corre en paralelo) ===");
  console.log("A) [SEGUIMIENTO_DEBUG] nodo detectado → ver flowService al escribir testseg por WA");
  console.log("B) [SEGUIMIENTO_DEBUG] insert payload → debe haber salido arriba en esta corrida");
  console.log("C) insert error → ver insert result en logs");
  console.log("D) fila en Supabase →", filas.length ? "SÍ id=" + ultima.id : "NO");
  console.log("E) worker pendientes → ver [SEGUIMIENTO_WORKER_DEBUG] pendientes encontrados");
  console.log("F) worker envío → ver [SEGUIMIENTO_WORKER_DEBUG] enviando");
  console.log("G) estado final →", filasPost[0]?.estado, filasPost[0]?.error_detalle || "—");
}

main().catch((err) => {
  console.error("Error diagnóstico:", err.response?.data || err.message);
  process.exit(1);
});
