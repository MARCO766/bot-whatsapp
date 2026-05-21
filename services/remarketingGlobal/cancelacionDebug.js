function capturarLlamador() {
  const stack = new Error().stack || "";
  const lineas = stack.split("\n").slice(2, 8);
  return lineas.map((l) => l.trim()).join(" <- ");
}

function logCancelacionRemarketing(motivo, numero, extra = {}) {
  const archivo = extra.archivo || extra.__archivo || "desconocido";
  console.log("[RM CANCEL DEBUG] archivo=", archivo);
  console.log("[RM CANCEL DEBUG] motivo=", motivo);
  console.log("[RM CANCEL DEBUG] flujo=", extra.flujoId ?? extra.flujo_id ?? null);
  console.log("[RM CANCEL DEBUG] cliente=", numero);
  console.log("[RM CANCEL DEBUG] row=", extra.row ?? extra.payload ?? null);
  console.log("[RM CANCEL DEBUG] etiquetas=", extra.etiquetas ?? []);
  console.log("[RM CANCEL DEBUG] compraDetectada=", extra.compraDetectada ?? false);
  if (extra.detalle) {
    console.log("[RM CANCEL DEBUG] detalle=", extra.detalle);
  }
  if (extra.funcion) {
    console.log("[RM CANCEL DEBUG] funcion=", extra.funcion);
  }
  if (extra.stack) {
    console.log("[RM CANCEL DEBUG] stack=", extra.stack);
  }
}

function logAntesDeCancelarRemarketing(archivo, funcion, motivo, ctx = {}) {
  logCancelacionRemarketing(motivo, ctx.cliente_numero || ctx.numero, {
    archivo,
    funcion,
    flujoId: ctx.flujo_id || ctx.flujoId,
    row: ctx.row,
    etiquetas: ctx.etiquetas,
    compraDetectada: ctx.compraDetectada,
    detalle: ctx.detalle,
    stack: capturarLlamador(),
  });
}

module.exports = {
  logCancelacionRemarketing,
  logAntesDeCancelarRemarketing,
  capturarLlamador,
};
