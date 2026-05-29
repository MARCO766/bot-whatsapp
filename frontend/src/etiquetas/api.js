import { resolveApiUrl } from "../flujos/apiBase";
import { CONEXION_TODAS } from "../utils/conexionesInbox";

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

function conexionParam(conexionWhatsappId) {
  const id = conexionWhatsappId || CONEXION_TODAS;
  return `conexion_whatsapp_id=${encodeURIComponent(id)}`;
}

function withConexionQuery(path, conexionWhatsappId) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${conexionParam(conexionWhatsappId)}`;
}

function writeConexionBody(payload, conexionWhatsappId) {
  return {
    ...payload,
    conexion_whatsapp_id: conexionWhatsappId,
  };
}

export function fetchEtiquetas(conexionWhatsappId) {
  return request(withConexionQuery("/api/etiquetas", conexionWhatsappId));
}

export function createEtiqueta(body, conexionWhatsappId) {
  return request("/api/etiquetas", {
    method: "POST",
    body: JSON.stringify(writeConexionBody(body, conexionWhatsappId)),
  });
}

export function updateEtiqueta(id, body, conexionWhatsappId) {
  return request(withConexionQuery(`/api/etiquetas/${id}`, conexionWhatsappId), {
    method: "PATCH",
    body: JSON.stringify(writeConexionBody(body, conexionWhatsappId)),
  });
}

export function deleteEtiqueta(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/etiquetas/${id}`, conexionWhatsappId), {
    method: "DELETE",
  });
}

export function loginUrl() {
  return resolveApiUrl("/login");
}
