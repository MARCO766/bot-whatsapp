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
  conexionSeleccionada,
  onNuevoMensaje,
  onMensajeEstado,
  onSeguimientoEstado,
}) {
  useSocketEvent(
    RT.NUEVO_MENSAJE,
    (msg) => {
      if (!onNuevoMensaje) return;
      const normalized = normalizeIncomingMessage(msg);
      if (
        conexionSeleccionada &&
        normalized.conexion_whatsapp_id &&
        normalized.conexion_whatsapp_id !== conexionSeleccionada
      ) {
        return;
      }
      const numero = normalized.cliente_numero;
      onNuevoMensaje({
        msg: normalized,
        numero,
        isActive: numero === chatActivo,
      });
    },
    Boolean(usuarioId && onNuevoMensaje && conexionSeleccionada)
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
