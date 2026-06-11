function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const { renderFaviconLink, renderMacBotLogoFull } = require("./brandLogo");

const AUTH_STYLES = `
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
.mb-login__logo-img{
  display:block;
  width:min(220px,92%);
  height:auto;
  margin:0 0 14px;
}
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
.mb-login__message{
  margin:0 0 20px;
  padding:12px 14px;
  border-radius:10px;
  font-size:.875rem;
  line-height:1.45;
}
.mb-login__message--success{
  background:rgba(57,255,20,.1);
  border:1px solid rgba(57,255,20,.25);
  color:#bbf7d0;
}
.mb-login__message--info{
  background:rgba(34,211,238,.08);
  border:1px solid rgba(34,211,238,.2);
  color:#a5f3fc;
}
.mb-login__message--error{
  background:rgba(248,113,113,.1);
  border:1px solid rgba(248,113,113,.25);
  color:#fecaca;
}
.mb-login__back{
  display:inline-block;
  margin-top:18px;
  font-size:.8125rem;
  color:#22d3ee;
  text-decoration:none;
}
.mb-login__back:hover{color:#67e8f9}
@keyframes mb-login-fade-in{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes mb-login-glow{
  0%,100%{box-shadow:0 0 0 1px rgba(57,255,20,.04) inset, 0 24px 48px rgba(0,0,0,.35)}
  50%{box-shadow:0 0 0 1px rgba(57,255,20,.08) inset, 0 24px 48px rgba(0,0,0,.35), 0 0 40px rgba(57,255,20,.06)}
}
`;

const AUTH_BRAND = `
<aside class="mb-login__brand">
  <div class="mb-login__brand-panel">
    <div class="mb-login__brand-inner">
      ${renderMacBotLogoFull({ className: "mb-login__logo-img", width: 220 })}
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
`;

function renderAuthPage({ documentTitle, cardTitle, cardSubtitle, cardBody, scripts = "" }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
${renderFaviconLink()}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${AUTH_STYLES}</style>
</head>
<body class="mb-login">

<div class="mb-login__bg" aria-hidden="true">
  <div class="mb-login__bg-grid"></div>
</div>

<div class="mb-login__shell">
  ${AUTH_BRAND}
  <section class="mb-login__panel">
    <div class="mb-login__card">
      <h2 class="mb-login__title">${escapeHtml(cardTitle)}</h2>
      <p class="mb-login__subtitle">${escapeHtml(cardSubtitle)}</p>
      ${cardBody}
    </div>
  </section>
</div>

${scripts}

</body>
</html>`;
}

const PASSWORD_TOGGLE_SCRIPT = `
<script>
(function(){
  var btn=document.querySelector("[data-toggle-password]");
  var pwd=document.getElementById("password");
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
})();
</script>
`;

module.exports = {
  escapeHtml,
  renderAuthPage,
  PASSWORD_TOGGLE_SCRIPT,
};
