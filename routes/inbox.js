const express = require("express");
const router = express.Router();

const axios = require("axios");

const { protegerPanel } = require("../middlewares/auth");
const {
  loadInboxData,
  loadChatMessages,
  marcarLeido,
  chatCompositeKey,
  parseChatCompositeKey,
} = require("../services/inboxService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

// =========================
// 📥 INBOX VISUAL (legacy EJS)
// =========================

router.get("/inbox", protegerPanel, async (req, res) => {
  try {
    const etiquetaFiltro = req.query.etiqueta || "";
    const data = await loadInboxData(req.session.usuario.id, { etiquetaFiltro });

    const chatSeleccionadoNumero = String(req.query.numero || "").trim();
    const chatSeleccionadoConexion = String(
      req.query.conexion_whatsapp_id || ""
    ).trim();

    let chatActualKey = "";
    if (chatSeleccionadoNumero && chatSeleccionadoConexion) {
      chatActualKey = chatCompositeKey(
        chatSeleccionadoNumero,
        chatSeleccionadoConexion
      );
    }
    if (!data.chatKeys.includes(chatActualKey)) {
      chatActualKey = "";
    }

    const parsedActual = parseChatCompositeKey(chatActualKey);
    const chatActualNumero = parsedActual.numero || "";
    const chatActualConexion = parsedActual.conexionWhatsappId || "";

    res.render("inbox", {
      etiquetaFiltro,
      etiquetasUnicas: data.etiquetasUnicas,
      etiquetasDisponibles: data.etiquetasDisponibles,
      mapaColoresEtiquetas: data.mapaColoresEtiquetas,
      etiquetasClientes: data.etiquetasClientes,
      conversaciones: data.conversaciones,
      mapaConversaciones: data.mapaConversaciones,
      chats: data.chats,
      chatKeys: data.chatKeys,
      chatActualKey,
      chatActualNumero,
      chatActualConexion,
      mapaUnread: data.mapaUnread,
      mapaClientes: data.mapaClientes,
      horaBolivia: data.horaBolivia,
      usuarioId: req.session.usuario.id,
    });
  } catch (error) {
    res.send(error.message);
  }
});

router.get("/inbox/chat-json", protegerPanel, async (req, res) => {
  try {
    const numero = String(req.query.numero || "").trim();
    const conexionWhatsappId = String(
      req.query.conexion_whatsapp_id || ""
    ).trim();

    if (!numero) {
      return res.status(400).json({ ok: false, error: "Falta numero" });
    }
    if (!conexionWhatsappId) {
      console.log("[INBOX_MULTI_GUARD] falta conexion_whatsapp_id");
      return res
        .status(400)
        .json({ ok: false, error: "Falta conexion_whatsapp_id" });
    }

    const chat = await loadChatMessages(
      req.session.usuario.id,
      numero,
      conexionWhatsappId
    );

    res.json({
      ok: true,
      nombre: chat.nombre,
      numero: chat.numero,
      conexion_whatsapp_id: conexionWhatsappId,
      chatKey: chatCompositeKey(numero, conexionWhatsappId),
      mensajes: chat.mensajes || [],
    });
  } catch (error) {
    console.log("ERROR CHAT JSON:", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

router.post("/inbox/marcar-leido", protegerPanel, async (req, res) => {
  try {
    const numero = String(req.body.numero || "").trim();
    const conexionWhatsappId = String(
      req.body.conexion_whatsapp_id || ""
    ).trim();

    if (!numero) {
      return res.json({ ok: false });
    }
    if (!conexionWhatsappId) {
      console.log("[INBOX_MULTI_GUARD] falta conexion_whatsapp_id");
      return res.json({ ok: false });
    }

    await marcarLeido(req.session.usuario.id, numero, conexionWhatsappId);

    res.json({ ok: true });
  } catch (error) {
    console.log("ERROR MARCANDO LEIDO:", error.response?.data || error.message);
    res.json({ ok: false });
  }
});

module.exports = router;
