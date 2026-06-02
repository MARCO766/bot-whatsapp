/**
 * Pausa de bot/flujo por conversación (usuario + lead + conexion_whatsapp_id).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

function normalizarNumero(clienteNumero) {
  return String(clienteNumero || "").trim();
}

function normalizarUsuarioId(usuarioId) {
  if (usuarioId == null || String(usuarioId).trim() === "") return null;
  return String(usuarioId).trim();
}

function filtroConversacion(usuarioId, clienteNumero, conexionWhatsappId) {
  const uid = encodeURIComponent(usuarioId);
  const num = encodeURIComponent(clienteNumero);
  const conn = normalizarConexionId(conexionWhatsappId);
  if (!conn) return null;
  return (
    `cliente_numero=eq.${num}` +
    `&usuario_id=eq.${uid}` +
    `&conexion_whatsapp_id=eq.${encodeURIComponent(conn)}`
  );
}

function pausaActivaDesdeFilas(row) {
  if (!row || row.bot_pausado !== true) {
    return {
      bot_pausado: false,
      bot_pausado_hasta: row?.bot_pausado_hasta ?? null,
      bot_pausado_motivo: row?.bot_pausado_motivo ?? null,
      activa: false,
    };
  }

  const hasta = row.bot_pausado_hasta;
  if (hasta) {
    const fin = new Date(hasta).getTime();
    if (!Number.isFinite(fin) || fin <= Date.now()) {
      return {
        bot_pausado: false,
        bot_pausado_hasta: hasta,
        bot_pausado_motivo: row.bot_pausado_motivo ?? null,
        activa: false,
        expirada: true,
      };
    }
  }

  return {
    bot_pausado: true,
    bot_pausado_hasta: hasta ?? null,
    bot_pausado_motivo: row.bot_pausado_motivo ?? null,
    activa: true,
  };
}

async function obtenerEstadoPausaConversacion({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const uid = normalizarUsuarioId(usuarioId);
  const num = normalizarNumero(clienteNumero);
  const conn = normalizarConexionId(conexionWhatsappId);

  if (!uid || !num || !conn || !SUPABASE_URL || !SUPABASE_KEY) {
    return {
      bot_pausado: false,
      bot_pausado_hasta: null,
      bot_pausado_motivo: null,
      activa: false,
    };
  }

  const filtro = filtroConversacion(uid, num, conn);
  if (!filtro) {
    return {
      bot_pausado: false,
      bot_pausado_hasta: null,
      bot_pausado_motivo: null,
      activa: false,
    };
  }

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?${filtro}&select=bot_pausado,bot_pausado_hasta,bot_pausado_motivo&limit=1`,
      { headers: headers() }
    );
    return pausaActivaDesdeFilas(res.data?.[0]);
  } catch (err) {
    console.log(
      "[BOT_PAUSE] error leyendo estado:",
      err.response?.data || err.message
    );
    return {
      bot_pausado: false,
      bot_pausado_hasta: null,
      bot_pausado_motivo: null,
      activa: false,
    };
  }
}

async function estaBotPausado(params) {
  const estado = await obtenerEstadoPausaConversacion(params);
  return Boolean(estado.activa);
}

async function patchConversacionBot(uid, num, conn, payload) {
  const filtro = filtroConversacion(uid, num, conn);
  const res = await axios.patch(
    `${SUPABASE_URL}/rest/v1/conversaciones?${filtro}`,
    payload,
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return res.data?.[0] || null;
}

async function asegurarConversacion(uid, num, conn) {
  const filtro = filtroConversacion(uid, num, conn);
  const getRes = await axios.get(
    `${SUPABASE_URL}/rest/v1/conversaciones?${filtro}&select=id&limit=1`,
    { headers: headers() }
  );
  if (getRes.data?.[0]) return getRes.data[0];

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/conversaciones`,
    {
      usuario_id: uid,
      cliente_numero: num,
      conexion_whatsapp_id: conn,
      estado: "abierta",
      unread_count: 0,
      ultimo_mensaje: "",
      ultimo_mensaje_en: new Date().toISOString(),
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );
  return res.data?.[0] || null;
}

async function pausarBotConversacion({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  hasta = null,
  motivo = null,
}) {
  const uid = normalizarUsuarioId(usuarioId);
  const num = normalizarNumero(clienteNumero);
  const conn = normalizarConexionId(conexionWhatsappId);

  if (!uid || !num || !conn) {
    return { ok: false, error: "datos_incompletos" };
  }

  await asegurarConversacion(uid, num, conn);

  const row = await patchConversacionBot(uid, num, conn, {
    bot_pausado: true,
    bot_pausado_hasta: hasta || null,
    bot_pausado_motivo: motivo || null,
  });

  console.log("[BOT_PAUSE] pausado", {
    usuario_id: uid,
    cliente_numero: num,
    conexion_whatsapp_id: conn,
    bot_pausado_hasta: hasta || null,
    bot_pausado_motivo: motivo || null,
  });

  return {
    ok: true,
    bot_pausado: true,
    bot_pausado_hasta: row?.bot_pausado_hasta ?? hasta ?? null,
    bot_pausado_motivo: row?.bot_pausado_motivo ?? motivo ?? null,
  };
}

async function reactivarBotConversacion({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const uid = normalizarUsuarioId(usuarioId);
  const num = normalizarNumero(clienteNumero);
  const conn = normalizarConexionId(conexionWhatsappId);

  if (!uid || !num || !conn) {
    return { ok: false, error: "datos_incompletos" };
  }

  const row = await patchConversacionBot(uid, num, conn, {
    bot_pausado: false,
    bot_pausado_hasta: null,
    bot_pausado_motivo: null,
  });

  console.log("[BOT_PAUSE] reactivado", {
    usuario_id: uid,
    cliente_numero: num,
    conexion_whatsapp_id: conn,
  });

  return {
    ok: true,
    bot_pausado: false,
    bot_pausado_hasta: null,
    bot_pausado_motivo: null,
    actualizado: Boolean(row),
  };
}

function calcularHastaDesdeDuracion(duration) {
  const d = String(duration || "").trim().toLowerCase();
  if (d === "indefinido") return null;
  const ahora = Date.now();
  if (d === "1h") return new Date(ahora + 60 * 60 * 1000).toISOString();
  if (d === "24h") return new Date(ahora + 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function motivoDesdeDuracion(duration) {
  const d = String(duration || "").trim().toLowerCase();
  if (d === "1h") return "bandeja_1h";
  if (d === "24h") return "bandeja_24h";
  if (d === "indefinido") return "bandeja_indefinido";
  return "bandeja";
}

module.exports = {
  obtenerEstadoPausaConversacion,
  estaBotPausado,
  pausarBotConversacion,
  reactivarBotConversacion,
  calcularHastaDesdeDuracion,
  motivoDesdeDuracion,
  pausaActivaDesdeFilas,
};
