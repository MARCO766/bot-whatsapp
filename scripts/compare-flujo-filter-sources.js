/**
 * Compara filtro flujo: solo seguimientos (viejo) vs union (nuevo).
 */
require("dotenv").config();
const axios = require("axios");
const { computeResumen } = require("../services/metricasService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const headers = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });

async function seguimientosOnlyNumeros(usuarioId, flujoId, conexionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?usuario_id=eq.${usuarioId}&flujo_id=eq.${flujoId}&conexion_whatsapp_id=eq.${conexionId}&select=cliente_numero`,
    { headers: headers() }
  );
  return new Set((res.data || []).map((r) => r.cliente_numero).filter(Boolean));
}

async function main() {
  const usuarioId = "87e61dde-8f67-43e0-9859-634ef6500cd0";
  const conexionId = "a258304e-33da-4849-81c4-eb4ec8c71df0";
  const flujoId = "c757e178-ee0a-46c7-b07e-66653213a90a";

  for (const periodo of ["7d", "30d", "90d"]) {
    const q = { periodo, conexion_whatsapp_id: conexionId, flujo_id: flujoId };
    const res = await computeResumen(usuarioId, q);
    const k = res.kpis;
    console.log(`\n[${periodo}] PORTAVASOS — leads=${k.leads} conv=${k.conversaciones} ventas=${k.ventas} ingresos=${k.ingresos}`);
  }

  const segOnly = await seguimientosOnlyNumeros(usuarioId, flujoId, conexionId);
  console.log(`\nClientes solo-seguimientos: ${segOnly.size}`);

  const [convRows, iaRows] = await Promise.all([
    axios.get(
      `${SUPABASE_URL}/rest/v1/crm_conversiones?usuario_id=eq.${usuarioId}&flujo_id=eq.${flujoId}&conexion_whatsapp_id=eq.${conexionId}&select=cliente_numero`,
      { headers: headers() }
    ),
    axios.get(
      `${SUPABASE_URL}/rest/v1/ia_sessions?usuario_id=eq.${usuarioId}&flujo_id=eq.${flujoId}&conexion_whatsapp_id=eq.${conexionId}&select=cliente_numero`,
      { headers: headers() }
    ),
  ]);

  const convSet = new Set((convRows.data || []).map((r) => r.cliente_numero));
  const iaSet = new Set((iaRows.data || []).map((r) => r.cliente_numero));
  console.log(`Clientes solo-conversiones: ${convSet.size}`);
  console.log(`Clientes solo-ia_sessions: ${iaSet.size}`);
  console.log(`En conversiones pero NO en seguimientos: ${[...convSet].filter((n) => !segOnly.has(n)).length}`);
  console.log(`En ia_sessions pero NO en seguimientos: ${[...iaSet].filter((n) => !segOnly.has(n)).length}`);
}

main().catch(console.error);
