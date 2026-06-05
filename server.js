console.log("🔥 SERVER NUEVO ACTIVO");
require("dotenv").config();
require("./services/metaWhatsAppIntercept");
console.log("[ENV_CHECK]", {
  APP_URL: Boolean(process.env.APP_URL),
  SMTP_HOST: Boolean(process.env.SMTP_HOST),
  SMTP_PORT: Boolean(process.env.SMTP_PORT),
  SMTP_USER: Boolean(process.env.SMTP_USER),
  SMTP_PASS: Boolean(process.env.SMTP_PASS),
  SMTP_FROM: Boolean(process.env.SMTP_FROM),
});
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { enviarTextoWhatsApp, enviarMediaWhatsApp } = require("./services/whatsappService");
const { enviarEventoMeta } = require("./services/metaService");
const { esperarSegundos } = require("./utils/timers");
const { buscarYEjecutarActivador } = require("./services/flowService");
const authRoutes = require("./routes/auth");
const webhookRoutes = require("./routes/webhook");
const adminRoutes = require("./routes/admin");
const adminUsuariosApiRoutes = require("./routes/adminUsuariosApi");
const { warnIfMissingSessionSecret } = require("./middlewares/auth");
const { warnIfMissingPasswordResetEnv } = require("./services/emailService");
const inboxRoutes = require("./routes/inbox");
const builderRoutes = require("./routes/builder");
const flowsRoutes = require("./routes/flows");
const flujosApiRoutes = require("./routes/flujosApi");
const flujosCarpetasApiRoutes = require("./routes/flujosCarpetasApi");
const inboxApiRoutes = require("./routes/inboxApi");
const metricasApiRoutes = require("./routes/metricasApi");
const metaAdsApiRoutes = require("./routes/metaAdsApi");
const activadoresApiRoutes = require("./routes/activadoresApi");
const panelApiRoutes = require("./routes/panelApi");
const planesApiRoutes = require("./routes/planesApi");
const onboardingApiRoutes = require("./routes/onboardingApi");
const ajustesApiRoutes = require("./routes/ajustesApi");
const etiquetasApiRoutes = require("./routes/etiquetasApi");
const clientesApiRouter = require("./routes/clientesApi");
const aiApiRoutes = require("./routes/aiApi");
const internalCronApi = require("./routes/internalCronApi");
const seguimientoV2ApiRoutes = require("./routes/seguimientoV2Api");

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

warnIfMissingSessionSecret();
warnIfMissingPasswordResetEnv();

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

app.use(webhookRoutes);
app.use(adminRoutes);
app.use(adminUsuariosApiRoutes);
console.log("✅ Panel admin: GET /admin + /api/admin/usuarios + /api/admin/logs (ADMIN_EMAILS)");
app.use("/", inboxRoutes);
app.use("/", builderRoutes);
app.use(flowsRoutes);
app.use(flujosApiRoutes);
app.use(flujosCarpetasApiRoutes);
app.use(inboxApiRoutes);
app.use(metricasApiRoutes);
app.use(metaAdsApiRoutes);
app.use(activadoresApiRoutes);
app.use(panelApiRoutes);
app.use(planesApiRoutes);
app.use(onboardingApiRoutes);
app.use(ajustesApiRoutes);
app.use(etiquetasApiRoutes);
app.use("/api/clientes", clientesApiRouter);
app.use(aiApiRoutes);
app.use("/api/internal/cron", internalCronApi);
app.use(seguimientoV2ApiRoutes);
const legacySeguimientoCronDisabled = require("./routes/legacySeguimientoCronDisabled");
app.use(legacySeguimientoCronDisabled);
console.log("✅ API Planes montada en GET /api/planes/mi-plan");
console.log("✅ API Onboarding montada en GET /api/onboarding/estado y POST /api/onboarding/bienvenida");
console.log("✅ API Clientes montada en /api/clientes");
console.log("✅ API IA montada en POST /api/ai/run");
console.log("✅ Cron interno montado en POST /api/internal/cron/rm24h (seguimientos HTTP deshabilitado)");
console.log("✅ API Seguimiento V2 montada en POST /api/seguimiento-v2/upload-media");

/** Rutas de auth backend — deben ir antes del fallback React (Express, no SPA). */
const AUTH_BACKEND_PATHS = new Set([
  "/login",
  "/register",
  "/register/start",
  "/register/verify",
  "/register/resend",
  "/pricing",
  "/logout",
  "/forgot-password",
  "/reset-password",
]);

function normalizePathname(req) {
  const raw = req.originalUrl || req.url || req.path || "/";
  const pathname = String(raw).split("?")[0].split("#")[0];
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function isAuthBackendPath(req) {
  return AUTH_BACKEND_PATHS.has(normalizePathname(req));
}

function isBackendOnlyPath(req) {
  const pathname = normalizePathname(req);
  if (isAuthBackendPath(req)) return true;

  const backendOnlyPrefixes = [
    "/api",
    "/admin",
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
    "/reset-",
    "/forgot-",
  ];

  return backendOnlyPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

// ─── CRM React (frontend/dist) — mismo origen que /api en producción ───
const frontendDist = path.join(__dirname, "frontend", "dist");
const frontendIndex = path.join(frontendDist, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndex);

if (hasFrontendBuild) {
  console.log("✅ Sirviendo CRM React desde", frontendDist);

  // Login / reset password: Express backend (routes/auth.js), nunca index.html del SPA.
  app.use(authRoutes);

  app.use((req, res, next) => {
    if (isBackendOnlyPath(req)) return next();
    return express.static(frontendDist, { index: false })(req, res, next);
  });

  app.get("/{*splat}", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (isBackendOnlyPath(req)) return next();
    if (req.path.includes(".") && !req.path.endsWith(".html")) return next();
    return res.sendFile(frontendIndex);
  });
} else {
  console.log("⚠️ frontend/dist no encontrado — ejecuta: npm run build:frontend");
  app.use(authRoutes);
}


// 🔑 VARIABLES (Railway)
const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

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
  startSeguimientoWorker(app).catch((err) => {
    console.error("[SEGUIMIENTO_WORKER] error al arrancar:", err.message);
  });
  const { startSeguimientoV2Worker } = require("./jobs/seguimientoV2Worker");
  startSeguimientoV2Worker(app).catch((err) => {
    console.error("[SEG_V2_WORKER] error al arrancar:", err.message);
  });
  const { startRemarketing24hWorker } = require("./jobs/remarketing24hWorker");
  startRemarketing24hWorker();
  console.log("🚀 Servidor corriendo en puerto", PORT);
});