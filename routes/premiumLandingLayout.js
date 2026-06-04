const { escapeHtml } = require("./authPageLayout");

const PREMIUM_STYLES = `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
html,body{margin:0}
body.mb-premium{
  font-family:"Inter",system-ui,-apple-system,sans-serif;
  background:#060a10;
  color:#f1f5f9;
  overflow-x:hidden;
  animation:mb-prem-fade .5s ease-out both;
}
.mb-premium__bg{
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 55% 45% at 12% 25%, rgba(57,255,20,.09), transparent 55%),
    radial-gradient(ellipse 45% 40% at 88% 75%, rgba(139,92,246,.07), transparent 50%),
    radial-gradient(ellipse 50% 35% at 70% 15%, rgba(34,211,238,.06), transparent 50%),
    #060a10;
}
.mb-premium__grid{
  position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px);
  background-size:40px 40px;
  mask-image:radial-gradient(ellipse 90% 80% at 50% 30%, #000 15%, transparent 72%);
  opacity:.7;
}
.mb-premium__code{
  position:absolute;font-family:"JetBrains Mono",ui-monospace,monospace;
  font-size:.65rem;color:rgba(57,255,20,.18);white-space:nowrap;
  animation:mb-prem-float 12s ease-in-out infinite;
  user-select:none;
}
.mb-premium__code--1{top:12%;left:4%;animation-delay:0s}
.mb-premium__code--2{top:28%;right:6%;animation-delay:-3s;color:rgba(34,211,238,.15)}
.mb-premium__code--3{bottom:35%;left:8%;animation-delay:-6s}
.mb-premium__code--4{bottom:18%;right:10%;animation-delay:-9s;color:rgba(167,139,250,.14)}
.mb-premium__wrap{position:relative;z-index:1}

/* Navbar */
.mb-premium__nav{
  position:sticky;top:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:14px 24px;
  border-bottom:1px solid rgba(255,255,255,.06);
  background:rgba(6,10,16,.82);
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
}
.mb-premium__nav-links{
  display:flex;align-items:center;gap:8px 20px;flex-wrap:wrap;
}
.mb-premium__nav-link{
  font-size:.875rem;color:#94a3b8;text-decoration:none;
  transition:color .2s;
}
.mb-premium__nav-link:hover{color:#e2e8f0}
.mb-premium__nav-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}
.mb-premium__btn-ghost{
  padding:9px 16px;border-radius:10px;
  border:1px solid rgba(255,255,255,.12);
  background:transparent;color:#e2e8f0;
  font-size:.875rem;font-weight:500;font-family:inherit;
  text-decoration:none;cursor:pointer;
  transition:border-color .2s,background .2s;
}
.mb-premium__btn-ghost:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.04)}
.mb-premium__btn-primary{
  padding:9px 18px;border-radius:10px;border:none;
  background:linear-gradient(135deg,#39ff14,#22d3ee);
  color:#060a10;font-size:.875rem;font-weight:600;font-family:inherit;
  text-decoration:none;cursor:pointer;
  box-shadow:0 0 20px rgba(57,255,20,.2);
  transition:transform .15s,box-shadow .2s;
}
.mb-premium__btn-primary:hover{transform:translateY(-1px);box-shadow:0 0 28px rgba(57,255,20,.3)}
.mb-premium__menu-btn{
  display:none;padding:8px;border:none;border-radius:8px;
  background:rgba(255,255,255,.06);color:#f1f5f9;cursor:pointer;
}
@media(max-width:768px){
  .mb-premium__menu-btn{display:flex}
  .mb-premium__nav-links{
    display:none;position:absolute;top:100%;left:0;right:0;
    flex-direction:column;align-items:stretch;padding:16px 24px 20px;
    background:rgba(6,10,16,.96);border-bottom:1px solid rgba(255,255,255,.08);
  }
  .mb-premium__nav--open .mb-premium__nav-links{display:flex}
  .mb-premium__nav-actions .mb-premium__btn-ghost{display:none}
}

/* Logo */
.mb-premium__logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit}
.mb-premium__logo-icon{flex-shrink:0;width:40px;height:40px}
.mb-premium__logo-text{display:flex;flex-direction:column;line-height:1.1}
.mb-premium__logo-name{font-size:1.125rem;font-weight:700;letter-spacing:-.02em;color:#f8fafc}
.mb-premium__logo-sub{font-size:.625rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#22d3ee}

/* Hero */
.mb-premium__hero{
  display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;
  max-width:1200px;margin:0 auto;padding:64px 24px 80px;
}
@media(max-width:960px){
  .mb-premium__hero{grid-template-columns:1fr;padding:48px 20px 56px}
}
.mb-premium__hero-badge{
  display:inline-flex;align-items:center;gap:8px;
  padding:6px 14px;border-radius:999px;
  border:1px solid rgba(57,255,20,.25);
  background:rgba(57,255,20,.08);
  font-size:.75rem;font-weight:500;color:#86efac;
  margin-bottom:20px;
}
.mb-premium__hero-title{
  margin:0 0 18px;font-size:clamp(1.75rem,4vw,2.65rem);
  font-weight:700;letter-spacing:-.03em;line-height:1.15;color:#f8fafc;
}
.mb-premium__hero-title span{
  background:linear-gradient(135deg,#39ff14 0%,#22d3ee 50%,#a78bfa 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.mb-premium__hero-sub{
  margin:0 0 28px;font-size:1.05rem;line-height:1.65;color:#94a3b8;max-width:520px;
}
.mb-premium__hero-cta{display:flex;flex-wrap:wrap;gap:12px}
.mb-premium__btn-lg{
  padding:14px 24px;border-radius:12px;font-size:1rem;font-weight:600;
  font-family:inherit;text-decoration:none;cursor:pointer;
  transition:transform .15s,box-shadow .2s;
}
.mb-premium__btn-lg--neon{
  border:none;
  background:linear-gradient(135deg,#39ff14,#2dd40f);
  color:#060a10;
  box-shadow:0 0 32px rgba(57,255,20,.25);
}
.mb-premium__btn-lg--neon:hover{transform:translateY(-2px);box-shadow:0 0 40px rgba(57,255,20,.35)}
.mb-premium__btn-lg--outline{
  border:1px solid rgba(34,211,238,.4);
  background:rgba(34,211,238,.06);color:#67e8f9;
}
.mb-premium__btn-lg--outline:hover{background:rgba(34,211,238,.12)}

/* Flow mockup */
.mb-premium__mockup{
  position:relative;padding:24px;border-radius:20px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.5);
  backdrop-filter:blur(12px);
  box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(57,255,20,.04) inset;
  min-height:280px;
}
.mb-premium__mockup svg{width:100%;height:auto;display:block}
.mb-premium__node-pulse{animation:mb-prem-pulse 2.5s ease-in-out infinite}
.mb-premium__line-glow{stroke-dasharray:8 6;animation:mb-prem-dash 1.2s linear infinite}

/* Sections */
.mb-premium__section{max-width:1200px;margin:0 auto;padding:56px 24px}
.mb-premium__section-title{
  margin:0 0 8px;font-size:1.75rem;font-weight:700;letter-spacing:-.02em;text-align:center;
}
.mb-premium__section-sub{
  margin:0 auto 40px;max-width:560px;text-align:center;
  font-size:.9375rem;color:#94a3b8;line-height:1.55;
}
.mb-premium__cards{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;
}
.mb-premium__card{
  padding:22px 20px;border-radius:16px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.45);
  backdrop-filter:blur(14px);
  transition:border-color .25s,transform .25s,box-shadow .25s;
}
.mb-premium__card:hover{
  border-color:rgba(57,255,20,.2);
  transform:translateY(-3px);
  box-shadow:0 12px 32px rgba(0,0,0,.3),0 0 24px rgba(57,255,20,.06);
}
.mb-premium__card-icon{
  width:40px;height:40px;border-radius:10px;
  display:flex;align-items:center;justify-content:center;
  font-size:1.1rem;margin-bottom:14px;
}
.mb-premium__card-icon--g{background:rgba(57,255,20,.12);color:#39ff14}
.mb-premium__card-icon--c{background:rgba(34,211,238,.12);color:#22d3ee}
.mb-premium__card-icon--p{background:rgba(167,139,250,.12);color:#a78bfa}
.mb-premium__card h3{margin:0 0 8px;font-size:1rem;font-weight:600}
.mb-premium__card p{margin:0;font-size:.8125rem;color:#94a3b8;line-height:1.5}

/* Plans */
.mb-premium__plans{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;
}
.mb-premium__plan{
  padding:28px 22px;border-radius:18px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.55);
  backdrop-filter:blur(14px);
  display:flex;flex-direction:column;
  transition:border-color .25s,box-shadow .25s;
}
.mb-premium__plan--featured{
  border-color:rgba(57,255,20,.35);
  box-shadow:0 0 40px rgba(57,255,20,.08);
}
.mb-premium__plan-name{font-size:1.25rem;font-weight:700;margin:0 0 4px;text-transform:capitalize}
.mb-premium__plan-tag{font-size:.75rem;color:#64748b;margin:0 0 18px}
.mb-premium__plan-list{
  list-style:none;margin:0 0 22px;padding:0;flex:1;
  display:flex;flex-direction:column;gap:10px;
}
.mb-premium__plan-list li{
  font-size:.875rem;color:#cbd5e1;
  padding-left:20px;position:relative;
}
.mb-premium__plan-list li::before{
  content:"";position:absolute;left:0;top:.45em;width:8px;height:8px;
  border-radius:50%;background:linear-gradient(135deg,#39ff14,#22d3ee);
}
.mb-premium__plan-btn{
  width:100%;padding:12px;border-radius:10px;
  font-size:.9375rem;font-weight:600;font-family:inherit;
  text-align:center;text-decoration:none;cursor:pointer;border:none;
  transition:transform .15s,opacity .2s;
}
.mb-premium__plan-btn--active{
  background:linear-gradient(135deg,#39ff14,#2dd40f);color:#060a10;
}
.mb-premium__plan-btn--soon{
  background:rgba(255,255,255,.06);color:#64748b;border:1px solid rgba(255,255,255,.1);
  cursor:not-allowed;opacity:.85;
}

/* Auth panel (login / register) */
.mb-premium__auth{
  max-width:440px;margin:0 auto;
  padding:36px 32px;border-radius:20px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(15,23,42,.75);
  backdrop-filter:blur(20px);
  box-shadow:0 20px 50px rgba(0,0,0,.4);
}
.mb-premium__auth-title{margin:0 0 6px;font-size:1.5rem;font-weight:700}
.mb-premium__auth-sub{margin:0 0 24px;font-size:.9375rem;color:#94a3b8}
.mb-premium__form{display:flex;flex-direction:column;gap:16px}
.mb-premium__field{display:flex;flex-direction:column;gap:6px}
.mb-premium__label{font-size:.8125rem;font-weight:500;color:#94a3b8}
.mb-premium__input-wrap{position:relative;display:flex;align-items:center}
.mb-premium__input-icon{
  position:absolute;left:12px;width:18px;height:18px;color:#64748b;pointer-events:none;
}
.mb-premium__input{
  width:100%;padding:12px 12px 12px 40px;border-radius:11px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(6,10,16,.7);color:#f8fafc;
  font-size:.9375rem;font-family:inherit;outline:none;
  transition:border-color .2s,box-shadow .2s;
}
.mb-premium__input:focus{
  border-color:rgba(57,255,20,.45);
  box-shadow:0 0 0 3px rgba(57,255,20,.1);
}
.mb-premium__input--pwd{padding-right:44px}
.mb-premium__toggle-pwd{
  position:absolute;right:8px;width:32px;height:32px;border:none;border-radius:8px;
  background:transparent;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;
}
.mb-premium__row{display:flex;justify-content:flex-end}
.mb-premium__link{font-size:.8125rem;color:#22d3ee;text-decoration:none}
.mb-premium__link:hover{color:#67e8f9}
.mb-premium__submit{
  width:100%;padding:13px;border:none;border-radius:11px;margin-top:4px;
  background:linear-gradient(135deg,#39ff14,#2dd40f);
  color:#060a10;font-size:1rem;font-weight:600;font-family:inherit;cursor:pointer;
  box-shadow:0 0 24px rgba(57,255,20,.2);
  transition:transform .15s,box-shadow .2s;
}
.mb-premium__submit:hover:not(:disabled){box-shadow:0 0 32px rgba(57,255,20,.35);transform:translateY(-1px)}
.mb-premium__submit:disabled{opacity:.8;cursor:wait}
.mb-premium__footer-links{
  margin-top:18px;text-align:center;font-size:.8125rem;color:#64748b;
}
.mb-premium__footer-links a{color:#22d3ee;text-decoration:none}
.mb-premium__msg{
  margin:0 0 16px;padding:11px 13px;border-radius:10px;font-size:.875rem;line-height:1.45;
}
.mb-premium__msg--ok{background:rgba(57,255,20,.1);border:1px solid rgba(57,255,20,.25);color:#bbf7d0}
.mb-premium__msg--err{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.25);color:#fecaca}

.mb-premium__page-footer{
  text-align:center;padding:32px 24px 48px;
  font-size:.75rem;color:#475569;border-top:1px solid rgba(255,255,255,.05);
}

@keyframes mb-prem-fade{from{opacity:0}to{opacity:1}}
@keyframes mb-prem-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes mb-prem-pulse{0%,100%{opacity:1}50%{opacity:.75}}
@keyframes mb-prem-dash{to{stroke-dashoffset:-28}}
`;

