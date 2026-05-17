let nodoCount = 0;
let ultimoNodo = null;
let conexiones = [];
let nodoArrastrando = null;
let lineaTemporal = null;

let variantesContenido = [[]];
let varianteActual = 0;
let contenidoArmado = variantesContenido[varianteActual];

const MACBOT_BUILDER = window.MACBOT_BUILDER || {};

let flujoEditandoId = MACBOT_BUILDER.flujoEditandoId || "";
let flujoCargado = MACBOT_BUILDER.flujoCargado || null;

const activadoresData = MACBOT_BUILDER.activadoresData || [];
const etiquetasData = MACBOT_BUILDER.etiquetasData || [];

const CANVAS_BASE_WIDTH = 4200;
const CANVAS_BASE_HEIGHT = 2800;
const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 2;
const CANVAS_ZOOM_STEP = 0.1;

let canvasZoom = 1;

/* =========================
   INICIO
========================= */

window.addEventListener("load", function(){
  cargarFlujoGuardado();
  crearNodoInicioAutomatico();
  initCanvasViewport();

  const btnGuardarFlujo = document.getElementById("btnGuardarFlujo");

  if(btnGuardarFlujo){
    btnGuardarFlujo.addEventListener("click", guardarFlujo);
  }

  document.getElementById("modalContenido")?.classList.remove("activo");
  document.getElementById("modalActivador")?.classList.remove("activo");

  const panel = document.getElementById("panelNodo");
  if(panel){
    panel.classList.add("activo");
  }
});

/* =========================
   MENÚS
========================= */

function toggleMenuFlujo(id){
  const menu = document.getElementById("menu_" + id);

  if(!menu){
    alert("No encontré el menú de este flujo");
    return;
  }

  document.querySelectorAll(".menu-flujo").forEach(m => {
    if(m !== menu){
      m.style.display = "none";
    }
  });

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function editarNombreFlujo(id, nombreActual){
  const nuevoNombre = prompt("Nuevo nombre del flujo:", nombreActual);

  if(!nuevoNombre || nuevoNombre.trim() === ""){
    return;
  }

  fetch("/editar-nombre-flujo/" + id, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nombre: nuevoNombre.trim()
    })
  })
  .then(res => res.text())
  .then(msg => {
    alert(msg);
    location.reload();
  });
}

