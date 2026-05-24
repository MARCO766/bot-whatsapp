const {
  cancelarPendientesCliente,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");
const rt = require("../realtimeService");

async function cancelarSeguimientosPorRespuesta(numero, usuarioId, io, opts = {}) {
  if (!numero) return;

  await cancelarPendientesCliente(
    numero,
    usuarioId,
    ESTADOS_SEGUIMIENTO.RESPONDIDO,
    "Lead respondió",
    opts
  );

  rt.seguimientoActualizado(io, usuarioId, {
    cliente_numero: numero,
    estado: ESTADOS_SEGUIMIENTO.RESPONDIDO,
    motivo: "respuesta_cliente",
  });
}

module.exports = {
  cancelarSeguimientosPorRespuesta,
};