function renderMacBotLogo() {
  return `
<a href="/login" class="mb-premium__logo" aria-label="MacBot CRM inicio">
  <svg class="mb-premium__logo-icon" viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <linearGradient id="mbLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#39ff14"/>
        <stop offset="50%" stop-color="#22d3ee"/>
        <stop offset="100%" stop-color="#1e3a5f"/>
      </linearGradient>
    </defs>
    <circle cx="20" cy="20" r="18" fill="url(#mbLogoGrad)" opacity=".95"/>
    <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(57,255,20,.4)" stroke-width="1"/>
    <path d="M14 26c0-4 2.5-10 6-10s6 6 6 10" fill="none" stroke="#060a10" stroke-width="2.2" stroke-linecap="round"/>
    <text x="20" y="21" text-anchor="middle" font-size="13" font-weight="700" fill="#060a10" font-family="Inter,sans-serif">M</text>
    <path d="M28 12c3 0 5 2 5 4.5 0 2-1.5 3.5-3 4" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>
    <circle cx="30" cy="11" r="2.5" fill="#39ff14" opacity=".85"/>
  </svg>
  <span class="mb-premium__logo-text">
    <span class="mb-premium__logo-name">MacBot</span>
    <span class="mb-premium__logo-sub">CRM</span>
  </span>
</a>`;
}

