/**
 * Persistencia Supabase para flow_sessions (Fase 2 — auditoría).
 * Independiente de ia_sessions. No decide el runtime.
 */

const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const FLOW_SESSION_TIMEOUT_MS = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_DEFAULT = "active";
const STATUS_FINISHED = "finished";
const STATUS_CANCELLED = "cancelled";

const SELECT_COLUMNS =
  "id,usuario_id,conexion_whatsapp_id,cliente_numero,flujo_id,current_node_id,status,started_at,last_activity_at,created_at,updated_at";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function uuidValido(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const s = String(valor).trim();
  return UUID_RE.test(s) ? s : null;
}

function textoONull(valor) {
  if (valor == null) return null;
  const s = String(valor).trim();
  return s !== "" ? s : null;
}

function statusValido(valor) {
  const s = textoONull(valor);
  return s || STATUS_DEFAULT;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    conexion_whatsapp_id: row.conexion_whatsapp_id,
    cliente_numero: row.cliente_numero,
    flujo_id: row.flujo_id,
    current_node_id: row.current_node_id,
    status: row.status,
    started_at: row.started_at,
    last_activity_at: row.last_activity_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolverClave({ usuarioId, conexionWhatsappId, clienteNumero }) {
  const usuario_id = uuidValido(usuarioId);
  const conexion_whatsapp_id = uuidValido(conexionWhatsappId);
  const cliente_numero = String(clienteNumero || "").trim();

  if (!usuario_id || !conexion_whatsapp_id || !cliente_numero) {
    return null;
  }

  return { usuario_id, conexion_whatsapp_id, cliente_numero };
}

function filtroClaveActiva(clave, { flujoId = undefined } = {}) {
  let url =
    `${SUPABASE_URL}/rest/v1/flow_sessions` +
    `?usuario_id=eq.${encodeURIComponent(clave.usuario_id)}` +
    `&conexion_whatsapp_id=eq.${encodeURIComponent(clave.conexion_whatsapp_id)}` +
    `&cliente_numero=eq.${encodeURIComponent(clave.cliente_numero)}` +
    `&status=eq.${encodeURIComponent(STATUS_DEFAULT)}`;

  const flujo = uuidValido(flujoId);
  if (flujo) {
    url += `&flujo_id=eq.${encodeURIComponent(flujo)}`;
  }

  return url;
}

/**
 * Inserta una nueva fila (sin upsert: no hay unique por lead).
 */
async function crearFlowSession({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId = null,
  status = STATUS_DEFAULT,
  startedAt = null,
  lastActivityAt = null,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    throw new Error("Clave de flow_session inválida para Supabase");
  }

  const ahora = new Date().toISOString();
  const row = {
    ...clave,
    flujo_id: uuidValido(flujoId),
    current_node_id: textoONull(currentNodeId),
    status: statusValido(status),
    started_at: startedAt || ahora,
    last_activity_at: lastActivityAt || ahora,
    updated_at: ahora,
  };

  const res = await axios.post(`${SUPABASE_URL}/rest/v1/flow_sessions`, row, {
    headers: supabaseHeaders({
      Prefer: "return=representation",
    }),
    timeout: FLOW_SESSION_TIMEOUT_MS,
  });

  const created = Array.isArray(res.data) ? res.data[0] : res.data;
  return mapRow(created);
}

/**
 * Obtiene la sesión active más reciente por lead/línea (opcionalmente flujo).
 */
async function obtenerFlowSessionActiva({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    return null;
  }

  const res = await axios.get(
    filtroClaveActiva(clave, { flujoId }) +
      `&select=${SELECT_COLUMNS}` +
      "&order=started_at.desc&limit=1",
    {
      headers: supabaseHeaders(),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : null;
  return mapRow(row);
}

/**
 * Obtiene la sesión más reciente por lead/línea (cualquier status).
 */
async function obtenerFlowSession({ usuarioId, conexionWhatsappId, clienteNumero }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    return null;
  }

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flow_sessions` +
      `?usuario_id=eq.${encodeURIComponent(clave.usuario_id)}` +
      `&conexion_whatsapp_id=eq.${encodeURIComponent(clave.conexion_whatsapp_id)}` +
      `&cliente_numero=eq.${encodeURIComponent(clave.cliente_numero)}` +
      `&select=${SELECT_COLUMNS}` +
      "&order=started_at.desc&limit=1",
    {
      headers: supabaseHeaders(),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : null;
  return mapRow(row);
}

/**
 * Actualiza la sesión active más reciente del lead (y flujo si se indica).
 */
async function actualizarFlowSessionActiva({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
  currentNodeId,
  status,
  lastActivityAt,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    throw new Error("Clave de flow_session inválida para Supabase");
  }

  const ahora = new Date().toISOString();
  const patch = {
    updated_at: ahora,
  };

  if (currentNodeId !== undefined) {
    patch.current_node_id = textoONull(currentNodeId);
  }
  if (status !== undefined) {
    patch.status = statusValido(status);
  }
  if (lastActivityAt !== undefined) {
    patch.last_activity_at = lastActivityAt || ahora;
  } else {
    patch.last_activity_at = ahora;
  }

  const res = await axios.patch(
    filtroClaveActiva(clave, { flujoId }) + "&order=started_at.desc&limit=1",
    patch,
    {
      headers: supabaseHeaders({
        Prefer: "return=representation",
      }),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  const updated = Array.isArray(res.data) ? res.data[0] : res.data;
  return mapRow(updated);
}

/**
 * Marca como cancelled todas las sesiones active del lead/línea.
 */
async function cancelarFlowSessionsActivas({
  usuarioId,
  conexionWhatsappId,
  clienteNumero,
  flujoId = null,
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    throw new Error("Clave de flow_session inválida para Supabase");
  }

  const ahora = new Date().toISOString();
  const res = await axios.patch(
    filtroClaveActiva(clave, { flujoId }),
    {
      status: STATUS_CANCELLED,
      last_activity_at: ahora,
      updated_at: ahora,
    },
    {
      headers: supabaseHeaders({
        Prefer: "return=representation",
      }),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  return Array.isArray(res.data) ? res.data.map(mapRow) : [];
}

/**
 * Actualiza por id de fila.
 */
async function actualizarFlowSessionPorId(id, fields = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const sessionId = uuidValido(id);
  if (!sessionId) {
    throw new Error("id de flow_session inválido");
  }

  const ahora = new Date().toISOString();
  const patch = { updated_at: ahora };

  if (fields.flujoId !== undefined) {
    patch.flujo_id = uuidValido(fields.flujoId);
  }
  if (fields.currentNodeId !== undefined) {
    patch.current_node_id = textoONull(fields.currentNodeId);
  }
  if (fields.status !== undefined) {
    patch.status = statusValido(fields.status);
  }
  if (fields.startedAt !== undefined) {
    patch.started_at = fields.startedAt || null;
  }
  if (fields.lastActivityAt !== undefined) {
    patch.last_activity_at = fields.lastActivityAt || ahora;
  }

  const res = await axios.patch(
    `${SUPABASE_URL}/rest/v1/flow_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    patch,
    {
      headers: supabaseHeaders({
        Prefer: "return=representation",
      }),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  const updated = Array.isArray(res.data) ? res.data[0] : res.data;
  return mapRow(updated);
}

/**
 * Elimina por clave lead/línea (todas las filas que coincidan).
 */
async function eliminarFlowSession({ usuarioId, conexionWhatsappId, clienteNumero }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase no configurado");
  }

  const clave = resolverClave({ usuarioId, conexionWhatsappId, clienteNumero });
  if (!clave) {
    throw new Error("Clave de flow_session inválida para Supabase");
  }

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/flow_sessions` +
      `?usuario_id=eq.${encodeURIComponent(clave.usuario_id)}` +
      `&conexion_whatsapp_id=eq.${encodeURIComponent(clave.conexion_whatsapp_id)}` +
      `&cliente_numero=eq.${encodeURIComponent(clave.cliente_numero)}`,
    {
      headers: supabaseHeaders(),
      timeout: FLOW_SESSION_TIMEOUT_MS,
    }
  );

  return true;
}

module.exports = {
  crearFlowSession,
  obtenerFlowSession,
  obtenerFlowSessionActiva,
  actualizarFlowSessionActiva,
  actualizarFlowSessionPorId,
  cancelarFlowSessionsActivas,
  eliminarFlowSession,
  uuidValido,
  STATUS_DEFAULT,
  STATUS_FINISHED,
  STATUS_CANCELLED,
};
