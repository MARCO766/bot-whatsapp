import { resolveApiUrl } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class ApiError extends Error {
  constructor(message, code, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.payload = payload;
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
    throw new ApiError(
      data.error || `Error (${res.status})`,
      data.code || "SERVER",
      res.status,
      data
    );
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

export function probarMeta(body = {}) {
  return request("/api/ajustes/meta/probar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function guardarConexion(body) {
  return request("/api/ajustes/conexion/guardar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function desconectarWhatsapp() {
  return request("/api/ajustes/conexion/desconectar", { method: "POST", body: "{}" });
}

export function desconectarWhatsappPorId(id) {
  return request(`/api/ajustes/conexion/${id}/desconectar`, { method: "POST", body: "{}" });
}

export function probarWhatsapp(numero) {
  return request("/api/ajustes/conexion/probar", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export function probarWhatsappPorId(id, numero) {
  return request(`/api/ajustes/conexion/${id}/probar`, {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export function hacerPrincipalWhatsapp(id) {
  return request(`/api/ajustes/conexion/${id}/principal`, { method: "POST", body: "{}" });
}

export function fetchConexionDiagnostico(id) {
  return request(`/api/ajustes/conexion/${id}/diagnostico`);
}

export function logout() {
  window.location.href = resolveApiUrl("/logout");
}
