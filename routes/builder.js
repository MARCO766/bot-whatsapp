const express = require("express");
const router = express.Router();

const axios = require("axios");

const { protegerPanel } = require("../middlewares/auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

router.get("/builder", protegerPanel, async (req, res) => {
  try {
    res.render("builder");
  } catch (error) {
    res.send(error.message);
  }
});

module.exports = router;

/* =========================
   PANEL DERECHO DE NODO
========================= */

let nodoSeleccionadoPanel = null;

document.addEventListener("click", function(e){
  const nodo = e.target.closest(".node");

  if(!nodo) return;

  if(
    e.target.classList.contains("port") ||
    e.target.classList.contains("delete-node") ||
    e.target.classList.contains("edit-node")
  ){
    return;
  }

  abrirPanelNodo(nodo);
});

function abrirPanelNodo(nodo){
  nodoSeleccionadoPanel = nodo;

  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");

  if(!panel || !contenido) return;

  panel.classList.add("activo");

  const titulo = nodo.querySelector("h3")?.innerText || "Nodo";

  contenido.innerHTML = `
    <div class="panel-campo">
      <label>Nombre del nodo</label>
      <input id="panelTituloNodo" value="${escaparHTML(titulo)}">
    </div>

    <div class="panel-campo">
      <label>Posición X</label>
      <input value="${parseInt(nodo.style.left || 0)}px" disabled>
    </div>

    <div class="panel-campo">
      <label>Posición Y</label>
      <input value="${parseInt(nodo.style.top || 0)}px" disabled>
    </div>

    <button class="panel-btn" onclick="guardarPanelNodo()">
      Guardar cambios
    </button>
  `;
}

function guardarPanelNodo(){
  if(!nodoSeleccionadoPanel) return;

  const nuevoTitulo = document.getElementById("panelTituloNodo")?.value.trim();

  const h3 = nodoSeleccionadoPanel.querySelector("h3");

  if(h3 && nuevoTitulo){
    h3.innerText = nuevoTitulo;
  }

  alert("Nodo actualizado");
}

function cerrarPanelNodo(){
  const panel = document.getElementById("panelNodo");

  if(panel){
    panel.classList.remove("activo");
  }

  nodoSeleccionadoPanel = null;
}