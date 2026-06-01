/**
 * Registro de conversiones/ventas — tabla crm_conversiones (no etiquetas).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const ORIGENES_VALIDOS = new Set([
  "flujo",
  "manual",
  "hotmart",
  "stripe",
  "mercadopago",
  "qr",
  "webhook",
]);

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function normalizarOrigen(origen) {
  const o = String(origen || "flujo").trim().toLowerCase();
  return ORIGENES_VALIDOS.has(o) ? o : "flujo";
}

function normalizarValor(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

function normalizarMonedaISO(raw) {
  if (raw == null || raw === "") return "USD";
  const s = String(raw).trim();
  const isoMatch = s.match(/^([A-Za-z]{3})\b/);
  if (isoMatch) return isoMatch[1].toUpperCase();
  const parte = s.split(/\s*-\s*/)[0].trim();
  if (/^[A-Za-z]{3}$/i.test(parte)) return parte.toUpperCase();
  return parte.slice(0, 3).toUpperCase() || "USD";
}

/**
 * @returns {Promise<object|null>} fila creada o null si falla / sin config
 */
async function registrarConversion({
  usuarioId,
  flujoId = null,
  nodoId = null,
  clienteNumero,
  conexionWhatsappId = null,
  valor = 0,
  moneda = "USD",
  origen = "flujo",
  metadata = {},
}) {
  console.log("[CONV_TRACE] registrarConversion_REAL_ENTRY", {
    __filename,
  });

  console.log("[CONV_TRACE] registrarConversion_start", {
    valor,
    moneda,
    origen,
    metadata,
  });

  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) {
    return null;
  }

  if (
    metadata != null &&
    (typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    console.log("[CONV_TRACE] metadata_overwrite_point", {
      motivo: "metadata_invalido_reemplazado_por_objeto_vacio",
      metadata_recibido: metadata,
    });
  }

  const payload = {
    usuario_id: usuarioId,
    flujo_id: flujoId || null,
    nodo_id: nodoId || null,
    cliente_numero: String(clienteNumero).trim(),
    conexion_whatsapp_id: normalizarConexionId(conexionWhatsappId),
    valor: normalizarValor(valor),
    moneda: normalizarMonedaISO(moneda),
    origen: normalizarOrigen(origen),
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {},
  };

  console.log("[CONV_TRACE] insert_payload", payload);
  console.log("[CONVERSION] payload", JSON.stringify(payload));

  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/crm_conversiones`,
      payload,
      { headers: headers() }
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    console.log("[CONV_TRACE] insert_result", {
      id: row?.id || null,
      metadata: row?.metadata ?? null,
      error: null,
    });
    console.log("[CONVERSION] insert ok", {
      id: row?.id || null,
      cliente: payload.cliente_numero,
      conexion_whatsapp_id: payload.conexion_whatsapp_id,
      valor: payload.valor,
      moneda: payload.moneda,
      flujo_id: payload.flujo_id,
      nodo_id: payload.nodo_id,
    });
    return row;
  } catch (e) {
    console.log("[CONV_TRACE] insert_result", {
      id: null,
      metadata: null,
      error: e.response?.data || e.message,
    });
    console.error(
      "[CONVERSION] insert error",
      e.response?.data || e.message
    );
    return null;
  }
}

function parseConversionFromNodo(nodo) {
  const html = nodo?.html || "";
  let valor = 0;
  let moneda = "USD";
  let origen = "flujo";

  const matchData = html.match(
    /<textarea[^>]*class="conversion-data"[^>]*>([\s\S]*?)<\/textarea>/i
  );
  if (matchData) {
    try {
      const raw = matchData[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim();
      const data = JSON.parse(raw);
      if (data.valor != null) valor = data.valor;
      if (data.moneda != null) moneda = data.moneda;
      if (data.origen != null) origen = data.origen;
    } catch {
      /* inputs HTML como fallback */
    }
  }

  const matchValor = html.match(
    /class="conversion-valor"[^>]*value="([^"]*)"/i
  );
  const matchValorInput = html.match(
    /<input[^>]*class="conversion-valor"[^>]*value="([^"]*)"/i
  );
  if (matchValor) valor = matchValor[1];
  else if (matchValorInput) valor = matchValorInput[1];

  const matchMonedaSelected = html.match(
    /class="conversion-moneda"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="([^"]*)"/i
  );
  const matchMonedaSelectValue = html.match(
    /<select[^>]*class="conversion-moneda"[^>]*value="([^"]*)"/i
  );
  if (matchMonedaSelected) moneda = matchMonedaSelected[1];
  else if (matchMonedaSelectValue) moneda = matchMonedaSelectValue[1];

  const matchOrigen = html.match(
    /class="conversion-origen"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="([^"]*)"/i
  );
  if (matchOrigen) origen = matchOrigen[1];

  if (nodo?.data && typeof nodo.data === "object") {
    if (nodo.data.valor != null) valor = nodo.data.valor;
    if (nodo.data.valor_venta != null) valor = nodo.data.valor_venta;
    if (nodo.data.amount != null) valor = nodo.data.amount;
    if (nodo.data.moneda != null) moneda = nodo.data.moneda;
    if (nodo.data.currency != null) moneda = nodo.data.currency;
    if (nodo.data.origen != null) origen = nodo.data.origen;
  }

  return {
    valor: normalizarValor(valor),
    moneda: normalizarMonedaISO(moneda),
    origen: normalizarOrigen(origen),
  };
}

function buildMetadataRemarketingRm({
  cfg = {},
  rm24hId = null,
  rmNodeId = null,
  flujoOrigenId = null,
}) {
  return {
    origen: "remarketing",
    tipo_venta: "remarketing",
    rm24h_id: rm24hId != null ? String(rm24hId) : "",
    rm_node_id: rmNodeId != null ? String(rmNodeId) : "",
    flujo_origen_id: flujoOrigenId != null ? String(flujoOrigenId) : "",
    producto: String(cfg.producto ?? "").trim(),
    nombre: String(cfg.nombre ?? "").trim(),
    tipo: String(cfg.tipo ?? "venta").trim() || "venta",
  };
}

function metadataRemarketingPersistida(row, esperada) {
  const actual =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  return (
    actual.origen === esperada.origen &&
    actual.tipo_venta === esperada.tipo_venta
  );
}

async function persistirMetadataRemarketing(conversionId, metadataRm) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !conversionId) return null;
  try {
    const res = await axios.patch(
      `${SUPABASE_URL}/rest/v1/crm_conversiones?id=eq.${encodeURIComponent(
        String(conversionId)
      )}`,
      { metadata: metadataRm },
      { headers: headers() }
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    console.log("[RM_RUNTIME] conversion_rm_metadata_ok", {
      conversion_id: conversionId,
      origen: row?.metadata?.origen ?? metadataRm.origen,
      tipo_venta: row?.metadata?.tipo_venta ?? metadataRm.tipo_venta,
    });
    return row || { id: conversionId, metadata: metadataRm };
  } catch (e) {
    console.error(
      "[RM_RUNTIME] conversion_rm_metadata_error",
      e.response?.data || e.message
    );
    return null;
  }
}

/**
 * Conversión real desde nodo type=conversion del mini flujo RM.
 * Reutiliza crm_conversiones y registrarConversion; metadata marca origen remarketing.
 */
async function registrarConversionRemarketing(ctx, nodo) {
  console.log("[RM_CONV_TRACE] registrarConversionRemarketing_start", {
    ctx_keys: ctx && typeof ctx === "object" ? Object.keys(ctx) : [],
    ctx_usuarioId: ctx?.usuarioId ?? null,
    ctx_numero: ctx?.numero ?? null,
    ctx_conexionWhatsappId: ctx?.conexionWhatsappId ?? null,
    ctx_rm24h_id: ctx?.rm24h_id ?? null,
    ctx_fila_id: ctx?.fila?.id ?? null,
    ctx_fila_flujo_id: ctx?.fila?.flujo_id ?? null,
    "nodo.id": nodo?.id || nodo?.uid || null,
    "nodo.config": nodo?.config ?? null,
  });

  const cfg =
    nodo?.config && typeof nodo.config === "object" ? nodo.config : {};
  const fila = ctx?.fila || null;
  const usuarioId = ctx?.usuarioId || fila?.usuario_id || null;
  const clienteNumero = ctx?.numero || fila?.cliente_numero || null;
  const conexionWhatsappId = normalizarConexionId(
    ctx?.conexionWhatsappId || fila?.conexion_whatsapp_id
  );
  const flujoOrigenId = fila?.flujo_id ? String(fila.flujo_id) : null;
  const rm24hId = fila?.id || null;
  const rmNodeId = String(nodo?.id || nodo?.uid || "").trim() || null;

  if (!usuarioId || !clienteNumero) {
    console.log("[RM_RUNTIME] conversion_rm_omitida", {
      motivo: "faltan_usuario_o_cliente",
      rm24h_id: rm24hId,
      rm_node_id: rmNodeId,
    });
    return null;
  }

  const valor = normalizarValor(cfg.valor ?? 0);
  const moneda = normalizarMonedaISO(cfg.moneda ?? "USD");

  const metadataExistente = {
    ...(nodo?.metadata &&
    typeof nodo.metadata === "object" &&
    !Array.isArray(nodo.metadata)
      ? nodo.metadata
      : {}),
    ...(cfg.metadata &&
    typeof cfg.metadata === "object" &&
    !Array.isArray(cfg.metadata)
      ? cfg.metadata
      : {}),
  };

  const metadataRm = buildMetadataRemarketingRm({
    cfg,
    rm24hId,
    rmNodeId,
    flujoOrigenId,
  });

  const metadataFinal = {
    ...metadataExistente,
    ...metadataRm,
    tipo:
      String(
        metadataExistente.tipo ?? cfg.tipo ?? metadataRm.tipo ?? "venta"
      ).trim() || "venta",
    cliente_numero: String(clienteNumero).trim(),
    usuario_id: String(usuarioId),
    conexion_whatsapp_id:
      conexionWhatsappId != null ? String(conexionWhatsappId) : "",
    origen: "remarketing",
    tipo_venta: "remarketing",
  };

  console.log("[RM_RUNTIME] conversion_rm_metadata", JSON.stringify(metadataFinal));
  console.log(
    "[RM_CONVERSION_DEBUG] metadata_final",
    JSON.stringify(metadataFinal)
  );
  console.log("[RM_CONV_TRACE] metadata_final", metadataFinal);

  console.log("[RM_CONV_TRACE] payload_to_registrarConversion", {
    valor,
    moneda,
    origen: "flujo",
    metadata: metadataFinal,
  });

  const payloadRegistrarConversion = {
    usuarioId,
    flujoId: flujoOrigenId,
    nodoId: rmNodeId,
    clienteNumero,
    conexionWhatsappId,
    valor,
    moneda,
    origen: "flujo",
    metadata: metadataFinal,
  };

  let row;
  try {
    console.log("[RM_CONV_TRACE] registrarConversion_identity", {
      typeof_registrarConversion: typeof registrarConversion,
      function_name: registrarConversion?.name,
      function_string_start: String(registrarConversion).slice(0, 200),
    });
    console.log("[RM_CONV_TRACE] before_call_registrarConversion", {
      typeof_registrarConversion: typeof registrarConversion,
      payload: payloadRegistrarConversion,
    });
    row = await registrarConversion(payloadRegistrarConversion);
    console.log("[RM_CONV_TRACE] after_call_registrarConversion", {
      result: row,
    });
  } catch (e) {
    console.error("[RM_CONV_TRACE] registrarConversion_error", {
      message: e?.message,
      stack: e?.stack,
    });
    throw e;
  }

  if (!row?.id) return row;

  if (metadataRemarketingPersistida(row, metadataFinal)) {
    return row;
  }

  const patched = await persistirMetadataRemarketing(row.id, metadataFinal);
  return patched || row;
}

module.exports = {
  registrarConversion,
  registrarConversionRemarketing,
  parseConversionFromNodo,
  normalizarOrigen,
  normalizarMonedaISO,
  ORIGENES_VALIDOS,
};

console.log("[CONV_TRACE] registrarConversion_file_loaded", {
  __filename,
  exported_keys: Object.keys(module.exports || {}),
});
