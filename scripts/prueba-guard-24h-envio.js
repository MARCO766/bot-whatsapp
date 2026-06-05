/**
 * Prueba envío real vía enviarTextoWhatsApp() + guard 24h (terminal).
 *
 * node scripts/prueba-guard-24h-envio.js
 * node scripts/prueba-guard-24h-envio.js --numero=59176187797 --conexion=UUID --texto="Hola"
 */
require("dotenv").config();

const axios = require("axios");
const { enviarTextoWhatsApp } = require("../services/whatsappService");
const {
  validarVentana24hAntesDeEnviar,
  esWa24hGuardBlockError,
  obtenerModoGuard,
} = require("../services/whatsapp24hGuard");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const DEFAULTS = {
  numero: "59176187797",
  conexion: "6b1963d0-b9a2-4b0e-8601-c95728f40df8",
  texto: "PRUEBA GUARD 24H",
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (const arg of argv.slice(2)) {
    const m = String(arg).match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

async function resolverUsuarioDesdeConexion(conexionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}` +
      `&select=id,usuario_id,nombre,activo&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

function esUrlPostMeta(url) {
  const u = String(url || "");
  return u.includes("graph.facebook.com") && u.includes("/messages");
}

async function main() {
  const { numero, conexion, texto } = parseArgs(process.argv);
  const modo = obtenerModoGuard();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  const conexionRow = await resolverUsuarioDesdeConexion(conexion);
  if (!conexionRow?.usuario_id) {
    console.error("Conexión no encontrada:", conexion);
    process.exit(1);
  }

  const usuarioId = String(conexionRow.usuario_id).trim();

  console.log("=== PRUEBA GUARD 24H — enviarTextoWhatsApp ===");
  console.log({
    VENTANA24H_GUARD_MODE: modo,
    numero,
    conexion,
    conexion_nombre: conexionRow.nombre || null,
    usuarioId,
    texto,
  });

  const guard = await validarVentana24hAntesDeEnviar({
    usuarioId,
    clienteNumero: numero,
    conexionWhatsappId: conexion,
    origen: "prueba_guard_terminal",
    esPlantilla: false,
  });

  console.log("\n--- 1) Guard ---");
  console.log("accion:", guard.accion);
  console.log("horas_desde_ultima_interaccion:", guard.horas_desde_ultima_interaccion);
  console.log("ultima_interaccion:", guard.ultima_interaccion);

  let metaPostRealizado = false;
  let metaPostUrl = null;
  const originalPost = axios.post.bind(axios);

  axios.post = async function patchedPost(url, ...rest) {
    if (esUrlPostMeta(url)) {
      metaPostRealizado = true;
      metaPostUrl = String(url);
      console.log("\n--- 3) POST Meta ---");
      console.log("url:", metaPostUrl);
    }
    return originalPost(url, ...rest);
  };

  let bloqueadoPorGuard = false;
  let envioOk = false;
  let errorMsg = null;

  try {
    const result = await enviarTextoWhatsApp(numero, texto, {
      usuarioId,
      conexionWhatsappId: conexion,
      origen: "prueba_guard_terminal",
      _soloEnvioMeta: true,
    });
    envioOk = Boolean(result?.messages?.[0]?.id || result);
  } catch (err) {
    if (esWa24hGuardBlockError(err)) {
      bloqueadoPorGuard = true;
      errorMsg = err.message;
    } else {
      errorMsg = err.response?.data?.error?.message || err.message;
    }
  } finally {
    axios.post = originalPost;
  }

  console.log("\n--- 2) Bloqueo (mode=block) ---");
  if (modo === "block" && bloqueadoPorGuard) {
    console.log("SI — el guard bloqueó el envío (WA_24H_GUARD_BLOCK)");
    console.log("detalle:", errorMsg);
  } else if (modo === "block" && guard.accion === "WOULD_BLOCK" && !bloqueadoPorGuard) {
    console.log("NO — mode=block pero no se lanzó WA_24H_GUARD_BLOCK (revisar guard)");
  } else if (modo === "log_only" && guard.accion === "WOULD_BLOCK") {
    console.log("NO — mode=log_only (solo observación; WOULD_BLOCK no bloquea)");
  } else {
    console.log("NO — guard permitió continuar hacia Meta");
  }

  if (!metaPostRealizado) {
    console.log("\n--- 3) POST Meta ---");
    console.log("NO — no se llegó al POST de Meta");
  } else if (envioOk) {
    console.log("resultado Meta: OK");
  } else if (!bloqueadoPorGuard) {
    console.log("resultado Meta: POST ejecutado pero respuesta con error");
    if (errorMsg) console.log("error:", errorMsg);
  }

  console.log("\n=== RESUMEN ===");
  console.log({
    guard_accion: guard.accion,
    mode: modo,
    bloqueado_por_guard: bloqueadoPorGuard,
    post_meta: metaPostRealizado,
    envio_ok: envioOk,
  });

  if (bloqueadoPorGuard || (modo === "log_only" && guard.accion === "WOULD_BLOCK" && !envioOk && errorMsg)) {
    process.exitCode = bloqueadoPorGuard ? 2 : 1;
  }
}

main().catch((err) => {
  console.error(err.response?.data || err.message || err);
  process.exit(1);
});
