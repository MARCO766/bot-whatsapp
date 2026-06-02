import { resolveApiUrl } from "../flujos/apiBase";
import { MetricasApiError } from "./api";
import { CONEXION_TODAS } from "../utils/conexionesInbox";

const JSON_HEADERS = { "Content-Type": "application/json" };

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== CONEXION_TODAS) q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function request(path, { method = "GET", body, params } = {}) {
  const url = resolveApiUrl(`${path}${buildQuery(params || {})}`);

  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: JSON_HEADERS,
      ...(body != null ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    });
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

export function fetchMetaAdsStatus(params) {
  return request("/api/meta-ads/status", { params });
}

export function saveMetaAdsConfig(body) {
  return request("/api/meta-ads/config", { method: "POST", body });
}
