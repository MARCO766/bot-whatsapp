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

export function fetchDashboard() {
  return request("/api/clientes/dashboard");
}

export function fetchMeta() {
  return request("/api/clientes/meta");
}

export function fetchClientes(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v != null) qs.set(k, v);
  });
  const q = qs.toString();
  return request(`/api/clientes${q ? `?${q}` : ""}`);
}

export function fetchKanban() {
  return request("/api/clientes/kanban");
}

/** Solo dígitos; mismo criterio que el backend. */
export function normalizeClienteNumero(numero) {
  if (numero == null || numero === undefined) return "";
  const s = String(numero).trim();
  if (!s || s === "undefined" || s === "null") return "";
  const digits = s.replace(/\D/g, "");
  return digits || "";
}

export function fetchCliente(numero) {
  const n = normalizeClienteNumero(numero);
  if (!n) {
    return Promise.reject(
      new ApiError("Número de cliente inválido", "INVALID", 400)
    );
  }
  return request(`/api/clientes/${encodeURIComponent(n)}`);
}

export function fetchTimeline(numero, offset = 0) {
  const n = normalizeClienteNumero(numero);
  if (!n) {
    return Promise.resolve({ ok: true, timeline: [] });
  }
  return request(
    `/api/clientes/${encodeURIComponent(n)}/timeline?limit=40&offset=${offset}`
  );
}

export function fetchFlujos() {
  return request("/api/clientes/flujos");
}

export function createCliente(body) {
  return request("/api/clientes", { method: "POST", body: JSON.stringify(body) });
}

export function updateCliente(numero, body) {
  return request(`/api/clientes/${encodeURIComponent(numero)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function patchEmbudo(numero, estado_embudo) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/embudo`, {
    method: "PATCH",
    body: JSON.stringify({ estado_embudo }),
  });
}

export function addEtiqueta(numero, etiqueta) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/etiqueta`, {
    method: "POST",
    body: JSON.stringify({ etiqueta }),
  });
}

export function registrarCompra(numero, body) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/compra`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function crearRecordatorio(numero, body) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/recordatorio`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function bloquearCliente(numero) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/bloquear`, { method: "POST" });
}

export function desbloquearCliente(numero) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/desbloquear`, { method: "POST" });
}

export function archivarCliente(numero, archivado = true) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/archivar`, {
    method: "POST",
    body: JSON.stringify({ archivado }),
  });
}

export function eliminarCliente(numero) {
  return request(`/api/clientes/${encodeURIComponent(numero)}`, { method: "DELETE" });
}

export function iniciarFlujo(numero, flujo_id) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/flujo`, {
    method: "POST",
    body: JSON.stringify({ flujo_id }),
  });
}

export function cancelarSeguimientos(numero) {
  return request(`/api/clientes/${encodeURIComponent(numero)}/flujo/cancelar`, {
    method: "POST",
  });
}

export function loginUrl() {
  return resolveApiUrl("/login");
}
