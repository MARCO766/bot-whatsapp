/**
 * Simula la ventana 24h ajustando creado_en del último mensaje entrante del lead.
 *
 * Uso:
 *   node scripts/simular-ventana-24h.js --numero=591XXXXXXXX --conexion=UUID --horas=25
 *   node scripts/simular-ventana-24h.js --numero=591XXXXXXXX --conexion=UUID --horas=1
 */
require("dotenv").config();

const axios = require("axios");
const {
  validarVentana24hAntesDeEnviar,
  parseTimestamptzUtc,
  horasDesdeUtc,
} = require("../services/whatsapp24hGuard");
const { toTimestamptzUtc, nowUtc } = require("../services/seguimiento/timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = String(arg).match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function redondearHoras(horas) {
  if (horas == null || Number.isNaN(horas)) return null;
  return Math.round(horas * 100) / 100;
}

function calcularCreadoSimuladoUtc(horas) {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

function aIsoUtcLegible(valor) {
  const ts = parseTimestamptzUtc(valor);
  return ts == null ? null : new Date(ts).toISOString();
}

async function resolverUsuarioDesdeConexion(conexionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionId)}` +
      `&select=id,usuario_id,nombre&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function obtenerUltimoEntrante(usuarioId, numero, conexionId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
      `&cliente_numero=eq.${encodeURIComponent(numero)}` +
      `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionId)}` +
      `&direccion=eq.entrante` +
      `&select=id,creado_en,contenido` +
      `&order=creado_en.desc` +
      `&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function obtenerMensajePorId(id) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/mensajes?id=eq.${encodeURIComponent(id)}` +
      `&select=id,creado_en&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

async function patchCreadoEn(mensajeId, creadoEnIso) {
  const res = await axios.patch(
    `${SUPABASE_URL}/rest/v1/mensajes?id=eq.${encodeURIComponent(mensajeId)}`,
    { creado_en: toTimestamptzUtc(creadoEnIso) },
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }) }
  );
  return res.data?.[0] || null;
}

async function main() {
  const args = parseArgs(process.argv);
  const numero = String(args.numero || "").trim();
  const conexion = String(args.conexion || "").trim();
  const horas = Number(args.horas);

  if (!numero || !conexion || !Number.isFinite(horas) || horas < 0) {
    console.error(
      "Uso: node scripts/simular-ventana-24h.js --numero=591XXXXXXXX --conexion=UUID --horas=25"
    );
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exit(1);
  }

  const conexionRow = await resolverUsuarioDesdeConexion(conexion);
  if (!conexionRow?.usuario_id) {
    console.error("No se encontró conexion_whatsapp_id o falta usuario_id:", conexion);
    process.exit(1);
  }

  const usuarioId = String(conexionRow.usuario_id).trim();
  const ultimo = await obtenerUltimoEntrante(usuarioId, numero, conexion);

  if (!ultimo?.id) {
    console.error("No hay mensaje entrante para este lead/línea. Envía un mensaje entrante primero.");
    console.error({ usuarioId, numero, conexion });
    process.exit(1);
  }

  const nowUtcVal = nowUtc();
  const creadoSimuladoUtc = calcularCreadoSimuladoUtc(horas);
  const creadoAnterior = ultimo.creado_en;

  await patchCreadoEn(ultimo.id, creadoSimuladoUtc);

  const patchedRow = (await obtenerMensajePorId(ultimo.id)) || ultimo;
  const ultimoEfectivo = await obtenerUltimoEntrante(usuarioId, numero, conexion);
  const creadoEnDb = patchedRow?.creado_en ?? null;
  const creadoLeidoUtc = aIsoUtcLegible(creadoEnDb);
  const diffHoras = redondearHoras(horasDesdeUtc(creadoEnDb));

  console.log("=== simular-ventana-24h ===");
  console.log({
    mensaje_id: ultimo.id,
    conexion_nombre: conexionRow.nombre || null,
    usuarioId,
    numero,
    conexion,
    creado_en_anterior: creadoAnterior,
    now_utc: nowUtcVal,
    creado_simulado_utc: creadoSimuladoUtc,
    creado_en_db_raw: creadoEnDb,
    creado_leido_utc: creadoLeidoUtc,
    diff_horas: diffHoras,
    horas_solicitadas: horas,
    ultimo_efectivo_guard_id: ultimoEfectivo?.id ?? null,
    ultimo_efectivo_guard_creado_en: ultimoEfectivo?.creado_en ?? null,
    ultimo_efectivo_es_el_parcheado: ultimoEfectivo?.id === ultimo.id,
  });

  if (ultimoEfectivo?.id && ultimoEfectivo.id !== ultimo.id) {
    console.warn(
      `WARN: el guard usará otro entrante (${ultimoEfectivo.id}) más reciente que el parcheado (${ultimo.id}). ` +
        "Para probar con --horas=N hace falta que el último entrante sea el único reciente en esa línea."
    );
  }

  if (diffHoras == null) {
    console.warn("WARN: no se pudo calcular diff_horas — revisar creado_en en DB");
  } else if (Math.abs(diffHoras - horas) > 0.25) {
    console.warn(
      `WARN: diff_horas (${diffHoras}) no coincide con horas solicitadas (${horas}). ` +
        "¿RLS/trigger impide PATCH de creado_en?"
    );
  }

  const resultado = await validarVentana24hAntesDeEnviar({
    usuarioId,
    clienteNumero: numero,
    conexionWhatsappId: conexion,
    origen: "simulacion_script",
    esPlantilla: false,
  });

  console.log("\n=== resultado guard ===");
  console.log(resultado);

  const esperado = horas > 24 ? "WOULD_BLOCK" : "ALLOW";
  const ok = resultado.accion === esperado;
  console.log(
    `\nEsperado: horas=${horas} → ${esperado}${ok ? " ✓" : " ✗ (revisar logs arriba)"}`
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.response?.data || err.message || err);
  process.exit(1);
});
