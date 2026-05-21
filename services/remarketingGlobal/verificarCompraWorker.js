/**
 * Validación de compra SOLO para el worker (antes de enviar R1).
 * Fail-safe: ante duda o error → NO cancelar, continuar envío.
 */
const {
  obtenerEtiquetasCliente,
} = require("./remarketingRepository");
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

function normalizarTag(s) {
  return String(s || "")
    .trim()
    .toUpperCase();
}

function logWorkerCompraDebug(ctx) {
  console.log("[RM WORKER COMPRA DEBUG] cliente=", ctx.cliente);
  console.log("[RM WORKER COMPRA DEBUG] etiquetas=", ctx.etiquetas);
  console.log("[RM WORKER COMPRA DEBUG] conversiones=", ctx.conversiones);
  console.log("[RM WORKER COMPRA DEBUG] compraDetectada=", ctx.compraDetectada);
  console.log(
    "[RM WORKER COMPRA DEBUG] cancelandoPorCompra=" +
      (ctx.compraDetectada === true ? "SI" : "NO")
  );
  if (ctx.razon) {
    console.log("[RM WORKER COMPRA DEBUG] razon=", ctx.razon);
  }
  if (ctx.error) {
    console.log("[RM WORKER COMPRA DEBUG] error=", ctx.error);
  }
}

/**
 * Conversión cuenta como compra solo con evidencia explícita + mismo flujo.
 */
function conversionEsCompraReal(row, flujoId) {
  if (!row || row.id == null || row.id === undefined) {
    return { ok: false, razon: "conversion_sin_id" };
  }

  if (flujoId && row.flujo_id && row.flujo_id !== flujoId) {
    return { ok: false, razon: "conversion_otro_flujo" };
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};

  const compraExplicita = meta.compra === true || meta.compro === true;
  const origen = String(row.origen || "").toLowerCase().trim();
  const pagoExterno = ["hotmart", "stripe", "mercadopago", "webhook", "qr"].includes(
    origen
  );

  const valorRaw = row.valor;
  if (valorRaw === null || valorRaw === undefined || valorRaw === "") {
    if (!compraExplicita && !pagoExterno) {
      return { ok: false, razon: "valor_null_sin_compra_explicita" };
    }
  }

  const valor = parseFloat(valorRaw);
  const valorPositivo = Number.isFinite(valor) && valor > 0;

  if (pagoExterno && valorPositivo) {
    return { ok: true, razon: "pago_externo_valor_positivo" };
  }

  if (compraExplicita && valorPositivo) {
    return { ok: true, razon: "metadata_compra_y_valor_positivo" };
  }

  if (compraExplicita && pagoExterno) {
    return { ok: true, razon: "metadata_compra_pago_externo" };
  }

  return { ok: false, razon: "sin_evidencia_compra_explicita" };
}

async function obtenerConversionesClienteFlujo(clienteNumero, usuarioId, flujoId) {
  if (!clienteNumero || !usuarioId) {
    return { ok: false, rows: [], error: "sin_cliente_o_usuario" };
  }

  let url =
    `${SUPABASE_URL}/rest/v1/crm_conversiones?cliente_numero=eq.${encodeURIComponent(clienteNumero)}` +
    `&usuario_id=eq.${usuarioId}` +
    `&select=id,valor,origen,metadata,creado_en,flujo_id,nodo_id&order=creado_en.desc&limit=20`;

  if (flujoId) {
    url += `&flujo_id=eq.${flujoId}`;
  }

  try {
    const res = await axios.get(url, { headers: headers() });
    const rows = Array.isArray(res.data) ? res.data : [];
    return { ok: true, rows, error: null };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      error: err.response?.data || err.message,
    };
  }
}

/**
 * @returns {{ compraDetectada: boolean, razon: string, etiquetas: string[], conversiones: object[], error?: string }}
 */
async function verificarCompraWorkerRemarketing({
  cliente_numero,
  usuario_id,
  flujo_id,
  config,
}) {
  const cond = config?.condiciones || {};
  const etiquetasCfg = config?.etiquetas || {};
  const tagPagado =
    cond.detener_etiqueta_nombre || etiquetasCfg.pagado || "PAGADO";

  let etiquetas = [];
  let conversiones = [];
  let compraDetectada = false;
  let razon = "sin_evidencia";

  try {
    etiquetas = await obtenerEtiquetasCliente(cliente_numero, usuario_id);
  } catch (err) {
    logWorkerCompraDebug({
      cliente: cliente_numero,
      etiquetas: [],
      conversiones: [],
      compraDetectada: false,
      razon: "error_leyendo_etiquetas",
      error: err.message,
    });
    return {
      compraDetectada: false,
      razon: "error_leyendo_etiquetas",
      etiquetas: [],
      conversiones: [],
      error: err.message,
    };
  }

  const tagBuscado = normalizarTag(tagPagado);
  const tieneTagPagado =
    tagBuscado &&
    etiquetas.some((t) => normalizarTag(t) === tagBuscado);

  if (tieneTagPagado) {
    compraDetectada = true;
    razon = "etiqueta_" + tagPagado;
    logWorkerCompraDebug({
      cliente: cliente_numero,
      etiquetas,
      conversiones: [],
      compraDetectada: true,
      razon,
    });
    return {
      compraDetectada: true,
      razon,
      etiquetas,
      conversiones: [],
    };
  }

  const convRes = await obtenerConversionesClienteFlujo(
    cliente_numero,
    usuario_id,
    flujo_id
  );

  if (!convRes.ok) {
    logWorkerCompraDebug({
      cliente: cliente_numero,
      etiquetas,
      conversiones: [],
      compraDetectada: false,
      razon: "error_consulta_conversiones",
      error: String(convRes.error),
    });
    return {
      compraDetectada: false,
      razon: "error_consulta_conversiones_no_cancela",
      etiquetas,
      conversiones: [],
      error: String(convRes.error),
    };
  }

  conversiones = convRes.rows;

  if (!conversiones.length) {
    logWorkerCompraDebug({
      cliente: cliente_numero,
      etiquetas,
      conversiones: [],
      compraDetectada: false,
      razon: "sin_conversiones_en_flujo",
    });
    return {
      compraDetectada: false,
      razon: "sin_conversiones_en_flujo",
      etiquetas,
      conversiones: [],
    };
  }

  for (const row of conversiones) {
    const check = conversionEsCompraReal(row, flujo_id);
    if (check.ok) {
      compraDetectada = true;
      razon = check.razon;
      logWorkerCompraDebug({
        cliente: cliente_numero,
        etiquetas,
        conversiones,
        compraDetectada: true,
        razon,
      });
      return {
        compraDetectada: true,
        razon,
        etiquetas,
        conversiones,
        fila: row,
      };
    }
  }

  logWorkerCompraDebug({
    cliente: cliente_numero,
    etiquetas,
    conversiones,
    compraDetectada: false,
    razon: "conversiones_sin_compra_explicita",
  });

  return {
    compraDetectada: false,
    razon: "conversiones_sin_compra_explicita",
    etiquetas,
    conversiones,
  };
}

module.exports = {
  verificarCompraWorkerRemarketing,
  conversionEsCompraReal,
};
