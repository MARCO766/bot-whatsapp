/**
 * Resuelve la URL base del backend Express.
 * - Producción mismo origen: rutas relativas (/api/...)
 * - Dev Vite (proxy): rutas relativas → proxy a :3000
 * - Split deploy: VITE_API_BASE_URL=https://tu-app.railway.app
 */
export function getApiBase() {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (envBase && String(envBase).trim()) {
    return String(envBase).trim().replace(/\/$/, "");
  }
  return "";
}

/** Origen absoluto para enlaces al admin/builder (siempre el backend). */
export function getBackendOrigin() {
  const apiBase = getApiBase();
  if (apiBase) return apiBase;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function resolveApiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  if (!base) return normalized;
  return `${base}${normalized}`;
}
