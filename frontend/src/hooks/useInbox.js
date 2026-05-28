import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchInbox,
  fetchSession,
  fetchConexiones,
  fetchChat,
  marcarLeido,
  guardarEtiqueta,
  quitarEtiqueta,
  bloquearChat,
  desbloquearChat,
  eliminarChat,
} from "../services/chatService";
import {
  formatPreview,
  sameChat,
  chatListKey,
} from "../utils/chatFormat";
import { useInboxSocket } from "./useInboxSocket";

const STORAGE_CONEXION = "macbot_inbox_conexion_id";
export const CONEXION_TODAS = "__todas__";

function toSelectedChat(chat) {
  if (!chat) return null;
  const cliente_numero = String(chat.cliente_numero ?? chat.numero ?? "").trim();
  const conexion_whatsapp_id = String(
    chat.conexion_whatsapp_id ?? chat.conexionWhatsappId ?? ""
  ).trim();
  if (!cliente_numero || !conexion_whatsapp_id) return null;
  return {
    cliente_numero,
    conexion_whatsapp_id,
    conexionWhatsappId: conexion_whatsapp_id,
    conversacion_id: chat.conversacion_id ?? chat.conversacionId ?? null,
    conversacionId: chat.conversacion_id ?? chat.conversacionId ?? null,
  };
}

function findChatInList(chats, selected) {
  if (!selected) return null;
  return chats.find((c) => sameChat(c, selected)) || null;
}

