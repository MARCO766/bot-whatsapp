const { escapeHtml } = require("./authPageLayout");
const { renderPremiumLandingPage } = require("./premiumLandingLayout");

const PRICING_EXTRA_STYLES = `
.mb-pricing__hero{
  max-width:900px;margin:0 auto;padding:56px 24px 40px;text-align:center;
}
.mb-pricing__hero h1{
  margin:0 0 16px;font-size:clamp(1.65rem,4vw,2.35rem);
  font-weight:700;letter-spacing:-.03em;line-height:1.2;color:#f8fafc;
}
.mb-pricing__hero h1 span{
  background:linear-gradient(135deg,#39ff14 0%,#22d3ee 50%,#a78bfa 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.mb-pricing__hero p{
  margin:0 auto;max-width:640px;font-size:1.05rem;line-height:1.65;color:#94a3b8;
}
.mb-pricing__plans{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:20px;max-width:1200px;margin:0 auto;padding:0 24px 48px;
}
.mb-pricing__card{
  position:relative;padding:28px 22px;border-radius:18px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.55);
  backdrop-filter:blur(14px);
  display:flex;flex-direction:column;
  transition:border-color .25s,box-shadow .25s,transform .25s;
}
.mb-pricing__card:hover{
  border-color:rgba(34,211,238,.22);
  transform:translateY(-2px);
}
.mb-pricing__card--popular{
  border-color:rgba(167,139,250,.45);
  box-shadow:0 0 48px rgba(167,139,250,.12),0 0 24px rgba(57,255,20,.06);
}
.mb-pricing__badge{
  position:absolute;top:-11px;left:50%;transform:translateX(-50%);
  padding:5px 14px;border-radius:999px;
  background:linear-gradient(135deg,#a78bfa,#22d3ee);
  color:#060a10;font-size:.7rem;font-weight:700;letter-spacing:.04em;
  white-space:nowrap;
}
.mb-pricing__name{
  margin:0 0 6px;font-size:1.35rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;
}
.mb-pricing__price{
  margin:0 0 18px;font-size:1.75rem;font-weight:700;color:#f8fafc;
}
.mb-pricing__price small{
  display:block;margin-top:4px;font-size:.75rem;font-weight:500;color:#64748b;
}
.mb-pricing__list{
  list-style:none;margin:0 0 24px;padding:0;flex:1;
  display:flex;flex-direction:column;gap:10px;
}
.mb-pricing__list li{
  font-size:.875rem;color:#cbd5e1;padding-left:20px;position:relative;line-height:1.45;
}
.mb-pricing__list li::before{
  content:"";position:absolute;left:0;top:.5em;width:8px;height:8px;
  border-radius:50%;background:linear-gradient(135deg,#39ff14,#22d3ee);
}
.mb-pricing__btn{
  width:100%;padding:12px;border-radius:10px;
  font-size:.9375rem;font-weight:600;font-family:inherit;
  text-align:center;text-decoration:none;cursor:pointer;border:none;
  transition:transform .15s,box-shadow .2s,opacity .2s;
}
.mb-pricing__btn--primary{
  background:linear-gradient(135deg,#39ff14,#2dd40f);color:#060a10;
  box-shadow:0 0 20px rgba(57,255,20,.2);
}
.mb-pricing__btn--primary:hover{
  transform:translateY(-1px);box-shadow:0 0 28px rgba(57,255,20,.3);
}
.mb-pricing__btn--soon{
  background:rgba(255,255,255,.06);color:#64748b;
  border:1px solid rgba(255,255,255,.1);cursor:not-allowed;opacity:.9;
}
.mb-pricing__compare{
  max-width:1200px;margin:0 auto;padding:24px 24px 56px;
}
.mb-pricing__compare h2{
  margin:0 0 8px;font-size:1.5rem;font-weight:700;text-align:center;
}
.mb-pricing__compare > p{
  margin:0 auto 28px;max-width:520px;text-align:center;
  font-size:.9375rem;color:#94a3b8;line-height:1.5;
}
.mb-pricing__table-wrap{
  overflow-x:auto;border-radius:16px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.45);
  backdrop-filter:blur(12px);
  -webkit-overflow-scrolling:touch;
}
.mb-pricing__table{
  width:100%;min-width:640px;border-collapse:collapse;font-size:.875rem;
}
.mb-pricing__table th,.mb-pricing__table td{
  padding:14px 16px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);
}
.mb-pricing__table th{
  background:rgba(6,10,16,.6);color:#e2e8f0;font-weight:600;font-size:.8125rem;
}
.mb-pricing__table th:first-child,.mb-pricing__table td:first-child{
  text-align:left;color:#94a3b8;font-weight:500;
  position:sticky;left:0;background:rgba(15,23,42,.95);z-index:1;
}
.mb-pricing__table tr:last-child td{border-bottom:none}
.mb-pricing__table .mb-pricing__col--pro{
  background:rgba(167,139,250,.06);color:#e9d5ff;
}
.mb-pricing__yes{color:#86efac;font-weight:600}
.mb-pricing__no{color:#475569}
.mb-pricing__cta{
  max-width:720px;margin:0 auto;padding:0 24px 72px;text-align:center;
}
.mb-pricing__cta p{
  margin:0 0 20px;font-size:1.125rem;color:#e2e8f0;line-height:1.5;
}
.mb-pricing__nav-pricing .mb-premium__nav-link--active{color:#39ff14}
`;

