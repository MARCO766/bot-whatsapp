import { resolveApiUrl } from "../flujos/apiBase";

const INBOX_HEADERS = {
  "Content-Type": "application/json",
  "X-Inbox-Api": "1",
};

async function parseJson(res, url) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      res.status === 401
        ? "Sesión no válida. Inicia sesión en MacBot."
        : "Respuesta no JSON del servidor"
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

async function request(path, options = {}) {
  const url = resolveApiUrl(path);
  const res = await fetch(url, {
    credentials: "include",
    headers: INBOX_HEADERS,
    ...options,
  });
  return parseJson(res, url);
}

export async function fetchSession() {
  return request("/api/inbox/session");
}

export async function fetchInbox(etiquetaFiltro = "") {
  const q = etiquetaFiltro
    ? `?etiqueta=${encodeURIComponent(etiquetaFiltro)}`
    : "";
  return request(`/api/inbox${q}`);
}

export async function fetchChat(numero) {
  return request(`/api/inbox/chat?numero=${encodeURIComponent(numero)}`);
}

export async function marcarLeido(numero) {
  return request("/api/inbox/marcar-leido", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export async function guardarEtiqueta(numero, etiqueta) {
  return request("/api/inbox/etiqueta", {
    method: "POST",
    body: JSON.stringify({ numero, etiqueta }),
  });
}

export async function quitarEtiqueta(numero) {
  return request("/api/inbox/quitar-etiqueta", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export async function bloquearChat(numero) {
  return request("/api/inbox/bloquear", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export async function desbloquearChat(numero) {
  return request("/api/inbox/desbloquear", {
    method: "POST",
    body: JSON.stringify({ numero }),
  });
}

export async function eliminarChat(numero) {
  const url = resolveApiUrl(
    `/api/inbox/chat?numero=${encodeURIComponent(numero)}`
  );
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers: INBOX_HEADERS,
  });
  return parseJson(res, url);
}

export function sendMessageWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl("/inbox/responder"), true);
    xhr.setRequestHeader("X-Inbox-Api", "1");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 400) {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          resolve(data);
        } catch {
          resolve({ ok: true });
        }
        return;
      }
      reject(new Error("Error enviando mensaje"));
    };

    xhr.onerror = () => reject(new Error("Error de conexión"));
    xhr.send(formData);
  });
}

export function buildMessageFormData(numero, texto, archivo) {
  const formData = new FormData();
  formData.append("numero", numero);
  if (texto) formData.append("respuesta", texto);
  if (archivo) formData.append("archivo", archivo);
  return formData;
}
