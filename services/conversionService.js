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

/**
 * @returns {Promise<object|null>} fila creada o null si falla / sin config
 */
async function registrarConversion({
  usuarioId,
  flujoId = null,
  nodoId = null,
  clienteNumero,
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
    valor: normalizarValor(valor),
    moneda: String(moneda || "USD").trim().toUpperCase().slice(0, 8) || "USD",
    origen: normalizarOrigen(origen),
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {},
  };

  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/crm_conversiones`,
      payload,
      { headers: headers() }
    );
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    console.log(
      "[CONVERSION] ✓ Registrada:",
      payload.cliente_numero,
      payload.valor,
      payload.moneda,
      "| flujo:",
      payload.flujo_id || "—"
    );
    return row;
  } catch (e) {
    console.error(
      "[CONVERSION] Error registrando:",
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
        .replace(/&amp;/g, "&");
      const data = JSON.parse(raw);
      valor = data.valor;
      moneda = data.moneda;
      origen = data.origen;
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

  const matchMoneda = html.match(
    /class="conversion-moneda"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="([^"]*)"/i
  );
  if (matchMoneda) moneda = matchMoneda[1];

  const matchOrigen = html.match(
    /class="conversion-origen"[^>]*>[\s\S]*?<option[^>]*selected[^>]*value="([^"]*)"/i
  );
  if (matchOrigen) origen = matchOrigen[1];

  return {
    valor: normalizarValor(valor),
    moneda: String(moneda || "USD").trim().toUpperCase() || "USD",
    origen: normalizarOrigen(origen),
  };
}

module.exports = {
  registrarConversion,
  parseConversionFromNodo,
  normalizarOrigen,
  ORIGENES_VALIDOS,
};