function renderNavbar({ active = "landing" } = {}) {
  return `
<header class="mb-premium__nav" id="mbNav">
  ${renderMacBotLogo()}
  <button type="button" class="mb-premium__menu-btn" aria-label="Menú" data-nav-toggle>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  </button>
  <nav class="mb-premium__nav-links">
    <a href="/login#producto" class="mb-premium__nav-link">Producto</a>
    <a href="/login#planes" class="mb-premium__nav-link">Planes</a>
    <a href="/login#login" class="mb-premium__nav-link">Iniciar sesión</a>
  </nav>
  <div class="mb-premium__nav-actions">
    <a href="/login#login" class="mb-premium__btn-ghost">Iniciar sesión</a>
    <a href="/register" class="mb-premium__btn-primary">Crear cuenta</a>
  </div>
</header>`;
}

function renderHeroFlowMockup() {
  return `
<div class="mb-premium__mockup" aria-hidden="true">
  <svg viewBox="0 0 420 260" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lineG" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#39ff14"/><stop offset="50%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#a78bfa"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path class="mb-premium__line-glow" d="M95 80 H155" stroke="url(#lineG)" stroke-width="2" filter="url(#glow)"/>
    <path class="mb-premium__line-glow" d="M195 80 H255" stroke="url(#lineG)" stroke-width="2" filter="url(#glow)" style="animation-delay:.2s"/>
    <path class="mb-premium__line-glow" d="M295 80 H355" stroke="url(#lineG)" stroke-width="2" filter="url(#glow)" style="animation-delay:.4s"/>
    <path class="mb-premium__line-glow" d="M70 130 V175 H95" stroke="url(#lineG)" stroke-width="2" opacity=".7"/>
    <path class="mb-premium__line-glow" d="M350 130 V200 H325" stroke="url(#lineG)" stroke-width="2" opacity=".7"/>
    <g class="mb-premium__node-pulse" transform="translate(40,52)">
      <rect width="90" height="56" rx="12" fill="rgba(57,255,20,.12)" stroke="#39ff14" stroke-width="1.2"/>
      <text x="45" y="24" text-anchor="middle" fill="#86efac" font-size="10" font-family="Inter,sans-serif">WhatsApp</text>
      <text x="45" y="40" text-anchor="middle" fill="#94a3b8" font-size="8" font-family="Inter,sans-serif">Entrada</text>
    </g>
    <g class="mb-premium__node-pulse" transform="translate(140,52)" style="animation-delay:.3s">
      <rect width="90" height="56" rx="12" fill="rgba(34,211,238,.1)" stroke="#22d3ee" stroke-width="1.2"/>
      <text x="45" y="24" text-anchor="middle" fill="#67e8f9" font-size="10" font-family="Inter,sans-serif">IA</text>
      <text x="45" y="40" text-anchor="middle" fill="#94a3b8" font-size="8" font-family="Inter,sans-serif">Agente</text>
    </g>
    <g class="mb-premium__node-pulse" transform="translate(240,52)" style="animation-delay:.6s">
      <rect width="90" height="56" rx="12" fill="rgba(167,139,250,.1)" stroke="#a78bfa" stroke-width="1.2"/>
      <text x="45" y="24" text-anchor="middle" fill="#c4b5fd" font-size="10" font-family="Inter,sans-serif">Seguimiento</text>
      <text x="45" y="40" text-anchor="middle" fill="#94a3b8" font-size="8" font-family="Inter,sans-serif">CRM</text>
    </g>
    <g transform="translate(40,168)">
      <rect width="90" height="56" rx="12" fill="rgba(251,191,36,.08)" stroke="#fbbf24" stroke-width="1.2"/>
      <text x="45" y="24" text-anchor="middle" fill="#fde68a" font-size="10" font-family="Inter,sans-serif">Pago</text>
      <text x="45" y="40" text-anchor="middle" fill="#94a3b8" font-size="8" font-family="Inter,sans-serif">Lector</text>
    </g>
    <g class="mb-premium__node-pulse" transform="translate(290,168)" style="animation-delay:.9s">
      <rect width="90" height="56" rx="12" fill="rgba(57,255,20,.15)" stroke="#39ff14" stroke-width="1.5"/>
      <text x="45" y="24" text-anchor="middle" fill="#39ff14" font-size="10" font-weight="600" font-family="Inter,sans-serif">Venta</text>
      <text x="45" y="40" text-anchor="middle" fill="#94a3b8" font-size="8" font-family="Inter,sans-serif">Conversión</text>
    </g>
  </svg>
</div>`;
}

