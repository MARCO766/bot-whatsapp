require("dotenv").config();
const express = require('express');
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

const app = express();

app.set("view engine", "ejs");
app.set("views", "views");

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "macbot-secreto-cambiar",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(authRoutes);
app.use(webhookRoutes);
app.use(adminRoutes);
app.use("/", inboxRoutes);
app.use("/", builderRoutes);
app.use(flowsRoutes);




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
  console.log("🚀 Servidor corriendo en puerto", PORT);
});