const PRICING_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "Gratis",
    priceSub: "",
    popular: false,
    features: [
      "1 número WhatsApp",
      "1 flujo",
      "100 contactos",
      "Bandeja CRM",
      "Agente IA",
      "Seguimiento básico",
    ],
    cta: "Crear cuenta gratis",
    href: "/register",
    soon: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$9",
    priceSub: "/mes",
    popular: false,
    features: [
      "2 números WhatsApp",
      "10 flujos",
      "2.000 contactos",
      "IA conversacional",
      "Remarketing 24h",
      "Lector de pagos",
      "Métricas básicas",
    ],
    cta: "Próximamente",
    soon: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    priceSub: "/mes",
    popular: true,
    features: [
      "5 números WhatsApp",
      "20 flujos",
      "10.000 contactos",
      "IA avanzada",
      "Flujos visuales completos",
      "Remarketing avanzado",
      "Conversiones y métricas",
      "Soporte prioritario",
    ],
    cta: "Próximamente",
    soon: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: "Personalizado",
    priceSub: "",
    popular: false,
    features: [
      "WhatsApp ilimitado",
      "Flujos ilimitados",
      "Contactos ilimitados",
      "Multi-campañas",
      "Uso para agencias",
      "Soporte avanzado",
    ],
    cta: "Contactar · Próximamente",
    soon: true,
  },
];

const COMPARE_ROWS = [
  { label: "Números WhatsApp", free: "1", starter: "2", pro: "5", agency: "Ilimitado" },
  { label: "Contactos", free: "100", starter: "2.000", pro: "10.000", agency: "Ilimitado" },
  { label: "Flujos", free: "1", starter: "10", pro: "20", agency: "Ilimitado" },
  { label: "Bandeja CRM", free: "yes", starter: "yes", pro: "yes", agency: "yes" },
  { label: "IA", free: "Agente IA", starter: "Conversacional", pro: "Avanzada", agency: "Avanzada" },
  { label: "Remarketing", free: "no", starter: "24h", pro: "Avanzado", agency: "Avanzado" },
  { label: "Seguimientos", free: "Básico", starter: "yes", pro: "yes", agency: "yes" },
  { label: "Lector de pagos", free: "no", starter: "yes", pro: "yes", agency: "yes" },
  { label: "Métricas", free: "no", starter: "Básicas", pro: "Conversiones", agency: "yes" },
  { label: "Soporte", free: "no", starter: "no", pro: "Prioritario", agency: "Avanzado" },
];

