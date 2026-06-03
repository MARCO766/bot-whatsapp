/**
 * API seguimientos CRM en builder — siempre con conexion_whatsapp_id explícita.
 * Sin fallback a línea principal ni inferencia por cliente_numero.
 */
window.MacBotSeguimientoApi = (function () {
  function normalizarConexionId(valor) {
    if (valor == null || String(valor).trim() === "") return null;
    return String(valor).trim();
  }

  function leerDeObjetoChat(obj) {
    if (!obj || typeof obj !== "object") return null;
    return normalizarConexionId(
      obj.conexion_whatsapp_id ?? obj.conexionWhatsappId ?? null
    );
  }

  /**
   * Línea del builder: URL del flujo, flujo guardado, chat activo (si el panel lo expone).
   */
  function obtenerConexionWhatsappIdBuilderContext() {
    if (typeof window.leerConexionWhatsappIdBuilder === "function") {
      const desdeUrl = window.leerConexionWhatsappIdBuilder();
      if (desdeUrl) return desdeUrl;
    }

    const builder = window.MACBOT_BUILDER || {};
    const desdeFlujo = normalizarConexionId(builder.conexionWhatsappIdFlujo);
    if (desdeFlujo) return desdeFlujo;

    const inbox = window.MacBotInbox;
    if (inbox) {
      const desdeInbox =
        leerDeObjetoChat(inbox.selectedChat) ||
        leerDeObjetoChat(inbox.chatActivo) ||
        leerDeObjetoChat(inbox.conversacionActiva);
      if (desdeInbox) return desdeInbox;
      const lineaSel = normalizarConexionId(
        inbox.conexionSeleccionadaId ?? inbox.lineaSeleccionadaId
      );
      if (lineaSel) return lineaSel;
    }

    const desdeGlobals =
      leerDeObjetoChat(window.selectedChat) ||
      leerDeObjetoChat(window.chatActivo) ||
      leerDeObjetoChat(window.conversacionActiva);
    if (desdeGlobals) return desdeGlobals;

    return null;
  }

  function buildSeguimientosClienteUrl(numero, conexionWhatsappId) {
    const params = new URLSearchParams();
    params.set("numero", String(numero).trim());
    params.set("conexion_whatsapp_id", String(conexionWhatsappId).trim());
    return "/api/seguimientos/cliente?" + params.toString();
  }

  /**
   * @returns {Promise<{ok:boolean, items:Array, motivo?:string, error?:string}>}
   */
  async function fetchSeguimientosCliente(numero) {
    const clienteNumero = String(numero || "").trim();
    if (!clienteNumero) {
      return { ok: false, items: [], motivo: "sin_numero" };
    }

    const conexionWhatsappId = obtenerConexionWhatsappIdBuilderContext();
    if (!conexionWhatsappId) {
      console.info(
        "[SEGUIMIENTO_BUILDER] sin conexion_whatsapp_id — omitiendo GET /api/seguimientos/cliente",
        { cliente_numero: clienteNumero }
      );
      return { ok: false, items: [], motivo: "sin_conexion" };
    }

    const url = buildSeguimientosClienteUrl(clienteNumero, conexionWhatsappId);

    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        let detalle = res.statusText;
        try {
          const body = await res.json();
          detalle = body.error || detalle;
        } catch (_) {
          /* ignore */
        }
        console.warn("[SEGUIMIENTO_BUILDER] API cliente error", {
          status: res.status,
          detalle,
          cliente_numero: clienteNumero,
          conexion_whatsapp_id: conexionWhatsappId,
        });
        return { ok: false, items: [], motivo: "api_error", error: detalle };
      }

      const data = await res.json();
      return {
        ok: true,
        items: Array.isArray(data.items) ? data.items : [],
        conexion_whatsapp_id: conexionWhatsappId,
      };
    } catch (err) {
      console.warn("[SEGUIMIENTO_BUILDER] fetch cliente falló", err.message);
      return { ok: false, items: [], motivo: "red", error: err.message };
    }
  }

  return {
    obtenerConexionWhatsappIdBuilderContext,
    buildSeguimientosClienteUrl,
    fetchSeguimientosCliente,
  };
})();
