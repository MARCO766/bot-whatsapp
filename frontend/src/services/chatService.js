import { resolveApiUrl } from "../flujos/apiBase";

const INBOX_HEADERS = {
  "Content-Type": "application/json",
  "X-Inbox-Api": "1",
};

function conexionQuery(conexionWhatsappId) {
  if (!conexionWhatsappId) return "";
  return `&conexion_whatsapp_id=${encodeURIComponent(conexionWhatsappId)}`;
}

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

export async function fetchConexiones() {
  return request("/api/inbox/conexiones");
}

export async function fetchInbox(etiquetaFiltro = "", conexionWhatsappId = null) {
  const params = new URLSearchParams();
  if (conexionWhatsappId) params.set("conexion_whatsapp_id", conexionWhatsappId);
  if (etiquetaFiltro) params.set("etiqueta", etiquetaFiltro);
  const q = params.toString();
  return request(q ? `/api/inbox?${q}` : "/api/inbox");
}

export async function fetchChat(numero, conexionWhatsappId) {
  return request(
    `/api/inbox/chat?numero=${encodeURIComponent(numero)}${conexionQuery(conexionWhatsappId)}`
  );
}

export async function marcarLeido(numero, conexionWhatsappId) {
  return request("/api/inbox/marcar-leido", {
    method: "POST",
    body: JSON.stringify({
      numero,
      conexion_whatsapp_id: conexionWhatsappId,
    }),
  });
}

export async function guardarEtiqueta(numero, etiqueta, conexionWhatsappId) {
  return request("/api/inbox/etiqueta", {
    method: "POST",
    body: JSON.stringify({
      numero,
      etiqueta,
      conexion_whatsapp_id: conexionWhatsappId,
    }),
  });
}

export async function quitarEtiqueta(numero, conexionWhatsappId) {
  return request("/api/inbox/quitar-etiqueta", {
    method: "POST",
    body: JSON.stringify({
      numero,
      conexion_whatsapp_id: conexionWhatsappId,
    }),
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

export async function eliminarChat(numero, conexionWhatsappId) {
  const url = resolveApiUrl(
    `/api/inbox/chat?numero=${encodeURIComponent(numero)}${conexionQuery(conexionWhatsappId)}`
  );
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers: INBOX_HEADERS,
  });
  return parseJson(res, url);
}

export async function setBotPause({
  clienteNumero,
  conexionWhatsappId,
  action,
}) {
  return request("/api/inbox/bot-pause", {
    method: "POST",
    body: JSON.stringify({
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexionWhatsappId,
      action,
    }),
  });
}

export function sendMessageWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl("/api/inbox/responder"), true);
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

export function buildMessageFormData(numero, texto, archivo, conexionWhatsappId) {
  const formData = new FormData();
  formData.append("numero", numero);
  if (conexionWhatsappId) {
    formData.append("conexion_whatsapp_id", conexionWhatsappId);
  }
  if (texto) formData.append("respuesta", texto);
  if (archivo) formData.append("archivo", archivo);
  return formData;
}
