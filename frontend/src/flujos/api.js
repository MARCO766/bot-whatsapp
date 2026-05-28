import { getBackendOrigin, resolveApiUrl } from "./apiBase";
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

export function fetchFlows(conexionWhatsappId) {
  return request(withConexionQuery("/api/flujos", conexionWhatsappId));
}

export function fetchFlowStats() {
  return request("/api/flujos/stats");
}

export function fetchHeaderStats() {
  return request("/api/flujos/header-stats");
}

export function fetchApiStatus() {
  return request("/api/flujos/status");
}

export function patchFlowMeta(id, meta, conexionWhatsappId) {
  return request(withConexionQuery(`/api/flujos/${id}/meta`, conexionWhatsappId), {
    method: "PATCH",
    body: JSON.stringify(meta),
  });
}

export function patchFlowNombre(id, nombre, conexionWhatsappId) {
  return request(withConexionQuery(`/api/flujos/${id}/nombre`, conexionWhatsappId), {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });
}

export function createFlow(nombre, meta = {}, conexionWhatsappId) {
  return request("/api/flujos", {
    method: "POST",
    body: JSON.stringify(writeConexionBody({ nombre, meta }, conexionWhatsappId)),
  });
}

export function importFlowTemplate(templateId, conexionWhatsappId) {
  return request("/api/flujos/import", {
    method: "POST",
    body: JSON.stringify(writeConexionBody({ templateId }, conexionWhatsappId)),
  });
}

export function duplicateFlow(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/flujos/${id}/duplicate`, conexionWhatsappId), {
    method: "POST",
    body: JSON.stringify(writeConexionBody({}, conexionWhatsappId)),
  });
}

export function deleteFlow(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/flujos/${id}`, conexionWhatsappId), {
    method: "DELETE",
  });
}

export function fetchFlowTimeline(id, conexionWhatsappId) {
  return request(withConexionQuery(`/api/flujos/${id}/timeline`, conexionWhatsappId));
}

export function builderUrl(flow, conexionWhatsappId) {
  const base = getBackendOrigin();
  const params = new URLSearchParams({
    tab: "flujos",
    builder: "1",
    flujo_id: flow.id,
    nombre: flow.nombre,
  });
  const conn =
    conexionWhatsappId && conexionWhatsappId !== CONEXION_TODAS
      ? conexionWhatsappId
      : flow.conexion_whatsapp_id;
  if (conn) params.set("conexion_whatsapp_id", conn);
  return `${base}/admin?${params.toString()}`;
}

export function exportFlowUrl(id) {
  const base = getBackendOrigin();
  return `${base}/exportar-flujo/${id}`;
}

export function loginUrl() {
  return `${getBackendOrigin()}/login`;
}

export { resolveApiUrl, getBackendOrigin };
