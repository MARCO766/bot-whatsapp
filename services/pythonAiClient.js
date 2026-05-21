/**
 * Cliente HTTP para el detector Python (fallback a iaLocalRouter.js si falla).
 */

const axios = require("axios");

const PYTHON_AI_TIMEOUT_MS = Number(process.env.PYTHON_AI_TIMEOUT_MS) || 5000;

function usePythonAi() {
  const v = String(process.env.USE_PYTHON_AI || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function resolvePythonBaseUrl() {
  let base = String(process.env.PYTHON_AI_URL || "http://localhost:8000").trim();
  base = base.replace(/\/+$/, "");
  if (/\/detect-intent(-pro)?$/i.test(base)) {
    return base.replace(/\/detect-intent(-pro)?$/i, "");
  }
  return base;
}

function resolveDetectIntentEndpoint() {
  return `${resolvePythonBaseUrl()}/detect-intent`;
}

function resolveDetectIntentProEndpoint() {
  return `${resolvePythonBaseUrl()}/detect-intent-pro`;
}

function nombreRuta(route) {
  return String(route?.nombre || route?.text || route?.name || "").trim();
}

function buildRoutesFromConfig(config) {
  const raw = config?.caminos ?? config?.routes;
  const caminos = Array.isArray(raw) ? raw : [];
  return caminos
    .map((r) => ({
      id: String(r.id || "").trim(),
      name: nombreRuta(r),
      synonyms: Array.isArray(r.synonyms)
        ? r.synonyms.map((s) => String(s || "").trim()).filter(Boolean)
        : String(r.synonyms || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      priority: parseInt(r.priority, 10) || 50,
    }))
    .filter((r) => r.id && r.name);
}

function mapPythonToAnalisis(pythonResult) {
  const matched = !!pythonResult?.matched;
  const routeId = matched ? pythonResult.route_id || null : null;

  return {
    ok: true,
    matched,
    intent: String(pythonResult?.intent || ""),
    score: Number(pythonResult?.score) || 0,
    route: routeId || "",
    routeId,
    ranking: [],
    textoNormalizado: "",
    textoCorregido: "",
    source: "python",
  };
}

async function detectarIntentPython({ message, context, routes, threshold }) {
  const payload = {
    message: String(message || ""),
    context: String(context || ""),
    routes,
    threshold: Math.min(100, Math.max(0, parseInt(threshold, 10) || 40)),
  };

  const url = resolveDetectIntentEndpoint();
  console.log("🐍 Enviando a Python IA:", { url, routes: routes.length, threshold: payload.threshold });
  console.log("🐍 Payload Python IA:", payload);

  const res = await axios.post(url, payload, {
    timeout: PYTHON_AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  console.log("🐍 Respuesta Python IA:", res.data);
  return res.data;
}

function mapPythonProToResult(pythonResult) {
  const action = pythonResult?.action === "route" ? "route" : "reply";
  return {
    ok: true,
    action,
    intent: String(pythonResult?.intent || ""),
    score: Number(pythonResult?.score) || 0,
    routeId: action === "route" ? pythonResult.route_id || null : null,
    reply: action === "reply" ? String(pythonResult?.reply || "").trim() : "",
    source: "python-pro",
  };
}

async function detectarIntentProPython(payload) {
  const url = resolveDetectIntentProEndpoint();
  console.log("🐍 Enviando a Python IA Pro:", url);

  const res = await axios.post(url, payload, {
    timeout: PYTHON_AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  console.log("🐍 Respuesta Python IA Pro:", res.data);
  return res.data;
}

module.exports = {
  usePythonAi,
  resolveDetectIntentEndpoint,
  resolveDetectIntentProEndpoint,
  buildRoutesFromConfig,
  detectarIntentPython,
  mapPythonToAnalisis,
  detectarIntentProPython,
  mapPythonProToResult,
};
