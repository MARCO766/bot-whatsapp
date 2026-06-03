const axios = require("axios");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
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

  const payload = rows;
  console.log("[SEGUIMIENTO_DEBUG] insert payload", payload);

  try {
    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/seguimientos_programados`,
      rows,
      {
        headers: headers({ Prefer: "return=representation" }),
      }
    );

    const data = response.data || [];
    console.log("[SEGUIMIENTO_DEBUG] insert result", { data, error: null });
    console.log("[SEGUIMIENTO] Supabase POST OK:", data.length, "fila(s)");
    return data;
  } catch (error) {
    const errBody = error.response?.data || error.message;
    console.log("[SEGUIMIENTO_DEBUG] insert result", {
      data: null,
      error: errBody,
    });
    console.error("[SEGUIMIENTO_DEBUG] insert error", error);
    const detalle = errBody;
    console.error(
      "[SEGUIMIENTO] Supabase POST ERROR:",
      error.response?.status || "sin status",
      typeof detalle === "object" ? JSON.stringify(detalle) : detalle
    );
    throw error;
  }
}

function buildClaveDedupPaso(item) {
  return [
    item.usuario_id || "",
    item.cliente_numero || "",
    item.conexion_whatsapp_id || "",
    item.campana_id || "",
    String(item.paso_index ?? ""),
  ].join("|");
}

/** Worker: dedup/carrera solo dentro de la misma línea WhatsApp del lead. */
function filtrosDedupWorker(item) {
  const partes = [];
  if (item.usuario_id && item.cliente_numero) {
    partes.push(filtrosClaveLead(item.cliente_numero, item.usuario_id, item.conexion_whatsapp_id));
  }
  if (item.campana_id) {
    partes.push(filtrosLotePaso(item));
  }
  return partes.join("&");
}

function filtroEqCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") {
    return `${campo}=is.null`;
  }
  return `${campo}=eq.${encodeURIComponent(valor)}`;
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

/** Multi-número: misma línea o legacy (ambos null). Nunca mezclar A con B. */
function filtroConexionWhatsapp(conexionWhatsappId) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  if (conexion) {
    return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexion)}`;
  }
  return "&conexion_whatsapp_id=is.null";
}

function mensajeCoincideConexion(row, conexionWhatsappId) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const msgConn = normalizarConexionId(row?.conexion_whatsapp_id);
  if (conexion) return msgConn === conexion;
  return !msgConn;
}

/** Seguimiento y contexto deben compartir la misma conexion_whatsapp_id (sin mezclar líneas). */
function seguimientoMismaConexion(seguimiento, conexionContexto) {
  const segConn = normalizarConexionId(seguimiento?.conexion_whatsapp_id);
  const ctxConn = normalizarConexionId(conexionContexto);
  if (!segConn || !ctxConn) return false;
  return segConn === ctxConn;
}

function filtrosClaveLead(numero, usuarioId, conexionWhatsappId) {
  let parte =
    `cliente_numero=eq.${encodeURIComponent(numero)}` +
    filtroConexionWhatsapp(conexionWhatsappId);
  if (usuarioId) {
    parte += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }
  return parte;
}

function logPendienteSeguimiento(origen, row) {
  console.log("[WORKER LISTAR PENDIENTES]", {
    origen,
    id: row.id,
    cliente_numero: row.cliente_numero,
    estado: row.estado,
    run_at: row.run_at,
    conexion_whatsapp_id: row.conexion_whatsapp_id || null,
    flujo_id: row.flujo_id || null,
    nodo_id: row.nodo_id || null,
  });
}

