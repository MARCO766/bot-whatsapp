console.log("🔥 SERVER NUEVO ACTIVO");
require("dotenv").config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { enviarTextoWhatsApp, enviarMediaWhatsApp } = require("./services/whatsappService");
const { enviarEventoMeta } = require("./services/metaService");
const { esperarSegundos } = require("./utils/timers");
const { buscarYEjecutarActivador } = require("./services/flowService");
const authRoutes = require("./routes/auth");
const webhookRoutes = require("./routes/webhook");
const adminRoutes = require("./routes/admin");
const { protegerPanel } = require("./middlewares/auth");
const inboxRoutes = require("./routes/inbox");
const builderRoutes = require("./routes/builder");
const flowsRoutes = require("./routes/flows");
const flujosApiRoutes = require("./routes/flujosApi");
const inboxApiRoutes = require("./routes/inboxApi");
const metricasApiRoutes = require("./routes/metricasApi");
const activadoresApiRoutes = require("./routes/activadoresApi");
const panelApiRoutes = require("./routes/panelApi");
const ajustesApiRoutes = require("./routes/ajustesApi");
const etiquetasApiRoutes = require("./routes/etiquetasApi");
const clientesApiRouter = require("./routes/clientesApi");
const aiApiRoutes = require("./routes/aiApi");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

if (isProduction || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.set("view engine", "ejs");
app.set("views", "views");

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.CORS_ORIGIN) {
  const cors = require("cors");
  const origins = process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    "/api",
    cors({
      origin: origins,
      credentials: true,
    })
  );
  console.log("🌐 CORS API habilitado para:", origins.join(", "));
}

app.use(session({
  secret: process.env.SESSION_SECRET || "macbot-secreto-cambiar",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
  },
}));

app.use(authRoutes);
app.use(webhookRoutes);
app.use(adminRoutes);
app.use("/", inboxRoutes);
app.use("/", builderRoutes);
app.use(flowsRoutes);
app.use(flujosApiRoutes);
app.use(inboxApiRoutes);
app.use(metricasApiRoutes);
app.use(activadoresApiRoutes);
app.use(panelApiRoutes);
app.use(ajustesApiRoutes);
app.use(etiquetasApiRoutes);
app.use("/api/clientes", clientesApiRouter);
app.use(aiApiRoutes);
console.log("✅ API Clientes montada en /api/clientes");
console.log("✅ API IA montada en POST /api/ai/run");

// ─── CRM React (frontend/dist) — mismo origen que /api en producción ───
const frontendDist = path.join(__dirname, "frontend", "dist");
const frontendIndex = path.join(frontendDist, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndex);

if (hasFrontendBuild) {
  console.log("✅ Sirviendo CRM React desde", frontendDist);
  app.use(express.static(frontendDist, { index: false }));

  const backendOnlyPrefixes = [
    "/api",
    "/admin",
    "/login",
    "/logout",
    "/inbox",
    "/builder",
    "/webhook",
    "/crear-",
    "/guardar-",
    "/eliminar-",
    "/duplicar-",
    "/exportar-",
    "/editar-",
    "/subir-",
    "/bloquear-",
    "/desbloquear-",
    "/chat-",
    "/debug-",
  ];

  app.get("/{*splat}", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (backendOnlyPrefixes.some((p) => req.path.startsWith(p))) return next();
    if (req.path.includes(".") && !req.path.endsWith(".html")) return next();
    return res.sendFile(frontendIndex);
  });
} else {
  console.log("⚠️ frontend/dist no encontrado — ejecuta: npm run build:frontend");
}


// 🔑 VARIABLES (Railway)
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
app.get("/debug-login", async (req, res) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?select=email,activo`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    res.json({
      error: error.response?.data || error.message
    });
  }
});
app.get("/crear-pass", async (req, res) => {

  const hash = await bcrypt.hash("123456", 10);

  res.send(hash);

});



// 🖥️ PANEL ADMIN PRO - FLUJOS + NODOS FLOTANTES




const PORT = process.env.PORT || 3000;
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.set("io", io);

const { setApp: setRealtimeApp } = require("./services/realtimeService");
setRealtimeApp(app);

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado al inbox:", socket.id);

  socket.on("join-user", (usuarioId) => {
    socket.join("user_" + usuarioId);
    console.log("📡 Usuario unido a sala:", usuarioId);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});

server.listen(PORT, () => {
  const { startSeguimientoWorker } = require("./jobs/seguimientoWorker");
  startSeguimientoWorker(app);
  const { iniciarRemarketingGlobalWorker } = require("./jobs/remarketingGlobalWorker");
  console.log("[RM WORKER] WORKER CARGADO EN SERVER");
  iniciarRemarketingGlobalWorker();
  console.log("🚀 Servidor corriendo en puerto", PORT);
});