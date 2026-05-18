import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";
import { getApiBase, resolveApiUrl } from "../flujos/apiBase";
import { ALL_SOCKET_EVENTS, normalizeEvent } from "../realtime/events";

const SocketContext = createContext(null);

function socketOrigin() {
  const base = getApiBase();
  if (base) return base;
  if (typeof window !== "undefined") return window.location.origin;
  return undefined;
}

export function SocketProvider({ children }) {
  const [usuarioId, setUsuarioId] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const handlersRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(resolveApiUrl("/api/inbox/session"), {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.usuarioId) setUsuarioId(data.usuarioId);
      } catch {
        /* sesión no disponible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!usuarioId) return undefined;

    const socket = io(socketOrigin(), {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;
    socket.emit("join-user", usuarioId);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const dispatch = (rawEvent, payload) => {
      const event = normalizeEvent(rawEvent);
      const set = handlersRef.current.get(event);
      if (!set?.size) return;
      set.forEach((fn) => {
        try {
          fn(payload, rawEvent);
        } catch (err) {
          console.error("[MacBot socket]", event, err);
        }
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    ALL_SOCKET_EVENTS.forEach((ev) => {
      socket.on(ev, (payload) => dispatch(ev, payload));
    });

    return () => {
      ALL_SOCKET_EVENTS.forEach((ev) => socket.off(ev));
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [usuarioId]);

  const subscribe = useCallback((event, handler) => {
    const key = normalizeEvent(event);
    if (!handlersRef.current.has(key)) {
      handlersRef.current.set(key, new Set());
    }
    handlersRef.current.get(key).add(handler);
    return () => {
      handlersRef.current.get(key)?.delete(handler);
    };
  }, []);

  const value = useMemo(
    () => ({
      usuarioId,
      connected,
      subscribe,
      getSocket: () => socketRef.current,
    }),
    [usuarioId, connected, subscribe]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
