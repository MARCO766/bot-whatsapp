function envBool(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isSeguimientoLegacyEnabled() {
  return envBool("SEGUIMIENTO_LEGACY_ENABLED", true);
}

module.exports = {
  envBool,
  isSeguimientoLegacyEnabled,
};
