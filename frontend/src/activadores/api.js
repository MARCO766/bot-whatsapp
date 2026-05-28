import { resolveApiUrl, getBackendOrigin } from "../flujos/apiBase";
import { CONEXION_TODAS } from "../utils/conexionesInbox";

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

export function fetchActivadores(conexionWhatsappId) {
  return request(withConexionQuery("/api/activadores", conexionWhatsappId));
}

export function createActivador(payload, conexionWhatsappId) {
  return request("/api/activadores", {
    method: "POST",
    body: JSON.stringify(writeConexionBody(payload, conexionWhatsappId)),
  });
}

export function updateActivador(id, payload, conexionWhatsappId) {
  return request(withConexionQuery(`/api/activadores/${id}`, conexionWhatsappId), {
    method: "PATCH",
    body: JSON.stringify(writeConexionBody(payload, conexionWhatsappId)),
  });
}

export function deleteActivador(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/activadores/${id}`, conexionWhatsappId), {
    method: "DELETE",
  });
}

export function toggleActivador(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/activadores/${id}/toggle`, conexionWhatsappId), {
    method: "POST",
  });
}

export function loginUrl() {
  return `${getBackendOrigin()}/login`;
}

export { resolveApiUrl };
