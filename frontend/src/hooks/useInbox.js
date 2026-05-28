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

const STORAGE_CONEXION = "macbot_inbox_conexion_id";
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
      if (!conexionId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchInbox(filtro, conexionId);
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
          lista.find((c) => c.id === saved) || lista[0];
        setConexionSeleccionada(pick.id);
        sessionStorage.setItem(STORAGE_CONEXION, pick.id);
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

  const abrirChat = useCallback(
    async (numero) => {
      if (!numero || !conexionSeleccionada) return;
      setChatActivo(numero);
      setMenuChat(null);
      setCargandoChat(true);

      setChats((prev) =>
        prev.map((c) => (c.numero === numero ? { ...c, noLeidos: 0 } : c))
      );

      try {
        await marcarLeido(numero, conexionSeleccionada);
        const data = await fetchChat(numero, conexionSeleccionada);
        setChatMeta({
          nombre: data.nombre,
          bloqueado: data.bloqueado,
          numero: data.numero,
          conexionWhatsappId: conexionSeleccionada,
        });
        setMensajes(data.mensajes || []);
      } catch (err) {
        setError(err.message || "Error cargando chat");
        setMensajes([]);
      } finally {
        setCargandoChat(false);
      }
    },
    [conexionSeleccionada]
  );

  useEffect(() => {
    const pre = sessionStorage.getItem("macbot_inbox_numero");
    if (!pre || loading) return;
    sessionStorage.removeItem("macbot_inbox_numero");
    abrirChat(pre);
  }, [loading, chats.length, abrirChat]);

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
      if (
        conexionSeleccionada &&
        msg.conexion_whatsapp_id &&
        msg.conexion_whatsapp_id !== conexionSeleccionada
      ) {
        return;
      }
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
    chatActivo,
    conexionSeleccionada,
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

  const cambiarConexion = useCallback((conexionId) => {
    if (!conexionId || conexionId === conexionSeleccionada) return;
    sessionStorage.setItem(STORAGE_CONEXION, conexionId);
    setConexionSeleccionada(conexionId);
    setChatActivo(null);
    setMensajes([]);
    setChatMeta(null);
    setEtiquetaFiltro("");
    setMenuChat(null);
  }, [conexionSeleccionada]);

  const cambiarFiltroEtiqueta = useCallback((etiqueta) => {
    setEtiquetaFiltro(etiqueta);
    setChatActivo(null);
    setMensajes([]);
    setChatMeta(null);
    loadInbox(etiqueta, conexionSeleccionada);
  }, [loadInbox, conexionSeleccionada]);

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
      if (!conexionSeleccionada) return;
      await eliminarChat(numero, conexionSeleccionada);
      setChats((prev) => prev.filter((c) => c.numero !== numero));
      if (chatActivo === numero) {
        setChatActivo(null);
        setMensajes([]);
        setChatMeta(null);
      }
      setMenuChat(null);
    },
    [chatActivo, conexionSeleccionada]
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
    conexiones,
    conexionSeleccionada,
    cambiarConexion,
  };
}
