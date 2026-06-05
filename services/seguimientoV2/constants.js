const ESTADOS_SEGUIMIENTO_V2 = {
  PENDIENTE: "pendiente",
  PROCESANDO: "procesando",
  ENVIADO: "enviado",
  CANCELADO: "cancelado",
  RESPONDIDO: "respondido",
  FALLIDO: "fallido",
  OMITIDO_DUPLICADO: "omitido_duplicado",
};

const ESTADOS_ACTIVOS_V2 = [
  ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
  ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
];

module.exports = {
  ESTADOS_SEGUIMIENTO_V2,
  ESTADOS_ACTIVOS_V2,
};
