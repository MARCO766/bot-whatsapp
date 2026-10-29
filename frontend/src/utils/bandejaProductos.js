import { CONEXION_TODAS } from "./conexionesInbox.js";

/** Selección visual por defecto. No es un id de flujo. */
export const PRODUCTO_TODOS = "";

export function esLineaConcreta(conexionId) {
  if (conexionId == null) return false;
  const id = String(conexionId).trim();
  return id !== "" && id !== CONEXION_TODAS;
}

/**
 * Chips a partir de GET /api/flujos/bandeja. Identificador = id; texto = nombre.
 * No inventa productos: solo filas reales, sin ids vacíos ni repetidos.
 */
export function normalizarFlujosProducto(flows) {
  if (!Array.isArray(flows)) return [];
  const vistos = new Set();
  const salida = [];
  for (const flow of flows) {
    if (!flow || typeof flow !== "object") continue;
    const id = flow.id == null ? "" : String(flow.id).trim();
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const nombre = flow.nombre == null ? "" : String(flow.nombre).trim();
    salida.push({ id, nombre: nombre || "Sin nombre" });
  }
  return salida;
}

/** Al cambiar de línea el producto vuelve a Todos. */
export function seleccionTrasCambiarLinea(lineaAnterior, lineaNueva, seleccionActual) {
  if (String(lineaAnterior ?? "") !== String(lineaNueva ?? "")) {
    return PRODUCTO_TODOS;
  }
  return seleccionActual == null ? PRODUCTO_TODOS : String(seleccionActual);
}

export function parametrosConsultaInbox({
  etiquetaFiltro = "",
  conexionWhatsappId = null,
  flujoId = "",
  limit,
  offset,
} = {}) {
  const params = new URLSearchParams();
  if (conexionWhatsappId) params.set("conexion_whatsapp_id", String(conexionWhatsappId));
  if (etiquetaFiltro) params.set("etiqueta", String(etiquetaFiltro));
  const flujo = String(flujoId || "").trim();
  if (flujo) params.set("flujo_id", flujo);
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  return params;
}

/** Con un producto activo no se insertan chats que aún no están en la lista. */
export function socketPuedeInsertarChatNuevo(flujoSeleccionadoId) {
  return String(flujoSeleccionadoId || "").trim() === "";
}

/**
 * Actualiza la lista al llegar un mensaje.
 * Si el producto está filtrado, un chat desconocido se deja fuera.
 * Uno que ya está en la lista se mueve arriba.
 */
export function listaTrasSocket(prev, chatKey, previewTexto, ultimoEn, flujoSeleccionadoId) {
  if (!Array.isArray(prev)) return prev;
  const key = String(chatKey || "").trim();
  if (!key || !key.includes("::")) return prev;
  const ts = ultimoEn || new Date().toISOString();
  const idx = prev.findIndex((c) => c.chatKey === key);
  if (idx === -1) {
    if (!socketPuedeInsertarChatNuevo(flujoSeleccionadoId)) return prev;
    const sep = key.indexOf("::");
    const numero = key.slice(0, sep);
    const connId = key.slice(sep + 2);
    if (!numero || !connId) return prev;
    return [
      {
        chatKey: key,
        numero,
        cliente_numero: numero,
        conexionWhatsappId: connId,
        conexion_whatsapp_id: connId,
        conexion_nombre: "",
        nombre: numero,
        bloqueado: false,
        online: true,
        noLeidos: 0,
        ultimoMensaje: previewTexto,
        ultimoMensajeEn: ts,
        etiquetas: [],
      },
      ...prev,
    ];
  }
  const updated = [...prev];
  const [item] = updated.splice(idx, 1);
  updated.unshift({
    ...item,
    ultimoMensaje: previewTexto || item.ultimoMensaje,
    ultimoMensajeEn: ts,
  });
  return updated;
}
