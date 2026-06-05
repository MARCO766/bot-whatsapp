function logSegV2Step(payload = {}) {
  console.log("[SEG_V2_STEP]", {
    campana_id: payload.campana_id ?? null,
    seguimiento_v2_id: payload.seguimiento_v2_id ?? null,
    paso_index: payload.paso_index ?? null,
    estado: payload.estado ?? null,
    run_at: payload.run_at ?? null,
    conexion_whatsapp_id: payload.conexion_whatsapp_id ?? null,
    contenido: payload.contenido ?? null,
  });
}

function logSegV2PendingCount(cantidad, extra = {}) {
  console.log("[SEG_V2_PENDING_COUNT]", {
    cantidad,
    ...extra,
  });
}

function logSegV2Test(payload = {}) {
  console.log("[SEG_V2_TEST]", {
    campana_id: payload.campana_id ?? null,
    seguimiento_v2_id: payload.seguimiento_v2_id ?? null,
    conexion_whatsapp_id: payload.conexion_whatsapp_id ?? null,
    phone_id: payload.phone_id ?? null,
    estado: payload.estado ?? null,
    prueba: payload.prueba ?? null,
    linea: payload.linea ?? null,
    paso_index: payload.paso_index ?? null,
    cliente_numero: payload.cliente_numero ?? null,
    motivo: payload.motivo ?? null,
  });
}

function logSegV2TestVariant(payload = {}) {
  console.log("[SEG_V2_TEST_VARIANT]", {
    conexion_whatsapp_id: payload.conexion_whatsapp_id ?? null,
    contenido: payload.contenido ?? null,
    campana_id: payload.campana_id ?? null,
    paso_index: payload.paso_index ?? null,
  });
}

module.exports = {
  logSegV2Test,
  logSegV2Step,
  logSegV2PendingCount,
  logSegV2TestVariant,
};
