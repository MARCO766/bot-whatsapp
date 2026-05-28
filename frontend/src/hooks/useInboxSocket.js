/**
 * @deprecated Usar useSocketEvent desde SocketProvider global.
 * Mantenido por compatibilidad; delega al socket único de la app.
 */
import { useRef } from "react";
import { useSocketEvent } from "./useSocketEvent";
import { RT } from "../realtime/events";
import {
  normalizeIncomingMessage,
  resolveChatKey,
  sameChatKey,
} from "../utils/chatFormat";

export function useInboxSocket({
  usuarioId,
  selectedChat,
  panelActivo = false,
  onNuevoMensaje,
  onMensajeEstado,
  onSeguimientoEstado,
}) {
  const selectedChatRef = useRef(selectedChat);
  const panelActivoRef = useRef(panelActivo);
  selectedChatRef.current = selectedChat;
  panelActivoRef.current = panelActivo;

  useSocketEvent(
    RT.NUEVO_MENSAJE,
    (msg) => {
      if (!onNuevoMensaje) return;

      const normalized = normalizeIncomingMessage(msg);
      const { cliente_numero, conexion_whatsapp_id, chatKey, conversacion_id } =
        normalized;

      const sel = selectedChatRef.current;
      const selectedChatKey = resolveChatKey(sel);

      console.log("SOCKET NUEVO MENSAJE", {
        cliente_numero,
        conexion_whatsapp_id,
        conversacion_id,
        chatKey,
        selectedChatKey,
      });

      if (!chatKey) return;

      const isActive = Boolean(
        panelActivoRef.current &&
          sel &&
          selectedChatKey &&
          chatKey === selectedChatKey
      );

      onNuevoMensaje({
        msg: normalized,
        chatKey,
        cliente_numero,
        conexionWhatsappId: conexion_whatsapp_id,
        conversacion_id,
        isActive,
      });
    },
    Boolean(usuarioId && onNuevoMensaje)
  );

  useSocketEvent(
    RT.MENSAJE_ESTADO,
    (data) => onMensajeEstado?.(data),
    Boolean(usuarioId && onMensajeEstado)
  );

  useSocketEvent(
    RT.SEGUIMIENTO_ACTUALIZADO,
    (data) => {
      const sel = selectedChatRef.current;
      if (!panelActivoRef.current || !sel) return;

      const segKey = resolveChatKey({
        cliente_numero: data?.cliente_numero,
        conexion_whatsapp_id: data?.conexion_whatsapp_id,
        chatKey: data?.chatKey,
      });
      if (!segKey || !sameChatKey(sel, { chatKey: segKey })) return;

      onSeguimientoEstado?.(data);
    },
    Boolean(usuarioId && onSeguimientoEstado)
  );

  return null;
}
