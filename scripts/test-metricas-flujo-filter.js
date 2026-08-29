/**
 * Prueba local de coherencia del filtro flujo_id en métricas.
 * Uso: node scripts/test-metricas-flujo-filter.js <usuario_id> <conexion_id> <flujo_id> [periodo]
 *
 * Compara /api/metricas/resumen con y sin flujo_id para detectar KPIs incoherentes
 * (p. ej. ventas > 0 pero leads = 0 con el mismo filtro).
 */
require("dotenv").config();

const {
  computeResumen,
  fetchFlujoClienteNumeros,
} = require("../services/metricasService");

async function main() {
  const [usuarioId, conexionId, flujoId, periodo = "7d"] = process.argv.slice(2);
  if (!usuarioId || !conexionId || !flujoId) {
    console.error(
      "Uso: node scripts/test-metricas-flujo-filter.js <usuario_id> <conexion_id> <flujo_id> [periodo]"
    );
    process.exit(1);
  }

  const baseQuery = { periodo, conexion_whatsapp_id: conexionId };
  const flujoQuery = { ...baseQuery, flujo_id: flujoId };

  const [todos, filtrado, numerosFlujo] = await Promise.all([
    computeResumen(usuarioId, baseQuery),
    computeResumen(usuarioId, flujoQuery),
    fetchFlujoClienteNumeros(usuarioId, flujoId, conexionId),
  ]);

  const kTodos = todos.kpis || {};
  const kFlujo = filtrado.kpis || {};

  console.log("\n=== Métricas flujo — diagnóstico ===");
  console.log(`Periodo: ${periodo}`);
  console.log(`Conexión: ${conexionId}`);
  console.log(`Flujo: ${flujoId}`);
  console.log(`Clientes asociados al flujo (union): ${numerosFlujo.length}`);

  const rows = [
    ["KPI", "Todos los flujos", "Flujo específico"],
    ["Leads", kTodos.leads, kFlujo.leads],
    ["Conversaciones", kTodos.conversaciones, kFlujo.conversaciones],
    ["Mensajes enviados", kTodos.mensajesEnviados, kFlujo.mensajesEnviados],
    ["Respuestas", kTodos.respuestas, kFlujo.respuestas],
    ["Ventas", kTodos.ventas, kFlujo.ventas],
    ["Ingresos", kTodos.ingresos, kFlujo.ingresos],
  ];

  rows.forEach((r) => console.log(`${r[0].padEnd(18)} | ${String(r[1]).padStart(8)} | ${String(r[2]).padStart(8)}`));

  const incoherente =
    kFlujo.ventas > 0 &&
    kFlujo.leads === 0 &&
    kFlujo.conversaciones === 0 &&
    kFlujo.mensajesEnviados === 0;

  if (incoherente) {
    console.error(
      "\n✗ INCOHERENTE: hay ventas con flujo pero leads/conversaciones/mensajes en 0."
    );
    process.exit(2);
  }

  if (kFlujo.ventas > kTodos.ventas) {
    console.error("\n✗ INCOHERENTE: ventas del flujo superan el total sin filtro.");
    process.exit(3);
  }

  console.log("\n✓ Sin incoherencias obvias en resumen.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