function renderHeroSection() {
  return `
<section class="mb-premium__hero">
  <div>
    <div class="mb-premium__hero-badge">
      <span>●</span> WhatsApp CRM + IA + Flujos visuales
    </div>
    <h1 class="mb-premium__hero-title">
      Automatiza tus ventas por WhatsApp con <span>IA y flujos visuales</span>
    </h1>
    <p class="mb-premium__hero-sub">
      MacBot combina CRM, WhatsApp API, inteligencia artificial, remarketing, lector de pagos y embudos visuales para vender automáticamente.
    </p>
    <div class="mb-premium__hero-cta">
      <a href="/register" class="mb-premium__btn-lg mb-premium__btn-lg--neon">Crear cuenta gratis</a>
      <a href="#login" class="mb-premium__btn-lg mb-premium__btn-lg--outline">Iniciar sesión</a>
    </div>
  </div>
  ${renderHeroFlowMockup()}
</section>`;
}

const PRODUCT_CARDS = [
  { icon: "g", emoji: "📱", title: "Bandeja multi-número", desc: "Gestiona varias líneas WhatsApp desde un solo panel." },
  { icon: "c", emoji: "🔀", title: "Flujos visuales", desc: "Diseña embudos con nodos, condiciones y automatizaciones." },
  { icon: "p", emoji: "🤖", title: "Agente IA", desc: "Responde, califica leads y deriva conversaciones con IA." },
  { icon: "g", emoji: "🔁", title: "Remarketing automático", desc: "Reactiva contactos con campañas programadas 24h." },
  { icon: "c", emoji: "💳", title: "Lector de pagos", desc: "Detecta comprobantes y acelera el cierre de ventas." },
  { icon: "p", emoji: "📊", title: "Conversión y métricas", desc: "Mide ingresos, embudo y rendimiento por flujo." },
  { icon: "g", emoji: "📋", title: "Planes con límites", desc: "Escala desde free hasta agency según tu operación." },
  { icon: "c", emoji: "🔐", title: "Recuperación de contraseña segura", desc: "Restablece acceso sin exponer si el correo existe." },
];

