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

  const contentType = res.headers.get("content-type") || "";
  if (res.status === 401) {
    throw new ApiError("Sesión no válida. Inicia sesión en MacBot.", "NO_AUTH", 401);
  }
  if (!contentType.includes("application/json")) {
    throw new ApiError("Respuesta inválida del servidor.", "API_UNAVAILABLE", res.status);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Error (${res.status})`, "SERVER", res.status);
  }
  return data;
}

export function fetchAjustes() {
  return request("/api/ajustes");
}

export function patchPerfil(body) {
  return request("/api/ajustes/perfil", { method: "PATCH", body: JSON.stringify(body) });
}

export function cambiarPassword(body) {
  return request("/api/ajustes/password", { method: "POST", body: JSON.stringify(body) });
}

export function probarMeta() {
  return request("/api/ajustes/meta/probar", { method: "POST", body: "{}" });
}

/** Misma lógica que POST /guardar-conexion */
export function guardarConexion(body) {
  return request("/api/ajustes/conexion/guardar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Misma lógica que POST /desconectar-whatsapp */
export function desconectarWhatsapp() {
  return request("/api/ajustes/conexion/desconectar", { method: "POST", body: "{}" });
}

/** Misma lógica que POST /probar-whatsapp */
export function probarWhatsapp(numero) {
  return request("/api/ajustes/conexion/probar", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
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

export function logout() {
  window.location.href = resolveApiUrl("/logout");
}
