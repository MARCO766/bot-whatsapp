/**
 * Modo embudo por lead + flujo (flujo normal vs remarketing vs comprado).
 */
const axios = require("axios");
const { limpiarSesionIAPendiente, obtenerSesionIAPendiente } = require("../iaFlowSession");
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
const resetVentanaPorLead = new Map();

function claveLead(usuarioId, numero) {
  return `${usuarioId || ""}:${numero || ""}`;
}

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

function leadEnVentanaReset(usuarioId, numero) {
  const t = resetVentanaPorLead.get(claveLead(usuarioId, numero));
  if (!t) return false;
  if (Date.now() - t > 15 * 60 * 1000) {
    resetVentanaPorLead.delete(claveLead(usuarioId, numero));
    return false;
  }
  return true;
}

function marcarVentanaResetLead(usuarioId, numero) {
  resetVentanaPorLead.set(claveLead(usuarioId, numero), Date.now());
}

async function obtenerClienteDesdeDb(usuarioId, numero) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !numero) {
    return { estado_embudo: null, encontrado: false };
  }

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}&select=estado_embudo,estado,notas&limit=1`,
      { headers: headers() }
    );
    const row = (res.data || [])[0];
    return {
      estado_embudo: row?.estado_embudo ?? null,
      estado: row?.estado ?? null,
      notas: row?.notas ?? null,
      encontrado: !!row,
    };
  } catch {
    return { estado_embudo: null, encontrado: false };
  }
}

async function obtenerDiagnosticoLead(usuarioId, numero, flujoIdOpcional) {
  const cliente = await obtenerClienteDesdeDb(usuarioId, numero);
  const sesionIa = obtenerSesionIAPendiente(usuarioId, numero);
  const rmActivo = leadEnVentanaReset(usuarioId, numero)
    ? null
    : await obtenerModoRemarketingActivoParaLead(usuarioId, numero);

  let comprado = cliente.estado_embudo === "compro";
  const prefix = `${usuarioId}:${numero}:`;
  const cacheKeys = [];
  for (const k of cache.keys()) {
    if (!k.startsWith(prefix)) continue;
    const v = cache.get(k);
    cacheKeys.push(v);
    if (v?.estado === ESTADO_EMBUDO.COMPRADO) comprado = true;
  }

  let modoEmbudo = null;
  if (flujoIdOpcional && !leadEnVentanaReset(usuarioId, numero)) {
    modoEmbudo = await getModoEmbudo(usuarioId, numero, flujoIdOpcional);
    const c = await leadEstaComprado(usuarioId, numero, flujoIdOpcional, null);
    comprado = comprado || c.comprado;
  }

  return {
    estado_embudo: cliente.estado_embudo,
    estado_cliente: cliente.estado,
    remarketing_activo: !!(rmActivo?.estado === ESTADO_EMBUDO.REMARKETING_ACTIVO),
    remarketing_flujo_id: rmActivo?.flujo_id || null,
    comprado,
    modo_embudo: modoEmbudo?.estado || null,
    ventana_reset: leadEnVentanaReset(usuarioId, numero),
    ia_pendiente: !!sesionIa,
    nodo_pendiente: sesionIa?.nodoId || null,
    flujo_id_ia: sesionIa?.flujoId || null,
    route_id: sesionIa?.flowContext?.route_id || sesionIa?.flowContext?.route || null,
    visitados: sesionIa?.visitados || [],
    modos_cache: cacheKeys,
  };
}

function limpiarModosEmbudoLead(usuarioId, numero) {
  const prefix = `${usuarioId}:${numero}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
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
    /* opcional */
  }
}

