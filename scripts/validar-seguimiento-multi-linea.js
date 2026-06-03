/**
 * Valida mensajes y seguimientos por línea (TESTA / TESTB u otro cliente).
 *
 * Uso:
 *   node scripts/validar-seguimiento-multi-linea.js --cliente=5491111111111
 *   node scripts/validar-seguimiento-multi-linea.js --cliente=5491111111111 --usuario=UUID
 */
require("dotenv").config();
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const args = process.argv.slice(2);
const cliente =
  args.find((a) => a.startsWith("--cliente="))?.split("=")[1] ||
  process.env.VALIDAR_CLIENTE ||
  "";
const usuarioId =
  args.find((a) => a.startsWith("--usuario="))?.split("=")[1] ||
  process.env.VALIDAR_USUARIO_ID ||
  "";

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function fallo(msg) {
  console.error("❌", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("✅", msg);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Falta SUPABASE_URL o SUPABASE_SECRET_KEY");
    return;
  }
  if (!cliente) {
    fallo("Indica --cliente=NUMERO (mismo para TESTA y TESTB en líneas distintas)");
    return;
  }

  let urlMsg =
    `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(cliente)}` +
    `&order=creado_en.desc&limit=30&select=id,contenido,conexion_whatsapp_id,seguimiento_id,direccion,creado_en`;
  if (usuarioId) urlMsg += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;

  const msgRes = await axios.get(urlMsg, { headers: headers() });
  const mensajes = msgRes.data || [];

  let urlSeg =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(cliente)}` +
    `&order=creado_en.desc&limit=20&select=id,estado,conexion_whatsapp_id,paso_index,mensaje_payload,campana_id,enviado_en`;
  if (usuarioId) urlSeg += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;

  const segRes = await axios.get(urlSeg, { headers: headers() });
  const seguimientos = segRes.data || [];

  console.log("\n=== MENSAJES (últimos 30) ===");
  for (const m of mensajes) {
    const conn = m.conexion_whatsapp_id ?? "NULL";
    const seg = m.seguimiento_id ?? "-";
    console.log(`  [${m.direccion}] ${String(m.contenido || "").slice(0, 40)} | conexion=${conn} | seg_id=${seg}`);
    if (m.seguimiento_id && !m.conexion_whatsapp_id) {
      fallo(`Mensaje seguimiento sin conexion_whatsapp_id id=${m.id}`);
    }
  }

  const segIds = new Set();
  for (const m of mensajes) {
    if (!m.seguimiento_id) continue;
    if (segIds.has(m.seguimiento_id)) {
      fallo(`Duplicado mensajes.seguimiento_id=${m.seguimiento_id}`);
    }
    segIds.add(m.seguimiento_id);
  }
  if (segIds.size) ok(`Sin duplicados por seguimiento_id (${segIds.size} únicos)`);

  console.log("\n=== SEGUIMIENTOS_PROGRAMADOS ===");
  for (const s of seguimientos) {
    const conn = s.conexion_whatsapp_id ?? "NULL";
    const texto = (s.mensaje_payload?.texto || s.mensaje_payload?.caption || "").slice(0, 30);
    console.log(`  paso=${s.paso_index} estado=${s.estado} conexion=${conn} | ${texto}`);
    if (!s.conexion_whatsapp_id) {
      fallo(`Seguimiento sin conexion id=${s.id} estado=${s.estado}`);
    }
  }

  const porConexion = {};
  for (const s of seguimientos.filter((x) => x.estado === "enviado")) {
    const c = s.conexion_whatsapp_id;
    porConexion[c] = (porConexion[c] || 0) + 1;
  }
  console.log("\nEnviados por conexion_whatsapp_id:", porConexion);

  const nullConnMsgs = mensajes.filter((m) => !m.conexion_whatsapp_id);
  if (nullConnMsgs.length) {
    fallo(`${nullConnMsgs.length} mensaje(s) con conexion_whatsapp_id NULL`);
  } else {
    ok("Ningún mensaje con conexion NULL en la muestra");
  }

  console.log("\n=== FIN ===\n");
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
