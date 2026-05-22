const ESTADOS_RM24H = {
  ACTIVO: "activo",
  PENDIENTE_DISPARO: "pendiente_disparo",
  DISPARADO: "disparado",
  CANCELADO: "cancelado",
  CONVERTIDO: "convertido",
};

/** 23 horas — ventana WhatsApp Cloud API (no 24 exactas) */
const HORAS_INACTIVIDAD = 23;
const MS_INACTIVIDAD = HORAS_INACTIVIDAD * 60 * 60 * 1000;

const ESTADOS_ABIERTOS = [
  ESTADOS_RM24H.ACTIVO,
  ESTADOS_RM24H.PENDIENTE_DISPARO,
];

module.exports = {
  ESTADOS_RM24H,
  HORAS_INACTIVIDAD,
  MS_INACTIVIDAD,
  ESTADOS_ABIERTOS,
};
