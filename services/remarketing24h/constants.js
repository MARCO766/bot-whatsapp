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
  CANCELADO_RESETBOT: "cancelado_resetbot",
};

const MOTIVOS_RM24H = {
  CONVERSION: "conversion",
  MAX_INTENTOS_TRAS_ENVIO: "max_intentos_tras_envio",
  MAX_INTENTOS: "max_intentos",
  VENTANA_CERRADA: "ventana_whatsapp_cerrada",
  MENSAJE_VACIO: "mensaje_vacio",
  RESETBOT: "resetbot",
  /** Resetbot invalidó contexto Motor 1A (fila post-envío sigue en historial). */
  RESETBOT_CONTEXT_CLEARED: "resetbot_context_cleared",
};

/** Máximo / default inactividad RM24H antes de disparar (no 24 exactas) */
const HORAS_INACTIVIDAD = 23;
const HORAS_INACTIVIDAD_MIN = 1;
const MS_INACTIVIDAD = HORAS_INACTIVIDAD * 60 * 60 * 1000;

const UNIDADES_TIEMPO_INACTIVIDAD = ["minutos", "horas", "dias"];

const TIEMPO_INACTIVIDAD_DEFAULT = {
  valor: HORAS_INACTIVIDAD,
  unidad: "horas",
};

const PRESETS_TIEMPO_INACTIVIDAD = {
  minutos: [1, 5, 10, 15, 30],
  horas: [1, 2, 4, 8, 12, 23],
  dias: [1, 2, 3, 7],
};

/** Ventana de mensajería WhatsApp Cloud API desde último mensaje del lead */
const HORAS_VENTANA_WHATSAPP = 24;
const MS_VENTANA_WHATSAPP = HORAS_VENTANA_WHATSAPP * 60 * 60 * 1000;

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

function normalizarUnidadTiempoInactividad(unidad) {
  const s = String(unidad ?? "")
    .toLowerCase()
    .trim();
  if (s === "minuto" || s === "minutos" || s === "min") return "minutos";
  if (s === "hora" || s === "horas" || s === "h") return "horas";
  if (s === "dia" || s === "días" || s === "dias" || s === "day" || s === "days") {
    return "dias";
  }
  return null;
}

function normalizarTiempoInactividad(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return { ...TIEMPO_INACTIVIDAD_DEFAULT };
  }

  const anidado = raw.tiempoInactividad;
  if (anidado && typeof anidado === "object") {
    const unidad = normalizarUnidadTiempoInactividad(anidado.unidad);
    const valor = parseInt(anidado.valor, 10);
    if (unidad && Number.isFinite(valor) && valor > 0) {
      return { valor, unidad };
    }
  }

  if (raw.horasInactividad != null) {
    const valor = parseInt(raw.horasInactividad, 10);
    if (Number.isFinite(valor) && valor > 0) {
      return {
        valor: clampHorasInactividad(valor),
        unidad: "horas",
      };
    }
  }

  return { ...TIEMPO_INACTIVIDAD_DEFAULT };
}

function msDesdeTiempoInactividad(tiempo) {
  const t = normalizarTiempoInactividad({ tiempoInactividad: tiempo });
  const valor = t.valor;
  if (t.unidad === "minutos") return valor * 60 * 1000;
  if (t.unidad === "horas") return valor * 60 * 60 * 1000;
  if (t.unidad === "dias") return valor * 24 * 60 * 60 * 1000;
  return MS_INACTIVIDAD;
}

function msInactividadDesdeConfig(configOrigen) {
  if (!configOrigen || typeof configOrigen !== "object") {
    return MS_INACTIVIDAD;
  }

  let snap = configOrigen.config_snapshot ?? configOrigen;
  if (typeof snap === "string") {
    try {
      snap = JSON.parse(snap);
    } catch {
      snap = {};
    }
  }
  if (!snap || typeof snap !== "object") {
    return MS_INACTIVIDAD;
  }

  return msDesdeTiempoInactividad(normalizarTiempoInactividad(snap));
}

function expiraEnDesdeConfig(configOrigen, ahoraMs = Date.now()) {
  return new Date(ahoraMs + msInactividadDesdeConfig(configOrigen)).toISOString();
}

function horasDesdeConfigOrigen(origen) {
  const ms = msInactividadDesdeConfig(origen);
  return Math.max(HORAS_INACTIVIDAD_MIN, Math.ceil(ms / (60 * 60 * 1000)));
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
  UNIDADES_TIEMPO_INACTIVIDAD,
  TIEMPO_INACTIVIDAD_DEFAULT,
  PRESETS_TIEMPO_INACTIVIDAD,
  HORAS_VENTANA_WHATSAPP,
  MS_VENTANA_WHATSAPP,
  clampHorasInactividad,
  msInactividadDesdeHoras,
  normalizarUnidadTiempoInactividad,
  normalizarTiempoInactividad,
  msDesdeTiempoInactividad,
  msInactividadDesdeConfig,
  expiraEnDesdeConfig,
  horasDesdeConfigOrigen,
  MAX_INTENTOS,
  ESTADOS_ABIERTOS,
  ESTADOS_REINICIO_RESPUESTA,
};
