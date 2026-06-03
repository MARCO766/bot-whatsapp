/**
 * Consulta seguimientos_programados y mensajes recientes de un lead.
 * node scripts/diagnostico-seguimientos-cliente.js [cliente_numero]
 */
require("dotenv").config();

const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CLIENTE = process.argv[2] || "59165818913";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  const segRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(CLIENTE)}&order=creado_en.desc&limit=20&select=id,cliente_numero,conexion_whatsapp_id,estado,run_at,creado_en,campana_id,paso_index,mensaje_payload`,
    { headers: headers() }
  );

  console.log("=== seguimientos_programados (últimos 20) ===");
  console.log(JSON.stringify(segRes.data || [], null, 2));

  const msgRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(CLIENTE)}&direccion=eq.saliente&order=creado_en.desc&limit=15&select=cliente_numero,direccion,contenido,conexion_whatsapp_id,creado_en`,
    { headers: headers() }
  );

  console.log("\n=== mensajes salientes (últimos 15) ===");
  console.log(JSON.stringify(msgRes.data || [], null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
