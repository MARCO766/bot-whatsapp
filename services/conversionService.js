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
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !clienteNumero) {
    return null;
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

  console.log("[CONVERSION] payload", JSON.stringify(payload));

  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/crm_conversiones`,
      payload,
      { headers: headers() }
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
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

module.exports = {
  registrarConversion,
  parseConversionFromNodo,
  normalizarOrigen,
  normalizarMonedaISO,
  ORIGENES_VALIDOS,
};
