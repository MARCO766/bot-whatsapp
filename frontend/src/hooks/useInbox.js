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
  sameChatKey,
  chatListKey,
  resolveChatKey,
} from "../utils/chatFormat";
import { useInboxSocket } from "./useInboxSocket";
import {
  CONEXION_TODAS,
  sameConexionId,
  normalizeConexionesInbox,
  findConexionInbox,
} from "../utils/conexionesInbox";

export { CONEXION_TODAS };

const STORAGE_INBOX_NUMERO = "macbot_inbox_numero";
const STORAGE_INBOX_NUMERO_CONEXION = "macbot_inbox_numero_conexion_id";
const INBOX_PAGE_LIMIT = 20;

function isAbortError(err) {
  return err?.name === "AbortError";
}

function mergeChatsByKey(prev, nuevos) {
  if (!nuevos?.length) return prev;
  const keys = new Set(prev.map((c) => c.chatKey).filter(Boolean));
  const merged = [...prev];
  for (const chat of nuevos) {
    const key = chat.chatKey;
    if (!key || keys.has(key)) continue;
    keys.add(key);
    merged.push(chat);
  }
  return merged;
}

function selectedChatMatchesTab(selectedChat, conexionSeleccionadaId) {
  if (!selectedChat) return false;
  if (!conexionSeleccionadaId || conexionSeleccionadaId === CONEXION_TODAS) {
    return true;
  }
  const conn =
    selectedChat.conexion_whatsapp_id ?? selectedChat.conexionWhatsappId ?? "";
  return sameConexionId(conn, conexionSeleccionadaId);
}

function toSelectedChat(chat) {
  if (!chat) return null;
  const cliente_numero = String(chat.cliente_numero ?? chat.numero ?? "").trim();
  const conexion_whatsapp_id = String(
    chat.conexion_whatsapp_id ?? chat.conexionWhatsappId ?? ""
  ).trim();
  if (!cliente_numero || !conexion_whatsapp_id) return null;
  const chatKey =
    chat.chatKey || chatListKey(cliente_numero, conexion_whatsapp_id);
  return {
    chatKey,
    cliente_numero,
    conexion_whatsapp_id,
    conexionWhatsappId: conexion_whatsapp_id,
    conversacion_id: chat.conversacion_id ?? chat.conversacionId ?? null,
    conversacionId: chat.conversacion_id ?? chat.conversacionId ?? null,
  };
}

