/**
 * Verifica coherencia entre todos los endpoints de métricas con filtro de flujo.
 */
require("dotenv").config();
const {
  computeResumen,
  computeFunnel,
  computeSeries,
  computeDiagnostico,
  computeRevenueBreakdown,
} = require("../services/metricasService");

const USUARIO = "87e61dde-8f67-43e0-9859-634ef6500cd0";
const NUMERO_A = "a258304e-33da-4849-81c4-eb4ec8c71df0";
const PORTAVASOS = "c757e178-ee0a-46c7-b07e-66653213a90a";

async function main() {
  const query = {
    periodo: "7d",
    conexion_whatsapp_id: NUMERO_A,
    flujo_id: PORTAVASOS,
  };

  const [resumen, funnel, series, diagnostico, revenue] = await Promise.all([
    computeResumen(USUARIO, query),
    computeFunnel(USUARIO, query),
    computeSeries(USUARIO, query),
    computeDiagnostico(USUARIO, query),
    computeRevenueBreakdown(USUARIO, query),
  ]);

  const k = resumen.kpis;
  const funnelVentas = funnel.etapas?.find((e) => e.nombre === "Ventas")?.cantidad;
  const seriesVentas = (series.diario || []).reduce((s, d) => s + (d.ventas || 0), 0);
  const bobRevenue = revenue.porMoneda?.BOB?.kpis?.totalCantidad;

  console.log("=== Endpoints PORTAVASOS / NUMERO A / 7d ===");
  console.log(`resumen.leads:          ${k.leads}`);
  console.log(`resumen.conversaciones: ${k.conversaciones}`);
  console.log(`resumen.ventas:         ${k.ventas}`);
  console.log(`resumen.ingresos:       ${k.ingresos}`);
  console.log(`funnel.ventas:          ${funnelVentas}`);
  console.log(`series.ventas (sum):    ${seriesVentas}`);
  console.log(`revenue BOB cantidad:   ${bobRevenue}`);
  console.log(`diagnostico items:      ${diagnostico.items?.length}`);

  const ok =
    k.ventas > 0 &&
    k.conversaciones > 0 &&
    funnelVentas === k.ventas &&
    seriesVentas === k.ventas;

  console.log(ok ? "\n✓ Endpoints coherentes" : "\n✗ Incoherencia entre endpoints");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