function renderProductSection() {
  const cards = PRODUCT_CARDS.map(
    (c) => `
    <article class="mb-premium__card">
      <div class="mb-premium__card-icon mb-premium__card-icon--${c.icon}">${c.emoji}</div>
      <h3>${escapeHtml(c.title)}</h3>
      <p>${escapeHtml(c.desc)}</p>
    </article>`
  ).join("");

  return `
<section class="mb-premium__section" id="producto">
  <h2 class="mb-premium__section-title">Todo lo que necesitas para vender en WhatsApp</h2>
  <p class="mb-premium__section-sub">MacBot une conversación, automatización y datos en una plataforma pensada para equipos de ventas.</p>
  <div class="mb-premium__cards">${cards}</div>
</section>`;
}

const PLANS = [
  { id: "free", featured: true, items: ["1 número WhatsApp", "1 flujo", "100 contactos"], tag: "Ideal para probar", cta: "Empezar gratis", href: "/register", soon: false },
  { id: "starter", items: ["2 números WhatsApp", "10 flujos", "2.000 contactos"], tag: "Ideal para emprendedores", cta: "Próximamente", soon: true },
  { id: "pro", items: ["5 números WhatsApp", "20 flujos", "10.000 contactos"], tag: "Ideal para negocios en crecimiento", cta: "Próximamente", soon: true },
  { id: "agency", items: ["WhatsApp ilimitado", "Flujos ilimitados", "Contactos ilimitados"], tag: "Ideal para agencias", cta: "Próximamente", soon: true },
];

