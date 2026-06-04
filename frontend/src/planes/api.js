import { resolveApiUrl } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class PlanApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "PlanApiError";
    this.status = status;
  }
}

export async function fetchMiPlan() {
  const url = resolveApiUrl("/api/planes/mi-plan");
  let res;
  try {
    res = await fetch(url, { credentials: "include", headers: JSON_HEADERS });
  } catch {
    throw new PlanApiError("No se pudo conectar al servidor.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (res.status === 401) {
    throw new PlanApiError("Sesión no válida. Inicia sesión en MacBot.", 401);
  }
  if (!contentType.includes("application/json")) {
    throw new PlanApiError("Respuesta inválida del servidor.", res.status);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new PlanApiError(data.error || `Error (${res.status})`, res.status);
  }
  return data;
}
