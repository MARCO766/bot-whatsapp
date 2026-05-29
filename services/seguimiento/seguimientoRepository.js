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
    item.campana_id || "",
    String(item.paso_index ?? ""),
  ].join("|");
}

function filtroEqCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") {
    return `${campo}=is.null`;
  }
  return `${campo}=eq.${encodeURIComponent(valor)}`;
}

/** Multi-número: filtra por línea WhatsApp; sin id = comportamiento legacy (sin filtro). */
function filtroConexionWhatsapp(conexionWhatsappId) {
  if (!conexionWhatsappId) return "";
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}`;
}

/** Deduplicación solo dentro del mismo lote (campana_id). */
async function existePasoEnviadoOProcesando(item, excludeId = null) {
  if (!item.campana_id) return null;

  const estados = [
    ESTADOS_SEGUIMIENTO.ENVIADO,
    ESTADOS_SEGUIMIENTO.PROCESANDO,
  ].join(",");

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?campana_id=eq.${item.campana_id}` +
    `&estado=in.(${estados})` +
    `&paso_index=eq.${item.paso_index}` +
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

/** Tras reservar: solo una fila en "procesando" por lote+paso debe enviar. */
async function esUnicoProcesandoEnClave(item) {
  if (!item.campana_id) return true;

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PROCESANDO}&${filtrosLotePaso(item)}&select=id&order=id.asc&limit=1`,
    { headers: headers() }
  );
  const primero = (response.data || [])[0];
  return primero?.id === item.id;
}

async function cancelarPendientesDuplicadosClave(item, exceptId) {
  if (!item.campana_id) return;

  const url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&${filtrosLotePaso(item)}&id=neq.${exceptId}`;

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

  return (response.data || [])[0] || null;
}

async function obtenerPendientesVencidos(limite = 40) {
  const ahora = new Date();
  const ahoraEncoded = encodeTimestampFilter(ahora);

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?estado=eq.${ESTADOS_SEGUIMIENTO.PENDIENTE}&run_at=lte.${ahoraEncoded}&order=run_at.asc&limit=${limite}&select=*`,
    { headers: headers() }
  );

  const pendientes = response.data || [];

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

async function cancelarCampana(campanaId, estado, motivo) {
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?campana_id=eq.${campanaId}&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})`,
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
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO.RESPONDIDO ? "respondido_en" : "cancelado_en";

  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${numero}&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})&detener_si_responde=eq.true`;

  if (usuarioId) {
    url += `&usuario_id=eq.${usuarioId}`;
  }

  if (opts.creadoAntesDe) {
    url += `&creado_en=lt.${encodeTimestampFilter(opts.creadoAntesDe)}`;
  }

  url += filtroConexionWhatsapp(opts.conexionWhatsappId);

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

async function clienteRespondioDespues(
  numero,
  usuarioId,
  checkpointAt,
  fallbackAt = null,
  conexionWhatsappId = null
) {
  const umbral = checkpointAt || fallbackAt;
  if (!umbral) return false;

  const checkpointEncoded = encodeTimestampFilter(umbral);

  let url =
    `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&direccion=eq.entrante&creado_en=gt.${checkpointEncoded}&select=id,creado_en,conexion_whatsapp_id&limit=1`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  url += filtroConexionWhatsapp(conexionWhatsappId);

  const response = await axios.get(url, { headers: headers() });
  const hay = (response.data || []).length > 0;

  console.log("[SEGUIMIENTO_MULTI] respuesta después del checkpoint", {
    usuario_id: usuarioId,
    cliente_numero: numero,
    conexion_whatsapp_id: conexionWhatsappId || null,
    checkpoint_at: umbral,
    hay_respuesta: hay,
    mensaje: response.data?.[0] || null,
  });

  return hay;
}

async function listarPendientesRespondibles(
  numero,
  usuarioId,
  limite = 100,
  conexionWhatsappId = null
) {
  let url =
    `${SUPABASE_URL}/rest/v1/seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}` +
    `&estado=in.(${ESTADOS_SEGUIMIENTO.PENDIENTE},${ESTADOS_SEGUIMIENTO.PROCESANDO})` +
    `&or=(solo_si_no_respondio.eq.true,detener_si_responde.eq.true)` +
    `&order=creado_en.asc&limit=${limite}&select=*`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  url += filtroConexionWhatsapp(conexionWhatsappId);

  const response = await axios.get(url, { headers: headers() });
  return response.data || [];
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
  insertarProgramados,
  buildClaveDedupPaso,
  existePasoEnviadoOProcesando,
  esUnicoProcesandoEnClave,
  cancelarPendientesDuplicadosClave,
  reservarPasoParaEnvio,
  obtenerPendientesVencidos,
  actualizarEstado,
  cancelarCampana,
  cancelarPendientesCliente,
  clienteRespondioDespues,
  listarPendientesRespondibles,
  listarPorCliente,
  listarPorNodo,
};