function renderPlansSection() {
  const plans = PLANS.map((p) => {
    const btnClass = p.soon ? "mb-premium__plan-btn--soon" : "mb-premium__plan-btn--active";
    const btn = p.soon
      ? `<span class="mb-premium__plan-btn ${btnClass}">${escapeHtml(p.cta)}</span>`
      : `<a href="${escapeHtml(p.href)}" class="mb-premium__plan-btn ${btnClass}">${escapeHtml(p.cta)}</a>`;
    const feat = p.featured ? " mb-premium__plan--featured" : "";
    const list = p.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    return `
    <article class="mb-premium__plan${feat}">
      <h3 class="mb-premium__plan-name">${escapeHtml(p.id.charAt(0).toUpperCase() + p.id.slice(1))}</h3>
      <p class="mb-premium__plan-tag">${escapeHtml(p.tag)}</p>
      <ul class="mb-premium__plan-list">${list}</ul>
      ${btn}
    </article>`;
  }).join("");

  return `
<section class="mb-premium__section" id="planes">
  <h2 class="mb-premium__section-title">Planes MacBot</h2>
  <p class="mb-premium__section-sub">Empieza gratis y escala cuando tu operación lo necesite.</p>
  <div class="mb-premium__plans">${plans}</div>
</section>`;
}

