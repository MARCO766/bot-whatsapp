import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketProvider";

/**
 * Suscripción estable a un evento del socket global (sin duplicar conexiones).
 */
export function useSocketEvent(event, handler, enabled = true) {
  const ctx = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx?.subscribe || !event || !enabled) return undefined;
    return ctx.subscribe(event, (payload, raw) => {
      handlerRef.current?.(payload, raw);
    });
  }, [ctx, event, enabled]);
}
