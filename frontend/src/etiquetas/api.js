import { resolveApiUrl } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class ApiError extends Error {
  constructor(message, code, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  const url = resolveApiUrl(path);
  let res;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: JSON_HEADERS,
      ...options,
    });
  } catch {
    throw new ApiError("No se pudo conectar al servidor.", "NETWORK");
  }

  if (res.status === 401) {
    throw new ApiError("Sesión no válida. Inicia sesión en MacBot.", "NO_AUTH", 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Error (${res.status})`, "SERVER", res.status);
  }
  return data;
}

export function fetchEtiquetas() {
  return request("/api/etiquetas");
}

export function createEtiqueta(body) {
  return request("/api/etiquetas", { method: "POST", body: JSON.stringify(body) });
}

export function updateEtiqueta(id, body) {
  return request(`/api/etiquetas/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteEtiqueta(id) {
  return request(`/api/etiquetas/${id}`, { method: "DELETE" });
}

export function loginUrl() {
  return resolveApiUrl("/login");
}
