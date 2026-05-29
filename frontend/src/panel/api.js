import { resolveApiUrl } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class PanelApiError extends Error {
  constructor(message, code, status = 0) {
    super(message);
    this.name = "PanelApiError";
    this.code = code;
    this.status = status;
  }
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") q.set(k, v);
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
    throw new PanelApiError(
      "No se pudo conectar al servidor. Revisa que el backend esté en línea.",
      "NETWORK"
    );
  }

  if (res.status === 401) {
    throw new PanelApiError("Sesión no válida. Inicia sesión en MacBot.", "NO_AUTH", 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PanelApiError(data.error || `Error del servidor (${res.status})`, "SERVER", res.status);
  }
  return data;
}

export function fetchPanelDashboard(params = {}) {
  return request("/api/panel/dashboard", params);
}
