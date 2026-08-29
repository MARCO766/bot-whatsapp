/**
 * Batería de pruebas de coherencia métricas por flujo (sin UI).
 */
require("dotenv").config();
const { computeResumen } = require("../services/metricasService");

const USUARIO = "87e61dde-8f67-43e0-9859-634ef6500cd0";
const NUMERO_A = "a258304e-33da-4849-81c4-eb4ec8c71df0";
const NUMERO_B = "6b1963d0-b9a2-4b0e-8601-c95728f40df8";
const PORTAVASOS = "c757e178-ee0a-46c7-b07e-66653213a90a";
const AMIGURUMIS = "4af1b854-18a3-45e7-afa6-54fb23e9c559";

function incoherente(k) {
  if (!k) return true;
  const tieneVentas = (k.ventas || 0) > 0;
  const todoCero =
    (k.leads || 0) === 0 &&
    (k.conversaciones || 0) === 0 &&
    (k.mensajesEnviados || 0) === 0 &&
    (k.respuestas || 0) === 0;
  return tieneVentas && todoCero;
}

async function caso(label, query) {
  const res = await computeResumen(USUARIO, query);
  const k = res.kpis || {};
  const bad = incoherente(k);
  console.log(
    `${bad ? "✗" : "✓"} ${label.padEnd(42)} | L=${String(k.leads).padStart(4)} C=${String(k.conversaciones).padStart(4)} V=${String(k.ventas).padStart(3)} $=${String(k.ingresos).padStart(5)}`
  );
  return bad ? 1 : 0;
}

async function main() {
  const periodo = process.argv[2] || "7d";
  console.log(`Periodo: ${periodo}\n`);

  let fails = 0;
  fails += await caso("NUMERO A + Todos", { periodo, conexion_whatsapp_id: NUMERO_A });
  fails += await caso("NUMERO A + PORTAVASOS", {
    periodo,
    conexion_whatsapp_id: NUMERO_A,
    flujo_id: PORTAVASOS,
  });
  fails += await caso("NUMERO A + AMIGURUMIS", {
    periodo,
    conexion_whatsapp_id: NUMERO_A,
    flujo_id: AMIGURUMIS,
  });
  fails += await caso("NUMERO B + Todos", { periodo, conexion_whatsapp_id: NUMERO_B });
  fails += await caso("Todas las líneas + Todos", { periodo });

  const todosA = await computeResumen(USUARIO, { periodo, conexion_whatsapp_id: NUMERO_A });
  const portA = await computeResumen(USUARIO, {
    periodo,
    conexion_whatsapp_id: NUMERO_A,
    flujo_id: PORTAVASOS,
  });
  if ((portA.kpis?.ventas || 0) > (todosA.kpis?.ventas || 0)) {
    console.log("✗ PORTAVASOS ventas > total NUMERO A");
    fails += 1;
  } else {
    console.log("✓ PORTAVASOS ventas <= total NUMERO A");
  }

  console.log(`\n${fails ? `FALLÓ: ${fails} caso(s)` : "TODOS LOS CASOS OK"}`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
