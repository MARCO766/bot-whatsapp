import { resolveApiUrl } from "../flujos/apiBase";
import { CONEXION_TODAS } from "../utils/conexionesInbox";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class MetricasApiError extends Error {
  constructor(message, code, status = 0) {
    super(message);
    this.name = "MetricasApiError";
    this.code = code;
    this.status = status;
  }
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== CONEXION_TODAS) q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function request(path, params = {}) {
  const url = resolveApiUrl(`${path}${buildQuery(params)}`);

  let res;
  try {
    res = await fetch(url, { credentials: "include", headers: JSON_HEADERS });
  } catch {
    throw new MetricasApiError(
      "No se pudo conectar al servidor. Revisa que el backend esté en línea.",
      "NETWORK"
    );
  }

  if (res.status === 401) {
    throw new MetricasApiError(
      "Sesión no válida. Inicia sesión en el panel MacBot.",
      "NO_AUTH",
      401
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MetricasApiError(data.error || `Error del servidor (${res.status})`, "SERVER", res.status);
  }
  return data;
}

export function fetchMetricasResumen(params) {
  return request("/api/metricas/resumen", params);
}

export function fetchMetricasFunnel(params) {
  return request("/api/metricas/funnel", params);
}

export function fetchMetricasSeries(params) {
  return request("/api/metricas/series", params);
}

export function fetchMetricasFlujos(params) {
  return request("/api/metricas/flujos", params);
}

export function fetchMetricasDiagnostico(params) {
  return request("/api/metricas/diagnostico", params);
}

export function fetchMetricasHeatmap(params) {
  return request("/api/metricas/heatmap", params);
}

export function fetchFlujosLista() {
  return request("/api/metricas/flujos-lista");
}

export function fetchMetricasRevenueBreakdown(params) {
  return request("/api/metricas/revenue-breakdown", params);
}
