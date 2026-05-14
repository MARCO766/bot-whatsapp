const express = require("express");
const router = express.Router();

const axios = require("axios");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

router.use(session({
  secret: process.env.SESSION_SECRET || "macbot-secreto-cambiar",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

router.get("/login", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Login MacBot</title>
<style>
body{
  margin:0;
  background:#0f1117;
  color:white;
  font-family:Arial,sans-serif;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.login-box{
  width:380px;
  background:#1b2029;
  padding:35px;
  border-radius:22px;
  border:1px solid #2a3140;
}
h1{
  color:#39ff14;
  margin-bottom:25px;
}
input{
  width:100%;
  background:#0f1117;
  border:2px solid #333;
  padding:15px;
  border-radius:14px;
  color:white;
  margin-bottom:15px;
  font-size:16px;
}
button{
  width:100%;
  background:#39ff14;
  color:black;
  border:none;
  padding:15px;
  border-radius:14px;
  font-size:17px;
  font-weight:bold;
  cursor:pointer;
}

.follow-node{
  padding:0 !important;
  border:2px solid #ff6d00 !important;
  background:#fff7e6 !important;
  color:#1f2937 !important;
  overflow:visible !important;
}

.follow-header{
  background:linear-gradient(135deg,#ff7a00,#ff5a00);
  color:white;
  padding:16px 18px;
  border-radius:20px 20px 0 0;
  font-size:20px;
  font-weight:bold;
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.follow-body{
  padding:18px;
  color:#374151;
}

.follow-title{
  font-size:15px;
  margin-bottom:10px;
  color:#374151;
}

.follow-item{
  background:#fffbea;
  border:2px solid #ffc83d;
  border-radius:8px;
  padding:9px 12px;
  margin-bottom:8px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  font-size:14px;
  color:#9a3412;
}

.follow-badge{
  background:#ffc83d;
  color:#7c2d12;
  padding:2px 7px;
  border-radius:6px;
  font-weight:bold;
  font-size:12px;
}

.follow-actions{
  display:flex;
  gap:8px;
  align-items:center;
}

.follow-actions button{
  background:rgba(255,255,255,.2);
  color:white;
  border:none;
  cursor:pointer;
  font-size:16px;
  width:28px;
  height:28px;
  border-radius:6px;
  position:relative;
  z-index:999;
}

.content-blocks{
  display:flex;
  flex-direction:column;
  gap:10px;
  margin-bottom:18px;
}

.content-card{
  border:2px solid #333;
  border-radius:12px;
  padding:12px;
  background:#111;
}

.content-card.texto{border-color:#4f7cff;}
.content-card.tiempo{border-color:#ffb000;}
.content-card.imagen{border-color:#00c896;}
.content-card.audio{border-color:#8b5cf6;}
.content-card.video{border-color:#ff4d4d;}
.content-card.doc{border-color:#ff8a00;}

.content-card-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:10px;
  font-weight:bold;
}

.content-tools button{
  width:auto;
  padding:4px 8px;
  margin-left:4px;
  border-radius:6px;
  background:#222;
  color:white;
  border:1px solid #444;
  cursor:pointer;
}

.content-tools button:hover{
  background:#333;
}

.content-card textarea,
.content-card input{
  width:100%;
  margin-top:6px;
}

.content-card img{
  max-width:120px;
  border-radius:10px;
  display:block;
  margin-bottom:8px;
}

</style>
</head>
<body>

<div class="login-box">
  <h1>⚡ MacBot</h1>

  <form method="POST" action="/login">
    <input name="email" type="email" placeholder="Correo" required>
    <input name="password" type="password" placeholder="Contraseña" required>
    <button type="submit">Iniciar sesión</button>
  </form>
</div>

</body>
</html>
  `);
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?email=eq.${encodeURIComponent(email)}&activo=eq.true&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const usuario = response.data?.[0];

    if (!usuario) {
      return res.send("Usuario no encontrado o inactivo");
    }

    const passwordCorrecto = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordCorrecto) {
      return res.send("Contraseña incorrecta");
    }

    req.session.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email
    };

    res.redirect("/admin?tab=inicio");

  } catch (error) {
    console.log("ERROR LOGIN:", error.response?.data || error.message);
    res.send("Error iniciando sesión");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;