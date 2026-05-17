import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchInbox,
  fetchSession,
  fetchChat,
  marcarLeido,
  guardarEtiqueta,
  quitarEtiqueta,
  bloquearChat,
  desbloquearChat,
  eliminarChat,
} from "../services/chatService";
import { formatPreview } from "../utils/chatFormat";
import { useInboxSocket } from "./useInboxSocket";

export function useInbox({ onUnreadChange } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usuarioId, setUsuarioId] = useState(null);
  const [chats, setChats] = useState([]);
  const [etiquetasUnicas, setEtiquetasUnicas] = useState([]);
  const [etiquetasDisponibles, setEtiquetasDisponibles] = useState([]);
  const [mapaColores, setMapaColores] = useState({});
  const [etiquetaFiltro, setEtiquetaFiltro] = useState("");
  const [chatActivo, setChatActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [chatMeta, setChatMeta] = useState(null);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [menuChat, setMenuChat] = useState(null);
  const [tagModalNumero, setTagModalNumero] = useState(null);

  const totalNoLeidos = useMemo(
    () => chats.reduce((s, c) => s + (c.noLeidos || 0), 0),
    [chats]
  );

  useEffect(() => {
    onUnreadChange?.(totalNoLeidos);
  }, [totalNoLeidos, onUnreadChange]);

  const loadInbox = useCallback(async (filtro = etiquetaFiltro) => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetchSession();
      setUsuarioId(session.usuarioId);
      const data = await fetchInbox(filtro);
      setChats(data.chats || []);
      setEtiquetasUnicas(data.etiquetasUnicas || []);
      setEtiquetasDisponibles(data.etiquetasDisponibles || []);
      setMapaColores(data.mapaColoresEtiquetas || {});
    } catch (err) {
      setError(err.message || "Error cargando bandeja");
    } finally {
      setLoading(false);
    }
  }, [etiquetaFiltro]);

  useEffect(() => {
    loadInbox(etiquetaFiltro);
  }, [etiquetaFiltro]);

  const abrirChat = useCallback(async (numero) => {
    if (!numero) return;
    setChatActivo(numero);
    setMenuChat(null);
    setCargandoChat(true);

    setChats((prev) =>
      prev.map((c) => (c.numero === numero ? { ...c, noLeidos: 0 } : c))
    );

    try {
      await marcarLeido(numero);
      const data = await fetchChat(numero);
      setChatMeta({
        nombre: data.nombre,
        bloqueado: data.bloqueado,
        numero: data.numero,
      });
      setMensajes(data.mensajes || []);
    } catch (err) {
      setError(err.message || "Error cargando chat");
      setMensajes([]);
    } finally {
      setCargandoChat(false);
    }
  }, []);

  const moverChatArriba = useCallback((numero, preview) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.numero === numero);
      const texto = formatPreview(preview);
      if (idx === -1) {
        return [
          {
            numero,
            nombre: numero,
            bloqueado: false,
            online: true,
            noLeidos: 0,
            ultimoMensaje: texto,
            ultimoMensajeEn: new Date().toISOString(),
            etiquetas: [],
          },
          ...prev,
        ];
      }
      const updated = [...prev];
      const [item] = updated.splice(idx, 1);
      updated.unshift({
        ...item,
        ultimoMensaje: texto || item.ultimoMensaje,
        ultimoMensajeEn: new Date().toISOString(),
      });
      return updated;
    });
  }, []);

  const incrementarNoLeido = useCallback((numero) => {
    setChats((prev) =>
      prev.map((c) =>
        c.numero === numero
          ? { ...c, noLeidos: (c.noLeidos || 0) + 1 }
          : c
      )
    );
  }, []);

  const handleNuevoMensaje = useCallback(
    ({ msg, numero, isActive }) => {
      moverChatArriba(numero, msg.contenido || msg.tipo || "");
      if (!isActive) {
        incrementarNoLeido(numero);
        return;
      }
      setMensajes((prev) => {
        if (prev.some((m) => m.id === msg.id && msg.id)) return prev;
        return [...prev, msg];
      });
    },
    [moverChatArriba, incrementarNoLeido]
  );

  const handleMensajeEstado = useCallback((data) => {
    if (!data?.whatsapp_message_id) return;
    setMensajes((prev) =>
      prev.map((m) =>
        m.whatsapp_message_id === data.whatsapp_message_id
          ? { ...m, estado_envio: data.estado_envio }
          : m
      )
    );
  }, []);

  const handleSeguimientoEstado = useCallback((data) => {
    setMensajes((prev) => [
      ...prev,
      {
        id: `seg-${Date.now()}`,
        direccion: "sistema",
        tipo: "texto",
        contenido: `⏱ Seguimiento paso ${(data.paso_index || 0) + 1}: ${data.estado || "actualizado"}`,
        creado_en: new Date().toISOString(),
      },
    ]);
  }, []);

  useInboxSocket({
    usuarioId,
    chatActivo,
    onNuevoMensaje: handleNuevoMensaje,
    onMensajeEstado: handleMensajeEstado,
    onSeguimientoEstado: handleSeguimientoEstado,
  });

  const chat = useMemo(() => {
    if (!chatActivo) return null;
    const fromList = chats.find((c) => c.numero === chatActivo);
    return {
      ...(fromList || { numero: chatActivo }),
      ...(chatMeta || {}),
      numero: chatActivo,
    };
  }, [chats, chatActivo, chatMeta]);

  const chatsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.numero || "").includes(q)
    );
  }, [chats, busqueda]);

  const cambiarFiltroEtiqueta = useCallback((etiqueta) => {
    setEtiquetaFiltro(etiqueta);
    setChatActivo(null);
    setMensajes([]);
    setChatMeta(null);
    loadInbox(etiqueta);
  }, [loadInbox]);

  const aplicarEtiqueta = useCallback(
    async (numero, etiqueta) => {
      await guardarEtiqueta(numero, etiqueta);
      const color = mapaColores[etiqueta] || "#22c55e";
      setChats((prev) =>
        prev.map((c) =>
          c.numero === numero
            ? { ...c, etiquetas: [{ nombre: etiqueta, color }] }
            : c
        )
      );
      setTagModalNumero(null);
    },
    [mapaColores]
  );

  const quitarEtiquetaChat = useCallback(async (numero) => {
    await quitarEtiqueta(numero);
    setChats((prev) =>
      prev.map((c) =>
        c.numero === numero ? { ...c, etiquetas: [] } : c
      )
    );
    setTagModalNumero(null);
  }, []);

  const toggleBloqueo = useCallback(
    async (numero, bloqueado) => {
      if (bloqueado) await desbloquearChat(numero);
      else await bloquearChat(numero);
      setChats((prev) =>
        prev.map((c) =>
          c.numero === numero ? { ...c, bloqueado: !bloqueado } : c
        )
      );
      if (chatActivo === numero) {
        setChatMeta((m) => (m ? { ...m, bloqueado: !bloqueado } : m));
      }
      setMenuChat(null);
    },
    [chatActivo]
  );

  const eliminarChatHandler = useCallback(
    async (numero) => {
      if (!confirm("¿Eliminar este chat?")) return;
      await eliminarChat(numero);
      setChats((prev) => prev.filter((c) => c.numero !== numero));
      if (chatActivo === numero) {
        setChatActivo(null);
        setMensajes([]);
        setChatMeta(null);
      }
      setMenuChat(null);
    },
    [chatActivo]
  );

  const appendMensaje = useCallback((msg) => {
    setMensajes((prev) => [...prev, msg]);
  }, []);

  const patchMensaje = useCallback((id, patch) => {
    setMensajes((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  return {
    loading,
    error,
    usuarioId,
    chats,
    chatsFiltrados,
    etiquetasUnicas,
    etiquetasDisponibles,
    mapaColores,
    etiquetaFiltro,
    chatActivo,
    chat,
    mensajes,
    chatMeta,
    cargandoChat,
    busqueda,
    setBusqueda,
    menuChat,
    setMenuChat,
    tagModalNumero,
    setTagModalNumero,
    totalNoLeidos,
    abrirChat,
    cambiarFiltroEtiqueta,
    aplicarEtiqueta,
    quitarEtiquetaChat,
    toggleBloqueo,
    eliminarChatHandler,
    appendMensaje,
    patchMensaje,
    moverChatArriba,
    reload: loadInbox,
  };
}
