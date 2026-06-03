const express = require("express");
const router = express.Router();

const axios = require("axios");
const bcrypt = require("bcryptjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

router.get("/login", (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iniciar sesión · MacBot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%;margin:0}
body.mb-login{
  font-family:"Inter",system-ui,-apple-system,sans-serif;
  background:#070b12;
  color:#f8fafc;
  overflow-x:hidden;
  animation:mb-login-fade-in .55s ease-out both;
}
.mb-login__bg{
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:0;
  background:
    radial-gradient(ellipse 70% 50% at 15% 40%, rgba(57,255,20,.07), transparent 55%),
    radial-gradient(ellipse 50% 40% at 85% 70%, rgba(34,211,238,.05), transparent 50%),
    #070b12;
}
.mb-login__bg-grid{
  position:absolute;
  inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size:48px 48px;
  mask-image:radial-gradient(ellipse 80% 70% at 50% 50%, #000 20%, transparent 75%);
  opacity:.55;
}
.mb-login__shell{
  position:relative;
  z-index:1;
  min-height:100vh;
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
}
@media (max-width:900px){
  .mb-login__shell{grid-template-columns:1fr}
}
.mb-login__brand{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:48px 40px;
  position:relative;
}
@media (max-width:900px){
  .mb-login__brand{
    padding:40px 24px 16px;
    min-height:auto;
  }
}
.mb-login__brand-panel{
  width:100%;
  max-width:440px;
  padding:40px 36px;
  border-radius:24px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.55);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  box-shadow:
    0 0 0 1px rgba(57,255,20,.04) inset,
    0 24px 48px rgba(0,0,0,.35);
  position:relative;
  overflow:hidden;
  animation:mb-login-glow 8s ease-in-out infinite;
}
.mb-login__brand-panel::before{
  content:"";
  position:absolute;
  top:-40%;
  left:-20%;
  width:60%;
  height:80%;
  background:radial-gradient(circle, rgba(57,255,20,.12), transparent 65%);
  pointer-events:none;
}
.mb-login__brand-panel::after{
  content:"";
  position:absolute;
  bottom:-30%;
  right:-10%;
  width:50%;
  height:60%;
  background:radial-gradient(circle, rgba(34,211,238,.08), transparent 65%);
  pointer-events:none;
}
.mb-login__brand-inner{position:relative;z-index:1}
.mb-login__logo{
  font-size:2rem;
  font-weight:700;
  letter-spacing:-.03em;
  margin:0 0 8px;
  color:#f8fafc;
}
.mb-login__logo-accent{color:#39ff14;text-shadow:0 0 24px rgba(57,255,20,.35)}
.mb-login__tagline{
  margin:0 0 28px;
  font-size:.875rem;
  color:#94a3b8;
  line-height:1.5;
}
.mb-login__benefits{
  list-style:none;
  margin:0 0 24px;
  padding:0;
  display:flex;
  flex-direction:column;
  gap:12px;
}
.mb-login__benefit{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:.875rem;
  color:#cbd5e1;
}
.mb-login__benefit-icon{
  flex-shrink:0;
  width:20px;
  height:20px;
  border-radius:6px;
  background:rgba(57,255,20,.12);
  color:#39ff14;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:.7rem;
  font-weight:700;
}
.mb-login__footer-text{
  margin:0;
  font-size:.8125rem;
  color:#64748b;
  line-height:1.55;
  font-style:italic;
}
.mb-login__panel{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:48px 40px;
}
@media (max-width:900px){
  .mb-login__panel{padding:24px 20px 48px}
}
.mb-login__card{
  width:100%;
  max-width:420px;
  padding:40px 36px;
  border-radius:20px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.88);
  box-shadow:0 20px 50px rgba(0,0,0,.4);
  animation:mb-login-fade-in .65s ease-out .1s both;
}
.mb-login__title{
  margin:0 0 6px;
  font-size:1.75rem;
  font-weight:700;
  letter-spacing:-.03em;
  color:#f8fafc;
}
.mb-login__subtitle{
  margin:0 0 28px;
  font-size:.9375rem;
  color:#94a3b8;
}
.mb-login__google{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding:13px 18px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.04);
  color:#f8fafc;
  font-size:.9375rem;
  font-weight:500;
  font-family:inherit;
  cursor:pointer;
  transition:border-color .2s, background .2s, box-shadow .2s, transform .15s;
}
.mb-login__google:hover{
  border-color:rgba(255,255,255,.2);
  background:rgba(255,255,255,.07);
  box-shadow:0 0 20px rgba(34,211,238,.08);
}
.mb-login__google:active{transform:scale(.99)}
.mb-login__google svg{flex-shrink:0}
.mb-login__divider{
  display:flex;
  align-items:center;
  gap:14px;
  margin:24px 0;
  color:#64748b;
  font-size:.75rem;
  letter-spacing:.02em;
}
.mb-login__divider::before,
.mb-login__divider::after{
  content:"";
  flex:1;
  height:1px;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent);
}
.mb-login__form{display:flex;flex-direction:column;gap:18px}
.mb-login__field{display:flex;flex-direction:column;gap:8px}
.mb-login__label{
  font-size:.8125rem;
  font-weight:500;
  color:#94a3b8;
}
.mb-login__input-wrap{
  position:relative;
  display:flex;
  align-items:center;
}
.mb-login__input-icon{
  position:absolute;
  left:14px;
  width:18px;
  height:18px;
  color:#64748b;
  pointer-events:none;
  transition:color .2s;
}
.mb-login__input{
  width:100%;
  padding:13px 14px 13px 44px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(7,11,18,.65);
  color:#f8fafc;
  font-size:.9375rem;
  font-family:inherit;
  outline:none;
  transition:border-color .2s, box-shadow .2s, background .2s;
}
.mb-login__input::placeholder{color:#475569}
.mb-login__input:focus{
  border-color:rgba(57,255,20,.45);
  box-shadow:0 0 0 3px rgba(57,255,20,.12);
  background:rgba(7,11,18,.85);
}
.mb-login__input-wrap:focus-within .mb-login__input-icon{color:#39ff14}
.mb-login__input--password{padding-right:48px}
.mb-login__toggle-pwd{
  position:absolute;
  right:10px;
  width:36px;
  height:36px;
  border:none;
  border-radius:8px;
  background:transparent;
  color:#64748b;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0;
  transition:color .2s, background .2s;
}
.mb-login__toggle-pwd:hover{
  color:#94a3b8;
  background:rgba(255,255,255,.05);
}
.mb-login__row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
}
.mb-login__remember{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:.8125rem;
  color:#94a3b8;
  cursor:pointer;
  user-select:none;
}
.mb-login__remember input{
  width:16px;
  height:16px;
  accent-color:#39ff14;
  cursor:pointer;
}
.mb-login__forgot{
  font-size:.8125rem;
  color:#22d3ee;
  text-decoration:none;
  transition:color .2s, text-shadow .2s;
}
.mb-login__forgot:hover{
  color:#67e8f9;
  text-shadow:0 0 12px rgba(34,211,238,.25);
}
.mb-login__submit{
  width:100%;
  margin-top:4px;
  padding:14px 18px;
  border:none;
  border-radius:12px;
  background:linear-gradient(135deg, #39ff14 0%, #2dd40f 100%);
  color:#070b12;
  font-size:1rem;
  font-weight:600;
  font-family:inherit;
  cursor:pointer;
  transition:transform .15s, box-shadow .25s, filter .2s;
  box-shadow:0 0 24px rgba(57,255,20,.2);
}
.mb-login__submit:hover:not(:disabled){
  box-shadow:0 0 32px rgba(57,255,20,.35);
  filter:brightness(1.05);
  transform:translateY(-1px);
}
.mb-login__submit:active:not(:disabled){transform:translateY(0)}
.mb-login__submit:disabled{
  opacity:.85;
  cursor:wait;
  box-shadow:0 0 16px rgba(57,255,20,.15);
}
.mb-login__secure{
  margin:22px 0 0;
  text-align:center;
  font-size:.75rem;
  color:#64748b;
  letter-spacing:.01em;
}
@keyframes mb-login-fade-in{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes mb-login-glow{
  0%,100%{box-shadow:0 0 0 1px rgba(57,255,20,.04) inset, 0 24px 48px rgba(0,0,0,.35)}
  50%{box-shadow:0 0 0 1px rgba(57,255,20,.08) inset, 0 24px 48px rgba(0,0,0,.35), 0 0 40px rgba(57,255,20,.06)}
}
</style>
</head>
<body class="mb-login">

<div class="mb-login__bg" aria-hidden="true">
  <div class="mb-login__bg-grid"></div>
</div>

<div class="mb-login__shell">
  <aside class="mb-login__brand">
    <div class="mb-login__brand-panel">
      <div class="mb-login__brand-inner">
        <h1 class="mb-login__logo"><span class="mb-login__logo-accent">⚡</span> MacBot</h1>
        <p class="mb-login__tagline">Automatización inteligente para WhatsApp</p>
        <ul class="mb-login__benefits">
          <li class="mb-login__benefit"><span class="mb-login__benefit-icon">✔</span> Flujos inteligentes</li>
          <li class="mb-login__benefit"><span class="mb-login__benefit-icon">✔</span> IA conversacional</li>
          <li class="mb-login__benefit"><span class="mb-login__benefit-icon">✔</span> Remarketing 24h</li>
          <li class="mb-login__benefit"><span class="mb-login__benefit-icon">✔</span> Seguimiento CRM</li>
          <li class="mb-login__benefit"><span class="mb-login__benefit-icon">✔</span> Conversiones automáticas</li>
        </ul>
        <p class="mb-login__footer-text">Tu centro de automatización para ventas y atención en WhatsApp.</p>
      </div>
    </div>
  </aside>

  <section class="mb-login__panel">
    <div class="mb-login__card">
      <h2 class="mb-login__title">Iniciar sesión</h2>
      <p class="mb-login__subtitle">Accede a tu panel MacBot</p>

      <button type="button" class="mb-login__google" aria-label="Continuar con Google (próximamente)">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continuar con Google
      </button>

      <div class="mb-login__divider" role="separator">o</div>

      <form class="mb-login__form" method="POST" action="/login">
        <div class="mb-login__field">
          <label class="mb-login__label" for="email">Correo electrónico</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>
            </svg>
            <input class="mb-login__input" id="email" name="email" type="email" placeholder="tu@empresa.com" required autocomplete="email">
          </div>
        </div>

        <div class="mb-login__field">
          <label class="mb-login__label" for="password">Contraseña</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>
            </svg>
            <input class="mb-login__input mb-login__input--password" id="password" name="password" type="password" placeholder="••••••••••" required autocomplete="current-password">
            <button type="button" class="mb-login__toggle-pwd" aria-label="Mostrar contraseña" data-toggle-password>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-login__eye-open" aria-hidden="true">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-login__eye-closed" style="display:none" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="mb-login__row">
          <label class="mb-login__remember">
            <input type="checkbox" tabindex="-1">
            Recordarme en este dispositivo
          </label>
          <a href="#" class="mb-login__forgot" onclick="return false">¿Olvidaste tu contraseña?</a>
        </div>

        <button type="submit" class="mb-login__submit">Entrar a MacBot</button>
      </form>

      <p class="mb-login__secure">🔒 Acceso seguro · Sesión protegida</p>
    </div>
  </section>
</div>

<script>
(function(){
  var pwd=document.getElementById("password");
  var btn=document.querySelector("[data-toggle-password]");
  if(btn&&pwd){
    btn.addEventListener("click",function(){
      var show=pwd.type==="password";
      pwd.type=show?"text":"password";
      btn.setAttribute("aria-label",show?"Ocultar contraseña":"Mostrar contraseña");
      var o=btn.querySelector(".mb-login__eye-open");
      var c=btn.querySelector(".mb-login__eye-closed");
      if(o)o.style.display=show?"none":"block";
      if(c)c.style.display=show?"block":"none";
    });
  }
  var form=document.querySelector(".mb-login__form");
  if(form){
    form.addEventListener("submit",function(){
      var sub=form.querySelector(".mb-login__submit");
      if(sub&&!sub.disabled){
        sub.disabled=true;
        sub.textContent="Verificando...";
      }
    });
  }
  var googleBtn=document.querySelector(".mb-login__google");
  if(googleBtn){
    googleBtn.addEventListener("click",function(e){
      e.preventDefault();
    });
  }
})();
</script>

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

    res.redirect("/");

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