function findChatInList(chats, selected) {
  if (!selected) return null;
  const key = resolveChatKey(selected);
  if (key) {
    const byKey = chats.find((c) => c.chatKey === key);
    if (byKey) return byKey;
  }
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
  const [tagModalTarget, setTagModalTarget] = useState(null);
  const [conexionesInbox, setConexionesInbox] = useState([]);
  const [conexionSeleccionadaId, setConexionSeleccionadaId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const abrirChatSeqRef = useRef(0);
  const conexionSeleccionadaIdRef = useRef(null);
  const conexionesInboxRef = useRef([]);
  const selectedChatRef = useRef(null);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const nextOffsetRef = useRef(0);
  const pageLimitRef = useRef(INBOX_PAGE_LIMIT);
  const inboxLoadSeqRef = useRef(0);
  const inboxAbortRef = useRef(null);

  useEffect(() => {
    conexionSeleccionadaIdRef.current = conexionSeleccionadaId;
  }, [conexionSeleccionadaId]);

  useEffect(() => {
    conexionesInboxRef.current = conexionesInbox;
  }, [conexionesInbox]);

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
    setTagModalTarget(null);
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
    async (filtro = etiquetaFiltro, conexionId = conexionSeleccionadaId) => {
      inboxLoadSeqRef.current += 1;
      const requestSeq = inboxLoadSeqRef.current;
      inboxAbortRef.current?.abort();
      const ac = new AbortController();
      inboxAbortRef.current = ac;

      const isStale = () => requestSeq !== inboxLoadSeqRef.current;

      setLoading(true);
      setError(null);
      hasMoreRef.current = false;
      loadingMoreRef.current = false;
      nextOffsetRef.current = 0;
      setHasMore(false);
      setLoadingMore(false);
      try {
        const apiConexion =
          conexionId && conexionId !== CONEXION_TODAS ? conexionId : null;
        const data = await fetchInbox(filtro, apiConexion, {
          limit: INBOX_PAGE_LIMIT,
          offset: 0,
          signal: ac.signal,
        });
        if (isStale()) return;
        if (filtro && !(data.etiquetasUnicas || []).includes(filtro)) {
          setEtiquetaFiltro("");
          return;
        }
        const limit = data.limit ?? INBOX_PAGE_LIMIT;
        pageLimitRef.current = limit;
        nextOffsetRef.current = limit;
        const more = Boolean(data.hasMore);
        hasMoreRef.current = more;
        setHasMore(more);
        setChats(data.chats || []);
        setEtiquetasUnicas(data.etiquetasUnicas || []);
        setEtiquetasDisponibles(data.etiquetasDisponibles || []);
        setMapaColores(data.mapaColoresEtiquetas || {});
      } catch (err) {
        if (isAbortError(err) || isStale()) return;
        setError(err.message || "Error cargando bandeja");
      } finally {
        if (!isStale()) setLoading(false);
      }
    },
    [etiquetaFiltro, conexionSeleccionadaId]
  );

  const loadMoreInbox = useCallback(async () => {
    if (
      !hasMoreRef.current ||
      loadingMoreRef.current ||
      loading ||
      !conexionSeleccionadaId
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const loadSeq = inboxLoadSeqRef.current;
    try {
      const apiConexion =
        conexionSeleccionadaId && conexionSeleccionadaId !== CONEXION_TODAS
          ? conexionSeleccionadaId
          : null;
      const offset = nextOffsetRef.current;
      const limit = pageLimitRef.current;
      const data = await fetchInbox(etiquetaFiltro, apiConexion, {
        limit,
        offset,
      });
      if (loadSeq !== inboxLoadSeqRef.current) return;
      const nuevosChats = data.chats || [];
      setChats((prev) => mergeChatsByKey(prev, nuevosChats));
      const more = Boolean(data.hasMore);
      hasMoreRef.current = more;
      setHasMore(more);
      nextOffsetRef.current = offset + limit;
    } catch (err) {
      if (isAbortError(err) || loadSeq !== inboxLoadSeqRef.current) return;
      setError(err.message || "Error cargando más conversaciones");
    } finally {
      if (loadSeq === inboxLoadSeqRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [loading, conexionSeleccionadaId, etiquetaFiltro]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const session = await fetchSession(ac.signal);
        if (cancelled || ac.signal.aborted) return;
        setUsuarioId(session.usuarioId);

        const { conexiones: lista } = await fetchConexiones(ac.signal);
        if (cancelled || ac.signal.aborted) return;

        const normalizadas = normalizeConexionesInbox(lista);
        setConexionesInbox(normalizadas);
        if (!normalizadas.length) {
          setError(
            "No hay líneas WhatsApp configuradas. Agrega una en Ajustes."
          );
          setConexionSeleccionadaId(null);
          return;
        }

        setConexionSeleccionadaId(CONEXION_TODAS);
      } catch (err) {
        if (cancelled || isAbortError(err)) return;
        setError(err.message || "Error cargando bandeja");
      } finally {
        if (!cancelled && !ac.signal.aborted) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
      inboxLoadSeqRef.current += 1;
      inboxAbortRef.current?.abort();
      ac.abort();
    };
  }, []);

  const refreshConexiones = useCallback(async () => {
    try {
      const { conexiones: lista } = await fetchConexiones();
      const normalizadas = normalizeConexionesInbox(lista);
      setConexionesInbox(normalizadas);
      setConexionSeleccionadaId((prev) => {
        if (!prev || prev === CONEXION_TODAS) return prev;
        const sigue = normalizadas.some((c) => sameConexionId(c.id, prev));
        return sigue ? prev : CONEXION_TODAS;
      });
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

  const conexionActual = useMemo(
    () => findConexionInbox(conexionesInbox, conexionSeleccionadaId),
    [conexionesInbox, conexionSeleccionadaId]
  );

  useEffect(() => {
    if (!conexionSeleccionadaId) return;
    loadInbox(etiquetaFiltro, conexionSeleccionadaId);
  }, [etiquetaFiltro, conexionSeleccionadaId, loadInbox]);

  const prevConexionRef = useRef(undefined);
  useEffect(() => {
    if (!conexionSeleccionadaId) return;

    const prev = prevConexionRef.current;
    prevConexionRef.current = conexionSeleccionadaId;

    if (prev === undefined) return;

    if (prev !== conexionSeleccionadaId) {
      resetPanelState();
      setChats([]);
      hasMoreRef.current = false;
      nextOffsetRef.current = 0;
      setHasMore(false);
    }
  }, [conexionSeleccionadaId, resetPanelState]);

  useEffect(() => {
    if (!selectedChat || !conexionSeleccionadaId) return;
    if (!selectedChatMatchesTab(selectedChat, conexionSeleccionadaId)) {
      resetPanelState();
    }
  }, [conexionSeleccionadaId, selectedChat, resetPanelState]);

  const abrirChat = useCallback(async (chat) => {
    const sel = toSelectedChat(chat);
    if (!sel) return;
    if (!selectedChatMatchesTab(sel, conexionSeleccionadaId)) return;

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
        !selectedChatMatchesTab(sel, conexionSeleccionadaIdRef.current)
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
        bot_pausado: data.bot_pausado,
        bot_pausado_hasta: data.bot_pausado_hasta,
        bot_pausado_motivo: data.bot_pausado_motivo,
      });
      setMensajes(data.mensajes || []);
    } catch (err) {
      if (seq !== abrirChatSeqRef.current) return;
      setError(err.message || "Error cargando chat");
      setMensajes([]);
    } finally {
      if (seq === abrirChatSeqRef.current) setCargandoChat(false);
    }
  }, [conexionSeleccionadaId]);

  useEffect(() => {
    const pre = sessionStorage.getItem(STORAGE_INBOX_NUMERO);
    const preConn = sessionStorage.getItem(STORAGE_INBOX_NUMERO_CONEXION);
    if (!pre || !preConn || loading || !chats.length || !conexionSeleccionadaId) {
      return;
    }
    sessionStorage.removeItem(STORAGE_INBOX_NUMERO);
    sessionStorage.removeItem(STORAGE_INBOX_NUMERO_CONEXION);

    const match = chats.find(
      (c) =>
        (c.numero === pre || c.cliente_numero === pre) &&
        sameConexionId(
          c.conexion_whatsapp_id || c.conexionWhatsappId,
          preConn
        )
    );
    if (!match) return;
    const sel = toSelectedChat(match);
    if (!sel || !selectedChatMatchesTab(sel, conexionSeleccionadaId)) return;
    abrirChat(match);
  }, [loading, chats, abrirChat, conexionSeleccionadaId]);

  const moverChatArriba = useCallback((chatKey, preview, ultimoEn) => {
    const key = String(chatKey || "").trim();
    if (!key || !key.includes("::")) return;
    const ts = ultimoEn || new Date().toISOString();

    setChats((prev) => {
      const idx = prev.findIndex((c) => c.chatKey === key);
      const texto = formatPreview(preview);
      if (idx === -1) {
        const sep = key.indexOf("::");
        const numero = key.slice(0, sep);
        const connId = key.slice(sep + 2);
        if (!numero || !connId) return prev;
        return [
          {
            chatKey: key,
            numero,
            cliente_numero: numero,
            conexionWhatsappId: connId,
            conexion_whatsapp_id: connId,
            conexion_nombre: "",
            nombre: numero,
            bloqueado: false,
            online: true,
            noLeidos: 0,
            ultimoMensaje: texto,
            ultimoMensajeEn: ts,
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
        ultimoMensajeEn: ts,
      });
      return updated;
    });
  }, []);

  const incrementarNoLeido = useCallback((chatKey) => {
    const key = String(chatKey || "").trim();
    if (!key) return;
    setChats((prev) =>
      prev.map((c) =>
        c.chatKey === key ? { ...c, noLeidos: (c.noLeidos || 0) + 1 } : c
      )
    );
  }, []);

  const handleNuevoMensaje = useCallback(
    ({ msg, chatKey, conexionWhatsappId }) => {
      const key = String(chatKey || msg?.chatKey || "").trim();
      if (!key) return;

      const tabId = conexionSeleccionadaIdRef.current;
      if (
        tabId &&
        tabId !== CONEXION_TODAS &&
        conexionWhatsappId &&
        !sameConexionId(conexionWhatsappId, tabId)
      ) {
        return;
      }

      moverChatArriba(key, msg.contenido || msg.tipo || "", msg.creado_en);

      const sel = selectedChatRef.current;
      const selKey = resolveChatKey(sel);
      const sameSelectedChat = Boolean(selKey && key === selKey);
      const canPaintPanel =
        sameSelectedChat && selectedChatMatchesTab(sel, tabId);

      if (!canPaintPanel) {
        incrementarNoLeido(key);
        return;
      }

      setMensajes((prev) => {
        if (prev.some((m) => m.id === msg.id && msg.id)) return prev;
        if (msg.chatKey && selKey && msg.chatKey !== selKey) return prev;
        return [...prev, msg];
      });
    },
    [moverChatArriba, incrementarNoLeido]
  );

  const handleMensajeEstado = useCallback((data) => {
    if (!data?.whatsapp_message_id) return;
    const sel = selectedChatRef.current;
    const tabId = conexionSeleccionadaIdRef.current;
    if (!sel || !selectedChatMatchesTab(sel, tabId)) return;
    setMensajes((prev) =>
      prev.map((m) =>
        m.whatsapp_message_id === data.whatsapp_message_id
          ? { ...m, estado_envio: data.estado_envio }
          : m
      )
    );
  }, []);

  const handleSeguimientoEstado = useCallback((data) => {
    const sel = selectedChatRef.current;
    const tabId = conexionSeleccionadaIdRef.current;
    if (!sel || !selectedChatMatchesTab(sel, tabId)) return;
    const segKey = resolveChatKey({
      cliente_numero: data?.cliente_numero,
      conexion_whatsapp_id: data?.conexion_whatsapp_id,
      chatKey: data?.chatKey,
    });
    if (!sameChatKey(sel, { chatKey: segKey })) return;
    setMensajes((prev) => [
      ...prev,
      {
        id: `seg-${Date.now()}`,
        direccion: "sistema",
        tipo: "texto",
        contenido: `⏱ Seguimiento paso ${(data.paso_index || 0) + 1}: ${data.estado || "actualizado"}`,
        creado_en: new Date().toISOString(),
        chatKey: segKey,
      },
    ]);
  }, []);

  const panelActivo = useMemo(
    () => selectedChatMatchesTab(selectedChat, conexionSeleccionadaId),
    [selectedChat, conexionSeleccionadaId]
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
      chatKey: selectedChat.chatKey,
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
    if (conexionSeleccionadaId && conexionSeleccionadaId !== CONEXION_TODAS) {
      list = list.filter((c) =>
        sameConexionId(
          c.conexion_whatsapp_id || c.conexionWhatsappId,
          conexionSeleccionadaId
        )
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
  }, [chats, busqueda, conexionSeleccionadaId]);

  const seleccionarConexion = useCallback((rawId) => {
    let nextId = CONEXION_TODAS;

    if (rawId !== CONEXION_TODAS) {
      const lista = conexionesInboxRef.current || [];
      const row = lista.find((c) => sameConexionId(c.id, rawId));
      if (!row?.id) return;
      nextId = String(row.id);
    }

    if (conexionSeleccionadaIdRef.current === nextId) return;

    abrirChatSeqRef.current += 1;
    selectedChatRef.current = null;
    conexionSeleccionadaIdRef.current = nextId;
    setSelectedChat(null);
    setMensajes([]);
    setChatMeta(null);
    setMenuChatKey(null);
    setTagModalTarget(null);
    setCargandoChat(false);
    setChats([]);
    hasMoreRef.current = false;
    nextOffsetRef.current = 0;
    setHasMore(false);
    setConexionSeleccionadaId(nextId);
  }, []);

  const etiquetasModal = useMemo(() => {
    const connId = tagModalTarget?.conexion_whatsapp_id;
    if (!connId) return [];
    return etiquetasDisponibles.filter((e) =>
      sameConexionId(e.conexion_whatsapp_id ?? e.conexionWhatsappId, connId)
    );
  }, [etiquetasDisponibles, tagModalTarget]);

  const openTagModal = useCallback((chat) => {
    const numero = String(chat.cliente_numero ?? chat.numero ?? "").trim();
    const conexion_whatsapp_id = String(
      chat.conexion_whatsapp_id ?? chat.conexionWhatsappId ?? ""
    ).trim();
    if (!numero || !conexion_whatsapp_id) return;
    setTagModalTarget({
      numero,
      conexion_whatsapp_id,
      chatKey:
        chat.chatKey || chatListKey(numero, conexion_whatsapp_id),
    });
  }, []);

  const closeTagModal = useCallback(() => {
    setTagModalTarget(null);
  }, []);

  const cambiarFiltroEtiqueta = useCallback((etiqueta) => {
    setEtiquetaFiltro(etiqueta);
    setSelectedChat(null);
    setMensajes([]);
    setChatMeta(null);
  }, []);

  const aplicarEtiqueta = useCallback(
    async (numero, etiqueta) => {
      const target = tagModalTarget;
      if (!target?.conexion_whatsapp_id) return;

      await guardarEtiqueta(numero, etiqueta, target.conexion_whatsapp_id);
      const color = mapaColores[etiqueta] || "#22c55e";
      setChats((prev) =>
        prev.map((c) =>
          c.chatKey === target.chatKey
            ? { ...c, etiquetas: [{ nombre: etiqueta, color }] }
            : c
        )
      );
      setTagModalTarget(null);
    },
    [mapaColores, tagModalTarget]
  );

  const quitarEtiquetaChat = useCallback(async (numero) => {
    const target = tagModalTarget;
    if (!target?.conexion_whatsapp_id) return;

    await quitarEtiqueta(numero, target.conexion_whatsapp_id);
    setChats((prev) =>
      prev.map((c) =>
        c.chatKey === target.chatKey ? { ...c, etiquetas: [] } : c
      )
    );
    setTagModalTarget(null);
  }, [tagModalTarget]);

  const toggleBloqueo = useCallback(
    async (chatItem, bloqueado) => {
      const numero = chatItem.numero || chatItem.cliente_numero;
      if (!numero) {
        setError("Número de contacto no válido");
        setMenuChatKey(null);
        return;
      }
      try {
        setError(null);
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
      } catch (err) {
        setError(
          err.message ||
            (bloqueado ? "Error desbloqueando contacto" : "Error bloqueando contacto")
        );
        setMenuChatKey(null);
      }
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
    const sel = selectedChatRef.current;
    const tabId = conexionSeleccionadaIdRef.current;
    if (!sel || !selectedChatMatchesTab(sel, tabId)) return;
    const selKey = resolveChatKey(sel);
    if (msg?.chatKey && selKey && msg.chatKey !== selKey) return;
    setMensajes((prev) => [...prev, msg]);
  }, []);

  const patchMensaje = useCallback((id, patch) => {
    const sel = selectedChatRef.current;
    const tabId = conexionSeleccionadaIdRef.current;
    if (!sel || !selectedChatMatchesTab(sel, tabId)) return;
    setMensajes((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const patchBotPause = useCallback((pausePatch) => {
    const sel = selectedChatRef.current;
    const tabId = conexionSeleccionadaIdRef.current;
    if (!sel || !selectedChatMatchesTab(sel, tabId)) return;

    setChatMeta((m) => (m ? { ...m, ...pausePatch } : m));
    setChats((prev) =>
      prev.map((c) =>
        sameChat(c, sel) ? { ...c, ...pausePatch } : c
      )
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
    tagModalTarget,
    etiquetasModal,
    openTagModal,
    closeTagModal,
    totalNoLeidos,
    abrirChat,
    cambiarFiltroEtiqueta,
    aplicarEtiqueta,
    quitarEtiquetaChat,
    toggleBloqueo,
    eliminarChatHandler,
    appendMensaje,
    patchMensaje,
    patchBotPause,
    moverChatArriba,
    reload: loadInbox,
    loadMoreInbox,
    hasMore,
    loadingMore,
    conexionesInbox,
    conexionSeleccionadaId,
    conexionActual,
    seleccionarConexion,
    refreshConexiones,
    CONEXION_TODAS,
  };
}
