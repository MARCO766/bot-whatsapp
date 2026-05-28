/**
 * @deprecated Usar useSocketEvent desde SocketProvider global.
 * Mantenido por compatibilidad; delega al socket único de la app.
 */
import { useSocketEvent } from "./useSocketEvent";
import { RT } from "../realtime/events";
import { normalizeIncomingMessage, sameChat } from "../utils/chatFormat";

export function useInboxSocket({
  usuarioId,
  selectedChat,
  panelActivo = false,
  onNuevoMensaje,
  onMensajeEstado,
  onSeguimientoEstado,
}) {
  useSocketEvent(
    RT.NUEVO_MENSAJE,
    (msg) => {
      if (!onNuevoMensaje) return;
      const normalized = normalizeIncomingMessage(msg);
      const numero = normalized.cliente_numero;
      const msgChat = {
        cliente_numero: numero,
        conexion_whatsapp_id: normalized.conexion_whatsapp_id,
        conversacion_id: normalized.conversacion_id,
      };
      const isActive = Boolean(
        panelActivo &&
          selectedChat &&
          sameChat(msgChat, selectedChat)
      );
      onNuevoMensaje({
        msg: normalized,
        numero,
        conexionWhatsappId: normalized.conexion_whatsapp_id,
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
      if (
        panelActivo &&
        selectedChat &&
        data?.cliente_numero === selectedChat.cliente_numero &&
        String(data?.conexion_whatsapp_id || "") ===
          String(selectedChat.conexion_whatsapp_id || selectedChat.conexionWhatsappId || "")
      ) {
        onSeguimientoEstado?.(data);
      }
    },
    Boolean(usuarioId && onSeguimientoEstado)
  );

  return null;
}
