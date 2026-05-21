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
    estado === ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA ||
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

async function cancelarCampana(campanaId, estado, motivo, debugCtx = {}) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_REMARKETING.RESPONDIDO ? "respondido_en" : "cancelado_en";

  if (debugCtx.log !== false) {
    const { logCancelacionRemarketing } = require("./cancelacionDebug");
    logCancelacionRemarketing(motivo, debugCtx.cliente_numero || debugCtx.numero, {
      etiquetas: debugCtx.etiquetas,
      compraDetectada: debugCtx.compraDetectada,
      payload: {
        campana_id: campanaId,
        estado,
        ...debugCtx,
      },
    });
  }

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

async function obtenerFlujoIdRemarketingPendiente(numero, usuarioId) {
  if (!numero || !usuarioId) return null;

  let url =
    `${SUPABASE_URL}/rest/v1/remarketing_global_programados?cliente_numero=eq.${encodeURIComponent(numero)}` +
    `&usuario_id=eq.${usuarioId}&estado=eq.${ESTADOS_REMARKETING.PENDIENTE}` +
    `&select=flujo_id&order=creado_en.desc&limit=1`;

  try {
    const res = await axios.get(url, { headers: headers() });
    const row = (res.data || [])[0];
    return row?.flujo_id || null;
  } catch {
    return null;
  }
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

  const payload = {
    estado,
    actualizado_en: ahora,
    [campoFecha]: ahora,
    error_detalle: motivo || null,
  };

  try {
    await axios.patch(url, payload, {
      headers: headers({ Prefer: "return=minimal" }),
    });
  } catch (error) {
    if (estado === ESTADOS_REMARKETING.CANCELADO_POR_RESPUESTA) {
      await axios.patch(
        url,
        {
          ...payload,
          estado: ESTADOS_REMARKETING.CANCELADO,
          error_detalle: motivo || "cancelado_por_respuesta",
        },
        { headers: headers({ Prefer: "return=minimal" }) }
      );
      return;
    }
    throw error;
  }
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

async function obtenerEtiquetasCliente(numero, usuarioId) {
  if (!numero) return [];

  let url = `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&select=etiqueta`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  try {
    const response = await axios.get(url, { headers: headers() });
    return (response.data || []).map((r) => r.etiqueta).filter(Boolean);
  } catch {
    return [];
  }
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

/** Conversiones con valor 0 u origen flujo sin compra explícita NO cuentan como compra. */
function esCompraRealExplicita(row) {
  if (!row) return { compra: false, razon: "sin_fila" };

  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};

  if (meta.compra === true || meta.compro === true) {
    return { compra: true, razon: "metadata.compra_true" };
  }

  const origen = String(row.origen || "").toLowerCase();
  if (["hotmart", "stripe", "mercadopago", "webhook", "qr"].includes(origen)) {
    return { compra: true, razon: "origen_pago_" + origen };
  }

  const valor = parseFloat(row.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { compra: false, razon: "valor_cero_o_invalido" };
  }

  if (origen === "flujo" && meta.trigger === "nodo_flujo") {
    return { compra: true, razon: "nodo_conversion_valor_positivo" };
  }

  if (origen === "manual") {
    return { compra: true, razon: "manual_valor_positivo" };
  }

  return { compra: false, razon: "conversion_sin_compra_explicita" };
}

/**
 * Solo compra real: metadata.compra, pago externo, o conversión de nodo con valor > 0.
 * NO cualquier fila en crm_conversiones (evita falsos positivos con valor 0).
 */
async function leadTieneCompraExplicita(numero, usuarioId) {
  if (!numero) {
    return { compra: false, fila: null, razon: "sin_numero" };
  }

  let url = `${SUPABASE_URL}/rest/v1/crm_conversiones?cliente_numero=eq.${encodeURIComponent(numero)}&select=id,valor,origen,metadata,creado_en,flujo_id,nodo_id&order=creado_en.desc&limit=20`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  try {
    const response = await axios.get(url, { headers: headers() });
    const rows = response.data || [];

    for (const row of rows) {
      const check = esCompraRealExplicita(row);
      if (check.compra) {
        return { compra: true, fila: row, razon: check.razon };
      }
    }

    return {
      compra: false,
      fila: rows[0] || null,
      razon: rows.length
        ? "hay_conversiones_pero_ninguna_compra_explicita"
        : "sin_conversiones",
    };
  } catch (err) {
    return {
      compra: false,
      fila: null,
      razon: "error_consulta",
      error: err.message,
    };
  }
}

/** @deprecated Usar leadTieneCompraExplicita — evita falsos positivos */
async function tieneConversion(numero, usuarioId) {
  const res = await leadTieneCompraExplicita(numero, usuarioId);
  return res.compra;
}

module.exports = {
  insertarProgramados,
  obtenerPendientesVencidos,
  obtenerFlujoIdRemarketingPendiente,
  actualizarEstado,
  cancelarCampana,
  cancelarPendientesCliente,
  clienteRespondioDespues,
  ultimoMensajeEntranteEn,
  obtenerEtiquetasCliente,
  tieneEtiqueta,
  esCompraRealExplicita,
  leadTieneCompraExplicita,
  tieneConversion,
};
