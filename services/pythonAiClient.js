/**
 * Cliente HTTP para el detector Python (fallback a iaLocalRouter.js si falla).
 */

const axios = require("axios");

const PYTHON_AI_URL = String(process.env.PYTHON_AI_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);
const PYTHON_AI_TIMEOUT_MS = Number(process.env.PYTHON_AI_TIMEOUT_MS) || 5000;

function usePythonAi() {
  return String(process.env.USE_PYTHON_AI || "").toLowerCase() === "true";
}

function nombreRuta(route) {
  return String(route?.nombre || route?.text || route?.name || "").trim();
}

function buildRoutesFromConfig(config) {
  const caminos = Array.isArray(config?.caminos) ? config.caminos : [];
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

  console.log("🐍 Enviando a Python IA:", payload);

  const res = await axios.post(`${PYTHON_AI_URL}/detect-intent`, payload, {
    timeout: PYTHON_AI_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  console.log("🐍 Respuesta Python IA:", res.data);
  return res.data;
}

module.exports = {
  usePythonAi,
  buildRoutesFromConfig,
  detectarIntentPython,
  mapPythonToAnalisis,
};
