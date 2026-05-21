/**
 * Resuelve el flujo ACTUAL del lead (no cualquier flujo del usuario).
 */
const axios = require("axios");
const { obtenerSesionIAPendiente } = require("../iaFlowSession");
const {
  resolverFlujoActivadorPorTexto,
  obtenerFlujoPorId,
} = require("./resolverFlujoActivador");
const { obtenerFlujoIdRemarketingPendiente } = require("./remarketingRepository");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

async function obtenerUltimoFlujoIdDesdeMensajes(clienteNumero, usuarioId) {
  if (!clienteNumero || !usuarioId) return null;

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(clienteNumero)}` +
      `&usuario_id=eq.${usuarioId}&flujo_id=not.is.null&select=flujo_id&order=creado_en.desc&limit=1`;

    const res = await axios.get(url, { headers: headers() });
    const row = (res.data || [])[0];
    return row?.flujo_id || null;
  } catch {
    return null;
  }
}

/**
 * Prioridad del flujo actual del lead:
 * 1) Activador del mensaje actual (entra / cambia de flujo)
 * 2) Sesión IA pendiente (sigue en el mismo flujo)
 * 3) Remarketing pendiente (contexto reciente)
 * 4) Último mensaje con flujo_id
 */
async function resolverFlujoActualDelLead({
  cliente_numero,
  usuario_id,
  texto_mensaje,
}) {
  console.log("[RM DEBUG] cliente=" + cliente_numero);

  if (!cliente_numero || !usuario_id) {
    return { ok: false, motivo: "sin_cliente_o_usuario" };
  }

  const sesionIa = obtenerSesionIAPendiente(usuario_id, cliente_numero);
  const flujoPendienteRm = await obtenerFlujoIdRemarketingPendiente(
    cliente_numero,
    usuario_id
  );
  const flujoUltimoMsg = await obtenerUltimoFlujoIdDesdeMensajes(
    cliente_numero,
    usuario_id
  );

  const activadorRes = await resolverFlujoActivadorPorTexto(
    texto_mensaje,
    usuario_id
  );

  let flujoIdActual = null;
  let fuente = null;
  let flujoPack = null;

  if (activadorRes.ok) {
    flujoIdActual = activadorRes.flujo.id;
    fuente = "activador_mensaje";
    flujoPack = {
      flujo: activadorRes.flujo,
      flujoDatos: activadorRes.flujoDatos,
    };
  } else if (sesionIa?.flujoId) {
    flujoIdActual = sesionIa.flujoId;
    fuente = "sesion_ia_pendiente";
    flujoPack = await obtenerFlujoPorId(flujoIdActual, usuario_id);
  } else if (flujoPendienteRm) {
    flujoIdActual = flujoPendienteRm;
    fuente = "remarketing_pendiente";
    flujoPack = await obtenerFlujoPorId(flujoIdActual, usuario_id);
  } else if (flujoUltimoMsg) {
    flujoIdActual = flujoUltimoMsg;
    fuente = "ultimo_mensaje";
    flujoPack = await obtenerFlujoPorId(flujoIdActual, usuario_id);
  }

  console.log(
    "[RM DEBUG] flujo actual del cliente=" + (flujoIdActual || "ninguno") +
      (fuente ? " | fuente=" + fuente : "")
  );

  if (!flujoIdActual || !flujoPack?.flujo || !flujoPack?.flujoDatos) {
    return { ok: false, motivo: "sin_flujo_actual" };
  }

  let flujoIdAnterior = null;
  if (flujoPendienteRm && flujoPendienteRm !== flujoIdActual) {
    flujoIdAnterior = flujoPendienteRm;
  } else if (
    activadorRes.ok &&
    sesionIa?.flujoId &&
    sesionIa.flujoId !== flujoIdActual
  ) {
    flujoIdAnterior = sesionIa.flujoId;
  }

  if (flujoIdAnterior) {
    console.log(
      "[RM DEBUG] cambio de flujo detectado | anterior=" +
        flujoIdAnterior +
        " | actual=" +
        flujoIdActual
    );
  }

  return {
    ok: true,
    flujoId: flujoIdActual,
    flujo: flujoPack.flujo,
    flujoDatos: flujoPack.flujoDatos,
    fuente,
    flujoIdAnterior,
  };
}

module.exports = {
  resolverFlujoActualDelLead,
};
