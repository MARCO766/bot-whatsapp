import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";
import { setBotPause } from "../../services/chatService";
import { sortMensajesPorCreadoEn } from "../../utils/chatFormat";
import {
  calcularVentana24h,
  etiquetaVentanaBadge,
} from "../../utils/whatsappVentana24h";

/** Distancia al fondo (px) para considerar que el usuario sigue al final del hilo. */
const NEAR_BOTTOM_PX = 120;

export default function ChatWindow({
  panelActivo = false,
  chat,
  chatMeta,
  mensajes,
  cargando,
  conexionWhatsappId,
  conexionSeleccionada,
  onSent,
  onPatchMensaje,
  moverChatArriba,
  onOpenTagModal,
  onPatchBotPause,
}) {
  const scrollRef = useRef(null);
  const messagesContentRef = useRef(null);
  const pinnedToBottomRef = useRef(true);
  const autoScrollingRef = useRef(false);
  const [ventanaTick, setVentanaTick] = useState(0);
  const [flowLoading, setFlowLoading] = useState(false);
  const numero = panelActivo ? chat?.numero || chat?.cliente_numero : null;
  const nombre = panelActivo
    ? chatMeta?.nombre || chat?.nombre || numero
    : null;
  const bloqueado = panelActivo
    ? chatMeta?.bloqueado ?? chat?.bloqueado
    : false;
  const conexionNombre = panelActivo
    ? String(chat?.conexion_nombre || "").trim()
    : "";
  const conexionEtiqueta = conexionNombre || `ID ${String(conexionWhatsappId || "").slice(-6)}`;
  const etiquetas = Array.isArray(chat?.etiquetas) ? chat.etiquetas.slice(0, 3) : [];

  const ventana = useMemo(
    () => calcularVentana24h(mensajes),
    [mensajes, ventanaTick]
  );
  const ventanaAbierta = ventana.abierta;

  const mensajesOrdenados = useMemo(
    () => sortMensajesPorCreadoEn(mensajes),
    [mensajes]
  );

  useEffect(() => {
    if (!numero || !ventanaAbierta) return undefined;
    const id = setInterval(() => setVentanaTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [numero, ventanaAbierta]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  const syncPinnedFromScroll = useCallback(() => {
    if (autoScrollingRef.current) return;
    pinnedToBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  const scrollToBottom = useCallback((instant = false, { force = false } = {}) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!force && !pinnedToBottomRef.current) return;

    autoScrollingRef.current = true;

    const run = () => {
      if (instant) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };

    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(() => {
        run();
        autoScrollingRef.current = false;
        pinnedToBottomRef.current = true;
      });
    });

    if (force) {
      pinnedToBottomRef.current = true;
    }
  }, []);

  const handleMediaLayout = useCallback(() => {
    scrollToBottom(false, { force: false });
  }, [scrollToBottom]);

  useEffect(() => {
    if (!numero) return;
    pinnedToBottomRef.current = true;
    scrollToBottom(true, { force: true });
  }, [numero, scrollToBottom]);

  useEffect(() => {
    if (!numero || cargando) return;
    scrollToBottom(true, { force: true });
  }, [cargando, numero, scrollToBottom]);

  useEffect(() => {
    if (!numero || cargando) return;
    scrollToBottom(false, { force: false });
  }, [mensajes, cargando, numero, scrollToBottom]);

  useEffect(() => {
    const contentEl = messagesContentRef.current;
    if (!contentEl || !numero) return undefined;

    const ro = new ResizeObserver(() => {
      if (pinnedToBottomRef.current) {
        scrollToBottom(true, { force: false });
      }
    });

    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [numero, scrollToBottom, mensajesOrdenados.length, cargando]);

  const conexionChat = String(conexionWhatsappId || "").trim();
  const conexionTab = String(conexionSeleccionada || "").trim();
  const conexionCoincide =
    !conexionTab ||
    conexionTab === "__todas__" ||
    (conexionChat && conexionChat === conexionTab);

  const botPausado = Boolean(
    chatMeta?.bot_pausado ?? chat?.bot_pausado
  );

  const aplicarBotPause = useCallback(
    async (action) => {
      if (!numero || !conexionWhatsappId || flowLoading) return;
      setFlowLoading(true);
      try {
        const data = await setBotPause({
          clienteNumero: numero,
          conexionWhatsappId,
          action,
        });
        onPatchBotPause?.({
          bot_pausado: data.bot_pausado,
          bot_pausado_hasta: data.bot_pausado_hasta,
          bot_pausado_motivo: data.bot_pausado_motivo,
        });
      } catch (err) {
        console.error("[BOT_PAUSE] UI error:", err.message || err);
      } finally {
        setFlowLoading(false);
      }
    },
    [numero, conexionWhatsappId, flowLoading, onPatchBotPause]
  );

  const miniContexto = useMemo(() => {
    const data = { ...(chat || {}), ...(chatMeta || {}) };
    const rows = [];

    const ventasValor =
      data.ventas_crm ??
      data.ventas ??
      data.crm_ventas ??
      data.total_ventas ??
      data.conversiones ??
      null;
    if (ventasValor != null && ventasValor !== "") {
      rows.push({ key: "ventas", label: "Ventas CRM", value: String(ventasValor) });
    }

    const seguimientosValor =
      data.seguimientos_pendientes ??
      data.seguimientosPendientes ??
      data.seguimientos_activos ??
      data.seguimientos ??
      null;
    if (seguimientosValor != null && seguimientosValor !== "") {
      rows.push({
        key: "seguimientos",
        label: "Seguimientos",
        value: String(seguimientosValor),
      });
    }

    const estadoBot = botPausado ? "Flujo apagado" : "Flujo activo";
    const estadoIa =
      data.ia_activa != null
        ? data.ia_activa
          ? "IA activa"
          : "IA inactiva"
        : null;
    const estadoRm =
      data.rm24h_activo != null
        ? data.rm24h_activo
          ? "RM24h activo"
          : "RM24h inactivo"
        : data.remarketing_activo != null
          ? data.remarketing_activo
            ? "RM activo"
            : "RM inactivo"
          : null;
    const estados = [estadoBot, estadoIa, estadoRm].filter(Boolean).join(" · ");
    if (estados) {
      rows.push({ key: "estado", label: "Estado", value: estados });
    }

    return rows.slice(0, 3);
  }, [chat, chatMeta, botPausado]);

  if (!panelActivo || !numero || !conexionWhatsappId || !conexionCoincide) {
    return (
      <section className="chatWindow">
        <div className="empty">Selecciona un chat</div>
      </section>
    );
  }

  return (
    <section className="chatWindow">
      <header className="chatHeader">
        <div className="chatHeaderMain">
          <div className="chatUser">
            <div className="bigAvatar">{(nombre || "?").charAt(0)}</div>
            <div className="chatUserText">
              <h2>{nombre}</h2>
              <p>{numero}</p>
              <small className="chatHeaderLine">Línea WhatsApp: {conexionEtiqueta}</small>
            </div>
          </div>
          <span
            className={`whatsappVentanaBadge ${
              ventanaAbierta ? "whatsappVentanaBadge--open" : "whatsappVentanaBadge--closed"
            }`}
            title={
              ventanaAbierta
                ? "Puedes enviar mensajes manuales dentro de la ventana de 24h"
                : "El lead debe responder para reabrir la ventana de 24h"
            }
          >
            {etiquetaVentanaBadge(ventana)}
          </span>
        </div>

        <div className="chatHeaderMeta">
          {etiquetas.length > 0 && (
            <div className="chatHeaderChips" aria-label="Etiquetas del lead">
              {etiquetas.map((tag) => (
                <span
                  key={tag.nombre}
                  className="chatHeaderChip"
                  style={{
                    backgroundColor: `${tag.color}24`,
                    borderColor: `${tag.color}66`,
                    color: "#e2e8f0",
                  }}
                >
                  {tag.nombre}
                </span>
              ))}
            </div>
          )}

          {miniContexto.length > 0 && (
            <div className="chatMiniContext" aria-label="Resumen CRM">
              {miniContexto.map((item) => (
                <span key={item.key} className="chatMiniItem">
                  <strong>{item.label}:</strong> {item.value}
                </span>
              ))}
            </div>
          )}

          <div className="chatQuickActions" aria-label="Acciones rápidas">
            <button type="button" className="chatQuickBtn" onClick={() => onOpenTagModal?.(chat)}>
              Etiquetas
            </button>

            <div className="chatFlowToggle">
              {botPausado ? (
                <>
                  <span
                    className="chatQuickBtn chatFlowBtn chatFlowBtn--paused chatFlowBtn--status"
                    aria-live="polite"
                  >
                    🔴 Flujo apagado
                  </span>
                  <button
                    type="button"
                    className="chatQuickBtn chatFlowBtn"
                    disabled={flowLoading}
                    onClick={() => aplicarBotPause("resume")}
                  >
                    Activar flujo
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="chatQuickBtn chatFlowBtn chatFlowBtn--active"
                  disabled={flowLoading}
                  onClick={() => aplicarBotPause("pause")}
                >
                  Apagar flujo
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {botPausado && (
        <div className="botPauseBanner" role="status">
          🔴 Automatización pausada — puedes responder manualmente
        </div>
      )}

      {bloqueado && (
        <div className="blockedBanner">Este contacto está bloqueado</div>
      )}

      <div
        ref={scrollRef}
        className="messages"
        aria-label="Mensajes del chat"
        onScroll={syncPinnedFromScroll}
      >
          {cargando && (
            <div className="loadingChat">Cargando conversación...</div>
          )}

          {!cargando && (
            <div ref={messagesContentRef} className="messagesInner">
              {mensajesOrdenados.map((m) => (
                <MessageBubble
                  key={m.id || `${m.creado_en}-${m.contenido}`}
                  msg={m}
                  uploadProgress={m._uploadProgress}
                  onMediaLayout={handleMediaLayout}
                />
              ))}
            </div>
          )}

        <div className="messagesEnd" />
      </div>

      <ChatComposer
        numero={numero}
        conexionWhatsappId={conexionWhatsappId}
        bloqueado={bloqueado}
        ventanaAbierta={ventanaAbierta}
        onSent={onSent}
        onPreviewList={(id, patch) => onPatchMensaje(id, patch)}
        moverChatArriba={moverChatArriba}
      />
    </section>
  );
}