/** Deduplicación solo dentro del mismo lote (campana_id). */
async function existePasoEnviadoOProcesando(item, excludeId = null) {
  if (!item.campana_id) return null;

  const estados = [
    ESTADOS_SEGUIMIENTO.ENVIADO,
    ESTADOS_SEGUIMIENTO.PROCESANDO,
  ].join(",");

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=in.(${estados})` +
    `&${filtrosDedupWorker(item)}` +
    "&select=id,estado&limit=1";

  if (excludeId) {
    url += `&id=neq.${excludeId}`;
  }

  const response = await axios.get(url, { headers: headers() });
  return (response.data || [])[0] || null;
}

function filtrosLotePaso(item) {
  return (
    `campana_id=eq.${item.campana_id}` +
    `&paso_index=eq.${item.paso_index}`
  );
}

/** Tras reservar: solo una fila en "procesando" por lead+línea+lote+paso. */
async function esUnicoProcesandoEnClave(item) {
  if (!item.campana_id || !item.usuario_id || !item.cliente_numero) return true;

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PROCESANDO}&${filtrosDedupWorker(item)}&select=id&order=id.asc&limit=1`,
    { headers: headers() }
  );
  const primero = (response.data || [])[0];
  return primero?.id === item.id;
}

async function cancelarPendientesDuplicadosClave(item, exceptId) {
  if (!item.campana_id || !item.usuario_id || !item.cliente_numero) return;

  const url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&${filtrosDedupWorker(item)}&id=neq.${exceptId}`;

  await axios.patch(
    url,
    {
      estado: ESTADOS_SEGUIMIENTO.CANCELADO,
      cancelado_en: nowUtc(),
      actualizado_en: nowUtc(),
      error_detalle: "Duplicado: paso ya reservado para envío (mismo lote)",
    },
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

/** Reserva atómica pendiente → procesando. Devuelve la fila solo si el PATCH afectó 1 registro. */
async function reservarPasoParaEnvio(id) {
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${id}&estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}`,
    {
      estado: ESTADOS_SEGUIMIENTO.PROCESANDO,
      actualizado_en: nowUtc(),
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  const row = (response.data || [])[0] || null;
  if (row) {
    console.log("[WORKER_RESERVA_TRACE]", {
      id: row.id,
      conexion_whatsapp_id_reservado: row.conexion_whatsapp_id ?? null,
      estado_reservado: row.estado ?? null,
      keys_en_respuesta: Object.keys(row),
    });
  }
  return row;
}

const SELECT_SEGUIMIENTO_WORKER =
  "id,cliente_numero,usuario_id,conexion_whatsapp_id,estado,run_at,creado_en,campana_id,paso_index,paso_id,mensaje_tipo,mensaje_payload,solo_si_no_respondio,detener_si_responde,checkpoint_at,flujo_id,nodo_id";

async function obtenerSeguimientoPorId(id) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${encodeURIComponent(id)}&select=${SELECT_SEGUIMIENTO_WORKER}`,
    { headers: headers() }
  );
  return response.data?.[0] || null;
}

async function obtenerPendientesVencidos(limite = 40) {
  const ahora = new Date();
  const ahoraEncoded = encodeTimestampFilter(ahora);

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&run_at=lte.${ahoraEncoded}&order=run_at.asc&limit=${limite}&select=${SELECT_SEGUIMIENTO_WORKER}`,
    { headers: headers() }
  );

  const pendientes = response.data || [];

  if (pendientes.length) {
    console.log("[WORKER LISTAR PENDIENTES] vencidos total:", pendientes.length);
    pendientes.forEach((row) => logPendienteSeguimiento("VENCIDOS", row));
  }

  if (!pendientes.length) {
    try {
      const diag = await axios.get(
        `${SUPABASE_URL}/rest/v1/seguimientos_programados?order=creado_en.desc&limit=5&select=id,estado,run_at,enviado_en,cancelado_en,usuario_id,cliente_numero,error_detalle`,
        { headers: headers() }
      );
      console.log("[SEGUIMIENTO_WORKER_DEBUG] 0 pendientes — filtros worker:", {
        estado_requerido: ESTADOS_SEGUIMIENTO.PENDIENTE,
        run_at_lte: ahora.toISOString(),
        run_at_filtro_encoded: ahoraEncoded,
        ultimas_5_filas: diag.data || [],
      });
    } catch (diagErr) {
      console.log("[SEGUIMIENTO_WORKER_DEBUG] 0 pendientes — no se pudo diagnosticar:", diagErr.message);
    }
  }

  return pendientes;
}

