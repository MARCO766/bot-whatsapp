const ESTADOS_SEGUIMIENTO = {
  PENDIENTE: "pendiente",
  PROCESANDO: "procesando",
  ENVIADO: "enviado",
  CANCELADO: "cancelado",
  RESPONDIDO: "respondido",
  FALLIDO_CONEXION_MISMATCH: "fallido_conexion_mismatch",
  ENVIADO_IDEMPOTENTE: "enviado_idempotente",
};

const UNIDADES_DELAY = ["minutos", "horas", "dias"];

const TIPOS_MENSAJE = ["texto", "imagen", "audio", "pdf", "video"];

module.exports = {
  ESTADOS_SEGUIMIENTO,
  UNIDADES_DELAY,
  TIPOS_MENSAJE,
};
