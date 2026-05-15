const canvas = document.getElementById("canvas-area");
const panel = document.getElementById("config-panel");
const panelTitle = document.getElementById("panel-title");

let nodoSeleccionado = null;

const tipos = {
  texto: {
    icono: "💬",
    titulo: "Mensaje de Texto",
    descripcion: "Envía un mensaje automático.",
  },

  imagen: {
    icono: "🖼",
    titulo: "Imagen",
    descripcion: "Envía una imagen automática.",
  },

  audio: {
    icono: "🎧",
    titulo: "Audio",
    descripcion: "Envía un audio automático.",
  },

  delay: {
    icono: "⏱",
    titulo: "Espera",
    descripcion: "Espera antes del siguiente paso.",
  },

  condicion: {
    icono: "🔀",
    titulo: "Condición",
    descripcion: "Divide el flujo según respuestas.",
  },

  ia: {
    icono: "🤖",
    titulo: "IA",
    descripcion: "Respuestas inteligentes.",
  },

  etiqueta: {
    icono: "🏷",
    titulo: "Etiqueta",
    descripcion: "Agrega o quita etiquetas.",
  },

  webhook: {
    icono: "🔗",
    titulo: "Webhook",
    descripcion: "Envía datos externos.",
  },
};

function crearNodo(tipo) {

  const data = tipos[tipo];

  const nodo = document.createElement("div");

  nodo.className = "flow-node";

  nodo.style.left = "300px";
  nodo.style.top = "200px";

  nodo.innerHTML = `
  
    <div class="node-top">

      <div class="node-icon">
        ${data.icono}
      </div>

      <div class="node-title">
        ${data.titulo}
      </div>

    </div>

    <div class="node-desc">
      ${data.descripcion}
    </div>

    <button class="edit-node-btn">
      Editar Nodo
    </button>

  `;

  canvas.appendChild(nodo);

  hacerDraggable(nodo);

  nodo.querySelector(".edit-node-btn")
    .addEventListener("click", () => {

      abrirPanel(data.titulo);

      nodoSeleccionado = nodo;

    });

}

function abrirPanel(titulo) {

  panel.style.display = "flex";

  panelTitle.innerText = titulo;

}

function cerrarPanel() {

  panel.style.display = "none";

}

function hacerDraggable(elemento) {

  let moviendo = false;

  let offsetX = 0;
  let offsetY = 0;

  elemento.addEventListener("mousedown", (e) => {

    moviendo = true;

    offsetX = e.clientX - elemento.offsetLeft;
    offsetY = e.clientY - elemento.offsetTop;

    elemento.style.cursor = "grabbing";

  });

  document.addEventListener("mousemove", (e) => {

    if (!moviendo) return;

    elemento.style.left =
      e.clientX - offsetX + "px";

    elemento.style.top =
      e.clientY - offsetY + "px";

  });

  document.addEventListener("mouseup", () => {

    moviendo = false;

    elemento.style.cursor = "grab";

  });

}