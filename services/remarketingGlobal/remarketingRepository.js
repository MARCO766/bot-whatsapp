const axios = require("axios");
const { ESTADOS_REMARKETING } = require("./constants");
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
      `${SUPABASE_URL}/rest/v1/remarketing_global_programados`,
      rows,
      { headers: headers({ Prefer: "return=representation" }) }
    );
    return response.data || [];
  } catch (error) {
    const detalle = error.response?.data || error.message;
    console.error(
      "[REMARKETING] ERROR insertando programación:",
      error.response?.status || "sin status",
      typeof detalle === "object" ? JSON.stringify(detalle) : detalle
    );
    throw error;
  }
}

async function obtenerPendientesVencidos(limite = 40) {
  const ahoraEncoded = encodeTimestampFilter(new Date());

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados?estado=eq.${ESTADOS_REMARKETING.PENDIENTE}&run_at=lte.${ahoraEncoded}&order=run_at.asc&limit=${limite}&select=*`,
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

  if (estado === ESTADOS_REMARKETING.ENVIADO) {
    payload.enviado_en = nowUtc();
  }
  if (
    estado === ESTADOS_REMARKETING.CANCELADO ||
    estado === ESTADOS_REMARKETING.FUERA_VENTANA_24H
  ) {
    payload.cancelado_en = nowUtc();
  }
  if (estado === ESTADOS_REMARKETING.RESPONDIDO) {
    payload.respondido_en = nowUtc();
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados?id=eq.${id}`,
    payload,
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarCampana(campanaId, estado, motivo) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_REMARKETING.RESPONDIDO ? "respondido_en" : "cancelado_en";

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados?campana_id=eq.${campanaId}&estado=eq.${ESTADOS_REMARKETING.PENDIENTE}`,
    {
      estado,
      actualizado_en: ahora,
      [campoFecha]: ahora,
      error_detalle: motivo || null,
    },
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarPendientesCliente(numero, usuarioId, estado, motivo, flujoId) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_REMARKETING.RESPONDIDO ? "respondido_en" : "cancelado_en";

  let url = `${SUPABASE_URL}/rest/v1/remarketing_global_programados?cliente_numero=eq.${encodeURIComponent(numero)}&estado=eq.${ESTADOS_REMARKETING.PENDIENTE}`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }
  if (flujoId) {
    url += `&flujo_id=eq.${flujoId}`;
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

  let url = `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&direccion=eq.entrante&creado_en=gt.${checkpointEncoded}&select=id&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || []).length > 0;
}

async function ultimoMensajeEntranteEn(numero, usuarioId, horas = 24) {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000);
  const desdeEncoded = encodeTimestampFilter(desde);

  let url = `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&direccion=eq.entrante&creado_en=gte.${desdeEncoded}&select=id,creado_en&order=creado_en.desc&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || [])[0] || null;
}

async function tieneEtiqueta(numero, usuarioId, nombreEtiqueta) {
  if (!nombreEtiqueta) return false;

  let url = `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&etiqueta=eq.${encodeURIComponent(nombreEtiqueta)}&select=id&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || []).length > 0;
}

async function tieneConversion(numero, usuarioId) {
  let url = `${SUPABASE_URL}/rest/v1/crm_conversiones?cliente_numero=eq.${encodeURIComponent(numero)}&select=id&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || []).length > 0;
}

module.exports = {
  insertarProgramados,
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  cancelarPendientesCliente,
  clienteRespondioDespues,
  ultimoMensajeEntranteEn,
  tieneEtiqueta,
  tieneConversion,
};
