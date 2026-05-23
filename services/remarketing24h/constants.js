const ESTADOS_RM24H = {
  ACTIVO: "activo",
  PENDIENTE_DISPARO: "pendiente_disparo",
  PROCESANDO: "procesando",
  DISPARADO: "disparado",
  /** Legacy — migrar a CANCELADO_CONVERSION */
  CANCELADO: "cancelado",
  CONVERTIDO: "convertido",
  CANCELADO_CONVERSION: "cancelado_conversion",
  CANCELADO_RESPUESTA: "cancelado_respuesta",
  EXPIRADO_VENTANA: "expirado_ventana",
  CERRADO_SIN_RESPUESTA: "cerrado_sin_respuesta",
};

const MOTIVOS_RM24H = {
  CONVERSION: "conversion",
  MAX_INTENTOS_TRAS_ENVIO: "max_intentos_tras_envio",
  MAX_INTENTOS: "max_intentos",
  VENTANA_CERRADA: "ventana_whatsapp_cerrada",
  MENSAJE_VACIO: "mensaje_vacio",
};

/** Máximo / default — ventana WhatsApp Cloud API (no 24 exactas) */
const HORAS_INACTIVIDAD = 23;
const HORAS_INACTIVIDAD_MIN = 1;
const MS_INACTIVIDAD = HORAS_INACTIVIDAD * 60 * 60 * 1000;

function clampHorasInactividad(val) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return HORAS_INACTIVIDAD;
  if (n < HORAS_INACTIVIDAD_MIN) return HORAS_INACTIVIDAD_MIN;
  if (n > HORAS_INACTIVIDAD) return HORAS_INACTIVIDAD;
  return n;
}

function msInactividadDesdeHoras(horas) {
  return clampHorasInactividad(horas) * 60 * 60 * 1000;
}

function horasDesdeConfigOrigen(origen) {
  if (!origen || typeof origen !== "object") return HORAS_INACTIVIDAD;
  let snap = origen.config_snapshot ?? origen;
  if (typeof snap === "string") {
    try {
      snap = JSON.parse(snap);
    } catch {
      snap = {};
    }
  }
  if (!snap || typeof snap !== "object") return HORAS_INACTIVIDAD;
  return clampHorasInactividad(snap.horasInactividad ?? HORAS_INACTIVIDAD);
}

/** Single shot: un solo remarketing por ciclo (sin reprogramar expira_en) */
const MAX_INTENTOS = 1;

const ESTADOS_ABIERTOS = [
  ESTADOS_RM24H.ACTIVO,
  ESTADOS_RM24H.PENDIENTE_DISPARO,
  ESTADOS_RM24H.PROCESANDO,
];

const ESTADOS_REINICIO_RESPUESTA = [
  ESTADOS_RM24H.ACTIVO,
  ESTADOS_RM24H.PENDIENTE_DISPARO,
  ESTADOS_RM24H.PROCESANDO,
];

module.exports = {
  ESTADOS_RM24H,
  MOTIVOS_RM24H,
  HORAS_INACTIVIDAD,
  HORAS_INACTIVIDAD_MIN,
  MS_INACTIVIDAD,
  clampHorasInactividad,
  msInactividadDesdeHoras,
  horasDesdeConfigOrigen,
  MAX_INTENTOS,
  ESTADOS_ABIERTOS,
  ESTADOS_REINICIO_RESPUESTA,
};
