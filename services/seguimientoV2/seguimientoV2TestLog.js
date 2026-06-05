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

module.exports = {
  logSegV2Test,
};
