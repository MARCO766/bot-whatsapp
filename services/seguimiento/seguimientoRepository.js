const axios = require("axios");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const { nowUtc, encodeTimestampFilter } = require("./timestamps");

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

async function insertarProgramados(rows) {
  if (!rows.length) return [];

  try {
    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados`,
      rows,
      {
        headers: headers({ Prefer: "return=representation" }),
      }
    );

    const insertados = response.data || [];
    console.log("[SEGUIMIENTO] Supabase POST OK:", insertados.length, "fila(s)");
    return insertados;
  } catch (error) {
    const detalle = error.response?.data || error.message;
    console.error(
      "[SEGUIMIENTO] Supabase POST ERROR:",
      error.response?.status || "sin status",
      typeof detalle === "object" ? JSON.stringify(detalle) : detalle
    );
    throw error;
  }
}

async function obtenerPendientesVencidos(limite = 40) {
  const ahoraEncoded = encodeTimestampFilter(new Date());

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&run_at=lte.${ahoraEncoded}&order=run_at.asc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  return response.data || [];
}

async function actualizarEstado(id, estado, extra = {}) {
  const payload = {
    estado,
    actualizado_en: nowUtc(),
    ...extra,
  };

  if (estado === ESTADOS_SEGUIMIENTO.ENVIADO) {
    payload.enviado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO.CANCELADO) {
    payload.cancelado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO.RESPONDIDO) {
    payload.respondido_en = nowUtc();
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${id}`,
    payload,
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarCampana(campanaId, estado, motivo) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?campana_id=eq.${campanaId}&estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}`,
    {
      estado,
      actualizado_en: ahora,
      [campoFecha]: ahora,
      error_detalle: motivo || null,
    },
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarPendientesCliente(numero, usuarioId, estado, motivo) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${numero}&estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&detener_si_responde=eq.true`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  await axios.patch(
    url,
    {
      estado,
      actualizado_en: ahora,
      [campoFecha]: ahora,
      error_detalle: motivo || null,
    },
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function clienteRespondioDespues(numero, usuarioId, checkpointAt) {
  if (!checkpointAt) return false;

  const checkpointEncoded = encodeTimestampFilter(checkpointAt);

  let url =
    `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&direccion=eq.entrante&creado_en=gt.${checkpointEncoded}&select=id&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || []).length > 0;
}

async function listarPorCliente(numero, usuarioId, limite = 50) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  return response.data || [];
}

async function listarPorNodo(flujoId, nodoId, usuarioId, limite = 30) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?flujo_id=eq.${flujoId}&nodo_id=eq.${nodoId}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  return response.data || [];
}

module.exports = {
  insertarProgramados,
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  cancelarPendientesCliente,
  clienteRespondioDespues,
  listarPorCliente,
  listarPorNodo,
};
