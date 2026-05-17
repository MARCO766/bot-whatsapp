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

const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 2;
const CANVAS_ZOOM_STEP = 0.1;
const WORLD_GRID_SIZE = 28;
const WORLD_SURFACE_PADDING = 6000;
const WORLD_MIN_SURFACE = 24000;

const viewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

/* =========================
   INICIO
========================= */

window.addEventListener("load", function(){
  if(!document.getElementById("builderArea")){
    return;
  }

  ensureInfiniteViewport();
  cargarFlujoGuardado();
  crearNodoInicioAutomatico();
  resizeWorldSurface();
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

  document.querySelectorAll(".follow-node").forEach((nodo) => {
    try {
      if(window.MacBotSeguimiento){
        window.MacBotSeguimiento.refrescarNodoCargado(nodo);
      }
    } catch (e) {
      console.warn("Seguimiento: error al refrescar nodo cargado", e);
    }
  });

  if (window.MacBotSeguimiento) {
    if (window.MacBotSeguimiento.initLiveSync) window.MacBotSeguimiento.initLiveSync();
    if (window.MacBotSeguimiento.sincronizarTodosLosNodos) {
      window.MacBotSeguimiento.sincronizarTodosLosNodos();
    }
  }

  resizeWorldSurface();
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
        <span>⏱️ Seguimiento CRM</span>
      </div>

      <button class="edit-node" onclick="event.stopPropagation(); abrirEditorSeguimiento('${nodo.id}')">✎</button>
      <button class="delete-node" onclick="event.stopPropagation(); borrarNodo('${nodo.id}')">×</button>

      <div class="follow-body">
        <p class="follow-empty">Configura en el panel →</p>
      </div>

      <textarea class="seguimiento-data" style="display:none;">{"version":2,"soloSiNoRespondio":true,"detenerSiResponde":true,"pasos":[]}</textarea>
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

  if(tipo === "seguimiento" && window.MacBotSeguimiento){
    window.MacBotSeguimiento.initNodoRecienCreado(nodo);
  }

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
    resizeWorldSurface();
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
   SEGUIMIENTO (MacBotSeguimiento)
========================= */

function abrirEditorSeguimiento(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  if(window.MacBotSeguimiento){
    window.MacBotSeguimiento.renderPanel(nodo);
    const panel = document.getElementById("panelNodo");
    if(panel) panel.classList.add("activo");
    marcarNodoSeleccionado(nodo);
  }
}

function agregarSegmentoSeguimiento(){
  document.getElementById("segAddPaso")?.click();
}

function guardarSeguimiento(){
  document.getElementById("segGuardarPanel")?.click();
}

function cerrarSeguimiento(){
  cerrarPanelNodo();
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
  return viewportState.zoom;
}

function getCanvasViewport(){
  return document.getElementById("canvasWrapper");
}

function ensureInfiniteViewport(){
  const wrap = getCanvasViewport();
  let canvasEl = document.getElementById("canvasFlujo");
  if(!wrap || !canvasEl){
    return;
  }

  let world = document.getElementById("flowWorld");
  const spacer = document.getElementById("canvasSpacer");

  if(!world){
    world = document.createElement("div");
    world.id = "flowWorld";
    world.className = "flow-world";

    if(spacer){
      canvasEl = spacer.querySelector("#canvasFlujo") || canvasEl;
      spacer.replaceWith(world);
      world.appendChild(canvasEl);
    }else if(canvasEl.parentElement === wrap){
      canvasEl.remove();
      world.appendChild(canvasEl);
      wrap.appendChild(world);
    }else{
      if(canvasEl.parentElement !== world){
        world.appendChild(canvasEl);
      }
      if(!wrap.contains(world)){
        wrap.appendChild(world);
      }
    }
  }else{
    if(spacer){
      const nested = spacer.querySelector("#canvasFlujo");
      if(nested){
        canvasEl = nested;
      }
      spacer.remove();
    }
    if(canvasEl.parentElement !== world){
      world.appendChild(canvasEl);
    }
    if(!wrap.contains(world)){
      wrap.appendChild(world);
    }
  }

  if(canvasEl){
    canvasEl.style.transform = "";
    canvasEl.style.transformOrigin = "";
    canvasEl.classList.add("flow-canvas");
  }

  wrap.style.overflow = "hidden";
  wrap.scrollLeft = 0;
  wrap.scrollTop = 0;
  resizeWorldSurface();
  aplicarViewportTransform();
}

function resizeWorldSurface(){
  const wrap = getCanvasViewport();
  const canvas = document.getElementById("canvasFlujo");
  if(!wrap || !canvas){
    return;
  }

  const rect = wrap.getBoundingClientRect();
  let maxX = Math.max(rect.width * 2.5, WORLD_MIN_SURFACE);
  let maxY = Math.max(rect.height * 2.5, WORLD_MIN_SURFACE);

  canvas.querySelectorAll(".node").forEach((nodo) => {
    maxX = Math.max(maxX, nodo.offsetLeft + nodo.offsetWidth + WORLD_SURFACE_PADDING);
    maxY = Math.max(maxY, nodo.offsetTop + nodo.offsetHeight + WORLD_SURFACE_PADDING);
  });

  canvas.style.width = maxX + "px";
  canvas.style.height = maxY + "px";
}

function screenPointToCanvas(clientX, clientY){
  const wrap = getCanvasViewport();
  if(!wrap){
    return { x: 0, y: 0 };
  }

  const rect = wrap.getBoundingClientRect();
  const zoom = getCanvasZoom();

  return {
    x: (clientX - rect.left - viewportState.panX) / zoom,
    y: (clientY - rect.top - viewportState.panY) / zoom,
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

function aplicarViewportTransform(){
  const world = document.getElementById("flowWorld");
  const wrap = getCanvasViewport();
  const zoom = getCanvasZoom();
  const gridStep = WORLD_GRID_SIZE * zoom;

  if(world){
    world.style.transform =
      "translate(" +
      viewportState.panX +
      "px, " +
      viewportState.panY +
      "px) scale(" +
      zoom +
      ")";
    world.style.transformOrigin = "0 0";
  }

  if(wrap){
    wrap.style.backgroundSize =
      "auto, auto, " + gridStep + "px " + gridStep + "px, " + gridStep + "px " + gridStep + "px";
    wrap.style.backgroundPosition =
      "0 0, 0 0, " +
      viewportState.panX +
      "px " +
      viewportState.panY +
      "px, " +
      viewportState.panX +
      "px " +
      viewportState.panY +
      "px";
  }

  actualizarZoomLabel();
  actualizarLineas();
}

function centerViewportOnContent(){
  const wrap = getCanvasViewport();
  const canvas = document.getElementById("canvasFlujo");
  if(!wrap || !canvas){
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const zoom = getCanvasZoom();
  const nodos = canvas.querySelectorAll(".node");

  if(!nodos.length){
    viewportState.panX = rect.width / 2 - 400 * zoom;
    viewportState.panY = rect.height / 2 - 300 * zoom;
    aplicarViewportTransform();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodos.forEach((nodo) => {
    minX = Math.min(minX, nodo.offsetLeft);
    minY = Math.min(minY, nodo.offsetTop);
    maxX = Math.max(maxX, nodo.offsetLeft + nodo.offsetWidth);
    maxY = Math.max(maxY, nodo.offsetTop + nodo.offsetHeight);
  });

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  viewportState.panX = rect.width / 2 - cx * zoom;
  viewportState.panY = rect.height / 2 - cy * zoom;
  aplicarViewportTransform();
}

function setCanvasZoom(nextZoom, anchorClientX, anchorClientY){
  const wrap = getCanvasViewport();
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

  const rect = wrap.getBoundingClientRect();

  if(anchorClientX != null && anchorClientY != null){
    const offsetX = anchorClientX - rect.left;
    const offsetY = anchorClientY - rect.top;
    const worldX = (offsetX - viewportState.panX) / oldZoom;
    const worldY = (offsetY - viewportState.panY) / oldZoom;

    viewportState.zoom = zoom;
    viewportState.panX = offsetX - worldX * zoom;
    viewportState.panY = offsetY - worldY * zoom;
  }else{
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx - viewportState.panX) / oldZoom;
    const worldY = (cy - viewportState.panY) / oldZoom;

    viewportState.zoom = zoom;
    viewportState.panX = cx - worldX * zoom;
    viewportState.panY = cy - worldY * zoom;
  }

  aplicarViewportTransform();
}

function zoomIn(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() + CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomOut(anchorClientX, anchorClientY){
  setCanvasZoom(getCanvasZoom() - CANVAS_ZOOM_STEP, anchorClientX, anchorClientY);
}

function zoomReset(){
  viewportState.zoom = 1;
  centerViewportOnContent();
}

function initCanvasViewport(){
  const wrap = getCanvasViewport();
  if(!wrap){
    return;
  }

  if(wrap.dataset.viewportReady === "1"){
    centerViewportOnContent();
    return;
  }

  wrap.dataset.viewportReady = "1";

  viewportState.panX = 0;
  viewportState.panY = 0;
  viewportState.zoom = 1;
  centerViewportOnContent();

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
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

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
    panStart = {
      x: e.clientX,
      y: e.clientY,
      panX: viewportState.panX,
      panY: viewportState.panY,
    };
    e.preventDefault();
  });

  document.addEventListener("mousemove", function(e){
    if(!panning){
      return;
    }

    viewportState.panX = panStart.panX + (e.clientX - panStart.x);
    viewportState.panY = panStart.panY + (e.clientY - panStart.y);
    aplicarViewportTransform();
  });

  document.addEventListener("mouseup", function(){
    if(!panning){
      return;
    }

    panning = false;
    wrap.classList.remove("panning");
  });

  window.addEventListener("resize", function(){
    if(!document.getElementById("builderArea")){
      return;
    }

    resizeWorldSurface();
    aplicarViewportTransform();
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

  if(window.MacBotSeguimiento && window.MacBotSeguimiento.esNodoSeguimiento(nodo)){
    window.MacBotSeguimiento.renderPanel(nodo);
    return;
  }

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