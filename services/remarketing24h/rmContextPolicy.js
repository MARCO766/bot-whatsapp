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

/**
 * Sin rm_context_policy en snapshot → allow_normal_triggers (flujos legacy).
 */
function leerRmContextPolicyDesdeSnapshot(configSnapshot) {
  const cfg = parseConfigSnapshot(configSnapshot);
  const raw = cfg.rm_context_policy;
  if (!raw || typeof raw !== "object") {
    return { ...POLICY_DEFAULT };
  }

  let mode = String(raw.mode || "").trim();
  if (!RM_CONTEXT_POLICY_MODES.includes(mode)) {
    return { ...POLICY_DEFAULT };
  }

  const dur = raw.duration && typeof raw.duration === "object" ? raw.duration : {};
  const unit = normalizarUnidadDuration(dur.unit) || POLICY_DEFAULT.duration.unit;
  let value = parseInt(dur.value, 10);
  if (!Number.isFinite(value) || value < 1) {
    value = POLICY_DEFAULT.duration.value;
  }

  return { mode, duration: { value, unit } };
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
  msDesdeRmContextDuration,
};
