const { cancelarPendientesCliente } = require("./remarketingRepository");
const { ESTADOS_REMARKETING } = require("./constants");
const { aplicarEtiquetaCliente } = require("./aplicarEtiqueta");
const {
  buscarNodoRemarketingEnFlujo,
  parseRemarketingFromNodo,
} = require("./parseRemarketingGlobalNode");
const { programarRemarketingGlobal } = require("./scheduleRemarketingGlobal");
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function obtenerFlujoData(flujoId) {
  if (!flujoId) return null;

  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flujoId}&select=data&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const row = (response.data || [])[0];
    return row?.data || null;
  } catch {
    return null;
  }
}

async function manejarRemarketingPorRespuesta(numero, usuarioId) {
  if (!numero || !usuarioId) return;

  const pendientesUrl = `${SUPABASE_URL}/rest/v1/remarketing_global_programados?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}&estado=eq.${ESTADOS_REMARKETING.PENDIENTE}&select=flujo_id,nodo_id,config_snapshot&limit=1`;

  let pendiente = null;

  try {
    const res = await axios.get(pendientesUrl, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    pendiente = (res.data || [])[0];
  } catch (err) {
    console.log("[REMARKETING] Error leyendo pendientes:", err.message);
    return;
  }

  if (!pendiente) return;

  const config =
    pendiente.config_snapshot ||
    (pendiente.flujo_id
      ? parseRemarketingFromNodo(
          buscarNodoRemarketingEnFlujo(
            await obtenerFlujoData(pendiente.flujo_id)
          ) || {}
        )
      : null);

  if (!config) return;

  const cond = config.condiciones || {};

  if (cond.detener_si_responde && !cond.reiniciar_si_responde) {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.RESPONDIDO,
      "Lead respondió"
    );
    if (config.etiquetas?.interesado) {
      await aplicarEtiquetaCliente(
        numero,
        config.etiquetas.interesado,
        usuarioId
      );
    }
    return;
  }

  if (cond.reiniciar_si_responde) {
    await cancelarPendientesCliente(
      numero,
      usuarioId,
      ESTADOS_REMARKETING.RESPONDIDO,
      "Reinicio por respuesta"
    );

    if (config.etiquetas?.interesado) {
      await aplicarEtiquetaCliente(
        numero,
        config.etiquetas.interesado,
        usuarioId
      );
    }

    if (!pendiente.flujo_id) return;

    const flujoData = await obtenerFlujoData(pendiente.flujo_id);
    const nodo = buscarNodoRemarketingEnFlujo(flujoData);
    if (!nodo) return;

    await programarRemarketingGlobal({
      numero,
      usuarioId,
      flujoId: pendiente.flujo_id,
      nodo: { ...nodo, id: pendiente.nodo_id || nodo.id },
      cancelarAnteriores: false,
    });

    console.log(
      "[REMARKETING] Secuencia reiniciada tras respuesta | cliente:",
      numero
    );
  }
}

module.exports = {
  manejarRemarketingPorRespuesta,
};