function renderPricingNavbar() {
  return `
<header class="mb-premium__nav mb-pricing__nav-pricing" id="mbNav">
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
  </a>
  <button type="button" class="mb-premium__menu-btn" aria-label="Menú" data-nav-toggle>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  </button>
  <nav class="mb-premium__nav-links">
    <a href="/login#producto" class="mb-premium__nav-link">Producto</a>
    <a href="/pricing" class="mb-premium__nav-link mb-premium__nav-link--active">Planes</a>
    <a href="/login#login" class="mb-premium__nav-link">Iniciar sesión</a>
  </nav>
  <div class="mb-premium__nav-actions">
    <a href="/login#login" class="mb-premium__btn-ghost">Iniciar sesión</a>
    <a href="/register" class="mb-premium__btn-primary">Crear cuenta</a>
  </div>
</header>`;
}

function formatCompareCell(value) {
  if (value === "yes") return '<span class="mb-pricing__yes">✓</span>';
  if (value === "no") return '<span class="mb-pricing__no">—</span>';
  return escapeHtml(String(value));
}

function renderPlanCards() {
  return PRICING_PLANS.map((plan) => {
    const popularClass = plan.popular ? " mb-pricing__card--popular" : "";
    const badge = plan.popular
      ? '<span class="mb-pricing__badge">Más popular</span>'
      : "";
    const priceSub = plan.priceSub
      ? `<small>${escapeHtml(plan.priceSub)}</small>`
      : "";
    const list = plan.features
      .map((f) => `<li>${escapeHtml(f)}</li>`)
      .join("");
    const btnClass = plan.soon ? "mb-pricing__btn--soon" : "mb-pricing__btn--primary";
    const btn = plan.soon
      ? `<span class="mb-pricing__btn ${btnClass}">${escapeHtml(plan.cta)}</span>`
      : `<a href="${escapeHtml(plan.href)}" class="mb-pricing__btn ${btnClass}">${escapeHtml(plan.cta)}</a>`;

    return `
    <article class="mb-pricing__card${popularClass}">
      ${badge}
      <h3 class="mb-pricing__name">${escapeHtml(plan.name)}</h3>
      <p class="mb-pricing__price">${escapeHtml(plan.price)}${priceSub}</p>
      <ul class="mb-pricing__list">${list}</ul>
      ${btn}
    </article>`;
  }).join("");
}

function renderCompareTable() {
  const body = COMPARE_ROWS.map((row) => {
    const cols = ["free", "starter", "pro", "agency"]
      .map((key) => {
        const proClass = key === "pro" ? ' class="mb-pricing__col--pro"' : "";
        return `<td${proClass}>${formatCompareCell(row[key])}</td>`;
      })
      .join("");
    return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cols}</tr>`;
  }).join("");

  return `
<section class="mb-pricing__compare" id="comparador">
  <h2>Comparar planes</h2>
  <p>Elige el nivel que mejor se adapte a tu volumen de conversaciones y automatización.</p>
  <div class="mb-pricing__table-wrap" role="region" aria-label="Tabla comparativa de planes">
    <table class="mb-pricing__table">
      <thead>
        <tr>
          <th scope="col">Función</th>
          <th scope="col">Free</th>
          <th scope="col">Starter</th>
          <th scope="col" class="mb-pricing__col--pro">Pro</th>
          <th scope="col">Agency</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</section>`;
}

function renderPricingPage() {
  const main = `
  ${renderPricingNavbar()}
  <section class="mb-pricing__hero">
    <h1>Elige el plan ideal para <span>automatizar tus ventas por WhatsApp</span></h1>
    <p>MacBot combina CRM, IA, flujos visuales, remarketing, seguimiento automático y lector de pagos para convertir conversaciones en ventas.</p>
  </section>
  <div class="mb-pricing__plans">${renderPlanCards()}</div>
  ${renderCompareTable()}
  <section class="mb-pricing__cta">
    <p>Empieza gratis y actualiza cuando tu negocio crezca</p>
    <a href="/register" class="mb-premium__btn-lg mb-premium__btn-lg--neon">Crear cuenta gratis</a>
  </section>`;

  const html = renderPremiumLandingPage({
    documentTitle: "Planes y precios · MacBot CRM",
    mainContent: main,
    extraStyles: PRICING_EXTRA_STYLES,
    skipNavbar: true,
  });

  return html;
}

module.exports = { renderPricingPage };
