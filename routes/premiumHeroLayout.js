const { escapeHtml } = require("./authPageLayout");

const PREMIUM_HERO_STYLES = `
/* ── Hero centrado (copy arriba + builder showcase abajo) ── */
.mb-premium__hero--centered{
  display:flex;flex-direction:column;align-items:center;
  width:100%;max-width:100%;
  margin:0 auto;
  padding:48px 24px 40px;
  text-align:center;
  box-sizing:border-box;
}
.mb-premium__hero-copy{
  width:100%;max-width:980px;margin:0 auto;
  display:flex;flex-direction:column;align-items:center;
}
.mb-premium__hero-title-glow{
  position:relative;display:inline-block;width:100%;max-width:980px;
}
.mb-premium__hero-title-glow::before{
  content:"";position:absolute;left:50%;top:50%;
  transform:translate(-50%,-50%);
  width:88%;height:130%;
  background:radial-gradient(ellipse at center,rgba(255,255,255,.06) 0%,rgba(34,211,238,.025) 42%,transparent 72%);
  filter:blur(36px);pointer-events:none;z-index:0;
}
.mb-premium__hero-showcase{
  width:100%;max-width:100%;margin:36px auto 0;
  opacity:0;transform:translateY(18px);
  animation:mb-hero-showcase-in .85s cubic-bezier(.22,1,.36,1) .1s both;
}
.mb-premium__hero-badge{
  display:inline-flex;align-items:center;gap:8px;
  padding:6px 14px;border-radius:999px;
  border:1px solid rgba(57,255,20,.28);
  background:rgba(57,255,20,.08);
  font-size:.72rem;font-weight:600;color:#86efac;
  margin-bottom:18px;
  box-shadow:0 0 20px rgba(57,255,20,.08);
}
.mb-premium__hero-title{
  position:relative;z-index:1;
  margin:0 0 20px;
  font-size:clamp(2.35rem,4.6vw + .95rem,4.15rem);
  font-weight:900;letter-spacing:-.042em;line-height:1.02;color:#ffffff;
  display:flex;flex-direction:column;align-items:center;gap:.06em;
  max-width:980px;
  text-wrap:balance;
}
.mb-premium__hero--centered .mb-premium__hero-title > span,
.mb-premium__hero--centered .mb-premium__hero-title .mb-premium__hero-title-line{
  background:none;-webkit-text-fill-color:inherit;color:inherit;margin-top:0;
}
.mb-premium__hero-title-line{display:block}
.mb-premium__hero-title-line--l1,
.mb-premium__hero-title-line--l2{white-space:nowrap}
.mb-premium__hero-title .txt-wa{color:#25D366;-webkit-text-fill-color:#25D366;display:inline}
.mb-premium__hero-title .txt-ai{color:#22d3ee;-webkit-text-fill-color:#22d3ee;display:inline}
.mb-premium__hero-sub{
  margin:0 auto 26px;font-size:1.0625rem;line-height:1.72;color:#8b9cb3;max-width:680px;font-weight:400;
}
.mb-premium__hero-chips{
  display:flex;flex-wrap:wrap;gap:7px;justify-content:center;
  margin:0 auto 28px;max-width:820px;
}
.mb-premium__chip{
  padding:6px 13px;border-radius:999px;
  border:1px solid rgba(255,255,255,.06);
  background:rgba(255,255,255,.025);
  font-size:.72rem;font-weight:500;color:#8899ad;
  transition:border-color .22s,background .22s,color .22s,box-shadow .22s,transform .22s;
}
.mb-premium__chip::before{
  content:"✓";margin-right:6px;font-size:.65rem;color:rgba(255,255,255,.28);font-weight:600;
}
.mb-premium__chip:hover{
  border-color:rgba(255,255,255,.14);
  background:rgba(255,255,255,.055);
  color:#cbd5e1;
  box-shadow:0 6px 22px rgba(0,0,0,.18);
  transform:translateY(-1px);
}
.mb-premium__hero-cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:14px}
.mb-premium__btn-lg{
  padding:13px 22px;border-radius:12px;font-size:.9375rem;font-weight:600;
  font-family:inherit;text-decoration:none;cursor:pointer;
  transition:transform .15s,box-shadow .2s,border-color .2s;
}
.mb-premium__btn-lg--neon{
  border:none;
  background:#25D366;
  color:#ffffff;
  font-weight:700;
  box-shadow:0 4px 20px rgba(37,211,102,.28),0 1px 2px rgba(0,0,0,.24);
}
.mb-premium__btn-lg--neon:hover{
  transform:translateY(-2px);
  background:#22c55e;
  box-shadow:0 8px 28px rgba(37,211,102,.32),0 2px 4px rgba(0,0,0,.2);
}
.mb-premium__btn-lg--outline{
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.035);color:#e2e8f0;font-weight:600;
}
.mb-premium__btn-lg--outline:hover{
  background:rgba(255,255,255,.07);
  border-color:rgba(255,255,255,.22);
  color:#f8fafc;
}
.mb-premium__hero-trust{
  margin:0;font-size:.75rem;color:#64748b;
}

/* ── Builder Visual — captura real, grande y proporcional ── */
.mb-hero-builder{
  --hb-float:-12px;
  position:relative;
  width:min(1024px,100%);
  margin:8px auto 0;
}
.mb-hero-builder__glow{
  position:absolute;
  inset:-14% -5% -10%;
  pointer-events:none;
  z-index:0;
  background:
    radial-gradient(ellipse 36% 58% at 14% 62%, rgba(57,255,20,.38), transparent 68%),
    radial-gradient(ellipse 34% 54% at 86% 40%, rgba(34,211,238,.32), transparent 70%),
    radial-gradient(ellipse 46% 36% at 50% 108%, rgba(57,255,20,.14), transparent 72%);
  filter:blur(10px);
}
.mb-hero-builder__float{
  position:relative;
  z-index:1;
  animation:mb-hero-builder-float 6.8s ease-in-out infinite;
  will-change:transform;
}
.mb-hero-builder__frame{
  border-radius:22px;
  padding:1px;
  background:linear-gradient(135deg, rgba(57,255,20,.62), rgba(34,211,238,.38) 52%, rgba(57,255,20,.22));
  box-shadow:
    0 0 42px rgba(57,255,20,.18),
    0 0 78px rgba(34,211,238,.14),
    0 30px 70px rgba(0,0,0,.45);
}
.mb-hero-builder__shot{
  display:block;
  width:100%;
  height:auto;
  aspect-ratio:1024 / 438;
  object-fit:contain;
  object-position:center;
  border-radius:21px;
  background:#070b14;
}
@keyframes mb-hero-builder-float{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(var(--hb-float))}
}
@media (max-width:1100px){
  .mb-hero-builder{width:100%;margin-top:4px}
  .mb-hero-builder__glow{inset:-10% -3% -8%}
  .mb-hero-builder__frame{border-radius:18px}
  .mb-hero-builder__shot{border-radius:17px}
}
@media (max-width:768px){
  .mb-hero-builder{--hb-float:-8px}
  .mb-hero-builder__glow{inset:-8% -2% -6%;filter:blur(8px)}
  .mb-hero-builder__frame{
    border-radius:14px;
    box-shadow:
      0 0 28px rgba(57,255,20,.16),
      0 0 42px rgba(34,211,238,.12),
      0 18px 40px rgba(0,0,0,.4);
  }
  .mb-hero-builder__shot{border-radius:13px}
}
@media (max-width:520px){
  .mb-hero-builder{--hb-float:-6px}
  .mb-hero-builder__frame{border-radius:12px}
  .mb-hero-builder__shot{border-radius:11px}
}

@media(max-width:768px){
  .mb-premium__hero--centered{padding:36px 16px 28px}
  .mb-premium__hero-showcase{margin-top:22px}
  .mb-premium__hero-title{font-size:clamp(1.85rem,6.8vw,2.55rem);line-height:1.04;letter-spacing:-.038em}
  .mb-premium__hero-title-line--l1,
  .mb-premium__hero-title-line--l2{white-space:normal}
}

@keyframes mb-hero-showcase-in{
  from{opacity:0;transform:translateY(18px)}
  to{opacity:1;transform:none}
}
@media(prefers-reduced-motion:reduce){
  .mb-premium__hero-showcase{animation:none!important;opacity:1;transform:none}
  .mb-hero-builder__float{animation:none!important}
}
`;

