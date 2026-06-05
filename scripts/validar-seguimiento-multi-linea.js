/**
 * Diagnóstico Seguimiento CRM multi-línea (solo reporte, sin corrección automática).
 *
 * Uso:
 *   node scripts/validar-seguimiento-multi-linea.js
 *   node scripts/validar-seguimiento-multi-linea.js --cliente=5491111111111
 *   node scripts/validar-seguimiento-multi-linea.js --cliente=5491111111111 --usuario=UUID
 *   node scripts/validar-seguimiento-multi-linea.js --usuario=UUID
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

const LIMITE_SEG = 200;
const LIMITE_MSG = 300;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normConn(val) {
  if (val == null || String(val).trim() === "") return null;
  return String(val).trim();
}

function tripleKey(usuario, numero, conexion) {
  return [usuario || "", numero || "", conexion || ""].join("|");
}

function aviso(msg) {
  console.warn("⚠️ ", msg);
}

function fallo(msg) {
  console.error("❌", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("✅", msg);
}

function info(msg) {
  console.log("ℹ️ ", msg);
}

function filtrosBase(entidad) {
  const partes = [];
  if (usuarioId) partes.push(`usuario_id=eq.${encodeURIComponent(usuarioId)}`);
  if (cliente) partes.push(`cliente_numero=eq.${encodeURIComponent(cliente)}`);
  return partes.length ? `${partes.join("&")}&` : "";
}

async function fetchJson(url) {
  const res = await axios.get(url, { headers: headers() });
  return res.data || [];
}

async function comprobarColumnaSeguimiento() {
  const url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?select=id,conexion_whatsapp_id&limit=1`;
  try {
    await axios.get(url, { headers: headers() });
    ok("Columna seguimientos_programados.conexion_whatsapp_id accesible");
    return true;
  } catch (err) {
    const msg = err.response?.data?.message || err.message || "";
    if (String(msg).includes("conexion_whatsapp_id")) {
      fallo(
        "Columna seguimientos_programados.conexion_whatsapp_id ausente — ejecuta supabase/migrations/add_conexion_whatsapp_id_seguimientos_programados.sql"
      );
      return false;
    }
    throw err;
  }
}

async function cargarSeguimientosSinConexion() {
  const url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?${filtrosBase()}conexion_whatsapp_id=is.null` +
    `&select=id,estado,cliente_numero,usuario_id,flujo_id,nodo_id,paso_index,creado_en,enviado_en` +
    `&order=creado_en.desc&limit=${LIMITE_SEG}`;
  return fetchJson(url);
}

async function cargarMensajesSeguimientoSinConexion() {
  const url =
    `${SUPABASE_URL}/rest/v1/mensajes?${filtrosBase()}seguimiento_id=not.is.null&conexion_whatsapp_id=is.null` +
    `&select=id,seguimiento_id,cliente_numero,usuario_id,contenido,direccion,creado_en` +
    `&order=creado_en.desc&limit=${LIMITE_MSG}`;
  return fetchJson(url);
}

async function cargarSeguimientosEnviados() {
  const url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?${filtrosBase()}estado=eq.enviado` +
    `&select=id,cliente_numero,usuario_id,conexion_whatsapp_id,paso_index,enviado_en,campana_id` +
    `&order=enviado_en.desc&limit=${LIMITE_SEG}`;
  return fetchJson(url);
}

async function cargarMensajesConSeguimientoId() {
  const url =
    `${SUPABASE_URL}/rest/v1/mensajes?${filtrosBase()}seguimiento_id=not.is.null` +
    `&select=id,seguimiento_id,cliente_numero,usuario_id,conexion_whatsapp_id,contenido,direccion,creado_en` +
    `&order=creado_en.desc&limit=${LIMITE_MSG}`;
  return fetchJson(url);
}

async function cargarSeguimientosPorIds(ids) {
  if (!ids.length) return [];
  const lista = ids.map((id) => encodeURIComponent(id)).join(",");
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=in.(${lista})` +
    `&select=id,cliente_numero,usuario_id,conexion_whatsapp_id,estado,paso_index`;
  if (usuarioId) url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  return fetchJson(url);
}

function reportarSeguimientosSinConexion(filas) {
  console.log("\n=== 1) SEGUIMIENTOS SIN conexion_whatsapp_id ===");
  if (!filas.length) {
    ok("Ningún seguimiento con conexion_whatsapp_id NULL en el alcance");
    return;
  }

  fallo(`${filas.length} seguimiento(s) con conexion_whatsapp_id NULL (máx ${LIMITE_SEG})`);
  for (const s of filas) {
    console.log(
      `  id=${s.id} estado=${s.estado} cliente=${s.cliente_numero} usuario=${s.usuario_id ?? "NULL"} ` +
        `flujo=${s.flujo_id ?? "NULL"} nodo=${s.nodo_id} paso=${s.paso_index} creado=${s.creado_en}`
    );
  }
}

function reportarMensajesSeguimientoSinConexion(filas) {
  console.log("\n=== 2) MENSAJES DE SEGUIMIENTO SIN conexion_whatsapp_id ===");
  if (!filas.length) {
    ok("Ningún mensaje con seguimiento_id y conexion_whatsapp_id NULL");
    return;
  }

  fallo(`${filas.length} mensaje(s) de seguimiento sin conexion_whatsapp_id (máx ${LIMITE_MSG})`);
  for (const m of filas) {
    console.log(
      `  id=${m.id} seguimiento_id=${m.seguimiento_id} cliente=${m.cliente_numero} ` +
        `[${m.direccion}] ${String(m.contenido || "").slice(0, 40)} creado=${m.creado_en}`
    );
  }
}

function reportarEnviadosPorTriple(filas) {
  console.log("\n=== 3) SEGUIMIENTOS ENVIADOS por cliente_numero + conexion_whatsapp_id ===");
  if (!filas.length) {
    aviso("Sin seguimientos en estado enviado en el alcance");
    return;
  }

  const grupos = {};
  for (const s of filas) {
    const key = tripleKey(s.usuario_id, s.cliente_numero, s.conexion_whatsapp_id);
    if (!grupos[key]) {
      grupos[key] = {
        usuario_id: s.usuario_id ?? null,
        cliente_numero: s.cliente_numero,
        conexion_whatsapp_id: s.conexion_whatsapp_id ?? null,
        total: 0,
      };
    }
    grupos[key].total += 1;
  }

  const ordenados = Object.values(grupos).sort((a, b) => b.total - a.total);
  for (const g of ordenados) {
    const conn = g.conexion_whatsapp_id ?? "NULL";
    console.log(
      `  cliente=${g.cliente_numero} conexion=${conn} usuario=${g.usuario_id ?? "NULL"} → ${g.total} enviado(s)`
    );
    if (!g.conexion_whatsapp_id) {
      fallo(`Enviados agrupados con conexion NULL para cliente=${g.cliente_numero}`);
    }
  }

  if (ordenados.length > 1 && cliente) {
    info(
      `Cliente ${cliente} tiene seguimientos enviados en ${ordenados.length} combinación(es) línea/distinta`
    );
  }
}

function reportarCruceConexionMensajeSeguimiento(mensajes, seguimientosMap) {
  console.log("\n=== 4) CRUCE mensaje.seguimiento_id vs seguimiento.conexion_whatsapp_id ===");

  const duplicados = new Set();
  const cruces = [];

  for (const m of mensajes) {
    const segId = m.seguimiento_id != null ? String(m.seguimiento_id).trim() : "";
    if (!segId) continue;

    if (duplicados.has(segId)) {
      fallo(`Duplicado mensajes.seguimiento_id=${segId}`);
    }
    duplicados.add(segId);

    const seg = seguimientosMap.get(segId);
    if (!seg) {
      cruces.push({
        tipo: "seguimiento_no_encontrado",
        mensaje_id: m.id,
        seguimiento_id: segId,
        msg_conn: normConn(m.conexion_whatsapp_id),
        cliente: m.cliente_numero,
      });
      continue;
    }

    const msgConn = normConn(m.conexion_whatsapp_id);
    const segConn = normConn(seg.conexion_whatsapp_id);

    if (msgConn && segConn && msgConn !== segConn) {
      cruces.push({
        tipo: "conexion_distinta",
        mensaje_id: m.id,
        seguimiento_id: segId,
        msg_conn: msgConn,
        seg_conn: segConn,
        cliente: m.cliente_numero,
        seg_estado: seg.estado,
      });
    }

    if (!msgConn && segConn) {
      cruces.push({
        tipo: "mensaje_sin_conexion_seg_si",
        mensaje_id: m.id,
        seguimiento_id: segId,
        seg_conn: segConn,
        cliente: m.cliente_numero,
      });
    }

    if (msgConn && !segConn) {
      cruces.push({
        tipo: "seguimiento_sin_conexion_msg_si",
        mensaje_id: m.id,
        seguimiento_id: segId,
        msg_conn: msgConn,
        cliente: m.cliente_numero,
      });
    }
  }

  if (!cruces.length) {
    ok("Todas las parejas mensaje↔seguimiento coinciden en conexion_whatsapp_id (o ambas NULL)");
    return;
  }

  fallo(`${cruces.length} inconsistencia(s) mensaje↔seguimiento`);
  for (const c of cruces) {
    if (c.tipo === "conexion_distinta") {
      console.log(
        `  CRUCE id=${c.mensaje_id} seg=${c.seguimiento_id} cliente=${c.cliente} ` +
          `mensaje_conn=${c.msg_conn} seguimiento_conn=${c.seg_conn} estado_seg=${c.seg_estado}`
      );
    } else if (c.tipo === "seguimiento_no_encontrado") {
      console.log(
        `  HUÉRFANO id=${c.mensaje_id} seg=${c.seguimiento_id} cliente=${c.cliente} ` +
          `mensaje_conn=${c.msg_conn ?? "NULL"} (seguimiento no cargado)`
      );
    } else if (c.tipo === "mensaje_sin_conexion_seg_si") {
      console.log(
        `  MSG_SIN_CONN id=${c.mensaje_id} seg=${c.seguimiento_id} cliente=${c.cliente} ` +
          `seguimiento_conn=${c.seg_conn}`
      );
    } else if (c.tipo === "seguimiento_sin_conexion_msg_si") {
      console.log(
        `  SEG_SIN_CONN id=${c.mensaje_id} seg=${c.seguimiento_id} cliente=${c.cliente} ` +
          `mensaje_conn=${c.msg_conn}`
      );
    }
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fallo("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    return;
  }

  console.log("\n========================================");
  console.log(" DIAGNÓSTICO SEGUIMIENTO CRM MULTI-LÍNEA");
  console.log("========================================");
  console.log(`Alcance: cliente=${cliente || "(todos)"} usuario=${usuarioId || "(todos)"}`);
  console.log("(Solo reporte — no se modifican datos)\n");

  const columnaOk = await comprobarColumnaSeguimiento();
  if (!columnaOk) return;

  const [
    segSinConn,
    msgSegSinConn,
    segEnviados,
    mensajesSeg,
  ] = await Promise.all([
    cargarSeguimientosSinConexion(),
    cargarMensajesSeguimientoSinConexion(),
    cargarSeguimientosEnviados(),
    cargarMensajesConSeguimientoId(),
  ]);

  reportarSeguimientosSinConexion(segSinConn);
  reportarMensajesSeguimientoSinConexion(msgSegSinConn);
  reportarEnviadosPorTriple(segEnviados);

  const segIds = [
    ...new Set(
      mensajesSeg
        .map((m) => (m.seguimiento_id != null ? String(m.seguimiento_id).trim() : ""))
        .filter(Boolean)
    ),
  ];
  const segRows = await cargarSeguimientosPorIds(segIds);
  const segMap = new Map(segRows.map((s) => [String(s.id), s]));

  reportarCruceConexionMensajeSeguimiento(mensajesSeg, segMap);

  console.log("\n=== RESUMEN ===");
  console.log(`  Seguimientos sin conexión: ${segSinConn.length}`);
  console.log(`  Mensajes seguimiento sin conexión: ${msgSegSinConn.length}`);
  console.log(`  Seguimientos enviados (muestra): ${segEnviados.length}`);
  console.log(`  Mensajes con seguimiento_id (muestra): ${mensajesSeg.length}`);

  if (process.exitCode) {
    console.log("\n❌ Diagnóstico con hallazgos — revisar secciones anteriores");
  } else {
    console.log("\n✅ Diagnóstico sin hallazgos críticos en el alcance");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