export function useInbox({ onUnreadChange } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usuarioId, setUsuarioId] = useState(null);
  const [chats, setChats] = useState([]);
  const [etiquetasUnicas, setEtiquetasUnicas] = useState([]);
  const [etiquetasDisponibles, setEtiquetasDisponibles] = useState([]);
  const [mapaColores, setMapaColores] = useState({});
  const [etiquetaFiltro, setEtiquetaFiltro] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [chatMeta, setChatMeta] = useState(null);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [menuChatKey, setMenuChatKey] = useState(null);
  const [tagModalNumero, setTagModalNumero] = useState(null);
  const [conexiones, setConexiones] = useState([]);
  const [conexionSeleccionada, setConexionSeleccionada] = useState(null);

  const totalNoLeidos = useMemo(
    () => chats.reduce((s, c) => s + (c.noLeidos || 0), 0),
    [chats]
  );

  useEffect(() => {
    onUnreadChange?.(totalNoLeidos);
  }, [totalNoLeidos, onUnreadChange]);

  const loadInbox = useCallback(
    async (filtro = etiquetaFiltro, conexionId = conexionSeleccionada) => {
      setLoading(true);
      setError(null);
      try {
        const apiConexion =
          conexionId && conexionId !== CONEXION_TODAS ? conexionId : null;
        const data = await fetchInbox(filtro, apiConexion);
        setChats(data.chats || []);
        setEtiquetasUnicas(data.etiquetasUnicas || []);
        setEtiquetasDisponibles(data.etiquetasDisponibles || []);
        setMapaColores(data.mapaColoresEtiquetas || {});
      } catch (err) {
        setError(err.message || "Error cargando bandeja");
      } finally {
        setLoading(false);
      }
    },
    [etiquetaFiltro, conexionSeleccionada]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const session = await fetchSession();
        if (cancelled) return;
        setUsuarioId(session.usuarioId);

        const { conexiones: lista } = await fetchConexiones();
        if (cancelled) return;

        setConexiones(lista || []);
        if (!lista?.length) {
          setError(
            "No hay líneas WhatsApp configuradas. Agrega una en Ajustes."
          );
          setConexionSeleccionada(null);
          return;
        }

        const saved = sessionStorage.getItem(STORAGE_CONEXION);
        const pick =
          saved === CONEXION_TODAS
            ? CONEXION_TODAS
            : lista.find((c) => c.id === saved)?.id || CONEXION_TODAS;
        setConexionSeleccionada(pick);
        sessionStorage.setItem(STORAGE_CONEXION, pick);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Error cargando bandeja");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!conexionSeleccionada) return;
    loadInbox(etiquetaFiltro, conexionSeleccionada);
  }, [etiquetaFiltro, conexionSeleccionada, loadInbox]);

  const abrirChat = useCallback(async (chat) => {
    const sel = toSelectedChat(chat);
    if (!sel) return;

    setSelectedChat(sel);
    setMenuChatKey(null);
    setCargandoChat(true);

    setChats((prev) =>
      prev.map((c) =>
        sameChat(c, sel) ? { ...c, noLeidos: 0 } : c
      )
    );

    try {
      await marcarLeido(sel.cliente_numero, sel.conexion_whatsapp_id);
      const data = await fetchChat(sel.cliente_numero, sel.conexion_whatsapp_id);
      setChatMeta({
        nombre: data.nombre,
        bloqueado: data.bloqueado,
        numero: data.numero,
        cliente_numero: data.cliente_numero,
        conexionWhatsappId: data.conexionWhatsappId,
        conexion_whatsapp_id: data.conexion_whatsapp_id,
        conversacionId: data.conversacionId,
        conversacion_id: data.conversacion_id,
      });
      setMensajes(data.mensajes || []);
    } catch (err) {
      setError(err.message || "Error cargando chat");
      setMensajes([]);
    } finally {
      setCargandoChat(false);
    }
  }, []);

  useEffect(() => {
    const pre = sessionStorage.getItem("macbot_inbox_numero");
    if (!pre || loading || !chats.length) return;
    sessionStorage.removeItem("macbot_inbox_numero");
    const match = chats.find((c) => c.numero === pre || c.cliente_numero === pre);
    if (match) abrirChat(match);
  }, [loading, chats, abrirChat]);

  const moverChatArriba = useCallback((numero, preview, conexionWhatsappId) => {
    setChats((prev) => {
      const target = {
        cliente_numero: numero,
        conexion_whatsapp_id: conexionWhatsappId,
      };
      const idx = prev.findIndex((c) => sameChat(c, target));
      const texto = formatPreview(preview);
      if (idx === -1) {
        return [
          {
            chatKey: chatListKey(numero, conexionWhatsappId),
            numero,
            cliente_numero: numero,
            conexionWhatsappId,
            conexion_whatsapp_id: conexionWhatsappId,
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

  const incrementarNoLeido = useCallback((numero, conexionWhatsappId) => {
    const target = { cliente_numero: numero, conexion_whatsapp_id: conexionWhatsappId };
    setChats((prev) =>
      prev.map((c) =>
        sameChat(c, target)
          ? { ...c, noLeidos: (c.noLeidos || 0) + 1 }
          : c
      )
    );
  }, []);

  const handleNuevoMensaje = useCallback(
    ({ msg, numero, conexionWhatsappId, isActive }) => {
      if (
        conexionSeleccionada &&
        conexionSeleccionada !== CONEXION_TODAS &&
        conexionWhatsappId &&
        conexionWhatsappId !== conexionSeleccionada
      ) {
        return;
      }
      moverChatArriba(numero, msg.contenido || msg.tipo || "", conexionWhatsappId);
      if (!isActive) {
        incrementarNoLeido(numero, conexionWhatsappId);
        return;
      }
      setMensajes((prev) => {
        if (prev.some((m) => m.id === msg.id && msg.id)) return prev;
        return [...prev, msg];
      });
    },
    [moverChatArriba, incrementarNoLeido, conexionSeleccionada]
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
    selectedChat,
    onNuevoMensaje: handleNuevoMensaje,
    onMensajeEstado: handleMensajeEstado,
    onSeguimientoEstado: handleSeguimientoEstado,
  });

  const chat = useMemo(() => {
    if (!selectedChat) return null;
    const fromList = findChatInList(chats, selectedChat);
    return {
      ...(fromList || {}),
      ...(chatMeta || {}),
      numero: selectedChat.cliente_numero,
      cliente_numero: selectedChat.cliente_numero,
      conexionWhatsappId: selectedChat.conexion_whatsapp_id,
      conexion_whatsapp_id: selectedChat.conexion_whatsapp_id,
      conversacionId: selectedChat.conversacion_id,
      conversacion_id: selectedChat.conversacion_id,
    };
  }, [chats, selectedChat, chatMeta]);

  const chatsFiltrados = useMemo(() => {
    let list = chats;
    if (conexionSeleccionada && conexionSeleccionada !== CONEXION_TODAS) {
      list = list.filter(
        (c) =>
          String(c.conexion_whatsapp_id || c.conexionWhatsappId) ===
          String(conexionSeleccionada)
      );
    }
    const q = busqueda.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.numero || "").includes(q) ||
        (c.cliente_numero || "").includes(q)
    );
  }, [chats, busqueda, conexionSeleccionada]);

  const cambiarConexion = useCallback((conexionId) => {
    if (!conexionId || conexionId === conexionSeleccionada) return;
    sessionStorage.setItem(STORAGE_CONEXION, conexionId);
    setConexionSeleccionada(conexionId);
    setSelectedChat(null);
    setMensajes([]);
    setChatMeta(null);
    setEtiquetaFiltro("");
    setMenuChatKey(null);
  }, [conexionSeleccionada]);

  const cambiarFiltroEtiqueta = useCallback(
    (etiqueta) => {
      setEtiquetaFiltro(etiqueta);
      setSelectedChat(null);
      setMensajes([]);
      setChatMeta(null);
      loadInbox(etiqueta, conexionSeleccionada);
    },
    [loadInbox, conexionSeleccionada]
  );

  const aplicarEtiqueta = useCallback(
    async (numero, etiqueta) => {
      await guardarEtiqueta(numero, etiqueta);
      const color = mapaColores[etiqueta] || "#22c55e";
      setChats((prev) =>
        prev.map((c) =>
          c.numero === numero || c.cliente_numero === numero
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
        c.numero === numero || c.cliente_numero === numero
          ? { ...c, etiquetas: [] }
          : c
      )
    );
    setTagModalNumero(null);
  }, []);

  const toggleBloqueo = useCallback(
    async (chatItem, bloqueado) => {
      const numero = chatItem.numero || chatItem.cliente_numero;
      if (bloqueado) await desbloquearChat(numero);
      else await bloquearChat(numero);
      setChats((prev) =>
        prev.map((c) =>
          sameChat(c, chatItem) ? { ...c, bloqueado: !bloqueado } : c
        )
      );
      if (selectedChat && sameChat(selectedChat, chatItem)) {
        setChatMeta((m) => (m ? { ...m, bloqueado: !bloqueado } : m));
      }
      setMenuChatKey(null);
    },
    [selectedChat]
  );

  const eliminarChatHandler = useCallback(
    async (chatItem) => {
      if (!confirm("¿Eliminar este chat?")) return;
      const numero = chatItem.numero || chatItem.cliente_numero;
      const conexionId =
        chatItem.conexion_whatsapp_id || chatItem.conexionWhatsappId;
      await eliminarChat(numero, conexionId);
      setChats((prev) => prev.filter((c) => !sameChat(c, chatItem)));
      if (selectedChat && sameChat(selectedChat, chatItem)) {
        setSelectedChat(null);
        setMensajes([]);
        setChatMeta(null);
      }
      setMenuChatKey(null);
    },
    [selectedChat]
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
    selectedChat,
    chat,
    mensajes,
    chatMeta,
    cargandoChat,
    busqueda,
    setBusqueda,
    menuChatKey,
    setMenuChatKey,
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
    conexiones,
    conexionSeleccionada,
    cambiarConexion,
    CONEXION_TODAS,
  };
}
