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

/* ── Builder demo — composición estática tipo captura real ── */
.mb-hero-builder{
  --hb-w:1600;--hb-h:380;
  width:100%;max-width:100%;margin:0 auto;
  container-type:inline-size;
  container-name:hero-builder;
}
.mb-hero-builder__shell{
  border-radius:12px;
  border:1px solid rgba(255,255,255,.06);
  background:rgba(7,11,18,.5);
  box-shadow:0 12px 40px rgba(0,0,0,.22);
  overflow:visible;
}
.mb-hero-builder__toolbar{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05);
  background:rgba(10,14,22,.72);
}
.mb-hero-builder__toolbar-left{display:flex;align-items:center;gap:8px;min-width:0}
.mb-hero-builder__toolbar-back{
  padding:5px 9px;border-radius:7px;border:none;
  background:rgba(255,255,255,.06);color:#94a3b8;font-size:.62rem;font-weight:600;font-family:inherit;
}
.mb-hero-builder__toolbar-title{margin:0;font-size:.72rem;font-weight:600;color:#cbd5e1;line-height:1.2}
.mb-hero-builder__toolbar-hint{margin:1px 0 0;font-size:.58rem;color:#64748b}
.mb-hero-builder__toolbar-pill{
  padding:4px 8px;border-radius:999px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
  color:#94a3b8;font-size:.58rem;font-weight:600;white-space:nowrap;
}
.mb-hero-builder__stage{
  position:relative;overflow:visible;
  padding:12px 6px 16px;min-height:400px;
}
.mb-hero-builder__scroll{
  overflow:visible;-webkit-overflow-scrolling:touch;
  width:100%;display:flex;justify-content:center;
}
.mb-hero-builder__scale{
  position:relative;width:100%;
  height:calc(var(--hb-h) * 1px * (100cqw / var(--hb-w)));
  min-height:340px;max-height:420px;
}
.mb-hero-builder__canvas-wrap{
  position:absolute;left:50%;top:0;
  width:calc(var(--hb-w) * 1px);height:calc(var(--hb-h) * 1px);
  transform-origin:top center;
  transform:translateX(-50%) scale(calc(100cqw / (var(--hb-w) * 1px)));
}
@supports not (width: 1cqw){
  .mb-hero-builder__scale{aspect-ratio:1600/380;height:auto;min-height:300px;max-height:420px}
  .mb-hero-builder__canvas-wrap{left:0;transform:none;position:relative;margin:0 auto}
}
.mb-hero-builder__grid{
  position:absolute;inset:0;pointer-events:none;
  background-color:transparent;
  background-image:radial-gradient(circle,rgba(255,255,255,.055) 1px,transparent 1px);
  background-size:22px 22px;
}
.mb-hero-builder__edges{
  position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;
}
.mb-hero-builder__edge{
  fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:6 8;
}
.mb-hero-builder__edge--green{stroke:rgba(57,255,20,.72)}
.mb-hero-builder__edge--cyan{stroke:rgba(34,211,238,.5)}
.mb-hero-builder__edge--gold{stroke:rgba(251,191,36,.55)}
.mb-hero-builder__nodes{position:absolute;inset:0;z-index:2}
.mb-hero-builder__node-item{position:absolute}
.mb-hero-builder__node-item--primary{z-index:3}
.mb-hero-builder__node-item--hero{z-index:4}
.mb-hero-builder .node{position:relative;box-sizing:border-box;font-family:inherit}
.mb-hero-builder .port{
  position:absolute;width:10px;height:10px;border-radius:50%;
  border:2px solid rgba(255,255,255,.4);box-sizing:border-box;z-index:3;
}
.mb-hero-builder .port.in{
  left:-5px;top:50%;transform:translateY(-50%);
  background:#31ff92;
}
.mb-hero-builder .port.out{
  right:-5px;top:50%;transform:translateY(-50%);
  background:#ff9800;
}
.mb-hero-builder .port.out--top{top:28%;transform:translateY(-50%)}
.mb-hero-builder .port.out--bottom{top:72%;transform:translateY(-50%)}

/* Nodos principales */
.mb-hero-builder .node-start{
  width:186px;min-height:88px;padding:12px 14px;border-radius:14px;
  background:linear-gradient(135deg,#39ff14,#18b80a);
  border:1px solid rgba(140,255,60,.7);
  box-shadow:0 2px 12px rgba(0,0,0,.2);
}
.mb-hero-builder .node-title-start{margin:0 0 4px;font-size:.78rem;font-weight:800;color:#061018}
.mb-hero-builder .node-desc-start{margin:0;font-size:.66rem;font-weight:600;color:#061018;opacity:.86;line-height:1.35}
.mb-hero-builder .openai-agent-node{background:transparent;border:none;box-shadow:none;padding:0}
.mb-hero-builder .openai-agent-circle{
  position:relative;width:120px;height:120px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  background:linear-gradient(145deg,#0f0a1f,#1e1b4b 38%,#312e81 62%,#4338ca);
  border:2px solid rgba(103,232,249,.55);
  box-shadow:0 4px 20px rgba(0,0,0,.28);
}
.mb-hero-builder .openai-agent-status-badge{
  position:absolute;top:-5px;left:50%;transform:translateX(-50%);
  padding:2px 7px;border-radius:999px;font-size:.46rem;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;color:#a5f3fc;
  background:rgba(15,23,42,.94);border:1px solid rgba(34,211,238,.4);
}
.mb-hero-builder .openai-agent-icon-svg{width:44px;height:44px;color:#f0fdfa}
.mb-hero-builder .openai-agent-title{margin:0;font-size:.58rem;font-weight:800;color:#f8fafc;text-align:center}
.mb-hero-builder .conversion-node{background:transparent;border:none;padding:0;box-shadow:none}
.mb-hero-builder .conversion-circle{
  position:relative;width:108px;height:108px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  background:linear-gradient(145deg,rgba(28,22,8,.94),rgba(12,16,28,.96));
  border:2px solid rgba(250,204,21,.65);
  box-shadow:0 4px 18px rgba(0,0,0,.24);
}
.mb-hero-builder .conversion-badge-event{
  position:absolute;top:6px;left:50%;transform:translateX(-50%);
  font-size:.44rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:#1a1408;background:linear-gradient(135deg,#fde047,#f59e0b);
  border-radius:999px;padding:1px 5px;
}
.mb-hero-builder .conversion-icon{font-size:1rem;line-height:1}
.mb-hero-builder .conversion-title{margin:0;font-size:.62rem;font-weight:800;color:#fde047}
.mb-hero-builder .conversion-venta{margin:0;font-size:.5rem;color:#fcd34d;opacity:.88}

/* Nodos secundarios */
.mb-hero-builder .content-node{
  width:168px;border-radius:12px;overflow:visible;
  border:1px solid rgba(56,189,248,.22);
  background:rgba(10,18,32,.92);
  box-shadow:0 2px 10px rgba(0,0,0,.14);
}
.mb-hero-builder .content-node--mini{width:128px}
.mb-hero-builder .content-header{
  display:flex;align-items:center;justify-content:space-between;gap:4px;
  padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06);
}
.mb-hero-builder .content-header-title{color:#67e8f9;font-weight:700;font-size:.62rem}
.mb-hero-builder .content-status--completo{
  font-size:.48rem;font-weight:700;text-transform:uppercase;
  padding:1px 5px;border-radius:999px;color:#39ff14;
  background:rgba(57,255,20,.08);border:1px solid rgba(57,255,20,.22);
}
.mb-hero-builder .content-body{padding:6px 8px 8px}
.mb-hero-builder .content-preview{
  margin:0;padding:5px 7px;border-radius:6px;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);
  font-size:.56rem;line-height:1.35;color:#94a3b8;
}
.mb-hero-builder .content-variants{display:flex;gap:3px;margin-top:5px}
.mb-hero-builder .content-variant-thumb{
  width:24px;height:24px;border-radius:5px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);
}
.mb-hero-builder .seguimiento-v2-node{
  width:158px;padding:0;border-radius:12px;
  border:1px solid rgba(34,211,238,.22);
  background:rgba(10,20,36,.9);
  box-shadow:0 2px 10px rgba(0,0,0,.12);
}
.mb-hero-builder .segv2-shell{padding:8px 9px 9px}
.mb-hero-builder .segv2-header{display:flex;align-items:flex-start;gap:6px;margin-bottom:5px}
.mb-hero-builder .segv2-lock{font-size:14px;line-height:1}
.mb-hero-builder .segv2-title{font-size:.62rem;font-weight:700;color:#bae6fd;line-height:1.25}
.mb-hero-builder .segv2-badge{
  display:inline-flex;padding:1px 5px;border-radius:999px;
  font-size:.44rem;font-weight:700;text-transform:uppercase;
  color:#083344;background:#22d3ee;
}
.mb-hero-builder .segv2-steps{display:flex;flex-direction:column;gap:3px}
.mb-hero-builder .segv2-step{
  padding:4px 6px;border-radius:6px;font-size:.52rem;color:#94a3b8;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);
}
.mb-hero-builder .lector-pago-node{
  width:172px;padding:8px 9px 9px;border-radius:12px;
  border:1px solid rgba(129,246,236,.18);
  background:rgba(9,14,28,.9);
  box-shadow:0 2px 10px rgba(0,0,0,.14);color:#dbe5f5;
}
.mb-hero-builder .lector-pago-header{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:6px}
.mb-hero-builder .lector-pago-header-main{display:flex;align-items:center;gap:5px}
.mb-hero-builder .lector-pago-icon{
  width:18px;height:18px;display:flex;align-items:center;justify-content:center;
  border-radius:5px;background:rgba(34,211,238,.08);border:1px solid rgba(125,211,252,.14);font-size:.58rem;
}
.mb-hero-builder .lector-pago-node .node-title{
  margin:0;font-size:.58rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ecfeff;
}
.mb-hero-builder .lector-pago-status-badge{
  font-size:.44rem;font-weight:600;color:#5eead4;
  padding:1px 5px;border-radius:999px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.18);
}
.mb-hero-builder .lector-pago-cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.mb-hero-builder .lector-pago-card{
  padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);
}
.mb-hero-builder .lector-pago-card-title{font-size:.44rem;font-weight:600;color:#64748b;margin-bottom:1px}
.mb-hero-builder .lector-pago-card-value{font-size:.54rem;font-weight:700;color:#e2e8f0}
.mb-hero-builder .node-etiqueta{
  width:128px;padding:8px 9px;border-radius:10px;
  background:rgba(10,16,28,.9);
  border:1px solid rgba(41,182,246,.22);
  box-shadow:0 2px 8px rgba(0,0,0,.1);
}
.mb-hero-builder .node-etiqueta::before{
  content:"";position:absolute;left:0;top:0;bottom:0;width:2px;border-radius:10px 0 0 10px;
  background:#29b6f6;
}
.mb-hero-builder .node-etiqueta .node-title{margin:0 0 5px;font-size:.62rem;font-weight:700;color:#29b6f6}
.mb-hero-builder .node-etiqueta-select{
  padding:5px 7px;border-radius:6px;
  background:#0f1117;border:1px solid rgba(51,65,85,.6);color:#cbd5e1;
  font-size:.54rem;
}

@media(max-width:768px){
  .mb-premium__hero--centered{padding:36px 16px 28px}
  .mb-premium__hero-showcase{margin-top:28px}
  .mb-premium__hero-title{font-size:clamp(1.85rem,6.8vw,2.55rem);line-height:1.04;letter-spacing:-.038em}
  .mb-premium__hero-title-line--l1,
  .mb-premium__hero-title-line--l2{white-space:normal}
  .mb-hero-builder__toolbar-hint{display:none}
  .mb-hero-builder__scroll{
    overflow-x:auto;justify-content:flex-start;padding-bottom:4px;
  }
  .mb-hero-builder__scale{
    min-width:calc(var(--hb-w) * 1px);width:calc(var(--hb-w) * 1px);
    height:calc(var(--hb-h) * 1px);min-height:calc(var(--hb-h) * 1px);
    max-height:none;flex-shrink:0;
  }
  .mb-hero-builder__canvas-wrap{
    position:relative;left:0;transform:none;
    width:calc(var(--hb-w) * 1px);height:calc(var(--hb-h) * 1px);
  }
}
@media(max-width:520px){
  .mb-hero-builder__toolbar-back{display:none}
}

@keyframes mb-hero-showcase-in{
  from{opacity:0;transform:translateY(18px)}
  to{opacity:1;transform:none}
}
@media(prefers-reduced-motion:reduce){
  .mb-premium__hero-showcase{animation:none!important;opacity:1;transform:none}
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

const HERO_OPENAI_ICON = `<svg class="openai-agent-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.938 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .742 7.097 5.98 5.98 0 0 0 .511 4.936 6.051 6.051 0 0 0 6.514 2.9 5.985 5.985 0 0 0 4.997-2.9 6.056 6.056 0 0 0 3.997-2.9 5.995 5.995 0 0 0 .336-6.394zm-9.282 8.179a4.475 4.475 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.806 18.329a4.472 4.472 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-5.934-1.621zM2.34 7.895a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.168a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`;

/** Conexiones ortogonales — viewBox 1600×380 */
const HERO_BUILDER_EDGES = [
  { d: "M 206 209 H 248 V 188 H 260", tone: "green" },
  { d: "M 428 188 H 478 V 218 H 500", tone: "green" },
  { d: "M 620 192 H 652 V 78 H 680", tone: "green" },
  { d: "M 620 218 H 652 V 154 H 680", tone: "green" },
  { d: "M 620 244 H 652 V 246 H 680", tone: "green" },
  { d: "M 838 78 H 878 V 170 H 920", tone: "cyan" },
  { d: "M 808 154 H 864 V 170 H 920", tone: "cyan" },
  { d: "M 808 246 H 864 V 198 H 920", tone: "cyan" },
  { d: "M 1092 170 H 1130 V 182 H 1160", tone: "green" },
  { d: "M 1288 182 H 1320 V 222 H 1340", tone: "gold" },
];

function renderHeroBuilderEdgesSvg() {
  const paths = HERO_BUILDER_EDGES.map(
    (edge) =>
      `<path class="mb-hero-builder__edge mb-hero-builder__edge--${edge.tone}" d="${edge.d}"/>`
  ).join("");
  return `<svg class="mb-hero-builder__edges" viewBox="0 0 1600 380" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths}</svg>`;
}

function renderHeroBuilderStartNode() {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--primary" style="left:20px;top:165px">
    <div class="node node-start">
      <h3 class="node-title node-title-start">▶ Inicio del Flujo</h3>
      <p class="node-desc node-desc-start">Aquí comienza tu flujo.</p>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderContentNode() {
  return `
  <div class="mb-hero-builder__node-item" style="left:260px;top:128px">
    <div class="node content-node">
      <div class="port in"></div>
      <div class="content-header">
        <span class="content-header-title">💬 Contenido</span>
        <span class="content-status content-status--completo">Completo</span>
      </div>
      <div class="content-body">
        <p class="content-preview">¡Hola! 👋 Info del producto y medios de pago.</p>
        <div class="content-variants" aria-hidden="true">
          <span class="content-variant-thumb"></span>
          <span class="content-variant-thumb"></span>
        </div>
      </div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderMiniContentNode(label, preview, top) {
  return `
  <div class="mb-hero-builder__node-item" style="left:680px;top:${top}px">
    <div class="node content-node content-node--mini">
      <div class="port in"></div>
      <div class="content-header">
        <span class="content-header-title">💬 ${escapeHtml(label)}</span>
      </div>
      <div class="content-body">
        <p class="content-preview">${escapeHtml(preview)}</p>
      </div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderOpenAINode() {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--primary mb-hero-builder__node-item--hero" style="left:500px;top:158px">
    <div class="node openai-agent-node">
      <div class="openai-agent-circle">
        <span class="openai-agent-status-badge">+ IA Activa</span>
        <div class="openai-agent-icon-wrap">${HERO_OPENAI_ICON}</div>
        <h3 class="openai-agent-title">Agente OpenAI</h3>
        <div class="port in"></div>
        <div class="port out port--top"></div>
        <div class="port out"></div>
        <div class="port out port--bottom"></div>
      </div>
    </div>
  </div>`;
}

function renderHeroBuilderSeguimientoNode() {
  return `
  <div class="mb-hero-builder__node-item" style="left:680px;top:28px">
    <div class="node seguimiento-v2-node">
      <div class="port in"></div>
      <div class="segv2-shell">
        <div class="segv2-header">
          <span class="segv2-lock">🔒</span>
          <div>
            <div class="segv2-title">Seguimiento CRM V2</div>
            <span class="segv2-badge">2 pasos</span>
          </div>
        </div>
        <div class="segv2-steps">
          <div class="segv2-step">1 · Texto seguimiento</div>
          <div class="segv2-step">2 · Imagen oferta</div>
        </div>
      </div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderLectorNode() {
  return `
  <div class="mb-hero-builder__node-item" style="left:920px;top:100px">
    <div class="node lector-pago-node">
      <div class="port in"></div>
      <div class="lector-pago-header">
        <div class="lector-pago-header-main">
          <span class="lector-pago-icon">📄</span>
          <h3 class="node-title">Lector Pago</h3>
        </div>
        <span class="lector-pago-status-badge">Esperando</span>
      </div>
      <div class="lector-pago-cards-grid">
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">MONTO</div>
          <div class="lector-pago-card-value">49 USD</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">MONEDA</div>
          <div class="lector-pago-card-value">USD</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">NOMBRE</div>
          <div class="lector-pago-card-value">Cliente</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">TOLERANCIA</div>
          <div class="lector-pago-card-value">±2 USD</div>
        </div>
      </div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderEtiquetaNode() {
  return `
  <div class="mb-hero-builder__node-item" style="left:1160px;top:148px">
    <div class="node node-etiqueta">
      <div class="port in"></div>
      <h3 class="node-title">🏷️ Etiqueta</h3>
      <div class="node-etiqueta-select">VIP · Pagó depósito</div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderConversionNode() {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--primary" style="left:1340px;top:168px">
    <div class="node conversion-node">
      <div class="conversion-circle">
        <span class="conversion-badge-event">Evento</span>
        <div class="conversion-icon" aria-hidden="true">💰</div>
        <h3 class="conversion-title">Conversión</h3>
        <p class="conversion-venta">Venta 49 USD</p>
        <div class="port in"></div>
      </div>
    </div>
  </div>`;
}

function renderHeroBuilderDemo() {
  const nodes = [
    renderHeroBuilderStartNode(),
    renderHeroBuilderContentNode(),
    renderHeroBuilderOpenAINode(),
    renderHeroBuilderSeguimientoNode(),
    renderHeroBuilderMiniContentNode("QR", "Envía datos de pago QR", 118),
    renderHeroBuilderMiniContentNode("Depósito", "Instrucciones bancarias", 210),
    renderHeroBuilderLectorNode(),
    renderHeroBuilderEtiquetaNode(),
    renderHeroBuilderConversionNode(),
  ].join("");

  return `
<div class="mb-hero-builder" aria-label="Vista previa del constructor visual de MacBot">
  <div class="mb-hero-builder__shell">
    <div class="mb-hero-builder__toolbar">
      <div class="mb-hero-builder__toolbar-left">
        <span class="mb-hero-builder__toolbar-back">← Flujos</span>
        <div>
          <p class="mb-hero-builder__toolbar-title">Ventas WhatsApp</p>
          <p class="mb-hero-builder__toolbar-hint">Constructor visual · Flujo activo</p>
        </div>
      </div>
      <span class="mb-hero-builder__toolbar-pill">Flujo activo</span>
    </div>
    <div class="mb-hero-builder__stage">
      <div class="mb-hero-builder__scroll">
        <div class="mb-hero-builder__scale">
          <div class="mb-hero-builder__canvas-wrap">
            <div class="mb-hero-builder__grid" aria-hidden="true"></div>
            ${renderHeroBuilderEdgesSvg()}
            <div class="mb-hero-builder__nodes">${nodes}</div>
          </div>
        </div>
      </div>
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