async function cargarDesdeHistorial(usuarioId, numero, flujoId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || leadEnVentanaReset(usuarioId, numero)) {
    return null;
  }

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
      const estado = meta.estado_embudo || row.detalle;
      if (
        estado !== ESTADO_EMBUDO.REMARKETING_ACTIVO &&
        estado !== ESTADO_EMBUDO.COMPRADO
      ) {
        continue;
      }
      if (flujoId && meta.flujo_id && meta.flujo_id !== flujoId) {
        continue;
      }
      return { estado, flujo_id: meta.flujo_id || flujoId, desde: "historial" };
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

  if (leadEnVentanaReset(usuarioId, numero)) {
    return null;
  }

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
      `&select=metadata,detalle,creado_en&order=creado_en.desc&limit=30`;

    const res = await axios.get(url, { headers: headers() });
    const rows = res.data || [];

    for (const row of rows) {
      const meta = row.metadata || {};
      const estado = meta.estado_embudo || row.detalle;
      if (estado === ESTADO_EMBUDO.REMARKETING_ACTIVO) {
        return {
          estado: ESTADO_EMBUDO.REMARKETING_ACTIVO,
          flujo_id: meta.flujo_id || null,
          desde: "historial",
        };
      }
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

async function leadEstaComprado(usuarioId, numero, flujoId, config, opts = {}) {
  if (leadEnVentanaReset(usuarioId, numero)) {
    return { comprado: false, razon: "ventana_reset" };
  }

  const modo = await getModoEmbudo(usuarioId, numero, flujoId);
  if (modo.estado === ESTADO_EMBUDO.COMPRADO) {
    return { comprado: true, razon: "modo_embudo_comprado" };
  }

  const cliente = await obtenerClienteDesdeDb(usuarioId, numero);
  if (cliente.estado_embudo === "compro") {
    return { comprado: true, razon: "estado_embudo_compro" };
  }

  if (opts.omitirDbCompra) {
    return { comprado: false, razon: "sin_compra" };
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
      /* opcional */
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

async function evaluarBloqueoFlujoNormal(usuarioId, numero) {
  if (leadEnVentanaReset(usuarioId, numero)) {
    return {
      bloquear: false,
      motivo: "ventana_reset_activa",
      remarketing_activo: false,
      comprado: false,
    };
  }

  const diag = await obtenerDiagnosticoLead(usuarioId, numero);
  const activo = await obtenerModoRemarketingActivoParaLead(usuarioId, numero);

  if (activo?.estado === ESTADO_EMBUDO.REMARKETING_ACTIVO && activo.flujo_id) {
    return {
      bloquear: true,
      flujo_id: activo.flujo_id,
      modo: activo,
      motivo: "remarketing_activo",
      remarketing_activo: true,
      comprado: diag.comprado,
      diag,
    };
  }

  if (diag.comprado || diag.estado_embudo === "compro") {
    return {
      bloquear: true,
      motivo: "lead_comprado",
      remarketing_activo: false,
      comprado: true,
      diag,
    };
  }

  return {
    bloquear: false,
    motivo: null,
    remarketing_activo: false,
    comprado: false,
    diag,
  };
}

async function debeBloquearFlujoNormal(usuarioId, numero) {
  const ev = await evaluarBloqueoFlujoNormal(usuarioId, numero);
  return {
    bloquear: ev.bloquear,
    flujo_id: ev.flujo_id,
    modo: ev.modo,
    motivo: ev.motivo,
  };
}

function logFlujoDebug(numero, usuarioId, ev) {
  const d = ev.diag || {};
  console.log("[FLUJO DEBUG] cliente estado_embudo=" + (d.estado_embudo ?? "—"));
  console.log(
    "[FLUJO DEBUG] remarketing_activo=" + (ev.remarketing_activo ? "true" : "false")
  );
  console.log("[FLUJO DEBUG] comprado=" + (ev.comprado ? "true" : "false"));
  console.log(
    "[FLUJO DEBUG] puede iniciar flujo=" + (ev.bloquear ? "NO" : "SI")
  );
  console.log("[FLUJO DEBUG] motivo bloqueo=" + (ev.motivo || "ninguno"));
  console.log("[FLUJO DEBUG] ventana_reset=" + (d.ventana_reset ? "true" : "false"));
  console.log("[FLUJO DEBUG] ia_pendiente=" + (d.ia_pendiente ? "true" : "false"));
}

async function reprogramarRemarketingSiModoActivo(usuarioId, numero) {
  if (leadEnVentanaReset(usuarioId, numero)) {
    return false;
  }

  const bloqueo = await debeBloquearFlujoNormal(usuarioId, numero);
  if (!bloqueo.bloquear || bloqueo.motivo !== "remarketing_activo" || !bloqueo.flujo_id) {
    return false;
  }

  const { obtenerFlujoPorId } = require("./resolverFlujoActivador");
  const { programarRemarketingAlDetectarNodo } = require("./porMensajeEntrante");

  const flujoPack = await obtenerFlujoPorId(bloqueo.flujo_id, usuarioId);
  if (!flujoPack?.flujoDatos) return false;

  const puede = await puedeProgramarRemarketing({
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: bloqueo.flujo_id,
    config: null,
  });

  if (!puede.ok) return false;

  await programarRemarketingAlDetectarNodo({
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: bloqueo.flujo_id,
    flujo_datos: flujoPack.flujoDatos,
  });

  return true;
}

/**
 * Resetbot: limpieza total sin romper remarketing en producción.
 */
async function resetearEmbudoLeadParaResetbot(usuarioId, numero) {
  const antes = await obtenerDiagnosticoLead(usuarioId, numero);
  console.log(
    "[RESETBOT DEBUG] antes del reset estado cliente =",
    JSON.stringify(antes)
  );

  console.log("[RESETBOT DEBUG] limpiando tabla memoria_embudo");
  limpiarModosEmbudoLead(usuarioId, numero);
  marcarVentanaResetLead(usuarioId, numero);

  console.log("[RESETBOT DEBUG] limpiando sesion IA/OpenAI pendiente");
  limpiarSesionIAPendiente(usuarioId, numero);

  if (!SUPABASE_URL || !SUPABASE_KEY || !usuarioId || !numero) {
    const despues = await obtenerDiagnosticoLead(usuarioId, numero);
    console.log(
      "[RESETBOT DEBUG] después del reset estado cliente =",
      JSON.stringify(despues)
    );
    console.log("[RESETBOT DEBUG] reset completo OK");
    return;
  }

  const baseHist = `usuario_id=eq.${usuarioId}&cliente_numero=eq.${encodeURIComponent(numero)}`;

  console.log("[RESETBOT DEBUG] limpiando tabla crm_historial_cliente (remarketing_embudo)");
  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?${baseHist}&tipo=eq.remarketing_embudo`,
      { headers: headers() }
    );
  } catch (err) {
    console.log("[RESETBOT DEBUG] historial remarketing:", err.message);
  }

  console.log("[RESETBOT DEBUG] limpiando tabla crm_historial_cliente (flujo)");
  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/crm_historial_cliente?${baseHist}&tipo=eq.flujo`,
      { headers: headers() }
    );
  } catch (err) {
    console.log("[RESETBOT DEBUG] historial flujo:", err.message);
  }

  console.log("[RESETBOT DEBUG] limpiando tabla clientes.estado_embudo → nuevo");
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}`,
      {
        estado_embudo: "nuevo",
        ultima_actividad: new Date().toISOString(),
      },
      { headers: headers({ Prefer: "return=minimal" }) }
    );
  } catch (err) {
    console.log("[RESETBOT DEBUG] patch clientes:", err.message);
  }

  const despues = await obtenerDiagnosticoLead(usuarioId, numero);
  console.log(
    "[RESETBOT DEBUG] después del reset estado cliente =",
    JSON.stringify(despues)
  );
  console.log("[RESETBOT DEBUG] reset completo OK");
}

module.exports = {
  ESTADO_EMBUDO,
  getModoEmbudo,
  setModoEmbudo,
  limpiarModosEmbudoLead,
  marcarVentanaResetLead,
  leadEnVentanaReset,
  obtenerDiagnosticoLead,
  obtenerClienteDesdeDb,
  leadEstaComprado,
  marcarLeadCompradoEnFlujo,
  puedeProgramarRemarketing,
  activarModoRemarketingTrasR1Enviado,
  debeBloquearFlujoNormal,
  evaluarBloqueoFlujoNormal,
  logFlujoDebug,
  reprogramarRemarketingSiModoActivo,
  obtenerModoRemarketingActivoParaLead,
  resetearEmbudoLeadParaResetbot,
};
