/**
 * Prueba mínima testseg_fix — Seguimiento CRM 1 min, solo_si_no_respondio=false.
 * node scripts/prueba-testseg-fix.js <numero> <usuarioId> [flujoId-uuid]
 */
require("dotenv").config();

const axios = require("axios");
const { detectarTipoNodo } = require("../services/seguimiento/detectarTipoNodo");
const { ejecutarSeguimientoEnFlujo } = require("../services/seguimiento/ejecutarSeguimientoEnFlujo");
const { cancelarSeguimientosPorRespuesta, mensajeEsRespuestaValida } = require("../services/seguimiento/cancelOnReply");
const { procesarSeguimientosVencidos } = require("../services/seguimiento/executeSeguimiento");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const NUMERO = process.argv[2] || "59165818913";
const USUARIO_ID = process.argv[3] || "87e61dde-8f67-43e0-9859-634ef6500cd0";
const FLUJO_ID = process.argv[4] || "564b49a4-f1e5-4751-9851-05e3e101a6d3";
const NODO_ID = "nodo_testseg_fix";

function headers() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

function nodoTest() {
  const config = {
    version: 2,
    soloSiNoRespondio: false,
    detenerSiResponde: false,
    pasos: [
      {
        id: "paso_1",
        delay: { valor: 1, unidad: "minutos" },
        mensaje: { tipo: "texto", texto: "seguimiento crm funciona" },
      },
    ],
  };
  return {
    id: NODO_ID,
    className: "node follow-node node-seguimiento",
    html: `<textarea class="seguimiento-data">${JSON.stringify(config)}</textarea>`,
  };
}

async function main() {
  console.log("=== PRUEBA testseg_fix ===");

  const nodo = nodoTest();
  if (detectarTipoNodo(nodo) !== "seguimiento") {
    throw new Error("Nodo no detectado como seguimiento");
  }

  const activadorTs = new Date(Date.now() - 5000).toISOString();

  const result = await ejecutarSeguimientoEnFlujo({
    numero: NUMERO,
    usuarioId: USUARIO_ID,
    flujoId: FLUJO_ID,
    nodoId: NODO_ID,
    nodo,
  });

  const row = result.items?.[0];
  if (!row) throw new Error("No se insertó fila");

  const ignoraActivador = !mensajeEsRespuestaValida(activadorTs, row);
  console.log("activador ignorado:", ignoraActivador ? "SÍ" : "NO");

  await cancelarSeguimientosPorRespuesta(NUMERO, USUARIO_ID, null, {
    mensajeAt: activadorTs,
  });

  const postCancel = (
    await axios.get(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${row.id}&select=estado,error_detalle`,
      { headers: headers() }
    )
  ).data[0];

  if (postCancel.estado !== "pendiente") {
    throw new Error(`Tras activador quedó ${postCancel.estado}: ${postCancel.error_detalle}`);
  }

  const pasado = new Date(Date.now() - 3000).toISOString();
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${row.id}`,
    { run_at: pasado },
    { headers: { ...headers(), "Content-Type": "application/json" } }
  );

  const worker = await procesarSeguimientosVencidos(null);
  const final = (
    await axios.get(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${row.id}&select=estado,enviado_en,error_detalle,campana_id`,
      { headers: headers() }
    )
  ).data[0];

  console.log("worker:", worker);
  console.log("estado final:", final);

  if (final.estado !== "enviado") {
    throw new Error(`Esperado enviado, obtuvo ${final.estado}: ${final.error_detalle}`);
  }

  console.log("OK — testseg_fix pasó: insert → pendiente → enviado");
}

main().catch((e) => {
  console.error("FALLO:", e.message);
  process.exit(1);
});
