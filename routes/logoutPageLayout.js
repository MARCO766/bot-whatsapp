const { escapeHtml } = require("./authPageLayout");
const { renderFaviconLink, BRAND_ICON } = require("./brandLogo");

const LOGOUT_STYLES = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%;margin:0}
body.mb-logout{
  font-family:"Inter",system-ui,-apple-system,sans-serif;
  background:#050816;
  color:#f8fafc;
  overflow:hidden;
  animation:mb-logout-fade .5s ease-out both;
}
.mb-logout__bg{
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 20%, rgba(34,211,238,.10), transparent 55%),
    radial-gradient(ellipse 50% 45% at 80% 80%, rgba(239,68,68,.08), transparent 50%),
    radial-gradient(ellipse 40% 35% at 50% 50%, rgba(57,255,20,.05), transparent 60%),
    #050816;
}
.mb-logout__grid{
  position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size:42px 42px;
  mask-image:radial-gradient(ellipse 80% 70% at 50% 50%, #000 20%, transparent 75%);
  opacity:.55;
}
.mb-logout__shell{
  position:relative;z-index:1;
  min-height:100vh;
  display:flex;align-items:center;justify-content:center;
  padding:24px 16px;
}
.mb-logout__card{
  width:100%;max-width:420px;
  padding:40px 32px 32px;
  border-radius:28px;
  border:1px solid rgba(239,68,68,.22);
  background:
    linear-gradient(145deg, rgba(14,27,38,.92), rgba(5,13,20,.94));
  backdrop-filter:blur(22px);
  -webkit-backdrop-filter:blur(22px);
  box-shadow:
    0 30px 90px rgba(0,0,0,.55),
    0 0 0 1px rgba(34,211,238,.08) inset,
    0 0 48px rgba(239,68,68,.06);
  text-align:center;
  animation:mb-logout-card .55s cubic-bezier(.22,1,.36,1) both;
}
.mb-logout__logo{
  display:inline-flex;align-items:center;justify-content:center;
  width:64px;height:64px;border-radius:20px;margin:0 auto 20px;
  background:linear-gradient(135deg, #22c55e, #06b6d4, #a855f7);
  font-size:28px;font-weight:1000;color:#fff;
  box-shadow:0 0 32px rgba(34,211,238,.25);
  position:relative;
}
.mb-logout__logo-glow{
  position:absolute;inset:-8px;border-radius:24px;
  background:linear-gradient(135deg, #22c55e, #06b6d4, #a855f7);
  filter:blur(12px);opacity:.45;
  animation:mb-logout-glow 2.8s ease-in-out infinite;
}
.mb-logout__logo img{position:relative;z-index:1;width:40px;height:40px;display:block}
.mb-logout__brand{
  margin:0 0 28px;font-size:1.35rem;font-weight:700;letter-spacing:-.03em;
}
.mb-logout__brand-accent{color:#39ff14;text-shadow:0 0 20px rgba(57,255,20,.35)}
.mb-logout__icon-wrap{
  width:88px;height:88px;margin:0 auto 24px;position:relative;
}
.mb-logout__ring{
  position:absolute;inset:0;border-radius:50%;
  border:2px solid rgba(34,211,238,.25);
  animation:mb-logout-ring 2s ease-out forwards;
}
.mb-logout__ring--2{
  inset:-8px;border-color:rgba(239,68,68,.15);
  animation-delay:.15s;
}
.mb-logout__power{
  position:absolute;inset:12px;border-radius:50%;
  background:linear-gradient(145deg, rgba(34,197,94,.18), rgba(6,182,212,.12));
  border:1px solid rgba(34,211,238,.3);
  display:flex;align-items:center;justify-content:center;
  animation:mb-logout-power .6s cubic-bezier(.22,1,.36,1) .2s both;
}
.mb-logout__check{
  width:36px;height:36px;
  stroke:#22c55e;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:48;stroke-dashoffset:48;
  animation:mb-logout-check .55s ease .55s forwards;
  filter:drop-shadow(0 0 8px rgba(34,197,94,.6));
}
.mb-logout__title{
  margin:0 0 10px;font-size:1.35rem;font-weight:700;color:#f1f5f9;
}
.mb-logout__subtitle{
  margin:0 0 6px;font-size:.95rem;color:#94a3b8;line-height:1.5;
}
.mb-logout__redirect{
  margin:0 0 24px;font-size:.82rem;color:#64748b;
}
.mb-logout__progress{
  height:4px;border-radius:99px;overflow:hidden;
  background:rgba(255,255,255,.08);margin-bottom:24px;
}
.mb-logout__progress-bar{
  height:100%;width:0;border-radius:inherit;
  background:linear-gradient(90deg, #ef4444, #06b6d4, #22c55e);
  box-shadow:0 0 12px rgba(6,182,212,.4);
  animation:mb-logout-progress 2s linear forwards;
}
.mb-logout__btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  width:100%;padding:14px 20px;border-radius:16px;
  border:1px solid rgba(34,211,238,.35);
  background:rgba(255,255,255,.06);
  color:#e2e8f0;font-size:.95rem;font-weight:600;font-family:inherit;
  text-decoration:none;cursor:pointer;
  transition:background .2s, border-color .2s, box-shadow .2s, transform .2s;
}
.mb-logout__btn:hover{
  background:rgba(239,68,68,.12);
  border-color:rgba(239,68,68,.45);
  box-shadow:0 0 28px rgba(239,68,68,.18);
  transform:translateY(-1px);
  color:#fff;
}
@keyframes mb-logout-fade{
  from{opacity:0}to{opacity:1}
}
@keyframes mb-logout-card{
  from{opacity:0;transform:translateY(20px) scale(.97)}
  to{opacity:1;transform:none}
}
@keyframes mb-logout-glow{
  0%,100%{opacity:.35;transform:scale(1)}
  50%{opacity:.65;transform:scale(1.05)}
}
@keyframes mb-logout-ring{
  from{transform:scale(.6);opacity:0}
  to{transform:scale(1);opacity:1}
}
@keyframes mb-logout-power{
  from{transform:scale(.5);opacity:0}
  to{transform:scale(1);opacity:1}
}
@keyframes mb-logout-check{
  to{stroke-dashoffset:0}
}
@keyframes mb-logout-progress{
  from{width:0}
  to{width:100%}
}
@media(max-width:480px){
  .mb-logout__card{padding:32px 22px 26px;border-radius:22px}
  .mb-logout__title{font-size:1.2rem}
}
@media(prefers-reduced-motion:reduce){
  .mb-logout__progress-bar{animation-duration:.01ms;width:100%}
  .mb-logout__check{stroke-dashoffset:0;animation:none}
  .mb-logout__ring,.mb-logout__power,.mb-logout__logo-glow{animation:none}
}
`;

const LOGOUT_SCRIPT = `
<script>
(function(){
  var delay=2000;
  setTimeout(function(){window.location.href="/login";},delay);
})();
</script>
`;

function renderLogoutPage() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sesión cerrada · MacBot CRM</title>
${renderFaviconLink()}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${LOGOUT_STYLES}</style>
</head>
<body class="mb-logout">

<div class="mb-logout__bg" aria-hidden="true">
  <div class="mb-logout__grid"></div>
</div>

<div class="mb-logout__shell">
  <div class="mb-logout__card" role="status" aria-live="polite">
    <div class="mb-logout__logo" aria-hidden="true">
      <div class="mb-logout__logo-glow"></div>
      <img src="${BRAND_ICON}" width="40" height="40" alt="">
    </div>
    <p class="mb-logout__brand"><span class="mb-logout__brand-accent">Mac</span>Bot CRM</p>

    <div class="mb-logout__icon-wrap" aria-hidden="true">
      <div class="mb-logout__ring"></div>
      <div class="mb-logout__ring mb-logout__ring--2"></div>
      <div class="mb-logout__power">
        <svg class="mb-logout__check" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 13l4 4L19 7"/>
        </svg>
      </div>
    </div>

    <h1 class="mb-logout__title">${escapeHtml("Sesión cerrada correctamente")}</h1>
    <p class="mb-logout__subtitle">${escapeHtml("Gracias por usar MacBot CRM")}</p>
    <p class="mb-logout__redirect">${escapeHtml("Redirigiendo al inicio de sesión...")}</p>

    <div class="mb-logout__progress" aria-hidden="true">
      <div class="mb-logout__progress-bar"></div>
    </div>

    <a href="/login" class="mb-logout__btn">${escapeHtml("Volver al login")}</a>
  </div>
</div>

${LOGOUT_SCRIPT}

</body>
</html>`;
}

module.exports = { renderLogoutPage };
