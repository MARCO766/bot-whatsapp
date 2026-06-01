const { iniciarEsperaLectorPago } = require("../lectorPagoService");
const repo = require("./remarketing24hRepository");
const { normalizarConexionId } = repo;

const RM_LECTOR_FLUJO_PREFIX = "remarketing:";

function leerSnapshot(fila) {
  const snap = fila?.config_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) return snap;
  return {};
}

function buildFlujoIdRemarketing(rm24hId) {
  return `${RM_LECTOR_FLUJO_PREFIX}${String(rm24hId || "").trim()}`;
}

function esFlujoIdRemarketing(flujoId) {
  return String(flujoId || "").startsWith(RM_LECTOR_FLUJO_PREFIX);
}

function parseRm24hIdDesdeFlujoRemarketing(flujoId) {
  const s = String(flujoId || "");
  if (!esFlujoIdRemarketing(s)) return null;
  const id = s.slice(RM_LECTOR_FLUJO_PREFIX.length).trim();
  return id || null;
}

function normalizarConfigLectorPagosRm(raw) {
  const base = {
    activo: false,
    producto: "",
    montoEsperado: 0,
    moneda: "Bs",
    verificarMonto: true,
    verificarFecha: false,
    revisionManualSiFalla: true,
    mensajePagoNoValido:
      "No pude validar el comprobante. Puedes enviarlo mas claro?",
    tiempoMaximoEspera: { valor: 24, unidad: "horas" },
  };

  if (!raw || typeof raw !== "object") return { ...base };

  const monto = parseFloat(raw.montoEsperado ?? raw.monto_esperado);

  return {
    activo: raw.activo === true,
    producto: String(raw.producto ?? "").trim(),
    montoEsperado:
      Number.isFinite(monto) && monto >= 0 ? monto : base.montoEsperado,
    moneda: String(raw.moneda ?? raw.monedaEsperada ?? base.moneda).trim() || base.moneda,
    verificarMonto: raw.verificarMonto !== false,
    verificarFecha: raw.verificarFecha === true,
    revisionManualSiFalla: raw.revisionManualSiFalla !== false,
    mensajePagoNoValido: String(
      raw.mensajePagoNoValido ?? raw.mensaje_pago_no_valido ?? base.mensajePagoNoValido
    ).trim(),
    tiempoMaximoEspera:
      raw.tiempoMaximoEspera ||
      raw.tiempo_maximo_espera ||
      base.tiempoMaximoEspera,
  };
}

function resolverConfigLectorPagosRm(ctx, node) {
  const nodeCfg = node?.config;
  if (
    nodeCfg &&
    typeof nodeCfg === "object" &&
    (nodeCfg.montoEsperado != null ||
      nodeCfg.monto_esperado != null ||
      String(nodeCfg.producto || "").trim())
  ) {
    return normalizarConfigLectorPagosRm(nodeCfg);
  }

  const snapshot = leerSnapshot(ctx?.fila);
  const globalLp = snapshot?.rm24h_lector_pagos;
  if (globalLp?.config && typeof globalLp.config === "object") {
    return normalizarConfigLectorPagosRm(globalLp.config);
  }

  return normalizarConfigLectorPagosRm(nodeCfg || {});
}

function buildPseudoNodoLectorPago(cfg) {
  const moneda = String(cfg.moneda || "Bs")
    .trim()
    .toLowerCase();

  return {
    data: {
      montoEsperado: cfg.verificarMonto !== false ? cfg.montoEsperado : 0,
      monedaEsperada: moneda,
      productoTexto: cfg.producto || "",
      mensajePagoInvalido: cfg.mensajePagoNoValido || "",
    },
  };
}

/**
 * Inicia espera del lector de pagos existente con contexto remarketing (sin tabla nueva).
 */
async function iniciarLectorPagoRemarketing(ctx, node) {
  const rm24hId = ctx?.fila?.id || null;
  const rmNodeId = String(node?.id || "").trim() || null;
  const usuarioId = ctx?.usuarioId || ctx?.fila?.usuario_id || null;
  const clienteNumero = ctx?.numero || ctx?.fila?.cliente_numero || null;
  const conexionWhatsappId =
    normalizarConexionId(ctx?.conexionWhatsappId) ||
    normalizarConexionId(ctx?.fila?.conexion_whatsapp_id);

  console.log("[RM_RUNTIME] lector_pagos_start", {
    origen: "remarketing",
    rm24h_id: rm24hId,
    rm_node_id: rmNodeId,
    lead: clienteNumero,
    usuario: usuarioId,
    conexion_whatsapp_id: conexionWhatsappId,
  });

  if (!rm24hId || !usuarioId || !clienteNumero) {
    console.log("[RM_RUNTIME] lector_pagos_error", {
      origen: "remarketing",
      motivo: "faltan_datos_contexto",
      rm24h_id: rm24hId,
      rm_node_id: rmNodeId,
    });
    return { ok: false, motivo: "faltan_datos_contexto" };
  }

  if (!conexionWhatsappId) {
    console.log("[RM_RUNTIME] lector_pagos_error", {
      origen: "remarketing",
      motivo: "sin_conexion_whatsapp_id",
      rm24h_id: rm24hId,
      rm_node_id: rmNodeId,
    });
    return { ok: false, motivo: "sin_conexion_whatsapp_id" };
  }

  const cfg = resolverConfigLectorPagosRm(ctx, node);
  const pseudoNodo = buildPseudoNodoLectorPago(cfg);

  try {
    const resultado = await iniciarEsperaLectorPago({
      usuarioId,
      clienteNumero,
      conexionWhatsappId,
      flujoId: buildFlujoIdRemarketing(rm24hId),
      nodoId: rmNodeId,
      nodo: pseudoNodo,
    });

    console.log("[RM_RUNTIME] lector_pagos_waiting", {
      origen: "remarketing",
      rm24h_id: rm24hId,
      rm_node_id: rmNodeId,
      estado_id: resultado?.estado?.id || null,
      lead: clienteNumero,
      usuario: usuarioId,
      conexion_whatsapp_id: conexionWhatsappId,
      producto: cfg.producto || null,
      montoEsperado: cfg.montoEsperado,
      moneda: cfg.moneda,
      verificarMonto: cfg.verificarMonto,
      verificarFecha: cfg.verificarFecha,
      revisionManualSiFalla: cfg.revisionManualSiFalla,
      tiempoMaximoEspera: cfg.tiempoMaximoEspera,
    });

    return {
      ok: true,
      ...resultado,
      rmContext: {
        origen: "remarketing",
        rm24h_id: rm24hId,
        rm_node_id: rmNodeId,
      },
    };
  } catch (err) {
    console.log("[RM_RUNTIME] lector_pagos_error", {
      origen: "remarketing",
      rm24h_id: rm24hId,
      rm_node_id: rmNodeId,
      lead: clienteNumero,
      error: err.response?.data || err.message,
    });
    return { ok: false, error: err.response?.data || err.message };
  }
}

module.exports = {
  RM_LECTOR_FLUJO_PREFIX,
  buildFlujoIdRemarketing,
  esFlujoIdRemarketing,
  parseRm24hIdDesdeFlujoRemarketing,
  normalizarConfigLectorPagosRm,
  resolverConfigLectorPagosRm,
  buildPseudoNodoLectorPago,
  iniciarLectorPagoRemarketing,
};
