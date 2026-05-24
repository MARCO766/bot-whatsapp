const crypto = require("crypto");
const axios = require("axios");
const { parseSeguimientoFromHtml } = require("./parseSeguimientoNode");
const { insertarProgramados } = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const { nowUtc, toTimestamptzUtc } = require("./timestamps");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function ultimoMensajeEntranteAt(numero, usuarioId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !numero) return null;

  let url =
    `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}` +
    `&direccion=eq.entrante&order=creado_en.desc&limit=1&select=creado_en`;

  if (usuarioId) {
    url += `&usuario_id=eq.${encodeURIComponent(usuarioId)}`;
  }

  try {
    const response = await axios.get(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    return response.data?.[0]?.creado_en || null;
  } catch {
    return null;
  }
}

async function programarSeguimientoNodo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  html,
}) {
  const config = parseSeguimientoFromHtml(html);

  if (!config.pasos.length) {
    console.log("[SEGUIMIENTO] Sin pasos válidos para programar | nodo:", nodoId);
    return { campanaId: null, programados: 0 };
  }

  const campanaId = crypto.randomUUID();
  const checkpointAt =
    (await ultimoMensajeEntranteAt(numero, usuarioId)) || nowUtc();
  let acumuladoSegundos = 0;

  console.log("[SEGUIMIENTO] programando pasos", {
    nodoId,
    cliente: numero,
    pasos: config.pasos.length,
    checkpoint_at: checkpointAt,
  });
  const rows = [];

  config.pasos.forEach((paso, index) => {
    acumuladoSegundos += paso.segundos;
    const runAt = toTimestamptzUtc(Date.now() + acumuladoSegundos * 1000);

    rows.push({
      campana_id: campanaId,
      usuario_id: usuarioId || null,
      cliente_numero: numero,
      flujo_id: flujoId || null,
      nodo_id: nodoId,
      paso_index: index,
      paso_id: paso.id,
      run_at: runAt,
      mensaje_tipo: paso.mensaje.tipo,
      mensaje_payload: {
        ...paso.mensaje,
        botones: paso.botones || [],
      },
      solo_si_no_respondio: config.soloSiNoRespondio,
      detener_si_responde: config.detenerSiResponde,
      checkpoint_at: checkpointAt,
      estado: ESTADOS_SEGUIMIENTO.PENDIENTE,
    });
  });

  const insertados = await insertarProgramados(rows);

  console.log(
    "[SEGUIMIENTO] Programados:",
    insertados.length,
    "paso(s) | cliente:",
    numero,
    "| campaña:",
    campanaId
  );

  return { campanaId, programados: insertados.length, items: insertados };
}

module.exports = {
  programarSeguimientoNodo,
};
