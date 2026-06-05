const axios = require("axios");
const { ESTADOS_SEGUIMIENTO_V2, ESTADOS_ACTIVOS_V2 } = require("./constants");
const { nowUtc, encodeTimestampFilter } = require("./timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const TABLA = "seguimientos_v2";
const TABLA_LOGS = "seguimientos_v2_logs";

const SELECT_WORKER =
  "id,usuario_id,conexion_whatsapp_id,cliente_numero,flujo_id,nodo_id,campana_id,paso_index,paso_id,tipo,contenido,media_url,media_type,media_filename,estado,run_at,checkpoint_at,cancelar_si_responde,created_at,updated_at";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

function filtroConexionWhatsapp(conexionWhatsappId) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  if (!conexion) {
    throw new Error(
      "filtroConexionWhatsapp requiere conexion_whatsapp_id (clave triple)"
    );
  }
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexion)}`;
}

function filtrosClaveTriple({ usuarioId, numero, conexionWhatsappId }) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const cliente = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!usuario || !cliente || !conexion) {
    throw new Error(
      "filtrosClaveTriple requiere usuarioId, numero y conexionWhatsappId"
    );
  }

  return (
    `usuario_id=eq.${encodeURIComponent(usuario)}` +
    `&cliente_numero=eq.${encodeURIComponent(cliente)}` +
    filtroConexionWhatsapp(conexion)
  );
}

function filtroEqCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") {
    return `${campo}=is.null`;
  }
  return `${campo}=eq.${encodeURIComponent(valor)}`;
}

async function insertarPasos(rows) {
  if (!rows.length) return [];

  const response = await axios.post(
    `${SUPABASE_URL}/rest/v1/${TABLA}`,
    rows,
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return response.data || [];
}

async function obtenerPendientesVencidos({ limite = 40 } = {}) {
  const ahoraEncoded = encodeTimestampFilter(new Date());

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/${TABLA}?estado=eq.${ESTADOS_SEGUIMIENTO_V2.PENDIENTE}` +
      `&run_at=lte.${ahoraEncoded}` +
      `&order=run_at.asc&limit=${limite}&select=${SELECT_WORKER}`,
    { headers: headers() }
  );

  return response.data || [];
}

async function reservarParaEnvio(id) {
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}` +
      `&estado=eq.${ESTADOS_SEGUIMIENTO_V2.PENDIENTE}`,
    {
      estado: ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
      updated_at: nowUtc(),
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return (response.data || [])[0] || null;
}

async function actualizarEstado(id, estado, extra = {}) {
  const payload = {
    estado,
    updated_at: nowUtc(),
    ...extra,
  };

  if (estado === ESTADOS_SEGUIMIENTO_V2.ENVIADO && payload.enviado_en == null) {
    payload.enviado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO_V2.CANCELADO && payload.cancelado_en == null) {
    payload.cancelado_en = nowUtc();
  }
  if (estado === ESTADOS_SEGUIMIENTO_V2.RESPONDIDO && payload.respondido_en == null) {
    payload.respondido_en = nowUtc();
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}`,
    payload,
    { headers: headers({ Prefer: "return=minimal" }) }
  );
}

async function listarPorCampana(campanaId) {
  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/${TABLA}?campana_id=eq.${encodeURIComponent(campanaId)}` +
      `&order=paso_index.asc&select=${SELECT_WORKER}`,
    { headers: headers() }
  );

  return response.data || [];
}

async function listarPendientesPorClaveTriple({
  usuarioId,
  numero,
  conexionWhatsappId,
  limite = 100,
} = {}) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  if (!usuarioId || !numero || !conexion) {
    return [];
  }

  const estados = ESTADOS_ACTIVOS_V2.join(",");

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/${TABLA}?${filtrosClaveTriple({
      usuarioId,
      numero,
      conexionWhatsappId: conexion,
    })}` +
      `&estado=in.(${estados})` +
      `&order=run_at.asc&limit=${limite}&select=${SELECT_WORKER}`,
    { headers: headers() }
  );

  return response.data || [];
}