function renderLoginForm({ resetBanner = "", errorMsg = "" } = {}) {
  const banner = resetBanner
    ? `<p class="mb-premium__msg mb-premium__msg--ok">${resetBanner}</p>`
    : "";
  const err = errorMsg
    ? `<p class="mb-premium__msg mb-premium__msg--err">${escapeHtml(errorMsg)}</p>`
    : "";

  return `
<div class="mb-premium__auth" id="login">
  <h2 class="mb-premium__auth-title">Iniciar sesión</h2>
  <p class="mb-premium__auth-sub">Accede a tu panel MacBot</p>
  ${banner}${err}
  <form class="mb-premium__form" method="POST" action="/login">
    <div class="mb-premium__field">
      <label class="mb-premium__label" for="email">Correo electrónico</label>
      <div class="mb-premium__input-wrap">
        <svg class="mb-premium__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
        <input class="mb-premium__input" id="email" name="email" type="email" placeholder="tu@empresa.com" required autocomplete="email">
      </div>
    </div>
    <div class="mb-premium__field">
      <label class="mb-premium__label" for="password">Contraseña</label>
      <div class="mb-premium__input-wrap">
        <svg class="mb-premium__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>
        <input class="mb-premium__input mb-premium__input--pwd" id="password" name="password" type="password" placeholder="••••••••" required autocomplete="current-password">
        <button type="button" class="mb-premium__toggle-pwd" aria-label="Mostrar contraseña" data-toggle-password="password">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-premium__eye-open"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
    <div class="mb-premium__row">
      <a href="/forgot-password" class="mb-premium__link">¿Olvidaste tu contraseña?</a>
    </div>
    <button type="submit" class="mb-premium__submit">Entrar</button>
  </form>
  <p class="mb-premium__footer-links">
    ¿No tienes cuenta? <a href="/register">Crear cuenta gratis</a>
  </p>
</div>`;
}

function renderRegisterForm({ errors = {}, values = {} } = {}) {
  const globalErr = errors._global
    ? `<p class="mb-premium__msg mb-premium__msg--err">${escapeHtml(errors._global)}</p>`
    : "";
  const field = (name, label, type, placeholder, autocomplete) => {
    const err = errors[name] ? `<span style="color:#fca5a5;font-size:.75rem">${escapeHtml(errors[name])}</span>` : "";
    const val = escapeHtml(values[name] || "");
    const pwdClass = type === "password" ? " mb-premium__input--pwd" : "";
    const toggle =
      name === "password" || name === "password_confirm"
        ? `<button type="button" class="mb-premium__toggle-pwd" aria-label="Mostrar" data-toggle-password="${escapeHtml(name)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>`
        : "";
    const icon =
      type === "email"
        ? `<svg class="mb-premium__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>`
        : type === "password"
          ? `<svg class="mb-premium__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>`
          : `<svg class="mb-premium__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0 1 12 0v1"/></svg>`;

    return `
    <div class="mb-premium__field">
      <label class="mb-premium__label" for="${name}">${escapeHtml(label)}</label>
      <div class="mb-premium__input-wrap">
        ${icon}
        <input class="mb-premium__input${pwdClass}" id="${name}" name="${name}" type="${type}" placeholder="${escapeHtml(placeholder)}" required ${autocomplete ? `autocomplete="${autocomplete}"` : ""} value="${val}">
        ${toggle}
      </div>
      ${err}
    </div>`;
  };

  return `
<div class="mb-premium__auth">
  <h2 class="mb-premium__auth-title">Crear cuenta</h2>
  <p class="mb-premium__auth-sub">Plan Free incluido · Empieza en minutos</p>
  ${globalErr}
  <form class="mb-premium__form" method="POST" action="/register">
    ${field("nombre", "Nombre", "text", "Tu nombre", "name")}
    ${field("email", "Correo electrónico", "email", "tu@empresa.com", "email")}
    ${field("password", "Contraseña", "password", "Mínimo 6 caracteres", "new-password")}
    ${field("password_confirm", "Confirmar contraseña", "password", "Repite tu contraseña", "new-password")}
    <button type="submit" class="mb-premium__submit">Crear cuenta gratis</button>
  </form>
  <p class="mb-premium__footer-links">
    ¿Ya tienes cuenta? <a href="/login#login">Iniciar sesión</a>
  </p>
</div>`;
}

