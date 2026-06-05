import { resolveApiUrl } from "../flujos/apiBase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export class OnboardingApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "OnboardingApiError";
    this.status = status;
  }
}

export async function fetchOnboardingEstado() {
  const url = resolveApiUrl("/api/onboarding/estado");
  let res;
  try {
    res = await fetch(url, { credentials: "include", headers: JSON_HEADERS });
  } catch {
    throw new OnboardingApiError("No se pudo conectar al servidor.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (res.status === 401) {
    throw new OnboardingApiError("Sesión no válida.", 401);
  }
  if (!contentType.includes("application/json")) {
    throw new OnboardingApiError("Respuesta inválida del servidor.", res.status);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new OnboardingApiError(data.error || `Error (${res.status})`, res.status);
  }
  return data;
}

export async function marcarBienvenidaMostrada() {
  const url = resolveApiUrl("/api/onboarding/bienvenida");
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: JSON_HEADERS,
    });
  } catch {
    throw new OnboardingApiError("No se pudo conectar al servidor.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new OnboardingApiError("Respuesta inválida del servidor.", res.status);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new OnboardingApiError(data.error || `Error (${res.status})`, res.status);
  }
  return data;
}
