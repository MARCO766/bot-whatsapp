import { getBackendOrigin, resolveApiUrl } from "./apiBase";

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
    console.error("[Flujos API] Red:", url, networkErr);
    throw new ApiError(
      "No se pudo conectar al servidor. Revisa que el backend esté en línea.",
      "NETWORK",
      0,
      { url }
    );
  }

  const contentType = res.headers.get("content-type") || "";

  if (res.status === 401) {
    throw new ApiError(
      "Sesión no válida. Inicia sesión en el panel MacBot.",
      "NO_AUTH",
      401,
      { url }
    );
  }

  if (!contentType.includes("application/json")) {
    const hint =
      res.status === 404
        ? "Ruta API no encontrada en este dominio."
        : "El servidor no devolvió JSON (¿frontend y backend en dominios distintos sin VITE_API_BASE_URL?).";
    throw new ApiError(hint, "API_UNAVAILABLE", res.status, { url });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || `Error del servidor (${res.status})`,
      "SERVER",
      res.status,
      { url, data }
    );
  }

  return data;
}

export function fetchFlows() {
  return request("/api/flujos");
}

export function fetchFlowStats() {
  return request("/api/flujos/stats");
}

export function fetchApiStatus() {
  return request("/api/flujos/status");
}

export function patchFlowMeta(id, meta) {
  return request(`/api/flujos/${id}/meta`, {
    method: "PATCH",
    body: JSON.stringify(meta),
  });
}

export function patchFlowNombre(id, nombre) {
  return request(`/api/flujos/${id}/nombre`, {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });
}

export function createFlow(nombre, meta = {}) {
  return request("/api/flujos", {
    method: "POST",
    body: JSON.stringify({ nombre, meta }),
  });
}

export function importFlowTemplate(templateId) {
  return request("/api/flujos/import", {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

export function duplicateFlow(id) {
  return request(`/api/flujos/${id}/duplicate`, { method: "POST" });
}

export function deleteFlow(id) {
  return request(`/api/flujos/${id}`, { method: "DELETE" });
}

export function fetchFlowTimeline(id) {
  return request(`/api/flujos/${id}/timeline`);
}

export function builderUrl(flow) {
  const base = getBackendOrigin();
  return `${base}/admin?tab=flujos&builder=1&flujo_id=${flow.id}&nombre=${encodeURIComponent(flow.nombre)}`;
}

export function exportFlowUrl(id) {
  const base = getBackendOrigin();
  return `${base}/exportar-flujo/${id}`;
}

export function loginUrl() {
  return `${getBackendOrigin()}/login`;
}

export { resolveApiUrl, getBackendOrigin };
