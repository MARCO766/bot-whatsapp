const RM_CONTEXT_POLICY_MODES = [
  "until_conversion",
  "time_window",
  "allow_normal_triggers",
];

const POLICY_DEFAULT = {
  mode: "allow_normal_triggers",
  duration: { value: 24, unit: "hours" },
};

function normalizarUnidadDuration(unit) {
  const s = String(unit || "")
    .toLowerCase()
    .trim();
  if (
    s === "minuto" ||
    s === "minutos" ||
    s === "min" ||
    s === "minute" ||
    s === "minutes"
  ) {
    return "minutes";
  }
  if (s === "hora" || s === "horas" || s === "h" || s === "hour" || s === "hours") {
    return "hours";
  }
  if (
    s === "dia" ||
    s === "días" ||
    s === "dias" ||
    s === "day" ||
    s === "days"
  ) {
    return "days";
  }
  return null;
}

function parseConfigSnapshot(snapshot) {
  if (!snapshot) return {};
  if (typeof snapshot === "string") {
    try {
      return JSON.parse(snapshot);
    } catch {
      return {};
    }
  }
  if (typeof snapshot === "object" && !Array.isArray(snapshot)) {
    return snapshot;
  }
  return {};
}

function boolFromUnknown(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "1", "si", "sí", "on"].includes(s)) return true;
    if (["false", "0", "no", "off"].includes(s)) return false;
  }
  return null;
}

function leerActivarInterruptor(valor) {
  if (valor && typeof valor === "object") {
    return boolFromUnknown(valor.activar);
  }
  return boolFromUnknown(valor);
}

function extraerDurationDesdePolicyRaw(raw) {
  if (!raw || typeof raw !== "object") {
    return { ...POLICY_DEFAULT.duration };
  }

  const candidates = [raw.permanecerSoloTiempo, raw.duration];
  for (const src of candidates) {
    if (!src || typeof src !== "object") continue;
    const unit = normalizarUnidadDuration(src.unit ?? src.unidad);
    const value = parseInt(src.value ?? src.valor, 10);
    if (unit && Number.isFinite(value) && value >= 1) {
      return { value, unit };
    }
  }

  return { ...POLICY_DEFAULT.duration };
}

/**
 * Prioridad: permitir volver ON → permanecer solo tiempo → permanecer hasta compra → mode explícito.
 * permitirVolver OFF no debe pisar time_window si mode/interruptor de tiempo está activo.
 */
function resolverModeEfectivo(raw) {
  if (!raw || typeof raw !== "object") return null;

  const modeStr = String(raw.mode || "").trim();
  const permitirActivar = leerActivarInterruptor(raw.permitirVolverFlujoNormal);
  const soloTiempoActivar = leerActivarInterruptor(raw.permanecerSoloTiempo);
  const hastaCompraActivar = leerActivarInterruptor(raw.permanecerHastaCompraOFinRM);

  if (permitirActivar === true) return "allow_normal_triggers";

  if (soloTiempoActivar === true || modeStr === "time_window") {
    return "time_window";
  }

  if (hastaCompraActivar === true || modeStr === "until_conversion") {
    return "until_conversion";
  }

  if (permitirActivar === false && !modeStr) {
    return "until_conversion";
  }

  if (RM_CONTEXT_POLICY_MODES.includes(modeStr)) return modeStr;

  return null;
}

/**
 * Sin rm_context_policy en snapshot → allow_normal_triggers (flujos legacy).
 */
function leerRmContextPolicyDesdeSnapshot(configSnapshot) {
  const cfg = parseConfigSnapshot(configSnapshot);
  const raw = cfg.rm_context_policy;
  if (!raw || typeof raw !== "object") {
    return { ...POLICY_DEFAULT };
  }

  const duration = extraerDurationDesdePolicyRaw(raw);
  const mode = resolverModeEfectivo(raw);
  if (!mode || !RM_CONTEXT_POLICY_MODES.includes(mode)) {
    return { ...POLICY_DEFAULT };
  }

  return { mode, duration };
}

function msDesdeRmContextDuration(duration) {
  const d = duration || POLICY_DEFAULT.duration;
  const value = d.value;
  if (d.unit === "minutes") return value * 60 * 1000;
  if (d.unit === "hours") return value * 60 * 60 * 1000;
  if (d.unit === "days") return value * 24 * 60 * 60 * 1000;
  return POLICY_DEFAULT.duration.value * 60 * 60 * 1000;
}

function dentroVentanaTimeWindow(disparadoEn, policy, ahoraMs = Date.now()) {
  const t0 = new Date(disparadoEn).getTime();
  if (!Number.isFinite(t0)) return false;
  const fin = t0 + msDesdeRmContextDuration(policy.duration);
  return ahoraMs < fin;
}

function finVentanaTimeWindowIso(disparadoEn, policy) {
  const t0 = new Date(disparadoEn).getTime();
  if (!Number.isFinite(t0)) return null;
  return new Date(t0 + msDesdeRmContextDuration(policy.duration)).toISOString();
}

/**
 * @returns {boolean} true si deben bloquearse activadores del flujo normal
 */
function debeBloquearActivadoresNormales(policy, disparadoEn, ahoraMs = Date.now()) {
  const mode = policy?.mode || POLICY_DEFAULT.mode;

  if (mode === "allow_normal_triggers") {
    return false;
  }
  if (mode === "until_conversion") {
    return true;
  }
  if (mode === "time_window") {
    return dentroVentanaTimeWindow(disparadoEn, policy, ahoraMs);
  }
  return false;
}

module.exports = {
  RM_CONTEXT_POLICY_MODES,
  POLICY_DEFAULT,
  leerRmContextPolicyDesdeSnapshot,
  debeBloquearActivadoresNormales,
  dentroVentanaTimeWindow,
  finVentanaTimeWindowIso,
  msDesdeRmContextDuration,
  extraerDurationDesdePolicyRaw,
};