function toggleMenuActivador(id){
  document.querySelectorAll(".menu-flujo").forEach(menu => {
    if(menu.id !== "menu_act_" + id){
      menu.style.display = "none";
    }
  });

  const menu = document.getElementById("menu_act_" + id);

  if(!menu){
    alert("No encontré el menú del activador");
    return;
  }

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

/* =========================
   NODO INICIO
========================= */

function crearNodoInicioAutomatico(){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  const yaExiste = document.getElementById("nodo_inicio");
  if(yaExiste) return;

  const nodo = document.createElement("div");

  nodo.className = "node node-start";
  nodo.id = "nodo_inicio";
  nodo.dataset.tipo = "inicio";

  nodo.style.left = "120px";
  nodo.style.top = "280px";

  nodo.innerHTML = `
    <h3 class="node-title node-title-start">▶ Inicio del Flujo</h3>
    <p class="node-desc node-desc-start">Aquí comienza tu flujo de conversación.</p>
    <div class="port out" data-nodo="nodo_inicio" onmousedown="iniciarConexion(event, 'nodo_inicio')"></div>
  `;

  canvas.appendChild(nodo);
  hacerMovible(nodo);
}

/* =========================
   CARGAR FLUJO GUARDADO
========================= */

function cargarFlujoGuardado(){
  if(!flujoCargado) return;

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  canvas.innerHTML = "";

  conexiones = [];
  ultimoNodo = null;

  const mapaNodos = {};

  if(flujoCargado.nodos){
    flujoCargado.nodos.forEach(item => {
      const nodo = document.createElement("div");

      nodo.id = item.id;
      nodo.className = item.className || "node";
      nodo.innerHTML = item.html || "";
      nodo.style.left = item.left || "80px";
      nodo.style.top = item.top || "80px";

      if(item.id === "nodo_inicio"){
        nodo.classList.add("node-start");
        nodo.dataset.tipo = "inicio";
      }

      canvas.appendChild(nodo);
      hacerMovible(nodo);

      mapaNodos[item.id] = nodo;

      const numero = parseInt(String(item.id).replace("nodo_", ""));

      if(!isNaN(numero) && numero > nodoCount){
        nodoCount = numero;
      }

      ultimoNodo = nodo;
    });
  }

  if(flujoCargado.conexiones){
    flujoCargado.conexiones.forEach(c => {
      if(mapaNodos[c.desde] && mapaNodos[c.hasta]){
        conectarNodos(mapaNodos[c.desde], mapaNodos[c.hasta]);
      }
    });
  }
}

/* =========================
   CREAR NODOS
========================= */

function agregarNodo(tipo){
  const canvas = document.getElementById("canvasFlujo");

  if(!canvas){
    alert("No existe canvasFlujo");
    return;
  }

  nodoCount++;

  const nodo = document.createElement("div");

  nodo.className = "node";
  nodo.id = "nodo_" + nodoCount;
  nodo.dataset.tipo = tipo;

  nodo.style.left = (280 + nodoCount * 40) + "px";
  nodo.style.top = (260 + nodoCount * 30) + "px";

  let contenido = "";

  if(tipo === "seguimiento"){
    nodo.classList.add("follow-node");

    contenido = `
      <div class="follow-header">
        <span>⏱️ Seguimiento</span>
      </div>

      <button class="edit-node" onclick="event.stopPropagation(); abrirEditorSeguimiento('${nodo.id}')">✎</button>
      <button class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>

      <div class="follow-body">
        <div class="follow-title">Sin seguimientos todavía</div>
      </div>

      <textarea class="seguimiento-data" style="display:none;">[]</textarea>
    `;
  }

  if(tipo === "espera"){
    nodo.classList.add("orange");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">⏳ Espera</h3>
      <input type="number" max="60" placeholder="Máximo 60 segundos">
    `;
  }

  if(tipo === "etiqueta"){
    const opcionesEtiquetas = etiquetasData.map(e => {
      return `<option value="${e.nombre}">${e.nombre}</option>`;
    }).join("");

    contenido = `
      <div class="node-actions">
        <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
        <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
      </div>
      <h3 class="node-title">🏷️ Etiqueta</h3>
      <select class="node-select" style="width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px;">
        <option value="">Selecciona una etiqueta</option>
        ${opcionesEtiquetas}
      </select>
    `;
  }

  if(tipo === "conectar"){
    contenido = `
      <button class="delete-node" onclick="borrarNodo('${nodo.id}')">×</button>
      <h3>🔗 Conectar flujo</h3>
      <input placeholder="Nombre del flujo">
    `;
  }

  nodo.innerHTML = `
    <div class="port in" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}')"></div>
    ${contenido}
    <div class="port out" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}')"></div>
  `;

  canvas.appendChild(nodo);
  hacerMovible(nodo);
}

/* =========================
   MOVER NODOS
========================= */

function hacerMovible(nodo){
  let moviendo = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  nodo.addEventListener("mousedown", function(e){
    if(
      e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "SELECT" ||
      e.target.classList.contains("port")
    ){
      return;
    }

    moviendo = true;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = nodo.offsetLeft;
    origTop = nodo.offsetTop;
    marcarNodoSeleccionado(nodo);
  });

  document.addEventListener("mousemove", function(e){
    if(!moviendo) return;

    const zoom = getCanvasZoom();

    nodo.style.left = origLeft + (e.clientX - startX) / zoom + "px";
    nodo.style.top = origTop + (e.clientY - startY) / zoom + "px";

    actualizarLineas();
    actualizarPanelPosicion(nodo);
  });

  document.addEventListener("mouseup", function(){
    moviendo = false;
  });
}

/* =========================
   CONEXIONES
========================= */

function iniciarConexion(e, id){
  e.stopPropagation();

  nodoArrastrando = document.getElementById(id);

  const canvas = document.getElementById("canvasFlujo");
  if(!canvas || !nodoArrastrando) return;

  lineaTemporal = document.createElement("div");
  lineaTemporal.className = "linea linea-dashed";

  canvas.appendChild(lineaTemporal);

  document.addEventListener("mousemove", moverConexionTemporal);
  document.addEventListener("mouseup", soltarConexion);
}

function moverConexionTemporal(e){
  if(!nodoArrastrando || !lineaTemporal) return;

  const puerto = nodoArrastrando.querySelector(".port.out") || nodoArrastrando.querySelector(".port");
  if(!puerto) return;

  const inicio = getPortCanvasPoint(puerto);
  const fin = screenPointToCanvas(e.clientX, e.clientY);

  posicionarLinea(lineaTemporal, inicio.x, inicio.y, fin.x, fin.y);
}

function soltarConexion(e){
  document.removeEventListener("mousemove", moverConexionTemporal);
  document.removeEventListener("mouseup", soltarConexion);

  const destino = e.target.closest(".port");

  if(destino && nodoArrastrando){
    const nodoDestino = document.getElementById(destino.dataset.nodo);

    if(nodoDestino && nodoDestino.id !== nodoArrastrando.id){
      if(destino.classList.contains("in")){
        conectarNodos(nodoArrastrando, nodoDestino);
      }

      if(destino.classList.contains("out")){
        conectarNodos(nodoDestino, nodoArrastrando);
      }
    }
  }

  if(lineaTemporal){
    lineaTemporal.remove();
  }

  nodoArrastrando = null;
  lineaTemporal = null;
}

function conectarNodos(nodo1, nodo2){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas || !nodo1 || !nodo2) return;

  const linea = document.createElement("div");
  linea.className = "linea linea-dashed";

  const borrar = document.createElement("button");
  borrar.innerText = "×";
  borrar.className = "borrar-linea";

  borrar.onclick = function(e){
    e.stopPropagation();

    conexiones = conexiones.filter(c => c.linea !== linea);

    linea.remove();
    borrar.remove();
  };

  canvas.appendChild(linea);
  canvas.appendChild(borrar);

  conexiones.push({
    desde: nodo1,
    hasta: nodo2,
    linea,
    borrar
  });

  actualizarLineas();
}

function actualizarLineas(){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  conexiones = conexiones.filter(c => {
    if(!c.desde || !c.hasta || !c.linea){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    if(!document.body.contains(c.desde) || !document.body.contains(c.hasta)){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    return true;
  });

  conexiones.forEach(c => {
    const puertoDesde = c.desde.querySelector(".port.out") || c.desde.querySelector(".port");
    const puertoHasta = c.hasta.querySelector(".port.in") || c.hasta.querySelector(".port");

    if(!puertoDesde || !puertoHasta) return;

    const inicio = getPortCanvasPoint(puertoDesde);
    const fin = getPortCanvasPoint(puertoHasta);

    posicionarLinea(c.linea, inicio.x, inicio.y, fin.x, fin.y);

    if(c.borrar){
      c.borrar.style.left = (inicio.x + fin.x) / 2 - 12 + "px";
      c.borrar.style.top = (inicio.y + fin.y) / 2 - 12 + "px";
    }
  });
}

/* =========================
   MODAL CONTENIDO
========================= */

function abrirContenido(){
  const modal = document.getElementById("modalContenido");

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }
}

function cerrarContenido(){
  const modal = document.getElementById("modalContenido");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

function mostrarTab(tab, el){
  ["texto","tiempo","imagen","audio","video","doc"].forEach(t => {
    const item = document.getElementById("tab_" + t);
    if(item) item.style.display = "none";
  });

  const actual = document.getElementById("tab_" + tab);
  if(actual) actual.style.display = "block";

  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));

  if(el){
    el.classList.add("active");
  }
}

function actualizarContadorVariantes(){
  const contador = document.getElementById("contadorVariantes");

  if(contador){
    contador.innerText =
      "Variante " + (varianteActual + 1) + " de " + variantesContenido.length;
  }
}

function refrescarVarianteActual(){
  contenidoArmado = variantesContenido[varianteActual];

  renderContenidoBloques();
  actualizarPreviewContenido();
  actualizarContadorVariantes();
}

function agregarVarianteContenido(){
  variantesContenido[varianteActual] = contenidoArmado;

  variantesContenido.push([]);
  varianteActual = variantesContenido.length - 1;
  contenidoArmado = variantesContenido[varianteActual];

  refrescarVarianteActual();
}

function varianteAnterior(){
  if(varianteActual <= 0) return;

  variantesContenido[varianteActual] = contenidoArmado;

  varianteActual--;
  refrescarVarianteActual();
}

function varianteSiguiente(){
  if(varianteActual >= variantesContenido.length - 1) return;

  variantesContenido[varianteActual] = contenidoArmado;

  varianteActual++;
  refrescarVarianteActual();
}

function agregarPreview(tipo){
  if(tipo === "texto"){
    const texto = document.getElementById("textoMsg")?.value.trim();

    if(!texto){
      alert("Escribe un texto");
      return;
    }

    contenidoArmado.push({
      tipo: "texto",
      valor: texto
    });

    document.getElementById("textoMsg").value = "";
  }

  if(tipo === "tiempo"){
    const tiempo = document.getElementById("tiempoMsg")?.value;

    if(!tiempo){
      alert("Pon un tiempo");
      return;
    }

    contenidoArmado.push({
      tipo: "tiempo",
      valor: tiempo
    });

    document.getElementById("tiempoMsg").value = "";
  }

  if(tipo === "imagen"){
    const file = document.getElementById("imagenMsg")?.files[0];
    const desc = document.getElementById("descImagen")?.value || "";

    if(!file){
      alert("Selecciona una imagen");
      return;
    }

    const formData = new FormData();
    formData.append("archivo", file);

    fetch("/subir-archivo", {
      method: "POST",
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if(!data.url){
        alert("Error subiendo imagen");
        return;
      }

      contenidoArmado.push({
        tipo: "imagen",
        valor: data.url,
        descripcion: desc
      });

      document.getElementById("imagenMsg").value = "";
      document.getElementById("descImagen").value = "";

      renderContenidoBloques();
      actualizarPreviewContenido();
    });

    return;
  }

  if(tipo === "audio"){
    const file = document.getElementById("audioMsg")?.files[0];

    if(!file){
      alert("Selecciona un audio");
      return;
    }

    const formData = new FormData();
    formData.append("archivo", file);

    fetch("/subir-archivo", {
      method: "POST",
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if(!data.url){
        alert("Error subiendo audio");
        return;
      }

      contenidoArmado.push({
        tipo: "audio",
        valor: data.url
      });

      document.getElementById("audioMsg").value = "";

      renderContenidoBloques();
      actualizarPreviewContenido();
    });

    return;
  }

  if(tipo === "video"){
    const file = document.getElementById("videoMsg")?.files[0];
    const desc = document.getElementById("descVideo")?.value || "";

    if(!file){
      alert("Selecciona un video");
      return;
    }

    const formData = new FormData();
    formData.append("archivo", file);

    fetch("/subir-archivo", {
      method: "POST",
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if(!data.url){
        alert("Error subiendo video");
        return;
      }

      contenidoArmado.push({
        tipo: "video",
        valor: data.url,
        descripcion: desc
      });

      document.getElementById("videoMsg").value = "";
      document.getElementById("descVideo").value = "";

      renderContenidoBloques();
      actualizarPreviewContenido();
    });

    return;
  }

  if(tipo === "doc"){
    const url = document.getElementById("docMsg")?.value.trim();

    if(!url){
      alert("Pega la URL del documento");
      return;
    }

    contenidoArmado.push({
      tipo: "doc",
      valor: url
    });

    document.getElementById("docMsg").value = "";
  }

  renderContenidoBloques();
  actualizarPreviewContenido();
}

function renderContenidoBloques(){
  const contenedor = document.getElementById("contenidoBloques");
  if(!contenedor) return;

  contenedor.innerHTML = "";

  contenidoArmado.forEach((item, index) => {
    let icono = "💬";
    let campo = "";

    if(item.tipo === "texto"){
      icono = "💬";
      campo =
        '<textarea oninput="actualizarContenidoItem(' + index + ', this.value)">' +
        escaparHTML(item.valor || "") +
        '</textarea>';
    }

    if(item.tipo === "tiempo"){
      icono = "⏳";
      campo =
        '<input type="number" value="' +
        escaparHTML(item.valor || "") +
        '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
    }

    if(item.tipo === "imagen"){
      icono = "🖼️";
      campo =
        '<img src="' + escaparHTML(item.valor || "") + '" style="width:180px;max-width:100%;border-radius:10px;display:block;margin:auto;">' +
        '<textarea placeholder="Descripción" oninput="actualizarDescripcionItem(' + index + ', this.value)">' +
        escaparHTML(item.descripcion || "") +
        '</textarea>';
    }

    if(item.tipo === "audio"){
      icono = "🎧";
      campo =
        '<input value="' +
        escaparHTML(item.valor || "") +
        '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
    }

    if(item.tipo === "video"){
      icono = "🎥";
      campo =
        '<input value="' +
        escaparHTML(item.valor || "") +
        '" oninput="actualizarContenidoItem(' + index + ', this.value)">' +
        '<textarea placeholder="Descripción" oninput="actualizarDescripcionItem(' + index + ', this.value)">' +
        escaparHTML(item.descripcion || "") +
        '</textarea>';
    }

    if(item.tipo === "doc"){
      icono = "📄";
      campo =
        '<input value="' +
        escaparHTML(item.valor || "") +
        '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
    }

    contenedor.innerHTML +=
      '<div class="content-card ' + item.tipo + '">' +
        '<div class="content-card-head">' +
          '<span>' + icono + ' ' + item.tipo.toUpperCase() + '</span>' +
          '<div class="content-tools">' +
            '<button onclick="moverContenido(' + index + ', -1)">↑</button>' +
            '<button onclick="moverContenido(' + index + ', 1)">↓</button>' +
            '<button onclick="eliminarContenidoItem(' + index + ')">🗑</button>' +
          '</div>' +
        '</div>' +
        campo +
      '</div>';
  });
}

function actualizarContenidoItem(index, valor){
  if(!contenidoArmado[index]) return;

  contenidoArmado[index].valor = valor;
  actualizarPreviewContenido();
}

function actualizarDescripcionItem(index, valor){
  if(!contenidoArmado[index]) return;

  contenidoArmado[index].descripcion = valor;
  actualizarPreviewContenido();
}

function eliminarContenidoItem(index){
  contenidoArmado.splice(index, 1);

  renderContenidoBloques();
  actualizarPreviewContenido();
}

function moverContenido(index, direccion){
  const nuevoIndex = index + direccion;

  if(nuevoIndex < 0 || nuevoIndex >= contenidoArmado.length){
    return;
  }

  const item = contenidoArmado[index];

  contenidoArmado.splice(index, 1);
  contenidoArmado.splice(nuevoIndex, 0, item);

  renderContenidoBloques();
  actualizarPreviewContenido();
}

function actualizarPreviewContenido(){
  const box = document.getElementById("previewBox");
  if(!box) return;

  box.innerHTML = "";

  if(contenidoArmado.length === 0){
    box.innerHTML =
      '<p style="color:#78909c;text-align:center;margin-top:180px;">Agrega contenido para ver la vista previa</p>';
    return;
  }

  contenidoArmado.forEach(item => {
    if(item.tipo === "texto"){
      box.innerHTML +=
        '<div class="bubble">' +
        escaparHTML(item.valor || "") +
        '<small>ahora</small></div>';
    }

    if(item.tipo === "tiempo"){
      box.innerHTML +=
        '<div class="file-preview">⏳ Pausa ' +
        escaparHTML(item.valor || "") +
        ' segundos</div>';
    }

    if(item.tipo === "imagen"){
      box.innerHTML +=
        '<div class="bubble">' +
          '<img src="' + escaparHTML(item.valor || "") + '" style="width:220px;max-width:100%;border-radius:10px;display:block;margin:auto;">' +
          '<br>' +
          escaparHTML(item.descripcion || "") +
          '<small>ahora</small>' +
        '</div>';
    }

    if(item.tipo === "audio"){
      box.innerHTML +=
        '<div class="bubble">🎧 Audio<small>ahora</small></div>';
    }

    if(item.tipo === "video"){
      box.innerHTML +=
        '<div class="bubble">🎥 Video<br>' +
        escaparHTML(item.descripcion || "") +
        '<small>ahora</small></div>';
    }

    if(item.tipo === "doc"){
      box.innerHTML +=
        '<div class="bubble">📄 Documento<small>ahora</small></div>';
    }
  });
}

function agregarContenidoFinal(){
  const canvas = document.getElementById("canvasFlujo");

  if(!canvas){
    alert("No existe canvasFlujo");
    return;
  }

  variantesContenido[varianteActual] = contenidoArmado;

  const variantesValidas =
    variantesContenido.filter(v => Array.isArray(v) && v.length > 0);

  if(variantesValidas.length === 0){
    alert("Primero agrega contenido a la vista previa");
    return;
  }

  nodoCount++;

  const nodo = document.createElement("div");

  nodo.className = "node blue";
  nodo.id = "nodo_" + nodoCount;

  nodo.style.left = (120 + nodoCount * 20) + "px";
  nodo.style.top = (120 + nodoCount * 20) + "px";

  const htmlContenido = buildContenidoPreviewHtml(variantesValidas);

  nodo.dataset.tipo = "contenido";

  nodo.innerHTML = `
    <div class="port in" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}')"></div>

    <div class="node-actions">
      <button type="button" class="edit-node" onclick="event.stopPropagation(); editarNodo('${nodo.id}')">✎</button>
      <button type="button" class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>
    </div>
    <h3 class="node-title">💬 Contenido</h3>

    <div class="node-content-scroll">
      ${htmlContenido}
    </div>

    <div class="port out" data-nodo="${nodo.id}" onmousedown="iniciarConexion(event, '${nodo.id}')"></div>
  `;

  canvas.appendChild(nodo);

  hacerMovible(nodo);

  variantesContenido = [[]];
  varianteActual = 0;
  contenidoArmado = variantesContenido[varianteActual];

  const previewBox = document.getElementById("previewBox");

  if(previewBox){
    previewBox.innerHTML =
      '<p style="color:#78909c;text-align:center;margin-top:180px;">Agrega contenido para ver la vista previa</p>';
  }

  actualizarContadorVariantes();

  cerrarContenido();
}

/* =========================
   SEGUIMIENTO
========================= */

let seguimientoNodoEditando = null;
let seguimientoIndexEditando = 0;
let seguimientoDatosActuales = [];

function abrirEditorSeguimiento(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  seguimientoNodoEditando = nodo;

  const dataBox = nodo.querySelector(".seguimiento-data");

  try{
    seguimientoDatosActuales = JSON.parse(dataBox?.value || "[]");
  }catch(e){
    seguimientoDatosActuales = [];
  }

  const modal = document.getElementById("modalSeguimiento");

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }

  renderListaSeguimientos();

  if(seguimientoDatosActuales.length > 0){
    cargarSegmentoSeguimiento(0);
  } else {
    const min = document.getElementById("segMinutos");
    const msg = document.getElementById("segMensaje");

    if(min) min.value = "";
    if(msg) msg.value = "";
  }
}

function renderListaSeguimientos(){
  const lista = document.getElementById("listaSeguimientos");
  if(!lista) return;

  lista.innerHTML = "";

  seguimientoDatosActuales.forEach((seg, index) => {
    lista.innerHTML +=
      '<div onclick="cargarSegmentoSeguimiento(' + index + ')" style="' +
      'padding:12px;margin-bottom:8px;border-radius:8px;cursor:pointer;' +
      'background:' + (index === seguimientoIndexEditando ? '#123f5c' : '#1c1c1c') + ';color:white;">' +
        '<strong>Segmento ' + (index + 1) + '</strong><br>' +
        '<small>' + escaparHTML(seg.minutos || "") + ' minutos</small>' +
      '</div>';
  });
}

function cargarSegmentoSeguimiento(index){
  seguimientoIndexEditando = index;

  const seg = seguimientoDatosActuales[index];

  const min = document.getElementById("segMinutos");
  const msg = document.getElementById("segMensaje");

  if(min) min.value = seg?.minutos || "";
  if(msg) msg.value = seg?.mensaje || "";

  renderListaSeguimientos();
}

function agregarSegmentoSeguimiento(){
  seguimientoDatosActuales.push({
    minutos: "",
    mensaje: ""
  });

  cargarSegmentoSeguimiento(seguimientoDatosActuales.length - 1);
}

function guardarSeguimiento(){
  if(!seguimientoNodoEditando) return;

  if(seguimientoDatosActuales.length === 0){
    seguimientoDatosActuales.push({
      minutos: "",
      mensaje: ""
    });

    seguimientoIndexEditando = 0;
  }

  seguimientoDatosActuales[seguimientoIndexEditando].minutos =
    document.getElementById("segMinutos")?.value || "";

  seguimientoDatosActuales[seguimientoIndexEditando].mensaje =
    document.getElementById("segMensaje")?.value || "";

  const dataBox = seguimientoNodoEditando.querySelector(".seguimiento-data");

  if(dataBox){
    dataBox.value = JSON.stringify(seguimientoDatosActuales);
  }

  const body = seguimientoNodoEditando.querySelector(".follow-body");

  if(body){
    let html = "";

    if(seguimientoDatosActuales.length === 0){
      html = '<div class="follow-title">Sin seguimientos todavía</div>';
    } else {
      html = '<div class="follow-title">Configuración de tiempos:</div>';

      seguimientoDatosActuales.forEach((seg, index) => {
        html +=
          '<div class="follow-item">' +
            '<span>Tiempo ' + (index + 1) + ' (' + escaparHTML(seg.minutos || "") + ' min)</span>' +
            '<span class="follow-badge">' + (seg.mensaje ? '1' : '0') + '</span>' +
          '</div>';
      });
    }

    body.innerHTML = html;
  }

  cerrarSeguimiento();
}

function cerrarSeguimiento(){
  const modal = document.getElementById("modalSeguimiento");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

/* =========================
   EDITAR / BORRAR
========================= */

function editarNodo(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  if(nodo.innerHTML.includes("💬 Contenido")){
    const dataBox = nodo.querySelector(".contenido-variantes-data");

    if(dataBox){
      try{
        variantesContenido = JSON.parse(
          (dataBox.value || dataBox.innerHTML || dataBox.textContent || "[]")
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
        );

        if(!Array.isArray(variantesContenido) || variantesContenido.length === 0){
          variantesContenido = [[]];
        }

        varianteActual = 0;
        contenidoArmado = variantesContenido[varianteActual];

        abrirContenido();

        setTimeout(() => {
          refrescarVarianteActual();
        }, 100);

        return;
      }catch(error){
        console.log("ERROR LEYENDO VARIANTES:", error.message);
      }
    }
  }

  const campo =
    nodo.querySelector("textarea") ||
    nodo.querySelector("input") ||
    nodo.querySelector("select");

  if(campo){
    campo.focus();

    campo.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.35)";
    campo.style.borderColor = "#38bdf8";

    setTimeout(() => {
      campo.style.boxShadow = "";
      campo.style.borderColor = "";
    }, 1600);
  } else {
    alert("Este nodo no tiene campo editable");
  }
}

function borrarNodo(id){
  if(id === "nodo_inicio") return;

  const nodo = document.getElementById(id);
  if(!nodo) return;

  conexiones = conexiones.filter(c => {
    if(c.desde.id === id || c.hasta.id === id){
      c.linea?.remove();
      c.borrar?.remove();
      return false;
    }

    return true;
  });

  if(ultimoNodo && ultimoNodo.id === id){
    ultimoNodo = null;
  }

  nodo.remove();
}

/* =========================
   GUARDAR FLUJO
========================= */

async function guardarFlujo(){
  const titulo = document.getElementById("tituloFlujo");

  if(!titulo){
    alert("No existe tituloFlujo");
    return;
  }

  const nombre = titulo.innerText.replace("🔀", "").trim();

  const nodos = [];

  document.querySelectorAll(".node").forEach(nodo => {
    nodo.querySelectorAll("input, textarea, select").forEach(campo => {
      campo.setAttribute("value", campo.value);

      if(campo.tagName === "TEXTAREA"){
        campo.innerHTML = campo.value;
      }

      if(campo.tagName === "SELECT"){
        campo.querySelectorAll("option").forEach(op => {
          if(op.value === campo.value){
            op.setAttribute("selected", "selected");
          } else {
            op.removeAttribute("selected");
          }
        });
      }
    });

    nodos.push({
      id: nodo.id,
      html: nodo.innerHTML,
      left: nodo.style.left,
      top: nodo.style.top,
      className: nodo.className
    });
  });

  if(nodos.length === 0){
    alert("Primero agrega al menos un nodo");
    return;
  }

  const conexionesGuardadas = conexiones.map(c => {
    return {
      desde: c.desde.id,
      hasta: c.hasta.id
    };
  });

  const data = {
    nodos,
    conexiones: conexionesGuardadas
  };

  const res = await fetch("/guardar-flujo-builder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: flujoEditandoId,
      nombre,
      data
    })
  });

  const respuesta = await res.text();

  if(respuesta.includes("<!DOCTYPE html>") || respuesta.includes("<html")){
    alert("Tu sesión expiró. Inicia sesión otra vez y vuelve a guardar.");
    window.location.href = "/login";
    return;
  }

  alert(respuesta);
}

/* =========================
   ACTIVADORES / CONEXIÓN
========================= */

function abrirModalActivador(id = ""){
  const modal = document.getElementById("modalActivador");

  const activadorId = document.getElementById("activadorId");
  const activadorNombre = document.getElementById("activadorNombre");
  const activadorFrase = document.getElementById("activadorFrase");
  const activadorConexion = document.getElementById("activadorConexion");
  const activadorActivo = document.getElementById("activadorActivo");
  const activadorRepetible = document.getElementById("activadorRepetible");
  const activadorFlujo = document.getElementById("activadorFlujo");

  if(activadorId) activadorId.value = "";
  if(activadorNombre) activadorNombre.value = "";
  if(activadorFrase) activadorFrase.value = "";
  if(activadorConexion) activadorConexion.value = "API en la nube - MundoColor";
  if(activadorActivo) activadorActivo.checked = true;
  if(activadorRepetible) activadorRepetible.checked = true;

  if(id){
    const act = activadoresData.find(a => a.id === id);

    if(act){
      if(activadorId) activadorId.value = act.id;
      if(activadorNombre) activadorNombre.value = act.nombre || "";
      if(activadorFrase) activadorFrase.value = act.frase || "";
      if(activadorConexion) activadorConexion.value = act.conexion || "API en la nube - MundoColor";
      if(activadorFlujo) activadorFlujo.value = act.flujo_id || "";
      if(activadorActivo) activadorActivo.checked = !!act.activo;
      if(activadorRepetible) activadorRepetible.checked = !!act.repetible;
    }
  }

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }
}

function cerrarModalActivador(){
  const modal = document.getElementById("modalActivador");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

function abrirModalConexion(){
  const modal = document.getElementById("modalConexion");

  if(modal){
    modal.style.display = "flex";
    modal.classList.add("activo");
  }
}

function cerrarModalConexion(){
  const modal = document.getElementById("modalConexion");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}

/* =========================
   UTILIDADES
========================= */

function buildContenidoPreviewHtml(variantesValidas){
  const jsonVariantes = JSON.stringify(variantesValidas)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  let html =
    '<textarea class="contenido-variantes-data" style="display:none;">' +
    jsonVariantes +
    "</textarea>";

  html += '<div class="variantes-label">Variantes</div>';

  variantesValidas.forEach((variante, index) => {
    const preview = variante
      .map((item) => {
        if(item.tipo === "texto"){
          return item.valor || "";
        }

        return item.valor || item.descripcion || item.tipo || "";
      })
      .filter(Boolean)
      .join(", ") || "(vacío)";

    const short =
      preview.length > 48 ? preview.slice(0, 48) + "…" : preview;

    html +=
      '<div class="variant-chip"><span>Variante ' +
      (index + 1) +
      ":</span> <strong>" +
      escaparHTML(short) +
      "</strong></div>";
  });

  return html;
}

function getCanvasZoom(){
  return canvasZoom;
}

function screenPointToCanvas(clientX, clientY){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas){
    return { x: 0, y: 0 };
  }

  const rect = canvas.getBoundingClientRect();
  const zoom = getCanvasZoom();

  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
  };
}

function getPortCanvasPoint(puerto){
  const rect = puerto.getBoundingClientRect();

  return screenPointToCanvas(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

function posicionarLinea(linea, x1, y1, x2, y2){
  const largo = Math.hypot(x2 - x1, y2 - y1);
  const angulo = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

  linea.style.left = x1 + "px";
  linea.style.top = y1 + "px";
  linea.style.width = largo + "px";
  linea.style.transform = "rotate(" + angulo + "deg)";
  linea.style.transformOrigin = "0 0";
}

function actualizarZoomLabel(){
  const label = document.getElementById("flowZoomLabel");
  if(label){
    label.textContent = Math.round(getCanvasZoom() * 100) + "%";
  }
}

function aplicarCanvasZoom(){
  const canvas = document.getElementById("canvasFlujo");
  const spacer = document.getElementById("canvasSpacer");
  const zoom = getCanvasZoom();

  if(canvas){
    canvas.style.transform = "scale(" + zoom + ")";
    canvas.style.transformOrigin = "0 0";
  }

  if(spacer){
    spacer.style.width = CANVAS_BASE_WIDTH * zoom + "px";
    spacer.style.height = CANVAS_BASE_HEIGHT * zoom + "px";
  }

  actualizarZoomLabel();
  actualizarLineas();
}

function setCanvasZoom(nextZoom, anchorClientX, anchorClientY){
  const wrap = document.getElementById("canvasWrapper");
  if(!wrap){
    return;
  }

  const oldZoom = getCanvasZoom();
  const zoom = Math.min(
    CANVAS_ZOOM_MAX,
    Math.max(CANVAS_ZOOM_MIN, nextZoom)
  );

  if(zoom === oldZoom){
    return;
  }

  if(anchorClientX != null && anchorClientY != null){
    const wrapRect = wrap.getBoundingClientRect();
    const offsetX = anchorClientX - wrapRect.left;
    const offsetY = anchorClientY - wrapRect.top;
    const worldX = (wrap.scrollLeft + offsetX) / oldZoom;
    const worldY = (wrap.scrollTop + offsetY) / oldZoom;

    canvasZoom = zoom;
    aplicarCanvasZoom();

    wrap.scrollLeft = worldX * zoom - offsetX;
    wrap.scrollTop = worldY * zoom - offsetY;
    return;
  }

  canvasZoom = zoom;
  aplicarCanvasZoom();
}

function zoomIn(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() + CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomOut(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() - CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomReset(){
  setCanvasZoom(1);
}

function initCanvasViewport(){
  const wrap = document.getElementById("canvasWrapper");
  if(!wrap){
    return;
  }

  canvasZoom = 1;
  aplicarCanvasZoom();

  const btnIn = document.getElementById("btnCanvasZoomIn");
  const btnOut = document.getElementById("btnCanvasZoomOut");
  const btnReset = document.getElementById("btnCanvasZoomReset");

  if(btnIn){
    btnIn.addEventListener("click", function(e){
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomIn(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }

  if(btnOut){
    btnOut.addEventListener("click", function(e){
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomOut(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }

  if(btnReset){
    btnReset.addEventListener("click", function(e){
      e.preventDefault();
      zoomReset();
    });
  }

  wrap.addEventListener(
    "wheel",
    function(e){
      if(!document.getElementById("builderArea")){
        return;
      }

      if(e.target.closest(".flow-zoom-controls")){
        return;
      }

      e.preventDefault();

      const delta = e.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP;
      setCanvasZoom(getCanvasZoom() + delta, e.clientX, e.clientY);
    },
    { passive: false }
  );

  let panning = false;
  let startX = 0;
  let startY = 0;
  let scrollLeft = 0;
  let scrollTop = 0;

  wrap.addEventListener("mousedown", function(e){
    if(
      e.target.closest(".node") ||
      e.target.closest(".port") ||
      e.target.closest(".borrar-linea") ||
      e.target.closest(".flow-zoom-controls")
    ){
      return;
    }

    if(e.button !== 0){
      return;
    }

    panning = true;
    wrap.classList.add("panning");
    startX = e.clientX;
    startY = e.clientY;
    scrollLeft = wrap.scrollLeft;
    scrollTop = wrap.scrollTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", function(e){
    if(!panning){
      return;
    }

    wrap.scrollLeft = scrollLeft - (e.clientX - startX);
    wrap.scrollTop = scrollTop - (e.clientY - startY);
  });

  document.addEventListener("mouseup", function(){
    panning = false;
    wrap.classList.remove("panning");
  });
}

function marcarNodoSeleccionado(nodo){
  document.querySelectorAll(".node.selected").forEach((el) => {
    el.classList.remove("selected");
  });

  if(nodo){
    nodo.classList.add("selected");
  }
}

function actualizarPanelPosicion(nodo){
  if(!nodo || nodo !== nodoSeleccionadoPanel){
    return;
  }

  const posX = document.getElementById("panelPosX");
  const posY = document.getElementById("panelPosY");

  if(posX){
    posX.value = parseInt(nodo.style.left || 0, 10) + "px";
  }

  if(posY){
    posY.value = parseInt(nodo.style.top || 0, 10) + "px";
  }
}

function escaparHTML(texto){
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
  marcarNodoSeleccionado(nodo);

  const titulo = nodo.querySelector("h3")?.innerText || "Nodo";
  const tipo = nodo.dataset.tipo || "nodo";

  contenido.innerHTML = `
    <div class="panel-campo">
      <label>Nombre del nodo</label>
      <input id="panelTituloNodo" value="${escaparHTML(titulo)}">
    </div>

    <div class="panel-campo">
      <label>Posición X</label>
      <input id="panelPosX" value="${parseInt(nodo.style.left || 0, 10)}px" disabled>
    </div>

    <div class="panel-campo">
      <label>Posición Y</label>
      <input id="panelPosY" value="${parseInt(nodo.style.top || 0, 10)}px" disabled>
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

  const panelEtiqueta = document.getElementById("panelEtiqueta");
  const selectNodo = nodoSeleccionadoPanel.querySelector("select");

  if(panelEtiqueta && selectNodo){
    selectNodo.value = panelEtiqueta.value;
  }
}

function cerrarPanelNodo(){
  const panel = document.getElementById("panelNodo");
  const contenido = document.getElementById("panelNodoContenido");

  if(panel){
    panel.classList.remove("activo");
  }

  if(contenido && document.getElementById("builderArea")){
    contenido.innerHTML =
      '<p class="panel-empty">Selecciona un nodo en el canvas para editarlo.</p>';
  }

  marcarNodoSeleccionado(null);
  nodoSeleccionadoPanel = null;
}