function renderAdminPage({
  tab,
  builder,
  nombreBuilder,
  flujoId,
  flujosGuardados,
  flujoActual,
  activadores,
  etiquetas,
  conexionActiva,
  supabaseUrl,
  supabaseAnonKey,
  seguimientoLegacyEnabled = true,
}) {
  return `

  <!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>MacBot CRM</title>
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">

<link rel="stylesheet" href="/css/admin.css">
<link rel="stylesheet" href="/css/flow-builder.css">
${builder ? '<link rel="stylesheet" href="/css/seguimiento.css"><link rel="stylesheet" href="/css/seguimiento-v2.css"><link rel="stylesheet" href="/css/contenido.css"><link rel="stylesheet" href="/css/conversion-node.css"><link rel="stylesheet" href="/css/lector-pago-node.css"><link rel="stylesheet" href="/css/ia-node.css"><link rel="stylesheet" href="/css/ia-pro-node.css"><link rel="stylesheet" href="/css/openai-agent-node.css"><link rel="stylesheet" href="/css/node-actions-premium.css">' : ""}
</head>

<body>

<div class="sidebar">
  <div class="logo">
    <img src="/assets/brand/logo-macbot-crm-icon.svg" width="32" height="32" alt="" aria-hidden="true" style="vertical-align:middle;margin-right:8px">
    MacBot <span style="color:#22d3ee;font-size:.55em;letter-spacing:.12em;text-transform:uppercase">CRM</span>
  </div>

  <div class="menu" id="menuPrincipal" style="${builder ? "display:none;" : "display:flex;"}">
    <a href="/admin?tab=inicio" class="${tab === "inicio" ? "active" : ""}">🏠 Inicio</a>
    <a href="/admin?tab=chat" class="${tab === "chat" ? "active" : ""}">💬 Chat</a>
    <a href="/admin?tab=flujos" class="${tab === "flujos" ? "active" : ""}">🔀 Flujos</a>
    <a href="/admin?tab=activadores" class="${tab === "activadores" ? "active" : ""}">⚡ Activadores</a>
    <a href="/admin?tab=etiquetas" class="${tab === "etiquetas" ? "active" : ""}">🏷️ Etiquetas</a>
    <a href="/admin?tab=conexiones" class="${tab === "conexiones" ? "active" : ""}">
  📱 Conexiones
</a>
    <a href="/logout">🚪 Salir</a>
  </div>

  <div class="menu menu-nodos" id="menuNodos" style="${builder ? "display:flex;" : "display:none;"}">
    <span class="menu-nodos-title">Nodos</span>
    <button type="button" class="menu-nodo-btn active" disabled>🧩 Paleta</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-contenido" onclick="agregarNodoContenido()">💬 Contenido</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-ia" onclick="agregarNodoIA()">⚡ Agente Rápido</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-ia-pro" onclick="agregarNodoIAPro()">🤖 Agente IA Pro</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-openai-agent" onclick="agregarNodoOpenAIAgent()"><span class="menu-nodo-btn-openai-agent__icon" aria-hidden="true"></span> Agente OpenAI</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-seguimiento-v2" onclick="agregarNodoSeguimientoV2()">🔒 Seguimiento CRM V2</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-rm24h" onclick="agregarNodoRemarketingGlobal()">🔥 Remarketing 24h</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-espera" onclick="agregarNodo('espera')">⏳ Espera</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-etiqueta" onclick="agregarNodo('etiqueta')">🏷️ Etiqueta</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-conversion" onclick="agregarNodo('conversion')">💰 Conversión</button>
    <button type="button" class="menu-nodo-btn menu-nodo-btn-lector-pago" onclick="agregarNodo('lector_pago')">🧾 Lector Pago</button>
  </div>
</div>

<div class="main" style="${builder ? "padding:0;overflow:hidden;" : ""}">

${tab === "inicio" ? `

<div class="header">Inicio</div>

<div class="card">

  <h2>🔌 Estado del sistema</h2>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-top:20px;">

  <div style="
    background:${conexionActiva?.token ? "#0d3d24" : "#3d0d0d"};
    padding:18px;
    border-radius:14px;
    border:1px solid ${conexionActiva?.token ? "#00e676" : "#ff4d4d"};
  ">
    <h3>${conexionActiva?.token ? "🟢 TOKEN conectado" : "🔴 TOKEN no conectado"}</h3>
    <p style="margin-top:8px;color:#aaa;">
      Token API WhatsApp
    </p>
  </div>

  <div style="
    background:${conexionActiva?.phone_id ? "#0d3d24" : "#3d0d0d"};
    padding:18px;
    border-radius:14px;
    border:1px solid ${conexionActiva?.phone_id ? "#00e676" : "#ff4d4d"};
  ">
    <h3>${conexionActiva?.phone_id ? "🟢 PHONE_ID conectado" : "🔴 PHONE_ID no conectado"}</h3>
    <p style="margin-top:8px;color:#aaa;">
      ID del número de WhatsApp
    </p>
  </div>

  <div style="
    background:${conexionActiva?.numero ? "#0d3d24" : "#3d0d0d"};
    padding:18px;
    border-radius:14px;
    border:1px solid ${conexionActiva?.numero ? "#00e676" : "#ff4d4d"};
  ">
    <h3>${conexionActiva?.numero ? "🟢 WhatsApp conectado" : "🔴 WhatsApp no conectado"}</h3>
    <p style="margin-top:8px;color:#aaa;">
      ${conexionActiva?.numero ? "Número: " + conexionActiva.numero : "Sin número conectado"}
    </p>

${
  conexionActiva
  ? `
    <form method="POST" action="/desconectar-whatsapp">
      <button
        type="submit"
        style="
          margin-top:12px;
          background:#ff4d4d;
          color:white;
          border:none;
          padding:10px 14px;
          border-radius:10px;
          cursor:pointer;
          font-weight:bold;
        "
      >
        Desconectar
      </button>
    </form>
  `
  : ""
}

  </div>

</div>

</div>
<div class="card">
  <h2>📤 Probar WhatsApp</h2>

  <form method="POST" action="/probar-whatsapp" style="display:flex;gap:12px;align-items:center;">
    <input 
      name="numero" 
      placeholder="Ej: 59165818913" 
      required
      style="margin:0;"
    >

    <button class="btn" type="submit">
      Enviar prueba
    </button>
  </form>

  <p style="color:#aaa;margin-top:12px;">
    Envía un mensaje de prueba para confirmar que TOKEN y PHONE_ID funcionan.
  </p>
</div>
` : ""}

${tab === "chat" ? `
<div class="header">Chat</div>
<iframe src="/inbox" style="width:100%;height:80vh;border:none;border-radius:20px;"></iframe>
` : ""}
${tab === "conexiones" ? `

<div class="header">Conexiones</div>

<div class="card">

  ${
    conexionActiva
    ? `
      <div style="
  max-width:520px;
  background:linear-gradient(145deg,#20242b,#171a20);
  border:2px solid #00e676;
  border-radius:18px;
  padding:24px;
  position:relative;
  box-shadow:0 0 25px rgba(0,230,118,.18);
">

  <div style="
    display:flex;
    align-items:center;
    gap:18px;
    margin-bottom:18px;
  ">

    <div style="
      width:58px;
      height:58px;
      background:#eafff1;
      border-radius:16px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:30px;
      box-shadow:0 0 15px rgba(0,230,118,.25);
    ">
      ☁️
    </div>

    <div>
      <h3 style="color:white;margin:0;font-size:22px;">
        ${conexionActiva.nombre || "MundoColor"}
      </h3>

      <p style="color:#a7b0bd;margin-top:6px;font-size:15px;">
        +${conexionActiva.numero || ""}
      </p>
    </div>

  </div>

  <div style="
    background:#dff1ff;
    color:#005399;
    border-radius:8px;
    height:22px;
    font-size:12px;
    padding:4px 10px;
    margin-bottom:12px;
    width:100%;
    font-weight:bold;
  ">
    37 / 150 flujos hoy
  </div>

  <button
    onclick="abrirModalConexion()"
    style="
      width:100%;
      background:transparent;
      color:#00e676;
      border:1px solid #00e676;
      padding:10px;
      border-radius:999px;
      font-weight:bold;
      cursor:pointer;
      font-size:15px;
    "
  >
    Configurar
  </button>

  <div style="
    position:absolute;
    top:22px;
    right:22px;
    width:0;
    height:0;
    border-left:12px solid transparent;
    border-bottom:12px solid #31d158;
  "></div>

</div>
` 
   : `
      <h2>📱 No hay WhatsApp conectado</h2>
<p style="color:#aaa;margin-bottom:20px;">
  Agrega tu TOKEN y PHONE_ID para conectar tu número.
</p>

<button
  class="btn"
  onclick="abrirModalConexion()"
  style="margin-top:15px;"
>
  + Conectar WhatsApp
</button>
    `
  }

  <div id="modalConexion" class="modal" style="display:none;">
  <div style="
    width:90%;
    max-width:760px;
    background:#1d1d1d;
    border-radius:18px;
    overflow:hidden;
    border:1px solid #333;
  ">

    <div style="
      background:#2b2b2b;
      padding:20px;
      font-size:22px;
      font-weight:bold;
      color:white;
      border-bottom:1px solid #444;
    ">
      ☁️ API de WhatsApp Cloud (Oficial)
    </div>

    <div style="padding:35px;">

      <div style="
        border:2px solid #9cff2e;
        border-radius:18px;
        padding:28px;
        margin-bottom:28px;
        display:flex;
        gap:22px;
        align-items:center;
      ">

        <div style="
          width:70px;
          height:70px;
          border-radius:50%;
          background:#39ff14;
          color:#111;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:42px;
          font-weight:bold;
        ">
          ✓
        </div>

        <div style="flex:1;">
          <div style="margin-bottom:12px;">
            <span style="background:#39ff14;color:#111;padding:7px 14px;border-radius:999px;font-weight:bold;font-size:13px;">
              CONECTADO
            </span>

            <span style="background:#fff3c4;color:#8a5a00;padding:7px 14px;border-radius:999px;font-weight:bold;font-size:13px;margin-left:8px;">
              WABA APROBADO
            </span>
          </div>

          <h2 style="color:#7dd3fc;margin:8px 0;">
            +${conexionActiva?.numero || ""}
          </h2>

          <p style="color:#ddd;margin-bottom:14px;">
            ${conexionActiva?.nombre || "MundoColor"}
          </p>

          <div style="display:flex;align-items:center;gap:12px;">
            <span style="background:#ffc400;color:white;padding:7px 14px;border-radius:999px;font-weight:bold;">
              NIVEL 250
            </span>

            <span style="color:#ddd;">📞 Llamadas</span>

            <form method="POST" action="/desconectar-whatsapp" style="display:inline;">
              <button type="submit" style="
                background:none;
                color:#ff4d4d;
                border:none;
                font-weight:bold;
                cursor:pointer;
                font-size:15px;
              ">
                Desconectar
              </button>
            </form>
          </div>
        </div>
      </div>

      <p style="color:#ddd;line-height:1.5;font-size:16px;margin-bottom:28px;">
        Los mensajes de los clientes llegarán automáticamente a tus chats.
        Puedes enviar mensajes usando plantillas aprobadas o responder dentro
        de la ventana de 24 horas.
      </p>

      <form method="POST" action="/guardar-conexion">

        <input name="nombre" value="${conexionActiva?.nombre || ""}" placeholder="Nombre conexión. Ej: MundoColor" required>
        <input name="numero" value="${conexionActiva?.numero || ""}" placeholder="Número WhatsApp. Ej: 59165818913" required>

        <textarea name="token" placeholder="TOKEN Meta" required style="height:110px;">${conexionActiva?.token || ""}</textarea>

        <input name="phone_id" value="${conexionActiva?.phone_id || ""}" placeholder="PHONE_ID" required>

<input
  name="pixel_id"
  value="${conexionActiva?.pixel_id || ""}"
  placeholder="PIXEL ID Meta Ads opcional"
>

<textarea
  name="capi_token"
  placeholder="TOKEN CAPI Meta opcional"
  style="height:90px;"
>${conexionActiva?.capi_token || ""}</textarea>

        <div style="display:flex;gap:14px;margin-top:25px;">
          <button type="button" class="btn" style="background:#38bdf8;color:white;">
            ☁️ Número nuevo
          </button>

          <button type="button" class="btn" style="background:#111;color:#39ff14;border:1px solid #39ff14;">
            WABA existe
          </button>

          <button type="button" class="btn" style="background:#111;color:#ff9800;border:1px solid #ff9800;">
            Migrar de otro BSP
          </button>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:28px;">
          <button type="button" onclick="cerrarModalConexion()" style="
            background:none;
            color:#7dd3fc;
            border:none;
            font-weight:bold;
            cursor:pointer;
            font-size:16px;
          ">
            Cerrar
          </button>

          <button type="submit" class="btn">
            Guardar cambios
          </button>
        </div>

      </form>

    </div>
  </div>
</div>

` : ""}${tab === "flujos" && !builder ? `
<div class="header">Flujos</div>

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <h2>Flujos</h2>

    <form method="POST" action="/crear-flujo" style="display:flex;gap:10px;width:420px;">
      <input name="nombre" placeholder="Nombre del flujo" required style="margin:0;">
      <button class="btn" type="submit">+ Nuevo flujo</button>
    </form>
  </div>

  <div style="display:flex;gap:12px;margin-bottom:18px;">
    <span style="background:#ff6b35;color:white;padding:7px 14px;border-radius:8px;font-weight:bold;">
      Todos ${flujosGuardados.length}
    </span>

    <span style="background:#1c212c;color:#ccc;padding:7px 14px;border-radius:8px;">
      Sin carpeta 0
    </span>
  </div>

  ${
    flujosGuardados.length === 0
    ? `<p>No hay flujos guardados todavía.</p>`
    : flujosGuardados.map(f => `
      <div style="position:relative;display:flex;align-items:center;justify-content:space-between;padding:16px 12px;border-bottom:1px solid #2a3140;background:#11151c;">

        <div>
          <span style="display:inline-block;width:10px;height:10px;background:#00e676;border-radius:50%;margin-right:10px;"></span>
          <strong>${f.nombre}</strong>
        </div>

        <div style="position:relative;">
          <button onclick="abrirMenuFlujo('${f.id}')" style="background:#1c212c;color:white;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;">
            ⋮
          </button>

          <div id="menu_${f.id}" class="menu-flujo">
            <a href="/admin?tab=flujos&builder=1&flujo_id=${f.id}&nombre=${encodeURIComponent(f.nombre)}">👁️ Abrir editor</a>

<a href="#" onclick="editarNombreFlujo('${f.id}', '${f.nombre}')">✏️ Editar nombre</a>

<a href="#" onclick="alert('Mover a carpeta todavía no está activado')">📁 Mover a carpeta</a>

<a href="/duplicar-flujo/${f.id}">🟪 Duplicador</a>

<a href="/exportar-flujo/${f.id}" target="_blank">⬇️ Exportador</a>

<hr>

<a href="/eliminar-flujo/${f.id}" onclick="return confirm('¿Eliminar este flujo?')" style="color:#ff4d4d;">🗑️ Eliminar</a>
          </div>
        </div>

      </div>
    `).join("")
  }
</div>
` : ""}
${tab === "etiquetas" ? `
<div class="header">Etiquetas</div>

<div class="card">
  <h2>🏷️ Crear etiqueta</h2>

  <form method="POST" action="/crear-etiqueta" style="display:flex;gap:10px;align-items:center;">
    <input name="nombre" placeholder="Ej: Sin respuesta, Compró, Cliente caliente" required>

    <input 
      name="color" 
      type="color" 
      value="#25d366" 
      style="width:70px;height:50px;padding:5px;"
    >

    <button class="btn" type="submit">+ Crear</button>
  </form>
</div>

<div class="card">
  <h2>Mis etiquetas</h2>

  ${
    etiquetas.length === 0
    ? `<p>No tienes etiquetas creadas todavía.</p>`
    : etiquetas.map(e => `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:14px 0;
        border-bottom:1px solid #2a3140;
      ">
        <span style="
          background:${e.color || "#25d366"};
          color:white;
          padding:7px 14px;
          border-radius:999px;
          font-size:14px;
          font-weight:bold;
          display:inline-block;
        ">
          ${e.nombre}
        </span>

        <a href="/eliminar-etiqueta/${e.id}" 
           onclick="return confirm('¿Eliminar esta etiqueta?')"
           style="color:#ff4d4d;text-decoration:none;font-weight:bold;">
           Eliminar
        </a>
      </div>
    `).join("")
  }
</div>
` : ""}
${tab === "activadores" ? `
<div class="header">Activadores</div>

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
    <div>
      <span style="background:#ff6b35;color:white;padding:7px 14px;border-radius:8px;font-weight:bold;">
        Todos ${activadores.length}
      </span>

      <span style="background:#1c212c;color:#ccc;padding:7px 14px;border-radius:8px;margin-left:8px;">
        Sin carpeta 0
      </span>
    </div>

    <button class="btn" onclick="abrirModalActivador()">+ Nuevo Activador</button>
  </div>

  ${
    activadores.length === 0
    ? `<p>No hay activadores todavía.</p>`
    : activadores.map(a => {
      const flujoNombre = (flujosGuardados.find(f => f.id === a.flujo_id)?.nombre) || "Sin flujo";
      return `
      <div style="position:relative;display:grid;grid-template-columns:1.5fr 1fr 1fr 60px;gap:12px;align-items:center;padding:16px 12px;border-bottom:1px solid #2a3140;background:#11151c;">

        <div>
          <span style="display:inline-block;width:10px;height:10px;background:${a.activo ? "#00e676" : "#777"};border-radius:50%;margin-right:10px;"></span>
          <strong>${a.nombre}</strong>
          <br>
          <small style="color:#8f9ba8;">${a.frase}</small>
        </div>

        <div>
          <span style="background:#123f5c;color:#4bcffa;padding:5px 10px;border-radius:8px;">
            🔀 ${flujoNombre}
          </span>
        </div>

        <div>
          <span style="background:#0d3d24;color:#00e676;padding:5px 10px;border-radius:8px;">
            📱 ${a.conexion || "MundoColor"}
          </span>
        </div>

        <div style="position:relative;">
          <button onclick="toggleMenuActivador('${a.id}')" style="background:#1c212c;color:white;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;">
            ⋮
          </button>

          <div id="menu_act_${a.id}" class="menu-flujo">
            <a href="#" onclick="abrirModalActivador('${a.id}')">✏️ Editor</a>
            <a href="#" onclick="alert('Mover a carpeta todavía no está activado')">📁 Mover a carpeta</a>
            <hr>
            <a href="/eliminar-activador/${a.id}" onclick="return confirm('¿Eliminar este activador?')" style="color:#ff4d4d;">🗑️ Eliminar</a>
          </div>
        </div>

      </div>
      `;
    }).join("")
  }
</div>
` : ""}
${tab === "flujos" && builder ? `

<div id="builderArea" class="flow-builder builder-theme-dark">
  <header class="flow-toolbar">
    <div class="flow-toolbar-left">
      <h2 id="tituloFlujo" class="flow-title">🔀 ${nombreBuilder || "Flujo nuevo"}</h2>
      <p class="flow-hint">Selecciona nodos desde el panel izquierdo. Arrastra el fondo para moverte por el canvas.</p>
    </div>
    <div class="flow-toolbar-right">
      <button type="button" class="flow-theme-toggle" id="btnBuilderTheme" title="Modo claro" aria-label="Cambiar tema claro u oscuro" aria-pressed="true">☀️</button>
      <div class="flow-history-controls" role="group" aria-label="Deshacer y rehacer">
        <button type="button" class="flow-history-btn" id="btnBuilderUndo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>←</button>
        <button type="button" class="flow-history-btn" id="btnBuilderRedo" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled>→</button>
      </div>
      <button type="button" class="btn flow-save" id="btnGuardarFlujo">💾 Guardar flujo</button>
    </div>
  </header>

  <div class="flow-workspace">
    <div id="canvasWrapper" class="flow-canvas-wrap">
      <div class="flow-canvas-hint">Arrastra el fondo · Rueda o botones para zoom · Conecta nodos desde los puntos naranjas</div>
      <div class="flow-zoom-controls" id="flowZoomControls">
        <button type="button" id="btnCanvasZoomOut" title="Alejar" aria-label="Alejar">−</button>
        <button type="button" id="btnCanvasZoomReset" title="Zoom 100%" aria-label="Zoom 100%">
          <span id="flowZoomLabel">100%</span>
        </button>
        <button type="button" id="btnCanvasZoomIn" title="Acercar" aria-label="Acercar">+</button>
      </div>
      <div id="canvasSpacer" class="flow-canvas-spacer">
        <div class="builder flow-canvas" id="canvasFlujo"></div>
      </div>
    </div>

    <aside id="panelNodo" class="panel-nodo flow-panel">
      <div class="panel-nodo-header">
        <h3>⚙️ Configuración</h3>
        <button type="button" class="panel-close" onclick="cerrarPanelNodo()" title="Cerrar">×</button>
      </div>
      <div id="panelNodoContenido" class="panel-nodo-body"></div>
    </aside>
  </div>
</div>
<script>
(function () {
  var STORAGE_KEY = "macbot_builder_theme";
  var area = document.getElementById("builderArea");
  var btn = document.getElementById("btnBuilderTheme");
  if (!area || !btn) return;

  function applyTheme(theme) {
    theme = theme === "light" ? "light" : "dark";
    area.classList.remove("builder-theme-light", "builder-theme-dark");
    area.classList.add("builder-theme-" + theme);
    area.setAttribute("data-builder-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    btn.textContent = theme === "dark" ? "\u2600\ufe0f" : "\ud83c\udf19";
    btn.title = theme === "dark" ? "Modo claro" : "Modo oscuro";
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  var saved = localStorage.getItem(STORAGE_KEY);
  applyTheme(saved === "light" ? "light" : "dark");

  btn.addEventListener("click", function () {
    applyTheme(area.classList.contains("builder-theme-light") ? "dark" : "light");
  });
})();
</script>
` : ""}

</div>
<div class="modal" id="modalActivador" style="display:none;">
  <div style="width:90%;max-width:720px;background:#111;border-radius:18px;overflow:hidden;border:1px solid #333;">
    
    <div style="background:#f3704f;padding:18px;display:flex;justify-content:space-between;align-items:center;">
      <h2 style="color:white;">✏️ Editar Activador</h2>
      <button onclick="cerrarModalActivador()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">×</button>
    </div>

    <form method="POST" action="/guardar-activador" style="padding:25px;">
      <input type="hidden" name="id" id="activadorId">

      <label>Nombre del activador</label>
      <input name="nombre" id="activadorNombre" required placeholder="Ej: PAPERCRAFTS">

      <label>Flujo a ejecutar</label>
      <select name="flujo_id" id="activadorFlujo" style="width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px;">
        ${flujosGuardados.map(f => `
          <option value="${f.id}">${f.nombre}</option>
        `).join("")}
      </select>

      <label>Conexión de WhatsApp</label>
      <input name="conexion" id="activadorConexion" value="API en la nube - MundoColor">

      <label>Frase activadora</label>
      <textarea name="frase" id="activadorFrase" required placeholder="Hola, quiero más información, PAPERCRAFT"></textarea>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:15px;">
        <label style="background:#0d2517;border:1px solid #00e676;border-radius:12px;padding:14px;">
          <input type="checkbox" name="activo" id="activadorActivo" checked>
          Estado activo
        </label>

        <label style="background:#071c2d;border:1px solid #1e90ff;border-radius:12px;padding:14px;">
          <input type="checkbox" name="repetible" id="activadorRepetible" checked>
          Repetible
        </label>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:25px;">
        <button type="button" onclick="cerrarModalActivador()" style="background:#111;color:white;border:1px solid #aaa;border-radius:10px;padding:12px 20px;cursor:pointer;">
          Cancelar
        </button>

        <button type="submit" style="background:#f3704f;color:white;border:none;border-radius:10px;padding:12px 25px;font-weight:bold;cursor:pointer;">
          Guardar
        </button>
      </div>
    </form>
  </div>
</div>
<script>
  window.activadoresData = ${JSON.stringify(activadores)};
  window.etiquetasData = ${JSON.stringify(etiquetas)};
</script>

<script type="application/json" id="macbot-builder-data">${JSON.stringify({
  flujoEditandoId: flujoId || "",
  flujoCargado: flujoActual ? flujoActual.data : null,
  conexionWhatsappIdFlujo: flujoActual?.conexion_whatsapp_id || null,
  activadoresData: activadores || [],
  etiquetasData: etiquetas || [],
  supabaseUrl: supabaseUrl || "",
  supabaseAnonKey: supabaseAnonKey || "",
  seguimientoLegacyEnabled: false,
}).replace(/</g, "\\u003c")}</script>
<script>
(function () {
  var el = document.getElementById("macbot-builder-data");
  window.MACBOT_BUILDER = el ? JSON.parse(el.textContent) : {};
})();
</script>
${builder ? `
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="/js/builder/remarketing-global.js"></script>
<script src="/js/builder/seguimiento-api.js"></script>
<script src="/js/builder/seguimiento.js"></script>
<script src="/js/builder/seguimiento-v2.js"></script>
<script src="/js/builder/contenido.js"></script>
<script src="/js/builder/ia.js"></script>
<script src="/js/builder/ia-pro.js"></script>
<script src="/js/builder/openai-agent.js"></script>
<script src="/js/builder/lector-pago.js"></script>
<script src="/js/builder/inicio-lifecycle.js"></script>
<script src="/js/builder/minimap.js"></script>
<script src="/js/builder.js"></script>
` : ""}

<div class="modal" id="modalSeguimiento" style="display:none;">
  <div style="width:90%;max-width:1000px;height:78vh;background:#151515;border-radius:14px;overflow:hidden;border:1px solid #333;display:flex;">

    <div style="width:220px;background:#101010;border-right:1px solid #333;padding:15px;">
      <h3 style="color:white;margin-bottom:15px;">⏱️ Editar Seguimiento</h3>

      <div id="listaSeguimientos"></div>

      <button type="button" onclick="agregarSegmentoSeguimiento()" style="margin-top:20px;background:none;color:white;border:none;cursor:pointer;">
        + Seguimiento
      </button>
    </div>

    <div style="flex:1;padding:20px;">
      <label>Enviar en minutos</label>
      <input id="segMinutos" type="number" placeholder="15">

      <label>Mensaje</label>
      <textarea id="segMensaje" style="height:220px;" placeholder="Escribe el mensaje de seguimiento"></textarea>

      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;">
        <button type="button" onclick="cerrarSeguimiento()" style="background:#111;color:white;border:1px solid #aaa;padding:12px 20px;border-radius:10px;">
          Cancelar
        </button>

        <button type="button" onclick="guardarSeguimiento()" style="background:#1e90ff;color:white;border:none;padding:12px 25px;border-radius:10px;font-weight:bold;">
          Guardar
        </button>
      </div>
    </div>

  </div>
</div>
<script>
function abrirMenuFlujo(id){
  const menu = document.getElementById("menu_" + id);

  document.querySelectorAll(".menu-flujo").forEach(m => {
    if(m !== menu) m.style.display = "none";
  });

  if(menu){
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  }
}
</script>
</body>
</html>

`;
}

module.exports = {
  renderAdminPage
};