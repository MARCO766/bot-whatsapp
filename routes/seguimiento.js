const express = require("express");
const router = express.Router();

const { protegerPanel } = require("../middlewares/auth");
const {
  listarPorCliente,
  listarPorNodo,
} = require("../services/seguimiento/seguimientoRepository");

router.get("/api/seguimientos/cliente", protegerPanel, async (req, res) => {
  try {
    const numero = req.query.numero;
    if (!numero) {
      return res.status(400).json({ error: "Falta numero" });
    }

    const items = await listarPorCliente(numero, req.session.usuario.id);
    res.json({ ok: true, items });
  } catch (error) {
    console.log("ERROR listar seguimientos cliente:", error.message);
    res.status(500).json({ error: "No se pudieron cargar seguimientos" });
  }
});

router.get("/api/seguimientos/nodo", protegerPanel, async (req, res) => {
  try {
    const { flujo_id, nodo_id } = req.query;
    if (!flujo_id || !nodo_id) {
      return res.status(400).json({ error: "Faltan flujo_id o nodo_id" });
    }

    const items = await listarPorNodo(
      flujo_id,
      nodo_id,
      req.session.usuario.id
    );
    res.json({ ok: true, items });
  } catch (error) {
    console.log("ERROR listar seguimientos nodo:", error.message);
    res.status(500).json({ error: "No se pudieron cargar seguimientos" });
  }
});

module.exports = router;
