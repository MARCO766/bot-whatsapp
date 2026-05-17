import { resolveApiUrl, getBackendOrigin } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class ApiError extends Error {
  constructor(message, code, status = 0, details = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
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
  } catch (networkErr) {
    throw new ApiError(
      "No se pudo conectar al servidor. Revisa que el backend esté en línea.",
      "NETWORK",
      0,
      { url }
    );
  }

  const contentType = res.headers.get("content-type") || "";

  if (res.status === 401) {
    throw new ApiError("Sesión no válida. Inicia sesión en el panel MacBot.", "NO_AUTH", 401, {
      url,
    });
  }

  if (!contentType.includes("application/json")) {
    throw new ApiError("El servidor no devolvió JSON.", "API_UNAVAILABLE", res.status, { url });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || `Error del servidor (${res.status})`, "SERVER", res.status, {
      url,
      data,
    });
  }

  return data;
}

export function fetchActivadores() {
  return request("/api/activadores");
}

export function createActivador(payload) {
  return request("/api/activadores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateActivador(id, payload) {
  return request(`/api/activadores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteActivador(id) {
  return request(`/api/activadores/${id}`, { method: "DELETE" });
}

export function toggleActivador(id) {
  return request(`/api/activadores/${id}/toggle`, { method: "POST" });
}

export function loginUrl() {
  return `${getBackendOrigin()}/login`;
}

export { resolveApiUrl };
