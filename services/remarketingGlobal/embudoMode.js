/**
 * Modo embudo por lead + flujo (flujo normal vs remarketing vs comprado).
 * Memoria rápida + historial CRM opcional. No altera programación/envío R1 existente.
 */
const axios = require("axios");
const { limpiarSesionIAPendiente } = require("../iaFlowSession");
const { verificarCompraWorkerRemarketing } = require("./verificarCompraWorker");
const {
  cancelarPendientesCliente,
} = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const ESTADO_EMBUDO = {
  FLUJO_ACTIVO: "flujo_activo",
  REMARKETING_ACTIVO: "remarketing_activo",
  COMPRADO: "comprado",
};

const cache = new Map();

function clave(usuarioId, numero, flujoId) {
  return `${usuarioId || ""}:${numero || ""}:${flujoId || ""}`;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function persistirHistorialEmbudo(usuarioId, numero, flujoId, estado) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !numero) return;

  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente`,
      {
        usuario_id: usuarioId,
        cliente_numero: numero,
        tipo: "remarketing_embudo",
        titulo: "Modo embudo remarketing",
        detalle: estado,
        metadata: { flujo_id: flujoId, estado_embudo: estado },
      },
      { headers: headers({ Prefer: "return=minimal" }) }
    );
  } catch (_) {
    /* historial opcional */
  }
}

async function cargarDesdeHistorial(usuarioId, numero, flujoId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?usuario_id=eq.${usuarioId}` +
      `&cliente_numero=eq.${encodeURIComponent(numero)}` +
      `&tipo=eq.remarketing_embudo` +
      `&select=metadata,detalle,creado_en&order=creado_en.desc&limit=30`;

    const res = await axios.get(url, { headers: headers() });
    const rows = res.data || [];

    for (const row of rows) {
      const meta = row.metadata || {};
      if (meta.flujo_id === flujoId || row.detalle) {
        const estado = meta.estado_embudo || row.detalle;
        if (
          estado === ESTADO_EMBUDO.REMARKETING_ACTIVO ||
          estado === ESTADO_EMBUDO.COMPRADO
        ) {
          return { estado, flujo_id: flujoId, desde: "historial" };
        }
      }
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

async function getModoEmbudo(usuarioId, numero, flujoId) {
  const k = clave(usuarioId, numero, flujoId);
  if (cache.has(k)) {
    return cache.get(k);
  }

  const desdeHist = await cargarDesdeHistorial(usuarioId, numero, flujoId);
  if (desdeHist) {
    cache.set(k, desdeHist);
    return desdeHist;
  }

  const def = { estado: ESTADO_EMBUDO.FLUJO_ACTIVO, flujo_id: flujoId };
  cache.set(k, def);
  return def;
}

async function setModoEmbudo(usuarioId, numero, flujoId, estado) {
  const k = clave(usuarioId, numero, flujoId);
  const val = {
    estado,
    flujo_id: flujoId,
    actualizado_en: Date.now(),
  };
  cache.set(k, val);
  await persistirHistorialEmbudo(usuarioId, numero, flujoId, estado);
  return val;
}

async function obtenerModoRemarketingActivoParaLead(usuarioId, numero) {
  if (!usuarioId || !numero) return null;

  for (const [k, v] of cache.entries()) {
    if (!k.startsWith(`${usuarioId}:${numero}:`)) continue;
    if (v.estado === ESTADO_EMBUDO.REMARKETING_ACTIVO) {
      return { ...v, flujo_id: v.flujo_id || k.split(":")[2] };
    }
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?usuario_id=eq.${usuarioId}` +
      `&cliente_numero=eq.${encodeURIComponent(numero)}` +
      `&tipo=eq.remarketing_embudo` +
      `&detalle=eq.${ESTADO_EMBUDO.REMARKETING_ACTIVO}` +
      `&select=metadata,creado_en&order=creado_en.desc&limit=1`;

    const res = await axios.get(url, { headers: headers() });
    const row = (res.data || [])[0];
    if (row?.metadata?.flujo_id) {
      return {
        estado: ESTADO_EMBUDO.REMARKETING_ACTIVO,
        flujo_id: row.metadata.flujo_id,
        desde: "historial",
      };
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

function limpiarModosEmbudoLead(usuarioId, numero) {
  const prefix = `${usuarioId}:${numero}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

async function leadEstaComprado(usuarioId, numero, flujoId, config) {
  const modo = await getModoEmbudo(usuarioId, numero, flujoId);
  if (modo.estado === ESTADO_EMBUDO.COMPRADO) {
    return { comprado: true, razon: "modo_embudo_comprado" };
  }

  const compraRes = await verificarCompraWorkerRemarketing({
    cliente_numero: numero,
    usuario_id: usuarioId,
    flujo_id: flujoId,
    config: config || {},
  });

  if (compraRes.compraDetectada === true) {
    return { comprado: true, razon: compraRes.razon, compraRes };
  }

  return { comprado: false, razon: "sin_compra" };
}

async function marcarLeadCompradoEnFlujo({
  usuario_id,
  cliente_numero,
  flujo_id,
  config,
  motivo = "compra_detectada",
}) {
  console.log("[RM MODE] compra detectada → cancelando remarketing");

  await setModoEmbudo(usuario_id, cliente_numero, flujo_id, ESTADO_EMBUDO.COMPRADO);
  limpiarSesionIAPendiente(usuario_id, cliente_numero);

  try {
    await cancelarPendientesCliente(
      cliente_numero,
      usuario_id,
      ESTADOS_REMARKETING.CANCELADO,
      motivo,
      flujo_id
    );
  } catch (err) {
    console.log("[RM MODE] error cancelando remarketing:", err.message);
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${encodeURIComponent(cliente_numero)}&usuario_id=eq.${usuario_id}`,
        {
          estado_embudo: "compro",
          ultima_actividad: new Date().toISOString(),
        },
        { headers: headers({ Prefer: "return=minimal" }) }
      );
    } catch (_) {
      /* columna opcional */
    }
  }
}

async function puedeProgramarRemarketing({
  usuario_id,
  cliente_numero,
  flujo_id,
  config,
}) {
  const compra = await leadEstaComprado(
    usuario_id,
    cliente_numero,
    flujo_id,
    config
  );

  if (compra.comprado) {
    console.log("[RM MODE] lead comprado → no programar remarketing");
    await marcarLeadCompradoEnFlujo({
      usuario_id,
      cliente_numero,
      flujo_id,
      config,
      motivo: "Lead compró — no programar remarketing",
    });
    return { ok: false, razon: compra.razon };
  }

  return { ok: true };
}

async function cancelarSeguimientosNormales(numero, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero) return;

  const ahora = new Date().toISOString();
  let url = `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}&estado=eq.pendiente`;
  if (usuarioId) url += `&usuario_id=eq.${usuarioId}`;

  try {
    await axios.patch(
      url,
      {
        estado: "cancelado",
        cancelado_en: ahora,
        error_detalle: "remarketing_activo_cerro_flujo_normal",
      },
      { headers: headers({ Prefer: "return=minimal" }) }
    );
  } catch (_) {
    /* ignore */
  }
}

async function activarModoRemarketingTrasR1Enviado({
  usuario_id,
  cliente_numero,
  flujo_id,
}) {
  console.log("[RM MODE] R1 enviado OK → cerrando flujo normal");

  limpiarSesionIAPendiente(usuario_id, cliente_numero);
  await cancelarSeguimientosNormales(cliente_numero, usuario_id);

  await setModoEmbudo(
    usuario_id,
    cliente_numero,
    flujo_id,
    ESTADO_EMBUDO.REMARKETING_ACTIVO
  );

  console.log("[RM MODE] lead entra a remarketing_activo");
}

async function debeBloquearFlujoNormal(usuarioId, numero) {
  const activo = await obtenerModoRemarketingActivoParaLead(usuarioId, numero);
  if (activo?.estado === ESTADO_EMBUDO.REMARKETING_ACTIVO && activo.flujo_id) {
    return { bloquear: true, flujo_id: activo.flujo_id, modo: activo };
  }
  return { bloquear: false };
}

async function reprogramarRemarketingSiModoActivo(usuarioId, numero) {
  const bloqueo = await debeBloquearFlujoNormal(usuarioId, numero);
  if (!bloqueo.bloquear || !bloqueo.flujo_id) return false;

  const { obtenerFlujoPorId } = require("./resolverFlujoActivador");
  const { programarRemarketingAlDetectarNodo } = require("./porMensajeEntrante");

  const flujoPack = await obtenerFlujoPorId(bloqueo.flujo_id, usuarioId);
  if (!flujoPack?.flujoDatos) return true;

  const puede = await puedeProgramarRemarketing({
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: bloqueo.flujo_id,
    config: null,
  });

  if (!puede.ok) return true;

  await programarRemarketingAlDetectarNodo({
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: bloqueo.flujo_id,
    flujo_datos: flujoPack.flujoDatos,
  });

  return true;
}

module.exports = {
  ESTADO_EMBUDO,
  getModoEmbudo,
  setModoEmbudo,
  limpiarModosEmbudoLead,
  leadEstaComprado,
  marcarLeadCompradoEnFlujo,
  puedeProgramarRemarketing,
  activarModoRemarketingTrasR1Enviado,
  debeBloquearFlujoNormal,
  reprogramarRemarketingSiModoActivo,
  obtenerModoRemarketingActivoParaLead,
};
