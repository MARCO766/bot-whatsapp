function logCancelacionRemarketing(motivo, numero, extra = {}) {
  console.log("[RM CANCEL DEBUG] motivo cancelación", motivo);
  console.log("[RM CANCEL DEBUG] cliente=", numero);
  console.log("[RM CANCEL DEBUG] etiquetas=", extra.etiquetas ?? []);
  console.log("[RM CANCEL DEBUG] compraDetectada=", extra.compraDetectada ?? false);
  console.log("[RM CANCEL DEBUG] payload=", extra.payload ?? extra.row ?? null);
  if (extra.detalle) {
    console.log("[RM CANCEL DEBUG] detalle=", extra.detalle);
  }
}

module.exports = {
  logCancelacionRemarketing,
};
