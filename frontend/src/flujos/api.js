const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: JSON_HEADERS,
    ...options,
  });

  if (res.status === 401) {
    const err = new Error("NO_AUTH");
    err.code = "NO_AUTH";
    throw err;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const err = new Error("NO_AUTH");
    err.code = "NO_AUTH";
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Error de API");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fetchFlows() {
  return request("/api/flujos");
}

export function fetchFlowStats() {
  return request("/api/flujos/stats");
}

export function patchFlowMeta(id, meta) {
  return request(`/api/flujos/${id}/meta`, {
    method: "PATCH",
    body: JSON.stringify(meta),
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
  const base = typeof window !== "undefined" ? window.location.origin.replace(/:\d+$/, ":3000") : "";
  return `${base}/admin?tab=flujos&builder=1&flujo_id=${flow.id}&nombre=${encodeURIComponent(flow.nombre)}`;
}

export function exportFlowUrl(id) {
  const base = typeof window !== "undefined" ? window.location.origin.replace(/:\d+$/, ":3000") : "";
  return `${base}/exportar-flujo/${id}`;
}
