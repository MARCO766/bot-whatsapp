const axios = require("axios");
const { iniciarEsperaLectorPago } = require("../lectorPagoService");
const repo = require("./remarketing24hRepository");
const { normalizarConexionId } = repo;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

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
    nombreEsperado: "",
    montoEsperado: 0,
    moneda: "Bs",
    linkEntrega: "",
    verificarNombre: true,
    verificarMonto: true,
    verificarFecha: false,
    revisionManualSiFalla: true,
    mensajePagoNoValido:
      "No pude validar el comprobante 😅 ¿puedes enviarlo más claro?",
    tiempoMaximoEspera: { valor: 24, unidad: "horas" },
  };

  if (!raw || typeof raw !== "object") return { ...base };

  const monto = parseFloat(raw.montoEsperado ?? raw.monto_esperado);

  return {
    activo: raw.activo === true,
    producto: String(raw.producto ?? "").trim(),
    nombreEsperado: String(
      raw.nombreEsperado ?? raw.nombre_esperado ?? ""
    ).trim(),
    montoEsperado:
      Number.isFinite(monto) && monto >= 0 ? monto : base.montoEsperado,
    moneda: String(raw.moneda ?? raw.monedaEsperada ?? base.moneda).trim() || base.moneda,
    linkEntrega: String(
      raw.linkEntrega ?? raw.link_entrega ?? raw.productoUrl ?? raw.producto_url ?? ""
    ).trim(),
    verificarNombre: raw.verificarNombre !== false,
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
      String(nodeCfg.producto || "").trim() ||
      String(nodeCfg.nombreEsperado || nodeCfg.nombre_esperado || "").trim() ||
      String(nodeCfg.linkEntrega || nodeCfg.link_entrega || "").trim())
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

function serializarNodosPendingNext(nodos) {
  return (Array.isArray(nodos) ? nodos : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const tipo = String(item.type || item.tipo || "").toLowerCase();
      if (!tipo) return null;
      return {
        type: tipo,
        id: String(item.id || "").trim() || null,
        config: item.config && typeof item.config === "object" ? item.config : {},
      };
    })
    .filter(Boolean);
}

async function guardarPendingNextLectorRm(ctx, pendingNext, rmNodeId) {
  if (!ctx?.fila?.id) return null;

  const snap = leerSnapshot(ctx.fila);
  const pending = serializarNodosPendingNext(pendingNext);
  const configSnapshot = {
    ...snap,
    rm_lector_runtime: {
      rm_node_id: rmNodeId,
      pending_next: pending,
    },
  };

  const actualizado = await repo.actualizarPorId(
    ctx.fila.id,
    { config_snapshot: configSnapshot },
    ctx.fila
  );

  if (actualizado && ctx.fila) {
    ctx.fila = actualizado;
  }

  return actualizado;
}

function buildPseudoNodoLectorPago(cfg) {
  const moneda = String(cfg.moneda || "Bs")
    .trim()
    .toLowerCase();

  const verificarNombre = cfg.verificarNombre !== false;
  const nombreEsperado = verificarNombre ? String(cfg.nombreEsperado || "").trim() : "";

  return {
    data: {
      montoEsperado: cfg.verificarMonto !== false ? cfg.montoEsperado : 0,
      monedaEsperada: moneda,
      nombreEsperado,
      productoUrl: cfg.linkEntrega || "",
      mensajePagoInvalido: cfg.mensajePagoNoValido || "",
    },
  };
}

/**
 * Inicia espera del lector de pagos existente con contexto remarketing (sin tabla nueva).
 */
async function iniciarLectorPagoRemarketing(ctx, node, opts = {}) {
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
  const pendingNext = serializarNodosPendingNext(opts.pendingNext);

  try {
    if (pendingNext.length) {
      await guardarPendingNextLectorRm(ctx, pendingNext, rmNodeId);
    }

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
      nombreEsperado: cfg.nombreEsperado || null,
      linkEntrega: cfg.linkEntrega || null,
      verificarNombre: cfg.verificarNombre,
      montoEsperado: cfg.montoEsperado,
      moneda: cfg.moneda,
      verificarMonto: cfg.verificarMonto,
      verificarFecha: cfg.verificarFecha,
      revisionManualSiFalla: cfg.revisionManualSiFalla,
      tiempoMaximoEspera: cfg.tiempoMaximoEspera,
      pending_next_count: pendingNext.length,
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

async function obtenerFilaRmPorId(rm24hId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !rm24hId) return null;

  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/remarketing_global_24h?id=eq.${encodeURIComponent(
      rm24hId
    )}&select=*&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  return res.data?.[0] || null;
}

async function limpiarPendingNextLectorRm(fila) {
  if (!fila?.id) return fila;

  const snap = leerSnapshot(fila);
  if (!snap?.rm_lector_runtime) return fila;

  const configSnapshot = { ...snap };
  delete configSnapshot.rm_lector_runtime;

  return repo.actualizarPorId(
    fila.id,
    { config_snapshot: configSnapshot },
    fila
  );
}

module.exports = {
  RM_LECTOR_FLUJO_PREFIX,
  buildFlujoIdRemarketing,
  esFlujoIdRemarketing,
  parseRm24hIdDesdeFlujoRemarketing,
  normalizarConfigLectorPagosRm,
  resolverConfigLectorPagosRm,
  buildPseudoNodoLectorPago,
  serializarNodosPendingNext,
  guardarPendingNextLectorRm,
  iniciarLectorPagoRemarketing,
  obtenerFilaRmPorId,
  limpiarPendingNextLectorRm,
  leerSnapshot,
};
