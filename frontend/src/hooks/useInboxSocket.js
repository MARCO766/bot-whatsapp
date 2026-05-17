import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getApiBase } from "../flujos/apiBase";
import { normalizeIncomingMessage } from "../utils/chatFormat";

function socketOrigin() {
  const base = getApiBase();
  if (base) return base;
  if (typeof window !== "undefined") return window.location.origin;
  return undefined;
}

export function useInboxSocket({
  usuarioId,
  chatActivo,
  onNuevoMensaje,
  onMensajeEstado,
  onSeguimientoEstado,
}) {
  const socketRef = useRef(null);
  const chatRef = useRef(chatActivo);

  useEffect(() => {
    chatRef.current = chatActivo;
  }, [chatActivo]);

  useEffect(() => {
    if (!usuarioId) return undefined;

    const socket = io(socketOrigin(), {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;
    socket.emit("join-user", usuarioId);

    socket.on("nuevo-mensaje", (msg) => {
      const normalized = normalizeIncomingMessage(msg);
      const numero = normalized.cliente_numero;
      const isActive = numero === chatRef.current;

      onNuevoMensaje?.({
        msg: normalized,
        numero,
        isActive,
      });
    });

    socket.on("mensaje-estado", (data) => {
      onMensajeEstado?.(data);
    });

    socket.on("seguimiento-estado", (data) => {
      if (data.cliente_numero === chatRef.current) {
        onSeguimientoEstado?.(data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [usuarioId, onNuevoMensaje, onMensajeEstado, onSeguimientoEstado]);

  return socketRef;
}
