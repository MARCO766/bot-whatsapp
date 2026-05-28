import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const STORAGE_INBOX_NUMERO = "macbot_inbox_numero";
const STORAGE_INBOX_NUMERO_CONEXION = "macbot_inbox_numero_conexion_id";
export const CONEXION_TODAS = "__todas__";

function conexionIdKey(id) {
  if (id == null || id === "") return "";
  if (id === CONEXION_TODAS) return CONEXION_TODAS;
  return String(id).trim();
}

export function findConexionPorId(conexiones, conexionId) {
  const key = conexionIdKey(conexionId);
  if (!key || key === CONEXION_TODAS) return null;
  return (conexiones || []).find((c) => conexionIdKey(c.id) === key) ?? null;
}

function normalizeConexionSeleccionada(conexionId) {
  if (conexionId === CONEXION_TODAS) return CONEXION_TODAS;
  const key = conexionIdKey(conexionId);
  return key || null;
}

function selectedChatMatchesTab(selectedChat, conexionSeleccionada) {
  if (!selectedChat) return false;
  if (!conexionSeleccionada || conexionSeleccionada === CONEXION_TODAS) {
    return true;
  }
  const conn = String(
    selectedChat.conexion_whatsapp_id ?? selectedChat.conexionWhatsappId ?? ""
  ).trim();
  return conn === String(conexionSeleccionada);
}

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

  const abrirChatSeqRef = useRef(0);
  const conexionSeleccionadaRef = useRef(null);
  const selectedChatRef = useRef(null);

  useEffect(() => {
    conexionSeleccionadaRef.current = conexionSeleccionada;
  }, [conexionSeleccionada]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const resetPanelState = useCallback(() => {
    abrirChatSeqRef.current += 1;
    selectedChatRef.current = null;
    setSelectedChat(null);
    setMensajes([]);
    setChatMeta(null);
    setMenuChatKey(null);
    setTagModalNumero(null);
    setCargandoChat(false);
  }, []);

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
        let pick = CONEXION_TODAS;
        if (saved === CONEXION_TODAS) {
          pick = CONEXION_TODAS;
        } else if (saved) {
          const found = lista.find((c) => conexionIdKey(c.id) === conexionIdKey(saved));
          if (found) pick = conexionIdKey(found.id);
        }
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

  const refreshConexiones = useCallback(async () => {
    try {
      const { conexiones: lista } = await fetchConexiones();
      setConexiones(lista || []);
    } catch {
      /* mantener lista actual */
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshConexiones();
    };
    window.addEventListener("focus", refreshConexiones);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refreshConexiones);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshConexiones]);

  const conexionActiva = useMemo(
    () => findConexionPorId(conexiones, conexionSeleccionada),
    [conexiones, conexionSeleccionada]
  );

  useEffect(() => {
    if (!conexionSeleccionada) return;
    loadInbox(etiquetaFiltro, conexionSeleccionada);
  }, [etiquetaFiltro, conexionSeleccionada, loadInbox]);

  const prevConexionRef = useRef(undefined);
  useEffect(() => {
    if (!conexionSeleccionada) return;

    const prev = prevConexionRef.current;
    prevConexionRef.current = conexionSeleccionada;

    if (prev === undefined) return;

    if (prev !== conexionSeleccionada) {
      resetPanelState();
      setChats([]);
    }
  }, [conexionSeleccionada, resetPanelState]);

  useEffect(() => {
    if (!selectedChat || !conexionSeleccionada) return;
    if (!selectedChatMatchesTab(selectedChat, conexionSeleccionada)) {
      resetPanelState();
    }
  }, [conexionSeleccionada, selectedChat, resetPanelState]);

  const abrirChat = useCallback(async (chat) => {
    const sel = toSelectedChat(chat);
    if (!sel) return;
    if (!selectedChatMatchesTab(sel, conexionSeleccionada)) return;

    const seq = ++abrirChatSeqRef.current;
    selectedChatRef.current = sel;
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
      if (seq !== abrirChatSeqRef.current) return;
      if (
        !selectedChatMatchesTab(sel, conexionSeleccionadaRef.current)
      ) {
        return;
      }
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
      if (seq !== abrirChatSeqRef.current) return;
      setError(err.message || "Error cargando chat");
      setMensajes([]);
    } finally {
      if (seq === abrirChatSeqRef.current) setCargandoChat(false);
    }
  }, [conexionSeleccionada]);

  useEffect(() => {
    const pre = sessionStorage.getItem(STORAGE_INBOX_NUMERO);
    const preConn = sessionStorage.getItem(STORAGE_INBOX_NUMERO_CONEXION);
    if (!pre || !preConn || loading || !chats.length || !conexionSeleccionada) {
      return;
    }
    sessionStorage.removeItem(STORAGE_INBOX_NUMERO);
    sessionStorage.removeItem(STORAGE_INBOX_NUMERO_CONEXION);

    const match = chats.find(
      (c) =>
        (c.numero === pre || c.cliente_numero === pre) &&
        String(c.conexion_whatsapp_id || c.conexionWhatsappId || "") ===
          String(preConn)
    );
    if (!match) return;
    const sel = toSelectedChat(match);
    if (!sel || !selectedChatMatchesTab(sel, conexionSeleccionada)) return;
    abrirChat(match);
  }, [loading, chats, abrirChat, conexionSeleccionada]);

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

      const msgTarget = {
        cliente_numero: numero,
        conexion_whatsapp_id: conexionWhatsappId,
      };
      const canPaintPanel =
        isActive &&
        selectedChat &&
        sameChat(msgTarget, selectedChat) &&
        selectedChatMatchesTab(selectedChat, conexionSeleccionada);

      if (!canPaintPanel) {
        if (!isActive) incrementarNoLeido(numero, conexionWhatsappId);
        return;
      }
      setMensajes((prev) => {
        if (prev.some((m) => m.id === msg.id && msg.id)) return prev;
        return [...prev, msg];
      });
    },
    [
      moverChatArriba,
      incrementarNoLeido,
      conexionSeleccionada,
      selectedChat,
    ]
  );

  const handleMensajeEstado = useCallback(
    (data) => {
      if (!data?.whatsapp_message_id) return;
      if (!selectedChatMatchesTab(selectedChat, conexionSeleccionada)) return;
      setMensajes((prev) =>
        prev.map((m) =>
          m.whatsapp_message_id === data.whatsapp_message_id
            ? { ...m, estado_envio: data.estado_envio }
            : m
        )
      );
    },
    [selectedChat, conexionSeleccionada]
  );

  const handleSeguimientoEstado = useCallback(
    (data) => {
      if (!selectedChatMatchesTab(selectedChat, conexionSeleccionada)) return;
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
    },
    [selectedChat, conexionSeleccionada]
  );

  const panelActivo = useMemo(
    () => selectedChatMatchesTab(selectedChat, conexionSeleccionada),
    [selectedChat, conexionSeleccionada]
  );

  const selectedChatUi = useMemo(
    () => (panelActivo ? selectedChat : null),
    [panelActivo, selectedChat]
  );

  useInboxSocket({
    usuarioId,
    selectedChat: selectedChatUi,
    panelActivo,
    onNuevoMensaje: handleNuevoMensaje,
    onMensajeEstado: handleMensajeEstado,
    onSeguimientoEstado: handleSeguimientoEstado,
  });

  const chat = useMemo(() => {
    if (!panelActivo || !selectedChat) return null;
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
  }, [chats, selectedChat, chatMeta, panelActivo]);

  const mensajesPanel = useMemo(
    () => (panelActivo ? mensajes : []),
    [panelActivo, mensajes]
  );

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

  const cambiarConexion = useCallback(
    (conexionId) => {
      const next = normalizeConexionSeleccionada(conexionId);
      if (!next || next === conexionSeleccionadaRef.current) return;
      sessionStorage.setItem(STORAGE_CONEXION, next);
      abrirChatSeqRef.current += 1;
      selectedChatRef.current = null;
      conexionSeleccionadaRef.current = next;
      setSelectedChat(null);
      setMensajes([]);
      setChatMeta(null);
      setMenuChatKey(null);
      setTagModalNumero(null);
      setCargandoChat(false);
      setChats([]);
      setConexionSeleccionada(next);
    },
    []
  );

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

  const appendMensaje = useCallback(
    (msg) => {
      if (!selectedChatMatchesTab(selectedChat, conexionSeleccionada)) return;
      setMensajes((prev) => [...prev, msg]);
    },
    [selectedChat, conexionSeleccionada]
  );

  const patchMensaje = useCallback(
    (id, patch) => {
      if (!selectedChatMatchesTab(selectedChat, conexionSeleccionada)) return;
      setMensajes((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      );
    },
    [selectedChat, conexionSeleccionada]
  );

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
    selectedChat: selectedChatUi,
    panelActivo,
    chat,
    mensajes: mensajesPanel,
    chatMeta: panelActivo ? chatMeta : null,
    cargandoChat: panelActivo ? cargandoChat : false,
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
    conexionActiva,
    cambiarConexion,
    refreshConexiones,
    CONEXION_TODAS,
  };
}