const HERO_CHIPS = [
  "IA integrada",
  "CRM WhatsApp",
  "Seguimientos",
  "Lector de pagos",
  "Remarketing 24h",
  "Multi WhatsApp",
];

const BUILDER_VISUAL_SRC = "/assets/login/builder-visual.png";

function renderHeroBuilderDemo() {
  return `
<div class="mb-hero-builder" aria-label="Vista previa del constructor visual de MacBot">
  <div class="mb-hero-builder__glow" aria-hidden="true"></div>
  <div class="mb-hero-builder__float">
    <div class="mb-hero-builder__frame">
      <img
        class="mb-hero-builder__shot"
        src="${BUILDER_VISUAL_SRC}"
        alt="Builder Visual de MacBot con un flujo de WhatsApp: inicio, contenido, agente OpenAI, seguimiento, lector de pagos, etiqueta y conversión"
        width="1024"
        height="438"
        decoding="async"
      />
    </div>
  </div>
</div>`;
}

function renderHeroSection() {
  const chips = HERO_CHIPS.map(
    (label) => `<span class="mb-premium__chip">${escapeHtml(label)}</span>`
  ).join("");

  return `
<section class="mb-premium__hero mb-premium__hero--centered mb-premium__reveal is-visible" id="como-funciona">
  <div class="mb-premium__hero-copy">
    <div class="mb-premium__hero-badge">
      <span>🚀</span> Constructor visual #1 para WhatsApp
    </div>
    <div class="mb-premium__hero-title-glow">
      <h1 class="mb-premium__hero-title">
        <span class="mb-premium__hero-title-line mb-premium__hero-title-line--l1">Automatiza ventas por <span class="txt-wa">WhatsApp</span> con <span class="txt-ai">IA</span></span>
        <span class="mb-premium__hero-title-line mb-premium__hero-title-line--l2">y convierte conversaciones en clientes</span>
      </h1>
    </div>
    <p class="mb-premium__hero-sub">
      Diseña flujos visuales, responde con IA, realiza seguimientos, valida pagos y registra ventas automáticamente desde un solo lugar.
    </p>
    <div class="mb-premium__hero-chips">${chips}</div>
    <div class="mb-premium__hero-cta">
      <a href="/register" class="mb-premium__btn-lg mb-premium__btn-lg--neon">Crear cuenta gratis →</a>
      <a href="/pricing" class="mb-premium__btn-lg mb-premium__btn-lg--outline">Ver planes</a>
    </div>
    <p class="mb-premium__hero-trust">🛡️ No se requiere tarjeta · Cancela cuando quieras</p>
  </div>
  <div class="mb-premium__hero-showcase">
    ${renderHeroBuilderDemo()}
  </div>
</section>`;
}

module.exports = {
  PREMIUM_HERO_STYLES,
  renderHeroSection,
};
