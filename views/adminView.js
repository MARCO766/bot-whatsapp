function renderAdminPage({
  tab,
  builder,
  nombreBuilder,
  flujoId,
  flujosGuardados,
  flujoActual,
  activadores,
  etiquetas,
  conexionActiva
}) {
  return `

  <!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>MacBot CRM</title>

<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
body{background:#0f1117;color:white;display:flex;height:100vh;overflow:hidden}

.sidebar{width:270px;background:#151922;padding:25px;border-right:1px solid #222}
.logo{font-size:36px;font-weight:bold;color:#39ff14;margin-bottom:30px}
.menu{display:flex;flex-direction:column;gap:12px}
.menu a{background:#1c212c;color:white;padding:16px;border-radius:14px;text-decoration:none;font-size:17px;cursor:pointer}
.menu a.active{background:#39ff14;color:black;font-weight:bold}

.main{flex:1;padding:35px;overflow:auto}
.header{font-size:48px;font-weight:bold;margin-bottom:30px;color:#ffd89b}
.card{
  background:#1b2029;
  padding:28px;
  border-radius:22px;
  margin-bottom:25px;
  border:1px solid #2a3140;
  overflow:visible;
}
.card h2{color:#39ff14;margin-bottom:18px}

input,textarea{width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px}
textarea{min-height:110px;resize:vertical}
.btn{background:#39ff14;color:black;border:none;padding:14px 25px;border-radius:14px;font-size:17px;font-weight:bold;cursor:pointer}

.builder{
  position:relative;
  width:100%;
  height:650px;
  background:
    radial-gradient(circle at top left, rgba(57,255,20,0.10), transparent 28%),
    radial-gradient(circle at bottom right, rgba(75,207,250,0.10), transparent 28%),
    #071018;
  background-image:
    radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
    radial-gradient(circle at top left, rgba(57,255,20,0.10), transparent 28%),
    radial-gradient(circle at bottom right, rgba(75,207,250,0.10), transparent 28%);
  background-size:32px 32px, cover, cover;
  border-radius:24px;
  overflow:visible;
  margin-top:20px;
  border:1px solid rgba(255,255,255,0.08);
  box-shadow:inset 0 0 80px rgba(0,0,0,0.35);
}

.node{
  position:absolute;
  width:300px;
  min-height:110px;
  max-height:320px;
overflow:hidden;
  max-width:300px;
  background:rgba(18,24,36,0.92);
  border-radius:24px;
  padding:22px;
  border:1px solid rgba(57,255,20,0.55);
  cursor:move;
  z-index:2;
  color:white;
  overflow:visible;
  word-break:break-word;
  overflow-wrap:anywhere;
  box-shadow:
    0 18px 45px rgba(0,0,0,0.45),
    0 0 24px rgba(57,255,20,0.10);
  backdrop-filter:blur(12px);
  transition:transform .2s ease, box-shadow .2s ease, border .2s ease;
}

.node:hover{

  transform:translateY(-3px);
  box-shadow:
    0 24px 55px rgba(0,0,0,0.55),
    0 0 32px rgba(57,255,20,0.18);
}

.node h3{
  color:#ffffff;
  margin-bottom:14px;
  font-size:18px;
  display:flex;
  align-items:center;
  gap:8px;
}

.node p,
.node div,
.node span,
.node textarea,
.node input,
.node select{
  max-width:100%;
  word-break:break-word;
  overflow-wrap:anywhere;
}

.node p{
  white-space:normal;
  line-height:1.35;
  font-size:14px;
  margin-bottom:6px;
}

.node.blue{
  border-color:#38bdf8;
  box-shadow:
    0 18px 45px rgba(0,0,0,0.45),
    0 0 24px rgba(56,189,248,0.18);
}

.node.orange{
  border-color:#fbbf24;
  box-shadow:
    0 18px 45px rgba(0,0,0,0.45),
    0 0 24px rgba(251,191,36,0.18);
}

.node.red{
  border-color:#fb7185;
  box-shadow:
    0 18px 45px rgba(0,0,0,0.45),
    0 0 24px rgba(251,113,133,0.18);
}

.delete-node{
  position:absolute;
  top:8px;
  right:8px;
  background:#ff4d4d;
  color:white;
  border:none;
  width:26px;
  height:26px;
  border-radius:50%;
  cursor:pointer;
}

.edit-node{
  position:absolute;
  top:10px;
  right:44px;
  width:24px;
  height:24px;
  border:none;
  border-radius:50%;
  cursor:pointer;

  background:linear-gradient(135deg,#38bdf8,#0ea5e9);
  color:white;

  font-size:12px;
  font-weight:bold;

  display:flex;
  align-items:center;
  justify-content:center;

  box-shadow:
    0 0 12px rgba(56,189,248,.45),
    0 4px 10px rgba(0,0,0,.35);

  transition:.18s ease;
  z-index:20;
}

.edit-node:hover{
  transform:scale(1.12);
  box-shadow:
    0 0 20px rgba(56,189,248,.75),
    0 6px 16px rgba(0,0,0,.45);
}

.linea{
  position:absolute;
  border-top:3px solid #39ff14;
  z-index:1;
  filter:drop-shadow(0 0 8px rgba(57,255,20,0.7));
  opacity:0.9;
}
.borrar-linea{
  position:absolute;
  width:24px;
  height:24px;
  border-radius:50%;
  border:none;
  background:#ff4d4d;
  color:white;
  font-weight:bold;
  cursor:pointer;
  z-index:10;
}
.port{
  position:absolute;
  width:20px;
  height:20px;
  border-radius:50%;
  top:50%;
  transform:translateY(-50%);
  cursor:pointer;
  border:3px solid rgba(255,255,255,0.95);
  z-index:30;
  transition:.18s ease;
  box-shadow:0 0 18px rgba(0,0,0,.45);
}

.port:hover{
  transform:translateY(-50%) scale(1.12);
}

.port.in{
  left:-12px;
  background:linear-gradient(135deg,#00ff88,#00c853);
  box-shadow:0 0 18px rgba(0,255,136,.65);
}

.port.out{
  right:-12px;
  background:linear-gradient(135deg,#ffb300,#ff6d00);
  box-shadow:0 0 18px rgba(255,152,0,.65);
}

.node{
  min-height:90px;
}

.modal{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.75);
  display:none;
  align-items:center;
  justify-content:center;
  z-index:9999;
}

.modal.activo{
  display:flex;
}
.modal-box{width:90%;max-width:1050px;height:82vh;background:#1b2029;border-radius:22px;display:flex;overflow:hidden;border:2px solid #333}
.modal-left{width:58%;padding:25px;border-right:1px solid #333;overflow:auto}
.modal-right{width:42%;background:#0b141a;padding:25px;overflow:auto}

.tabs{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.tab{padding:12px 18px;border-radius:10px;background:#2a3140;cursor:pointer}
.tab.active{background:#39ff14;color:black;font-weight:bold}

.preview-title{color:#39ff14;font-size:20px;margin-bottom:15px}
.whatsapp-preview{background:#111b21;border-radius:18px;padding:18px;min-height:520px}
.bubble{background:#005c4b;padding:12px 14px;border-radius:12px;margin:10px 0;max-width:85%;margin-left:auto;word-wrap:break-word}
.bubble small{display:block;text-align:right;color:#cfd8dc;margin-top:6px}
.file-preview{background:#202c33;padding:12px;border-radius:10px;margin-top:8px}

.close{
  float:right;
  background:#ff4d4d;
  color:white;
  border:none;
  border-radius:10px;
  padding:10px 15px;
  cursor:pointer;
}

.menu-flujo{
  display:none;
  position:absolute;
  right:0;
  top:38px;
  width:230px;
  background:#0b0b0b;
  border:1px solid #333;
  border-radius:12px;
  padding:10px;
  z-index:999999;
  box-shadow:0 10px 30px rgba(0,0,0,.5);
}
.menu-flujo a{
  display:block;
  padding:12px;
  color:white;
  text-decoration:none;
  border-radius:8px;
}
.menu-flujo a:hover{
  background:#1c212c;
}

.menu-flujo hr{
  border:none;
  border-top:1px solid #333;
  margin:8px 0;
}

.node-content-scroll{
  max-height:220px;
  overflow-y:auto;
  padding-right:6px;
  font-size:13px;
  line-height:1.3;
}

.node-content-scroll::-webkit-scrollbar{
  width:5px;
}

.node-content-scroll::-webkit-scrollbar-thumb{
  background:#38bdf8;
  border-radius:10px;
}

</style>
</head>

<body>

<div class="sidebar">
  <div class="logo">⚡ MacBot</div>

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

  <div class="menu" id="menuNodos" style="${builder ? "display:flex;" : "display:none;"}">
    <a class="active">🧩 Nodos</a>
    
    <a onclick="abrirContenido()">💬 Contenido</a>
    <a onclick="agregarNodo('seguimiento')">🔔 Seguimiento</a>
    <a onclick="agregarNodo('espera')">⏳ Espera</a>
    <a onclick="agregarNodo('etiqueta')">🏷️ Etiqueta</a>
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
          <button onclick="toggleMenuFlujo('${f.id}')" style="background:#1c212c;color:white;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;">
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
<div id="builderArea" style="
display:block;
width:100%;
height:100vh;
padding:25px;
overflow:auto;
">
  <div class="card">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">

  <button
    onclick="window.location.href='/admin?tab=flujos'"
    style="
      background:#1c212c;
      color:white;
      border:none;
      padding:10px 16px;
      border-radius:10px;
      cursor:pointer;
      font-weight:bold;
    "
  >
    ← Volver
  </button>

  <h2 id="tituloFlujo" style="margin:0;">
    🔀 ${nombreBuilder || "Flujo nuevo"}
  </h2>

</div>
    <p>Selecciona nodos desde el panel izquierdo.</p>

<button class="btn" id="btnGuardarFlujo" type="button" style="margin:15px 0;">
💾 Guardar flujo
</button>

<div class="builder" id="canvasFlujo" style="height:85vh;"></div>
  </div>
</div>
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
<div class="modal" id="modalContenido" style="display:none;">
  <div class="modal-box">

    <div class="modal-left">
      <button class="close" onclick="cerrarContenido()">X</button>
      <h2 style="color:#39ff14;margin-bottom:20px;">Agregar contenido</h2>

      <div class="tabs">
        <div class="tab active" onclick="mostrarTab('texto', this)">Texto</div>
        <div class="tab" onclick="mostrarTab('tiempo', this)">Tiempo</div>
        <div class="tab" onclick="mostrarTab('imagen', this)">Imagen</div>
        <div class="tab" onclick="mostrarTab('audio', this)">Audio</div>
        <div class="tab" onclick="mostrarTab('video', this)">Video</div>
        <div class="tab" onclick="mostrarTab('doc', this)">Doc PDF/Word</div>
      </div>
                <div id="contenidoBloques" class="content-blocks"></div>
      <div id="tab_texto">
        <h3>Texto</h3>
        <textarea id="textoMsg" placeholder="Escribe textos sobre tu producto"></textarea>
        <button class="btn" onclick="agregarPreview('texto')">Agregar texto</button>
      </div>

      <div id="tab_tiempo" style="display:none;">
        <h3>Tiempo de espera</h3>
        <input type="number" id="tiempoMsg" min="1" max="60" placeholder="Máximo 60 segundos">
        <button class="btn" onclick="agregarPreview('tiempo')">Agregar tiempo</button>
      </div>

      <div id="tab_imagen" style="display:none;">
        <h3>Imagen</h3>
        <input type="file" id="imagenMsg" accept="image/*">
        <textarea id="descImagen" placeholder="Descripción de la imagen"></textarea>
        <button class="btn" onclick="agregarPreview('imagen')">Agregar imagen</button>
      </div>

      <div id="tab_audio" style="display:none;">
        <h3>Audio</h3>
        <input type="file" id="audioMsg" accept="audio/*">
        <button class="btn" onclick="agregarPreview('audio')">Agregar audio</button>
      </div>

      <div id="tab_video" style="display:none;">
        <h3>Video máximo 15MB</h3>
        <input type="file" id="videoMsg" accept="video/*">
        <textarea id="descVideo" placeholder="Descripción del video"></textarea>
        <button class="btn" onclick="agregarPreview('video')">Agregar video</button>
      </div>

      <div id="tab_doc" style="display:none;">
        <h3>Documento PDF o Word</h3>
        <input type="text" id="docMsg" placeholder="Pega aquí la URL pública del PDF o Word">
        <button class="btn" onclick="agregarPreview('doc')">Agregar documento</button>

              </div>
    </div>

    <div class="modal-right">

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;">

  <div style="display:flex;align-items:center;gap:8px;">

    <button 
      type="button"
      onclick="varianteAnterior()"
      style="
        width:38px;
        height:38px;
        border:none;
        border-radius:10px;
        background:#1e293b;
        color:white;
        font-size:18px;
        cursor:pointer;
      "
    >
      ←
    </button>

    <button 
      type="button"
      onclick="varianteSiguiente()"
      style="
        width:38px;
        height:38px;
        border:none;
        border-radius:10px;
        background:#1e293b;
        color:white;
        font-size:18px;
        cursor:pointer;
      "
    >
      →
    </button>

    <div class="preview-title" style="margin-bottom:0;">
      Vista previa WhatsApp
    </div>

  </div>

  <button 
    type="button" 
    onclick="agregarVarianteContenido()" 
    style="
      background:#38bdf8;
      color:white;
      border:none;
      border-radius:10px;
      padding:9px 13px;
      font-weight:bold;
      cursor:pointer;
      width:auto;
    "
  >
    + Variante
  </button>

</div>

<div id="contadorVariantes" style="color:#8f9ba8;font-size:14px;margin-bottom:10px;">
  Variante 1 de 1
</div>

  <button type="button" class="btn" onclick="agregarContenidoFinal()" style="margin-bottom:15px;width:100%;">
✅ Agregar contenido al flujo
</button>

  <div 
  class="whatsapp-preview" 
  id="previewBox"
  style="
    overflow:hidden;
    position:relative;
    transition:.25s ease;
  "
>
    <p style="color:#78909c;text-align:center;margin-top:180px;">
      Agrega contenido para ver la vista previa
    </p>
  </div>

</div>

  </div>
</div>

<script>


let nodoCount = 0;

let variantesContenido = [[]];
let varianteActual = 0;
let contenidoArmado = variantesContenido[varianteActual];

function actualizarContadorVariantes(){
  const contador = document.getElementById("contadorVariantes");

  if(contador){
    contador.innerText = "Variante " + (varianteActual + 1) + " de " + variantesContenido.length;
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

  const previewBox = document.getElementById("previewBox");

  if(previewBox){
    previewBox.style.transition = "transform .25s ease, opacity .25s ease";
    previewBox.style.transform = "translateX(80px)";
    previewBox.style.opacity = "0";

    setTimeout(() => {
      previewBox.style.transform = "translateX(0)";
      previewBox.style.opacity = "1";
      refrescarVarianteActual();
    }, 250);
  } else {
    refrescarVarianteActual();
  }
}

function varianteAnterior(){

  if(varianteActual <= 0) return;

  variantesContenido[varianteActual] = contenidoArmado;

  varianteActual--;

  const previewBox = document.getElementById("previewBox");

  if(previewBox){
    previewBox.style.transition = "transform .2s ease, opacity .2s ease";
    previewBox.style.transform = "translateX(-60px)";
    previewBox.style.opacity = "0";

    setTimeout(() => {
      previewBox.style.transform = "translateX(0)";
      previewBox.style.opacity = "1";
      refrescarVarianteActual();
    }, 200);
  } else {
    refrescarVarianteActual();
  }
}

function varianteSiguiente(){

  if(varianteActual >= variantesContenido.length - 1) return;

  variantesContenido[varianteActual] = contenidoArmado;

  varianteActual++;

  const previewBox = document.getElementById("previewBox");

  if(previewBox){
    previewBox.style.transition = "transform .2s ease, opacity .2s ease";
    previewBox.style.transform = "translateX(60px)";
    previewBox.style.opacity = "0";

    setTimeout(() => {
      previewBox.style.transform = "translateX(0)";
      previewBox.style.opacity = "1";
      refrescarVarianteActual();
    }, 200);
  } else {
    refrescarVarianteActual();
  }
}

function crearNodoInicioAutomatico(){
  const canvas = document.getElementById("canvasFlujo");
  if(!canvas) return;

  const yaExiste = document.getElementById("nodo_inicio");
  if(yaExiste) return;

  const nodo = document.createElement("div");
  nodo.className = "node";
  nodo.id = "nodo_inicio";

  nodo.style.left = "40px";
  nodo.style.top = "220px";
  nodo.style.width = "280px";
  nodo.style.background = "linear-gradient(135deg,#39ff14,#16c60c)";
nodo.style.border = "1px solid rgba(156,255,46,0.95)";
nodo.style.color = "white";
nodo.style.borderRadius = "24px";
nodo.style.boxShadow = "0 0 20px rgba(57,255,20,0.7),0 0 45px rgba(57,255,20,0.35)";

  nodo.innerHTML =
    '<h3 style="color:#061018;margin-bottom:14px;">▶ Inicio del Flujo</h3>' +
'<p style="color:#061018;font-weight:bold;">Aquí comienza tu flujo de conversación.</p>' +
    '<div class="port out" data-nodo="nodo_inicio" onmousedown="iniciarConexion(event, \\'nodo_inicio\\')"></div>';

  canvas.appendChild(nodo);
  hacerMovible(nodo);
}
let ultimoNodo = null;
let conexiones = [];
let nodoArrastrando = null;
let lineaTemporal = null;

function iniciarConexion(e, id){
  e.stopPropagation();

  nodoArrastrando = document.getElementById(id);

  const canvas = document.getElementById("canvasFlujo");

  lineaTemporal = document.createElement("div");
  lineaTemporal.className = "linea";
  canvas.appendChild(lineaTemporal);

  document.addEventListener("mousemove", moverConexionTemporal);
  document.addEventListener("mouseup", soltarConexion);
}

function moverConexionTemporal(e){
  if(!nodoArrastrando || !lineaTemporal) return;

  const canvas = document.getElementById("canvasFlujo");
  const rect = canvas.getBoundingClientRect();

  const puerto = document.querySelector('[data-nodo="' + nodoArrastrando.id + '"]');

const x1 =
  puerto.getBoundingClientRect().left -
  rect.left +
  puerto.offsetWidth / 2;

const y1 =
  puerto.getBoundingClientRect().top -
  rect.top +
  puerto.offsetHeight / 2;

  const x2 = e.clientX - rect.left;
  const y2 = e.clientY - rect.top;

  const largo = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angulo = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  lineaTemporal.style.left = x1 + "px";
  lineaTemporal.style.top = y1 + "px";
  lineaTemporal.style.width = largo + "px";
  lineaTemporal.style.transform = "rotate(" + angulo + "deg)";
  lineaTemporal.style.transformOrigin = "0 0";
}

function soltarConexion(e){
  document.removeEventListener("mousemove", moverConexionTemporal);
  document.removeEventListener("mouseup", soltarConexion);

  const destino = e.target.closest(".port");

  if(destino && nodoArrastrando){
    const nodoDestino = document.getElementById(destino.dataset.nodo);

    if(nodoDestino && nodoDestino.id !== nodoArrastrando.id){

  // Si soltó sobre ENTRADA
  if(destino.classList.contains("in")){
    conectarNodos(nodoArrastrando, nodoDestino);
  }

  // Si soltó sobre SALIDA
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
let flujoEditandoId = "${flujoId}";
let flujoCargado = ${JSON.stringify(flujoActual ? flujoActual.data : null)};

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

if(item.id === "nodo_inicio"){

  nodo.style.background = "linear-gradient(135deg,#39ff14,#16c60c)";
  nodo.style.border = "2px solid #7dff73";
  nodo.style.boxShadow = "0 0 20px rgba(57,255,20,0.7),0 0 45px rgba(57,255,20,0.35)";
  nodo.style.color = "white";

}

      nodo.className = item.className;

      nodo.innerHTML = item.html;

      nodo.style.left = item.left;

      nodo.style.top = item.top;

      canvas.appendChild(nodo);

      hacerMovible(nodo);

      mapaNodos[item.id] = nodo;

      const numero = parseInt(item.id.replace("nodo_", ""));

      if(numero > nodoCount){
        nodoCount = numero;
      }

      ultimoNodo = nodo;
    });
  }

  if(flujoCargado.conexiones){

    flujoCargado.conexiones.forEach(c => {

      if(mapaNodos[c.desde] && mapaNodos[c.hasta]){

        conectarNodos(
          mapaNodos[c.desde],
          mapaNodos[c.hasta]
        );
      }
    });
  }
}

setTimeout(() => {
  cargarFlujoGuardado();
  crearNodoInicioAutomatico();
}, 200);


function agregarNodo(tipo){
  const canvas = document.getElementById("canvasFlujo");
  nodoCount++;

  const nodo = document.createElement("div");
  nodo.className = "node";
  nodo.id = "nodo_" + nodoCount;

  nodo.style.left = (80 + nodoCount * 35) + "px";
  nodo.style.top = (80 + nodoCount * 35) + "px";

  let contenido = "";

  
  if(tipo === "seguimiento"){

  nodo.classList.add("follow-node");

  const datosDefault = [];

  contenido =
    '<div class="follow-header">' +
      '<span>⏱️ Seguimiento</span>' +
    '</div>' +

    '<button class="edit-node" onclick="event.stopPropagation(); abrirEditorSeguimiento(\\'' + nodo.id + '\\')">✎</button>' +

    '<button class="delete-node" onclick="event.stopPropagation(); borrarNodo(\\'' + nodo.id + '\\')">×</button>' +

    '<div class="follow-body">' +
      '<div class="follow-title">Sin seguimientos todavía</div>' +
    '</div>' +

    '<textarea class="seguimiento-data" style="display:none;">' +
      JSON.stringify(datosDefault) +
    '</textarea>';
}

  if(tipo === "espera"){
    nodo.classList.add("orange");
    contenido = \`
      <button class="edit-node" onclick="editarNodo('\${nodo.id}')">✎</button>
<button class="delete-node" onclick="borrarNodo('\${nodo.id}')">×</button>
      <h3>⏳ Espera</h3>
      <input type="number" max="60" placeholder="Máximo 60 segundos">
    \`;
  }

  if(tipo === "etiqueta"){

  let opcionesEtiquetas = etiquetasData.map(e => {
    return '<option value="' + e.nombre + '">' + e.nombre + '</option>';
  }).join("");

  contenido =
    '<button class="edit-node" onclick="editarNodo(\\'' + nodo.id + '\\')">✎</button>' +
'<button class="delete-node" onclick="borrarNodo(\\'' + nodo.id + '\\')">×</button>' +
    '<h3>🏷️ Etiqueta</h3>' +
    '<select style="width:100%;background:#0f1117;border:2px solid #333;padding:15px;border-radius:14px;color:white;margin:10px 0;font-size:16px;">' +
      '<option value="">Selecciona una etiqueta</option>' +
      opcionesEtiquetas +
    '</select>';
}
 

  if(tipo === "conectar"){
    contenido = \`
      <button class="delete-node" onclick="borrarNodo('\${nodo.id}')">×</button>
      <h3>🔗 Conectar flujo</h3>
      <input placeholder="Nombre del flujo">
    \`;
  }

  nodo.innerHTML =
  '<div class="port in" data-nodo="' + nodo.id + '" onmousedown="iniciarConexion(event, \\'' + nodo.id + '\\')"></div>' +
  contenido +
  '<div class="port out" data-nodo="' + nodo.id + '" onmousedown="iniciarConexion(event, \\'' + nodo.id + '\\')"></div>';

canvas.appendChild(nodo);
hacerMovible(nodo);

  }

function hacerMovible(nodo){
  let moviendo = false;
  let offsetX = 0;
  let offsetY = 0;

  nodo.addEventListener("mousedown", function(e){
    if(e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;

    moviendo = true;
    offsetX = e.clientX - nodo.offsetLeft;
    offsetY = e.clientY - nodo.offsetTop;
  });

  document.addEventListener("mousemove", function(e){
    if(!moviendo) return;

    nodo.style.left = (e.clientX - offsetX) + "px";
    nodo.style.top = (e.clientY - offsetY) + "px";

    actualizarLineas();
  });

  document.addEventListener("mouseup", function(){
    moviendo = false;
  });
}

function conectarNodos(nodo1, nodo2){

  const canvas = document.getElementById("canvasFlujo");

  const linea = document.createElement("div");
  linea.className = "linea";

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
    linea: linea,
    borrar: borrar
  });

  actualizarLineas();
}

function actualizarLineas(){

  conexiones = conexiones.filter(c => {
  if (!c.desde || !c.hasta || !c.linea) {
    if (c.linea) c.linea.remove();
    if (c.borrar) c.borrar.remove();
    return false;
  }

  if (!document.body.contains(c.desde) || !document.body.contains(c.hasta)) {
    if (c.linea) c.linea.remove();
    if (c.borrar) c.borrar.remove();
    return false;
  }

  return true;
});

conexiones.forEach(c => {

    const puertoDesde = c.desde.querySelector(".port.out") || c.desde.querySelector(".port");
const puertoHasta = c.hasta.querySelector(".port.in") || c.hasta.querySelector(".port");

const x1 =
  puertoDesde.getBoundingClientRect().left -
  document.getElementById("canvasFlujo").getBoundingClientRect().left +
  puertoDesde.offsetWidth / 2;

const y1 =
  puertoDesde.getBoundingClientRect().top -
  document.getElementById("canvasFlujo").getBoundingClientRect().top +
  puertoDesde.offsetHeight / 2;

const x2 =
  puertoHasta.getBoundingClientRect().left -
  document.getElementById("canvasFlujo").getBoundingClientRect().left +
  puertoHasta.offsetWidth / 2;

const y2 =
  puertoHasta.getBoundingClientRect().top -
  document.getElementById("canvasFlujo").getBoundingClientRect().top +
  puertoHasta.offsetHeight / 2;

    const largo = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angulo = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    c.linea.style.left = x1 + "px";
    c.linea.style.top = y1 + "px";
    c.linea.style.width = largo + "px";
    c.linea.style.transform = "rotate(" + angulo + "deg)";
    c.linea.style.transformOrigin = "0 0";

    if(c.borrar){
      c.borrar.style.left = ((x1 + x2) / 2 - 12) + "px";
      c.borrar.style.top = ((y1 + y2) / 2 - 12) + "px";
    }
  });
}



let seguimientoNodoEditando = null;
let seguimientoIndexEditando = 0;
let seguimientoDatosActuales = [];

function abrirEditorSeguimiento(id){
  const nodo = document.getElementById(id);
  if(!nodo) return;

  seguimientoNodoEditando = nodo;

  const dataBox = nodo.querySelector(".seguimiento-data");

  try{
    seguimientoDatosActuales = JSON.parse(dataBox.value || "[]");
  }catch(e){
    seguimientoDatosActuales = [];
  }

  const modal = document.getElementById("modalSeguimiento");
  modal.style.display = "flex";
  modal.classList.add("activo");

  renderListaSeguimientos();

  if(seguimientoDatosActuales.length > 0){
    cargarSegmentoSeguimiento(0);
  } else {
    document.getElementById("segMinutos").value = "";
    document.getElementById("segMensaje").value = "";
  }
}

function renderListaSeguimientos(){
  const lista = document.getElementById("listaSeguimientos");
  lista.innerHTML = "";

  seguimientoDatosActuales.forEach((seg, index) => {
    lista.innerHTML +=
      '<div onclick="cargarSegmentoSeguimiento(' + index + ')" style="' +
      'padding:12px;margin-bottom:8px;border-radius:8px;cursor:pointer;' +
      'background:' + (index === seguimientoIndexEditando ? '#123f5c' : '#1c1c1c') + ';color:white;">' +
        '<strong>Segmento ' + (index + 1) + '</strong><br>' +
        '<small>' + seg.minutos + ' minutos</small>' +
      '</div>';
  });
}

function cargarSegmentoSeguimiento(index){
  seguimientoIndexEditando = index;

  const seg = seguimientoDatosActuales[index];

  document.getElementById("segMinutos").value = seg.minutos || "";
  document.getElementById("segMensaje").value = seg.mensaje || "";

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
    document.getElementById("segMinutos").value || "";

  seguimientoDatosActuales[seguimientoIndexEditando].mensaje =
    document.getElementById("segMensaje").value || "";

  const dataBox = seguimientoNodoEditando.querySelector(".seguimiento-data");
  dataBox.value = JSON.stringify(seguimientoDatosActuales);

  const body = seguimientoNodoEditando.querySelector(".follow-body");

  let html = "";

  if(seguimientoDatosActuales.length === 0){
    html = '<div class="follow-title">Sin seguimientos todavía</div>';
  } else {
    html = '<div class="follow-title">Configuración de tiempos:</div>';

    seguimientoDatosActuales.forEach((seg, index) => {
      html +=
        '<div class="follow-item">' +
          '<span>Tiempo ' + (index + 1) + ' (' + seg.minutos + ' min)</span>' +
          '<span class="follow-badge">' + (seg.mensaje ? '1' : '0') + '</span>' +
        '</div>';
    });
  }

  body.innerHTML = html;

  cerrarSeguimiento();
}

function cerrarSeguimiento(){
  const modal = document.getElementById("modalSeguimiento");
  modal.style.display = "none";
  modal.classList.remove("activo");
}

function editarNodo(id){

  const nodo = document.getElementById(id);
  if(!nodo) return;

  // 🔀 NODO CONTENIDO CON VARIANTES
  if(nodo.innerHTML.includes("💬 Contenido")){

    const dataBox = nodo.querySelector(".contenido-variantes-data");

    if(dataBox){

      try{

        const textoJson =
          dataBox.value ||
          dataBox.innerHTML ||
          dataBox.textContent;

        variantesContenido = JSON.parse(
          textoJson
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
        );

        if(!Array.isArray(variantesContenido)){
          variantesContenido = [[]];
        }

        if(variantesContenido.length === 0){
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

        console.log(
          "ERROR LEYENDO VARIANTES:",
          error.message
        );
      }
    }

    // fallback viejo
    contenidoArmado = [];

    const parrafos = nodo.querySelectorAll("p");

    parrafos.forEach(p => {

      const texto = p.innerText.trim();

      if(texto.startsWith("texto:")){
        contenidoArmado.push({
          tipo:"texto",
          valor:texto.replace("texto:","").trim()
        });
      }

      if(texto.startsWith("tiempo:")){
        contenidoArmado.push({
          tipo:"tiempo",
          valor:texto.replace("tiempo:","").trim()
        });
      }

      if(texto.startsWith("imagen:")){
        contenidoArmado.push({
          tipo:"imagen",
          valor:texto.replace("imagen:","").trim()
        });
      }

      if(texto.startsWith("audio:")){
        contenidoArmado.push({
          tipo:"audio",
          valor:texto.replace("audio:","").trim()
        });
      }

      if(texto.startsWith("video:")){
        contenidoArmado.push({
          tipo:"video",
          valor:texto.replace("video:","").trim()
        });
      }

      if(texto.startsWith("doc:")){
        contenidoArmado.push({
          tipo:"doc",
          valor:texto.replace("doc:","").trim()
        });
      }

    });

    variantesContenido = [contenidoArmado];

    varianteActual = 0;

    abrirContenido();

    setTimeout(() => {
      refrescarVarianteActual();
    }, 100);

    return;
  }

  // ✏️ OTROS NODOS
  const textarea = nodo.querySelector("textarea");
  const input = nodo.querySelector("input");
  const select = nodo.querySelector("select");

  const campo = textarea || input || select;

  if(campo){

    campo.focus();

    campo.style.boxShadow =
      "0 0 0 3px rgba(56,189,248,0.35)";

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
if(id === "nodo_inicio"){
  return;
}
  const nodo = document.getElementById(id);

  conexiones = conexiones.filter(c => {
    if(c.desde.id === id || c.hasta.id === id){
      c.linea.remove();
      return false;
    }
    return true;
  });

  if(ultimoNodo && ultimoNodo.id === id){
    ultimoNodo = null;
  }

  if(nodo) nodo.remove();
}

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
  ["texto","tiempo","imagen","audio","video","doc"].forEach(t=>{
    document.getElementById("tab_"+t).style.display="none";
  });

  document.getElementById("tab_"+tab).style.display="block";

  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  el.classList.add("active");
}

function limpiarPreview(){
  const box=document.getElementById("previewBox");
  if(box.innerText.includes("Agrega contenido")){
    box.innerHTML="";
  }
}

function agregarPreview(tipo){

  if(tipo === "texto"){

  const texto = document.getElementById("textoMsg").value.trim();

  if(!texto){
    alert("Escribe un texto");
    return;
  }

  contenidoArmado.push({
    tipo: "texto",
    valor: texto
  });

  document.getElementById("textoMsg").value = "";

  renderContenidoBloques();
actualizarPreviewContenido();

// ocultar tabs después de agregar
document.getElementById("tab_texto").style.display = "none";
document.getElementById("tab_tiempo").style.display = "none";
document.getElementById("tab_imagen").style.display = "none";
document.getElementById("tab_audio").style.display = "none";
document.getElementById("tab_video").style.display = "none";
document.getElementById("tab_doc").style.display = "none";

// quitar active
document.querySelectorAll(".tab").forEach(t=>{
  t.classList.remove("active");
});

  return;
}

  if(tipo === "tiempo"){
    const tiempo = document.getElementById("tiempoMsg").value;

    if(!tiempo){
      alert("Pon un tiempo");
      return;
    }

    contenidoArmado.push({
      tipo: "tiempo",
      valor: tiempo
    });

    document.getElementById("tiempoMsg").value = "";
    renderContenidoBloques();
actualizarPreviewContenido();

["texto","tiempo","imagen","audio","video","doc"].forEach(tab => {
  const el = document.getElementById("tab_" + tab);
  if (el) el.style.display = "none";
});

document.querySelectorAll(".tab").forEach(t => {
  t.classList.remove("active");
});

["textoMsg","tiempoMsg","imagenMsg","audioMsg","videoMsg","docMsg","descImagen","descVideo"].forEach(id => {
  const campo = document.getElementById(id);
  if (campo) campo.value = "";
});
  }

  if(tipo === "imagen"){
    const file = document.getElementById("imagenMsg").files[0];
    const desc = document.getElementById("descImagen").value || "";

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

document.getElementById("tab_imagen").style.display = "none";

document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));

renderContenidoBloques();
actualizarPreviewContenido();
    });
  }

  if(tipo === "audio"){
    const file = document.getElementById("audioMsg").files[0];

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
  }

  if(tipo === "video"){
    const file = document.getElementById("videoMsg").files[0];
    const desc = document.getElementById("descVideo").value || "";

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
  }

  if(tipo === "doc"){
    const url = document.getElementById("docMsg").value.trim();

    if(!url){
      alert("Pega la URL del documento");
      return;
    }

    contenidoArmado.push({
      tipo: "doc",
      valor: url
    });

    document.getElementById("docMsg").value = "";

    renderContenidoBloques();
    actualizarPreviewContenido();
  }
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
  titulo = "TEXTO";
  campo = '<textarea oninput="actualizarContenidoItem(' + index + ', this.value)">' + item.valor + '</textarea>';
}

    if(item.tipo === "tiempo"){
      icono = "⏳";
      campo = '<input type="number" value="' + item.valor + '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
    }

    if(item.tipo === "imagen"){
      icono = "🖼️";
      campo =
        '<img src="' + item.valor + '" style="width:180px;max-width:100%;border-radius:10px;display:block;margin:auto;">' +
        '<textarea placeholder="Descripción" oninput="actualizarDescripcionItem(' + index + ', this.value)">' + (item.descripcion || "") + '</textarea>';
    }

    if(item.tipo === "audio"){
      icono = "🎧";
      campo = '<input value="' + item.valor + '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
    }

    if(item.tipo === "video"){
      icono = "🎥";
      campo =
        '<input value="' + item.valor + '" oninput="actualizarContenidoItem(' + index + ', this.value)">' +
        '<textarea placeholder="Descripción" oninput="actualizarDescripcionItem(' + index + ', this.value)">' + (item.descripcion || "") + '</textarea>';
    }

    if(item.tipo === "doc"){
      icono = "📄";
      campo = '<input value="' + item.valor + '" oninput="actualizarContenidoItem(' + index + ', this.value)">';
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
  contenidoArmado[index].valor = valor;
  actualizarPreviewContenido();
}

function actualizarDescripcionItem(index, valor){
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
      box.innerHTML += '<div class="bubble">' + item.valor + '<small>ahora</small></div>';
    }

    if(item.tipo === "tiempo"){
      box.innerHTML += '<div class="file-preview">⏳ Pausa ' + item.valor + ' segundos</div>';
    }

    if(item.tipo === "imagen"){
      box.innerHTML +=
        '<div class="bubble">' +
          '<img src="' + item.valor + '" style="width:220px;max-width:100%;border-radius:10px;display:block;margin:auto;">' +
          '<br>' + (item.descripcion || "") +
          '<small>ahora</small>' +
        '</div>';
    }

    if(item.tipo === "audio"){
      box.innerHTML += '<div class="bubble">🎧 Audio<small>ahora</small></div>';
    }

    if(item.tipo === "video"){
      box.innerHTML += '<div class="bubble">🎥 Video<br>' + (item.descripcion || "") + '<small>ahora</small></div>';
    }

    if(item.tipo === "doc"){
      box.innerHTML += '<div class="bubble">📄 Documento<small>ahora</small></div>';
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

  const variantesValidas = variantesContenido.filter(v => Array.isArray(v) && v.length > 0);

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

  let htmlContenido = "";

  const jsonVariantes = JSON.stringify(variantesValidas)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  htmlContenido += '<textarea class="contenido-variantes-data" style="display:none;">' + jsonVariantes + '</textarea>';

  htmlContenido += '<p>🔀 Variantes: ' + variantesValidas.length + '</p>';

  variantesValidas.forEach((variante, index) => {
    htmlContenido += '<p><strong>Variante ' + (index + 1) + '</strong></p>';

    variante.forEach(item => {
      if (item.tipo === "imagen" || item.tipo === "video") {
        htmlContenido += "<p>" + item.tipo + ": " + item.valor + "||" + (item.descripcion || "") + "</p>";
      } else {
        htmlContenido += "<p>" + item.tipo + ": " + item.valor + "</p>";
      }
    });
  });

  nodo.innerHTML =
    '<div class="port in" data-nodo="' + nodo.id + '" onmousedown="iniciarConexion(event, \\'' + nodo.id + '\\')"></div>' +
    '<button class="edit-node" onclick="editarNodo(\\'' + nodo.id + '\\')">✎</button>' +
    '<button class="delete-node" onclick="borrarNodo(\\'' + nodo.id + '\\')">×</button>' +
    '<h3>💬 Contenido</h3>' +
    '<div class="node-content-scroll">' +
    htmlContenido +
    '</div>' +
    '<div class="port out" data-nodo="' + nodo.id + '" onmousedown="iniciarConexion(event, \\'' + nodo.id + '\\')"></div>';

  canvas.appendChild(nodo);

  hacerMovible(nodo);

  variantesContenido = [[]];
  varianteActual = 0;
  contenidoArmado = variantesContenido[varianteActual];

  document.getElementById("previewBox").innerHTML =
    '<p style="color:#78909c;text-align:center;margin-top:180px;">Agrega contenido para ver la vista previa</p>';

  actualizarContadorVariantes();

  cerrarContenido();
}

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

  if (campo.tagName === "TEXTAREA") {
    campo.innerHTML = campo.value;
  }

  if (campo.tagName === "SELECT") {

    campo.querySelectorAll("option").forEach(op => {

      if (op.value === campo.value) {
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
    nodos: nodos,
    conexiones: conexionesGuardadas
  };

  const res = await fetch("/guardar-flujo-builder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
  id: flujoEditandoId,
  nombre: nombre,
  data: data
})
  });

  const respuesta = await res.text();

if (respuesta.includes("<!DOCTYPE html>") || respuesta.includes("<html")) {
  alert("Tu sesión expiró. Inicia sesión otra vez y vuelve a guardar.");
  window.location.href = "/login";
  return;
}

alert(respuesta);
}

const btnGuardarFlujo = document.getElementById("btnGuardarFlujo");

if(btnGuardarFlujo){
  btnGuardarFlujo.addEventListener("click", guardarFlujo);
}
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
const activadoresData = ${JSON.stringify(activadores)};
const etiquetasData = ${JSON.stringify(etiquetas)};

function toggleMenuActivador(id){
  document.querySelectorAll(".menu-flujo").forEach(menu => {
    if(menu.id !== "menu_act_" + id){
      menu.style.display = "none";
    }
  });

  const menu = document.getElementById("menu_act_" + id);
  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function abrirModalActivador(id = ""){
  const modal = document.getElementById("modalActivador");

  document.getElementById("activadorId").value = "";
  document.getElementById("activadorNombre").value = "";
  document.getElementById("activadorFrase").value = "";
  document.getElementById("activadorConexion").value = "API en la nube - MundoColor";
  document.getElementById("activadorActivo").checked = true;
  document.getElementById("activadorRepetible").checked = true;

  if(id){
    const act = activadoresData.find(a => a.id === id);

    if(act){
      document.getElementById("activadorId").value = act.id;
      document.getElementById("activadorNombre").value = act.nombre;
      document.getElementById("activadorFrase").value = act.frase;
      document.getElementById("activadorConexion").value = act.conexion || "API en la nube - MundoColor";
      document.getElementById("activadorFlujo").value = act.flujo_id || "";
      document.getElementById("activadorActivo").checked = !!act.activo;
      document.getElementById("activadorRepetible").checked = !!act.repetible;
    }
  }

  modal.style.display = "flex";
modal.classList.add("activo");
}

function cerrarModalActivador(){
  const modal = document.getElementById("modalActivador");

  if(modal){
    modal.style.display = "none";
    modal.classList.remove("activo");
  }
}
window.addEventListener("load", function(){
  document.getElementById("modalContenido")?.classList.remove("activo");
  document.getElementById("modalActivador")?.classList.remove("activo");
});

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

</script>

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

</body>
</html>

`;
}

module.exports = {
  renderAdminPage
};