async function actualizarEstado(id, estado, extra = {}) {
  const payload = {
    estado,
    actualizado_en: nowUtc(),
    ...extra,
  };

  if (estado === ESTADOS_SEGUIMIENTO.ENVIADO) {
    payload.enviado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO.CANCELADO) {
    payload.cancelado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO.RESPONDIDO) {
    payload.respondido_en = nowUtc();
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?id=eq.${id}`,
    payload,
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function cancelarCampana(campanaId, estado, motivo, opts = {}) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";
  const conexion = normalizarConexionId(opts.conexionWhatsappId);
  const clienteNumero =
    opts.clienteNumero != null ? String(opts.clienteNumero).trim() : "";
  const usuarioId =
    opts.usuarioId != null ? String(opts.usuarioId).trim() : "";

  if (!conexion || !clienteNumero || !usuarioId) {
    console.warn("[SEGUIMIENTO_MULTI] cancelarCampana omitido — requiere linea+cliente+usuario", {
      campana_id: campanaId,
      conexion_whatsapp_id: conexion ?? null,
      cliente_numero: clienteNumero || null,
      usuario_id: usuarioId || null,
    });
    return;
  }

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?campana_id=eq.${campanaId}` +
    `&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})` +
    `&${filtrosClaveLead(clienteNumero, usuarioId, conexion)}`;

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

async function cancelarPendientesCliente(
  numero,
  usuarioId,
  estado,
  motivo,
  opts = {}
) {
  const conexion = normalizarConexionId(opts.conexionWhatsappId);
  if (!conexion) {
    console.warn(
      "[SEGUIMIENTO_MULTI] cancelarPendientesCliente omitido — sin conexion_whatsapp_id",
      { cliente_numero: numero, usuario_id: usuarioId }
    );
    return;
  }

  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?${filtrosClaveLead(numero, usuarioId, conexion)}` +
    `&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})&detener_si_responde=eq.true`;

  if (opts.creadoAntesDe) {
    url += `&creado_en=lt.${encodeTimestampFilter(opts.creadoAntesDe)}`;
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

async function cancelarSeguimientosPendientesPorRemarketing({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
}) {
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";
  const cliente = clienteNumero != null ? String(clienteNumero).trim() : "";
  const conexion = normalizarConexionId(conexionWhatsappId);

  if (!usuario || !cliente || !conexion) return 0;

  const ahora = nowUtc();
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?` +
      `${filtrosClaveLead(cliente, usuario, conexion)}` +
      `&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})`,
    {
      estado: ESTADOS_SEGUIMIENTO.CANCELADO,
      cancelado_en: ahora,
      actualizado_en: ahora,
      error_detalle: "RM24H enviado",
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return (response.data || []).length;
}

async function clienteRespondioDespues(
  numero,
  usuarioId,
  checkpointAt,
  fallbackAt = null,
  conexionWhatsappId = null
) {
  const umbral = checkpointAt || fallbackAt;
  if (!umbral || !numero || !usuarioId) return false;

  const conexion = normalizarConexionId(conexionWhatsappId);
  if (!conexion) {
    console.log(
      `[SEGUIMIENTO_MULTI] clienteRespondioDespues omitido (sin conexion_whatsapp_id) cliente_numero=${numero}`
    );
    return false;
  }

  const checkpointEncoded = encodeTimestampFilter(umbral);

  const url =
    `${SUPABASE_URL}/rest/v1/mensajes?${filtrosClaveLead(numero, usuarioId, conexion)}` +
    `&direccion=eq.entrante&creado_en=gt.${checkpointEncoded}&select=id,creado_en,conexion_whatsapp_id&order=creado_en.asc&limit=5`;

  const response = await axios.get(url, { headers: headers() });
  const filas = (response.data || []).filter((row) =>
    mensajeCoincideConexion(row, conexion)
  );
  const mensaje = filas[0] || null;
  const hay = Boolean(mensaje);

  console.log(
    `[SEGUIMIENTO_MULTI] clienteRespondioDespues cliente_numero=${numero} usuario_id=${usuarioId} conexion_whatsapp_id=${conexion} checkpoint_at=${umbral} hay_respuesta=${hay} mensaje_id=${mensaje?.id ?? null} mensaje_conexion=${mensaje?.conexion_whatsapp_id ?? null}`
  );

  return hay;
}

/** Cancelación: solo mensajes de la misma línea que el seguimiento programado. */
async function leadRespondioParaSeguimiento(seguimiento, conexionMensajeEntrante = null) {
  if (!seguimiento?.cliente_numero || !seguimiento?.usuario_id) return false;

  if (!seguimientoMismaConexion(seguimiento, conexionMensajeEntrante)) {
    console.log(
      `[SEGUIMIENTO_MULTI] leadRespondioParaSeguimiento omitido seguimiento_id=${seguimiento.id} seg_conexion=${seguimiento.conexion_whatsapp_id ?? null} mensaje_conexion=${conexionMensajeEntrante ?? null}`
    );
    return false;
  }

  const conexionSeg = normalizarConexionId(seguimiento.conexion_whatsapp_id);
  if (!conexionSeg) return false;

  return clienteRespondioDespues(
    seguimiento.cliente_numero,
    seguimiento.usuario_id,
    seguimiento.checkpoint_at,
    seguimiento.creado_en,
    conexionSeg
  );
}

async function listarPendientesRespondibles(
  numero,
  usuarioId,
  limite = 100,
  conexionWhatsappId = null
) {
  if (!numero || !usuarioId) return [];

  const conexion = normalizarConexionId(conexionWhatsappId);
  if (!conexion) {
    console.warn(
      "[SEGUIMIENTO_MULTI] listarPendientesRespondibles omitido — sin conexion_whatsapp_id",
      { cliente_numero: numero, usuario_id: usuarioId }
    );
    return [];
  }

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?${filtrosClaveLead(numero, usuarioId, conexion)}` +
    `&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})` +
    `&or=(solo_si_no_respondio.eq.true,detener_si_responde.eq.true)` +
    `&order=creado_en.asc&limit=${limite}&select=*`;

  const response = await axios.get(url, { headers: headers() });
  const rows = (response.data || []).filter((row) =>
    seguimientoMismaConexion(row, conexion)
  );

  if (rows.length) {
    console.log(
      `[WORKER LISTAR PENDIENTES] respondibles total=${rows.length} cliente_numero=${numero} conexion_whatsapp_id=${conexion}`
    );
    rows.forEach((row) => logPendienteSeguimiento("RESPONDIBLES", row));
  }

  return rows;
}

async function listarPorCliente(numero, usuarioId, limite = 50) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  return response.data || [];
}

async function listarPorNodo(flujoId, nodoId, usuarioId, limite = 30) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?flujo_id=eq.${flujoId}&nodo_id=eq.${nodoId}&usuario_id=eq.${usuarioId}&order=creado_en.desc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  return response.data || [];
}

module.exports = {
  normalizarConexionId,
  seguimientoMismaConexion,
  insertarProgramados,
  buildClaveDedupPaso,
  existePasoEnviadoOProcesando,
  esUnicoProcesandoEnClave,
  cancelarPendientesDuplicadosClave,
  reservarPasoParaEnvio,
  obtenerSeguimientoPorId,
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  cancelarPendientesCliente,
  cancelarSeguimientosPendientesPorRemarketing,
  clienteRespondioDespues,
  leadRespondioParaSeguimiento,
  listarPendientesRespondibles,
  listarPorCliente,
  listarPorNodo,
};