const NAV_SCRIPT = `
<script>
(function(){
  var nav=document.getElementById("mbNav");
  var btn=document.querySelector("[data-nav-toggle]");
  if(btn&&nav){
    btn.addEventListener("click",function(){nav.classList.toggle("mb-premium__nav--open");});
  }
  document.querySelectorAll('.mb-premium__nav-link[href*="#"]').forEach(function(a){
    a.addEventListener("click",function(){nav&&nav.classList.remove("mb-premium__nav--open");});
  });
})();
</script>`;

const FORM_SUBMIT_SCRIPT = `
<script>
(function(){
  var form=document.querySelector(".mb-premium__form");
  if(form){
    form.addEventListener("submit",function(){
      var sub=form.querySelector(".mb-premium__submit");
      if(sub&&!sub.disabled){sub.disabled=true;sub.textContent="Procesando...";}
    });
  }
})();
</script>`;

const PREMIUM_PASSWORD_TOGGLE = `
<script>
(function(){
  document.querySelectorAll("[data-toggle-password]").forEach(function(btn){
    var id=btn.getAttribute("data-toggle-password")||"password";
    var pwd=document.getElementById(id);
    if(!pwd)return;
    btn.addEventListener("click",function(){
      var show=pwd.type==="password";
      pwd.type=show?"text":"password";
    });
  });
})();
</script>`;

function renderPremiumLandingPage({ documentTitle, mainContent, scripts = "" }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>${PREMIUM_STYLES}</style>
</head>
<body class="mb-premium">
<div class="mb-premium__bg" aria-hidden="true">
  <div class="mb-premium__grid"></div>
  <span class="mb-premium__code mb-premium__code--1">flow.trigger("whatsapp")</span>
  <span class="mb-premium__code mb-premium__code--2">ai.reply(context)</span>
  <span class="mb-premium__code mb-premium__code--3">crm.track(conversion)</span>
  <span class="mb-premium__code mb-premium__code--4">rm24h.schedule()</span>
</div>
<div class="mb-premium__wrap">
  ${renderNavbar()}
  ${mainContent}
  <footer class="mb-premium__page-footer">© MacBot CRM · WhatsApp automatizado con IA</footer>
</div>
${NAV_SCRIPT}${FORM_SUBMIT_SCRIPT}${PREMIUM_PASSWORD_TOGGLE}${scripts}
</body>
</html>`;
}

function renderLoginLandingPage(opts = {}) {
  const resetBanner =
    opts.resetOk
      ? "Tu contraseña fue actualizada. Ya puedes iniciar sesión."
      : "";

  const main = `
  ${renderHeroSection()}
  ${renderProductSection()}
  ${renderPlansSection()}
  <section class="mb-premium__section">
    ${renderLoginForm({ resetBanner, errorMsg: opts.errorMsg })}
  </section>`;

  return renderPremiumLandingPage({
    documentTitle: "MacBot CRM · Automatiza ventas por WhatsApp",
    mainContent: main,
  });
}

function renderRegisterPage(opts = {}) {
  const main = `
  <section class="mb-premium__hero" style="grid-template-columns:1fr;padding-top:48px;padding-bottom:24px">
    <div style="max-width:560px;margin:0 auto;text-align:center">
      <h1 class="mb-premium__hero-title" style="font-size:1.85rem">Únete a <span>MacBot CRM</span></h1>
      <p class="mb-premium__hero-sub" style="margin:0 auto">Crea tu cuenta gratis: 1 número, 1 flujo y 100 contactos para empezar.</p>
    </div>
  </section>
  <section class="mb-premium__section" style="padding-top:0">
    ${renderRegisterForm(opts)}
  </section>`;

  return renderPremiumLandingPage({
    documentTitle: "Crear cuenta · MacBot CRM",
    mainContent: main,
  });
}

module.exports = {
  renderLoginLandingPage,
  renderRegisterPage,
  renderLoginForm,
};