async function cancelarCampana(campanaId, clave = {}) {
  const conexion = normalizarConexionId(clave.conexionWhatsappId);
  const clienteNumero =
    clave.numero != null ? String(clave.numero).trim() : "";
  const usuarioId =
    clave.usuarioId != null ? String(clave.usuarioId).trim() : "";

  if (!campanaId || !conexion || !clienteNumero || !usuarioId) {
    console.warn("[SEG_V2] cancelarCampana omitido — requiere campanaId + clave triple", {
      campana_id: campanaId ?? null,
      usuario_id: usuarioId || null,
      cliente_numero: clienteNumero || null,
      conexion_whatsapp_id: conexion ?? null,
    });
    return 0;
  }

  const estado = clave.estado || ESTADOS_SEGUIMIENTO_V2.CANCELADO;
  const ahora = nowUtc();
  const campoFecha =
    estado === ESTADOS_SEGUIMIENTO_V2.RESPONDIDO ? "respondido_en" : "cancelado_en";

  const estadosCancelables = ESTADOS_ACTIVOS_V2.join(",");

  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?campana_id=eq.${encodeURIComponent(campanaId)}` +
      `&estado=in.(${estadosCancelables})` +
      `&${filtrosClaveTriple({ usuarioId, numero: clienteNumero, conexionWhatsappId: conexion })}`,
    {
      estado,
      updated_at: ahora,
      [campoFecha]: ahora,
      error_detalle: clave.motivo || null,
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return (response.data || []).length;
}

async function insertarLog({
  seguimientoId,
  usuarioId,
  conexionWhatsappId,
  numero,
  evento,
  detalle = {},
}) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const cliente = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!seguimientoId || !usuario || !cliente || !conexion || !evento) {
    throw new Error(
      "insertarLog requiere seguimientoId, usuarioId, conexionWhatsappId, numero y evento"
    );
  }

  const response = await axios.post(
    `${SUPABASE_URL}/rest/v1/${TABLA_LOGS}`,
    {
      seguimiento_id: seguimientoId,
      usuario_id: usuario,
      conexion_whatsapp_id: conexion,
      cliente_numero: cliente,
      evento: String(evento),
      detalle: detalle && typeof detalle === "object" ? detalle : {},
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return (response.data || [])[0] || null;
}

async function obtenerPorId(id) {
  if (!id) return null;

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}` +
      `&select=${SELECT_WORKER}&limit=1`,
    { headers: headers() }
  );

  return (response.data || [])[0] || null;
}

async function cancelarPendientesPorRespuestaLead({
  usuarioId,
  numero,
  conexionWhatsappId,
} = {}) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const cliente = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!usuario || !cliente || !conexion) {
    return [];
  }

  const ahora = nowUtc();
  const estadosCancelables = ESTADOS_ACTIVOS_V2.join(",");

  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/${TABLA}?${filtrosClaveTriple({
      usuarioId: usuario,
      numero: cliente,
      conexionWhatsappId: conexion,
    })}` +
      `&estado=in.(${estadosCancelables})` +
      `&cancelar_si_responde=eq.true`,
    {
      estado: ESTADOS_SEGUIMIENTO_V2.RESPONDIDO,
      respondido_en: ahora,
      cancelado_en: ahora,
      error_detalle: "lead_respondio",
      updated_at: ahora,
    },
    { headers: headers({ Prefer: "return=representation" }) }
  );

  return response.data || [];
}

async function obtenerCampanaActiva({
  usuarioId,
  numero,
  conexionWhatsappId,
  flujoId,
  nodoId,
}) {
  const conexion = normalizarConexionId(conexionWhatsappId);
  const cliente = numero != null ? String(numero).trim() : "";
  const usuario = usuarioId != null ? String(usuarioId).trim() : "";

  if (!usuario || !cliente || !conexion || !nodoId) {
    return null;
  }

  const estadosActivos = ESTADOS_ACTIVOS_V2.join(",");

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLA}?` +
    `${filtrosClaveTriple({ usuarioId: usuario, numero: cliente, conexionWhatsappId: conexion })}` +
    `&${filtroEqCampo("flujo_id", flujoId)}` +
    `&nodo_id=eq.${encodeURIComponent(nodoId)}` +
    `&estado=in.(${estadosActivos})` +
    `&select=campana_id,estado,conexion_whatsapp_id,created_at` +
    `&order=created_at.desc&limit=1`;

  const response = await axios.get(url, { headers: headers() });
  const row = (response.data || [])[0] || null;

  if (!row) return null;

  const rowConn = normalizarConexionId(row.conexion_whatsapp_id);
  if (rowConn !== conexion) return null;

  return {
    campana_id: row.campana_id,
    estado: row.estado,
    conexion_whatsapp_id: rowConn,
  };
}

module.exports = {
  insertarPasos,
  obtenerPendientesVencidos,
  obtenerPorId,
  reservarParaEnvio,
  actualizarEstado,
  listarPorCampana,
  listarPendientesPorClaveTriple,
  cancelarCampana,
  cancelarPendientesPorRespuestaLead,
  insertarLog,
  obtenerCampanaActiva,
  normalizarConexionId,
  filtrosClaveTriple,
};
