/**
 * @deprecated Usar useSocketEvent desde SocketProvider global.
 * Mantenido por compatibilidad; delega al socket único de la app.
 */
import { useSocketEvent } from "./useSocketEvent";
import { RT } from "../realtime/events";
import { normalizeIncomingMessage } from "../utils/chatFormat";

export function useInboxSocket({
  usuarioId,
  chatActivo,
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
      onNuevoMensaje({
        msg: normalized,
        numero,
        isActive: numero === chatActivo,
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
      if (data?.cliente_numero === chatActivo) {
        onSeguimientoEstado?.(data);
      }
    },
    Boolean(usuarioId && onSeguimientoEstado)
  );

  return null;
}
