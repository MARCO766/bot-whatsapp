const {
  cancelarPendientesCliente,
} = require("./seguimientoRepository");
const { ESTADOS_SEGUIMIENTO } = require("./constants");

async function cancelarSeguimientosPorRespuesta(numero, usuarioId, io) {
  if (!numero) return;

  await cancelarPendientesCliente(
    numero,
    usuarioId,
    ESTADOS_SEGUIMIENTO.RESPONDIDO,
    "Lead respondió"
  );

  if (io && usuarioId) {
    io.to("user_" + usuarioId).emit("seguimiento-estado", {
      cliente_numero: numero,
      estado: ESTADOS_SEGUIMIENTO.RESPONDIDO,
      motivo: "respuesta_cliente",
    });
  }
}

module.exports = {
  cancelarSeguimientosPorRespuesta,
};
