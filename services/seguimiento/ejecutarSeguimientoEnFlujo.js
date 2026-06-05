const { programarSeguimientoNodo } = require("./scheduleSeguimiento");
const { parseSeguimientoFromHtml } = require("./parseSeguimientoNode");

async function ejecutarSeguimientoEnFlujo({
  numero,
  usuarioId,
  flujoId,
  nodoId,
  nodo,
  conexionWhatsappId = null,
}) {
  const html = nodo.html || "";
  const className = nodo.className || "";

  console.log("[SEGUIMIENTO] nodo detectado", { nodoId, flujoId, numero });
  console.log("[SEGUIMIENTO] ─────────────────────────────");
  console.log("[SEGUIMIENTO] Nodo actual:", nodoId);
  console.log("[SEGUIMIENTO] Tipo detectado: seguimiento");
  console.log("[SEGUIMIENTO] className:", className);
  console.log(
    "[SEGUIMIENTO] cliente:",
    numero,
    "| usuario:",
    usuarioId,
    "| flujo:",
    flujoId,
    "| conexion:",
    conexionWhatsappId || "(legacy)"
  );

  const config = parseSeguimientoFromHtml(html);

  console.log("[SEGUIMIENTO] Pasos en configuración:", config.pasos.length);

  if (!config.pasos.length) {
    console.log(
      "[SEGUIMIENTO] ⚠ Sin pasos válidos (revisa retraso + mensaje en el panel y guarda el flujo)"
    );
    return { campanaId: null, programados: 0, omitido: true };
  }

  config.pasos.forEach((paso, i) => {
    console.log(
      "[SEGUIMIENTO]   paso",
      i + 1,
      "|",
      paso.delay.valor,
      paso.delay.unidad,
      "|",
      paso.mensaje.tipo,
      "|",
      (paso.mensaje.texto || paso.mensaje.url || "").slice(0, 40)
    );
  });

  const conexionId =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : null;

  if (!conexionId) {
    throw new Error(
      "ejecutarSeguimientoEnFlujo: conexion_whatsapp_id obligatorio (línea entrante del webhook)"
    );
  }

  console.log(
    `[EJECUTAR SEGUIMIENTO FLUJO] cliente_numero=${numero} flujo_id=${flujoId ?? null} nodo_id=${nodoId} conexion_whatsapp_id=${conexionId}`
  );

  const result = await programarSeguimientoNodo({
    numero,
    usuarioId,
    flujoId,
    nodoId,
    html,
    conexionWhatsappId: conexionId,
    origen: "ejecutarSeguimientoEnFlujo",
  });

  console.log("[SEGUIMIENTO] insert seguimiento", {
    programados: result.programados,
    campanaId: result.campanaId,
  });
  console.log(
    "[SEGUIMIENTO] ✓ Insertados en Supabase:",
    result.programados,
    "| campaña:",
    result.campanaId
  );

  return result;
}

module.exports = {
  ejecutarSeguimientoEnFlujo,
};
