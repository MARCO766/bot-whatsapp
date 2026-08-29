/**
 * Lista conexiones y flujos del primer usuario activo para probar métricas.
 */
require("dotenv").config();
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

async function main() {
  const users = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?select=id,email&limit=5&order=creado_en.asc`,
    { headers: headers() }
  );
  const user = users.data?.[0];
  if (!user) {
    console.log("No users found");
    return;
  }
  console.log("Usuario:", user.id, user.email);

  const [conexiones, flujos] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${user.id}&select=id,nombre,numero&order=creado_en.asc`,
      { headers: headers() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?usuario_id=eq.${user.id}&select=id,nombre&order=nombre.asc`,
      { headers: headers() }
    ),
  ]);

  console.log("\nConexiones:");
  (conexiones.data || []).forEach((c) =>
    console.log(`  ${c.id}  ${c.nombre || c.numero || "(sin nombre)"}`)
  );

  console.log("\nFlujos:");
  (flujos.data || []).forEach((f) => console.log(`  ${f.id}  ${f.nombre}`));

  const conn = conexiones.data?.[0];
  const flujo = flujos.data?.find((f) =>
    /portavasos|crochet/i.test(f.nombre || "")
  ) || flujos.data?.[0];

  if (conn && flujo) {
    console.log("\n--- Ejecutar prueba ---");
    console.log(
      `node scripts/test-metricas-flujo-filter.js ${user.id} ${conn.id} ${flujo.id} 7d`
    );
  }
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
