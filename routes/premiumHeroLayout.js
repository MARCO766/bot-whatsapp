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
  width:100%;max-width:1400px;margin:36px auto 0;
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

/* ── Builder demo showcase ── */
.mb-hero-builder{
  --hb-w:920;--hb-h:340;
  width:100%;max-width:1400px;margin:0 auto;
  container-type:inline-size;
  container-name:hero-builder;
}
.mb-hero-builder__shell{
  border-radius:16px;
  border:1px solid rgba(57,255,20,.14);
  background:linear-gradient(180deg,rgba(10,14,22,.97),rgba(6,10,16,.95));
  box-shadow:0 28px 72px rgba(0,0,0,.52),0 0 0 1px rgba(255,255,255,.04) inset,0 0 48px rgba(57,255,20,.07);
  overflow:visible;
  animation:mb-hero-shell-glow 2.4s ease-out 1 both;
}
.mb-hero-builder__toolbar{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);
  background:rgba(12,18,28,.94);
}
.mb-hero-builder__toolbar-left{display:flex;align-items:center;gap:10px;min-width:0}
.mb-hero-builder__toolbar-back{
  padding:7px 11px;border-radius:9px;border:none;
  background:#1c212c;color:#e2e8f0;font-size:.7rem;font-weight:700;font-family:inherit;
}
.mb-hero-builder__toolbar-title{margin:0;font-size:.9rem;font-weight:700;color:#39ff14;line-height:1.2}
.mb-hero-builder__toolbar-hint{margin:2px 0 0;font-size:.62rem;color:#64748b}
.mb-hero-builder__toolbar-pill{
  padding:6px 10px;border-radius:999px;
  border:1px solid rgba(57,255,20,.32);
  background:rgba(57,255,20,.1);
  color:#86efac;font-size:.62rem;font-weight:700;white-space:nowrap;
}
.mb-hero-builder__stage{
  position:relative;
  overflow:visible;
  padding:8px 12px 0;
  min-height:420px;
}
.mb-hero-builder__scroll{
  overflow:visible;
  -webkit-overflow-scrolling:touch;
  width:100%;
  display:flex;
  justify-content:center;
}
.mb-hero-builder__scale{
  position:relative;
  width:100%;
  height:calc(var(--hb-h) * 1px * (100cqw / var(--hb-w)));
  min-height:320px;
  max-height:420px;
}
.mb-hero-builder__canvas-wrap{
  position:absolute;left:50%;top:0;
  width:calc(var(--hb-w) * 1px);height:calc(var(--hb-h) * 1px);
  transform-origin:top center;
  transform:translateX(-50%) scale(calc(100cqw / (var(--hb-w) * 1px)));
}
@supports not (width: 1cqw){
  .mb-hero-builder__scale{aspect-ratio:920/340;height:auto;min-height:280px;max-height:420px}
  .mb-hero-builder__canvas-wrap{left:0;transform:none;position:relative;margin:0 auto}
}
.mb-hero-builder__grid{
  position:absolute;inset:0;pointer-events:none;
  background-color:#0b1020;
  background-image:radial-gradient(circle,rgba(255,255,255,.07) 1px,transparent 1px);
  background-size:24px 24px;
}
.mb-hero-builder__zoom{
  position:absolute;top:8px;right:8px;z-index:4;
  display:flex;align-items:center;gap:3px;padding:3px;border-radius:10px;
  background:rgba(15,23,42,.9);border:1px solid rgba(255,255,255,.08);
  font-size:.65rem;color:#94a3b8;
}
.mb-hero-builder__zoom span{
  width:28px;height:26px;display:flex;align-items:center;justify-content:center;
  border-radius:7px;background:rgba(255,255,255,.06);color:#e2e8f0;font-weight:800;
}
.mb-hero-builder__zoom em{font-style:normal;font-weight:900;color:#39ff14;padding:0 4px}
.mb-hero-builder__edges{
  position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;
}
.mb-hero-builder__edge{
  fill:none;stroke-width:2.4;stroke-linecap:round;
  stroke-dasharray:7 10;
  animation:mb-hero-edge-pulse 1.8s linear infinite;
}
.mb-hero-builder__edge--green{stroke:rgba(49,255,146,.72);filter:drop-shadow(0 0 3px rgba(49,255,146,.25))}
.mb-hero-builder__edge--orange{stroke:rgba(255,152,0,.68);filter:drop-shadow(0 0 3px rgba(255,152,0,.22))}
.mb-hero-builder__edge--cyan{stroke:rgba(34,211,238,.62);filter:drop-shadow(0 0 3px rgba(34,211,238,.2))}
.mb-hero-builder__edge--purple{stroke:rgba(167,139,250,.58);filter:drop-shadow(0 0 3px rgba(167,139,250,.18))}
.mb-hero-builder__travel-dot{
  fill:#39ff14;r:3;opacity:0;
  will-change:offset-distance,opacity;
  animation:mb-hero-dot-travel var(--dur,2.8s) linear infinite;
  animation-delay:var(--delay,0s);
}
.mb-hero-builder__travel-dot--orange{fill:#ff9800}
.mb-hero-builder__travel-dot--cyan{fill:#22d3ee}
.mb-hero-builder__nodes{position:absolute;inset:0;z-index:2}
.mb-hero-builder__node-item{
  position:absolute;opacity:0;transform:translateX(-12px);
  animation:mb-hero-node-in .55s cubic-bezier(.22,1,.36,1) forwards;
  animation-delay:calc(.18s + var(--delay,0) * 65ms);
  transition:transform .25s ease,filter .25s ease;
}
.mb-hero-builder__node-item:hover{transform:translateY(-2px);filter:brightness(1.06)}
.mb-hero-builder__node-item--glow .node-start,
.mb-hero-builder__node-item--glow .openai-agent-circle,
.mb-hero-builder__node-item--glow .conversion-circle{
  animation:mb-hero-glow-breathe 3.2s ease-in-out infinite;
}
.mb-hero-builder .node{position:relative;box-sizing:border-box;font-family:inherit}
.mb-hero-builder .port{
  position:absolute;width:12px;height:12px;border-radius:50%;
  border:2px solid rgba(255,255,255,.35);box-sizing:border-box;z-index:3;
}
.mb-hero-builder .port.in{
  left:-6px;top:50%;transform:translateY(-50%);
  background:#31ff92;box-shadow:0 0 8px rgba(49,255,146,.65);
}
.mb-hero-builder .port.out{
  right:-6px;top:50%;transform:translateY(-50%);
  background:#ff9800;box-shadow:0 0 8px rgba(255,152,0,.7);
}

/* Nodos — réplica visual MacBot */
.mb-hero-builder .node-start{
  width:178px;min-height:84px;padding:11px 13px;border-radius:14px;
  background:linear-gradient(135deg,#39ff14,#16c60c);
  border:1px solid rgba(156,255,46,.9);
  box-shadow:0 0 18px rgba(57,255,20,.45),0 0 36px rgba(57,255,20,.18);
}
.mb-hero-builder .node-title-start{margin:0 0 4px;font-size:.76rem;font-weight:800;color:#061018}
.mb-hero-builder .node-desc-start{margin:0;font-size:.66rem;font-weight:600;color:#061018;opacity:.88;line-height:1.35}
.mb-hero-builder .content-node{
  width:200px;border-radius:14px;overflow:visible;
  border:1px solid rgba(56,189,248,.42);
  background:linear-gradient(160deg,rgba(10,22,38,.98),rgba(6,12,22,.98));
  box-shadow:0 0 18px rgba(56,189,248,.12);
}
.mb-hero-builder .content-header{
  display:flex;align-items:center;justify-content:space-between;gap:6px;
  padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07);
}
.mb-hero-builder .content-header-title{color:#67e8f9;font-weight:800;font-size:.68rem}
.mb-hero-builder .content-status--completo{
  font-size:.54rem;font-weight:800;text-transform:uppercase;
  padding:2px 6px;border-radius:999px;color:#39ff14;
  background:rgba(57,255,20,.1);border:1px solid rgba(57,255,20,.32);
}
.mb-hero-builder .content-body{padding:8px 10px 10px}
.mb-hero-builder .content-preview{
  margin:0;padding:7px 9px;border-radius:8px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05);
  font-size:.62rem;line-height:1.4;color:#cbd5e1;
}
.mb-hero-builder .content-variants{
  display:flex;gap:4px;margin-top:6px;
}
.mb-hero-builder .content-variant-thumb{
  width:28px;height:28px;border-radius:6px;
  background:linear-gradient(135deg,rgba(34,211,238,.15),rgba(57,255,20,.1));
  border:1px solid rgba(255,255,255,.08);
}
.mb-hero-builder .openai-agent-node{background:transparent;border:none;box-shadow:none;padding:0}
.mb-hero-builder .openai-agent-node-shell{display:flex;flex-direction:row;align-items:center}
.mb-hero-builder .openai-agent-circle{
  position:relative;width:104px;height:104px;border-radius:50%;flex-shrink:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  background:linear-gradient(145deg,#0f0a1f,#1e1b4b 38%,#312e81 62%,#4338ca);
  border:2px solid rgba(103,232,249,.5);
  box-shadow:0 0 18px rgba(34,211,238,.24),0 0 28px rgba(99,102,241,.12);
}
.mb-hero-builder .openai-agent-status-badge{
  position:absolute;top:-4px;left:50%;transform:translateX(-50%);
  padding:2px 6px;border-radius:999px;font-size:.48rem;font-weight:800;
  letter-spacing:.07em;text-transform:uppercase;color:#a5f3fc;
  background:rgba(15,23,42,.92);border:1px solid rgba(34,211,238,.5);
}
.mb-hero-builder .openai-agent-icon-svg{width:40px;height:40px;color:#f0fdfa;filter:drop-shadow(0 0 8px rgba(103,232,249,.4))}
.mb-hero-builder .openai-agent-title{margin:0;font-size:.58rem;font-weight:800;color:#f8fafc;text-align:center}
.mb-hero-builder .openai-agent-routes-branch{display:flex;align-items:stretch;margin-left:2px}
.mb-hero-builder .openai-agent-routes-stem{position:relative;width:18px;flex-shrink:0}
.mb-hero-builder .openai-agent-routes-stem::before{
  content:"";position:absolute;left:0;top:50%;width:10px;height:2px;
  background:linear-gradient(90deg,#22d3ee,#818cf8);transform:translateY(-50%);
}
.mb-hero-builder .openai-agent-routes-stem::after{
  content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;
  background:linear-gradient(180deg,#22d3ee,#6366f1,#a78bfa);border-radius:2px;
}
.mb-hero-builder .openai-agent-routes-list{
  list-style:none;margin:0;padding:2px 0;display:flex;flex-direction:column;justify-content:center;gap:5px;
}
.mb-hero-builder .openai-agent-route-pill{
  display:flex;align-items:center;gap:5px;min-height:26px;padding:3px 7px 3px 8px;
  border-radius:9px;min-width:98px;position:relative;
  background:linear-gradient(145deg,rgba(15,23,42,.88),rgba(30,27,75,.82));
  border:1px solid rgba(103,232,249,.26);
}
.mb-hero-builder .openai-agent-route-pill::before{
  content:"";position:absolute;left:-10px;top:50%;width:10px;height:2px;
  background:linear-gradient(90deg,#22d3ee,#818cf8);transform:translateY(-50%);
}
.mb-hero-builder .openai-agent-route-pill--crm{border-color:rgba(167,139,250,.35)}
.mb-hero-builder .openai-agent-route-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:16px;height:16px;border-radius:5px;font-size:.58rem;
  color:#67e8f9;background:rgba(34,211,238,.1);border:1px solid rgba(103,232,249,.22);
}
.mb-hero-builder .openai-agent-route-name{font-size:.58rem;font-weight:700;color:#e2e8f0}
.mb-hero-builder .seguimiento-v2-node{
  width:178px;padding:0;border-radius:14px;
  border:2px solid rgba(34,211,238,.5);
  background:linear-gradient(160deg,#0c1929,#0f2744 48%,#0a1628);
  box-shadow:0 0 20px rgba(34,211,238,.12);
}
.mb-hero-builder .segv2-shell{padding:10px 11px 11px}
.mb-hero-builder .segv2-header{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px}
.mb-hero-builder .segv2-lock{font-size:16px;line-height:1;filter:drop-shadow(0 0 6px rgba(34,211,238,.4))}
.mb-hero-builder .segv2-title{font-size:.68rem;font-weight:800;color:#e0f2fe;line-height:1.25}
.mb-hero-builder .segv2-badge{
  display:inline-flex;padding:2px 6px;border-radius:999px;
  font-size:.48rem;font-weight:800;text-transform:uppercase;
  color:#083344;background:#22d3ee;
}
.mb-hero-builder .segv2-steps{
  display:flex;flex-direction:column;gap:4px;
}
.mb-hero-builder .segv2-step{
  padding:5px 7px;border-radius:8px;font-size:.58rem;color:#cbd5e1;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);
}
.mb-hero-builder .rm24-global-node{
  width:172px;padding:9px 10px;border-radius:12px;
  border:1px solid rgba(180,83,9,.5);
  background:linear-gradient(155deg,rgba(255,122,24,.06),rgba(12,18,32,.94) 36%,rgba(10,15,28,.97));
  box-shadow:0 0 16px rgba(255,122,24,.08);
}
.mb-hero-builder .rm24-title{
  margin:0 0 4px;font-size:.66rem;font-weight:800;color:#fdba74;
}
.mb-hero-builder .rm24-sub{margin:0;font-size:.58rem;color:#94a3b8;line-height:1.35}
.mb-hero-builder .rm24-badge{
  display:inline-flex;margin-top:6px;padding:2px 7px;border-radius:999px;
  font-size:.48rem;font-weight:800;text-transform:uppercase;
  color:#1a1408;background:linear-gradient(135deg,#fde047,#f59e0b);
}
.mb-hero-builder .lector-pago-node{
  width:188px;padding:9px 10px 10px;border-radius:14px;
  border:1px solid rgba(129,246,236,.2);
  background:linear-gradient(145deg,rgba(9,14,28,.93),rgba(8,14,22,.9));
  box-shadow:0 0 18px rgba(45,212,191,.07);
  color:#dbe5f5;
}
.mb-hero-builder .lector-pago-header{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:7px}
.mb-hero-builder .lector-pago-header-main{display:flex;align-items:center;gap:6px}
.mb-hero-builder .lector-pago-icon{
  width:20px;height:20px;display:flex;align-items:center;justify-content:center;
  border-radius:6px;background:rgba(34,211,238,.1);border:1px solid rgba(125,211,252,.18);font-size:.65rem;
}
.mb-hero-builder .lector-pago-node .node-title{
  margin:0;font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ecfeff;
}
.mb-hero-builder .lector-pago-status-badge{
  font-size:.48rem;font-weight:700;color:#5eead4;
  padding:2px 6px;border-radius:999px;background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.25);
}
.mb-hero-builder .lector-pago-cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.mb-hero-builder .lector-pago-card{
  padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05);
}
.mb-hero-builder .lector-pago-card-title{font-size:.48rem;font-weight:700;color:#64748b;margin-bottom:1px}
.mb-hero-builder .lector-pago-card-value{font-size:.6rem;font-weight:700;color:#e2e8f0}
.mb-hero-builder .node-etiqueta{
  width:148px;padding:9px 11px;border-radius:12px;
  background:linear-gradient(160deg,rgba(12,18,28,.98),rgba(8,12,20,.98));
  border:1px solid rgba(41,182,246,.5);
  box-shadow:0 0 14px rgba(41,182,246,.18);
}
.mb-hero-builder .node-etiqueta::before{
  content:"";position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:12px 0 0 12px;
  background:linear-gradient(to bottom,#29b6f6,#4fc3f7);
}
.mb-hero-builder .node-etiqueta .node-title{margin:0 0 6px;font-size:.7rem;font-weight:700;color:#29b6f6}
.mb-hero-builder .node-etiqueta-select{
  padding:6px 8px;border-radius:8px;
  background:#0f1117;border:1px solid rgba(51,65,85,.75);color:#e2e8f0;
  font-size:.6rem;
}
.mb-hero-builder .conversion-node{background:transparent;border:none;padding:0;box-shadow:none}
.mb-hero-builder .conversion-circle{
  position:relative;width:96px;height:96px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  background:linear-gradient(145deg,rgba(28,22,8,.92),rgba(12,16,28,.94) 55%,rgba(8,12,22,.98));
  border:2px solid rgba(250,204,21,.58);
  box-shadow:0 0 16px rgba(250,204,21,.16),0 0 26px rgba(247,181,0,.07);
}
.mb-hero-builder .conversion-badge-event{
  position:absolute;top:5px;left:50%;transform:translateX(-50%);
  font-size:.46rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:#1a1408;background:linear-gradient(135deg,#fde047,#f59e0b);
  border-radius:999px;padding:1px 5px;
}
.mb-hero-builder .conversion-icon{font-size:1rem;line-height:1}
.mb-hero-builder .conversion-title{margin:0;font-size:.62rem;font-weight:800;color:#fde047}
.mb-hero-builder .conversion-venta{margin:0;font-size:.52rem;color:#fcd34d;opacity:.9}

/* Stats bar */
.mb-hero-stats{
  display:flex;flex-wrap:wrap;align-items:stretch;justify-content:space-between;gap:8px;
  padding:10px 14px 12px;
  border-top:1px solid rgba(255,255,255,.06);
  background:rgba(8,12,20,.88);
}
.mb-hero-stats__item{
  flex:1 1 100px;min-width:88px;padding:8px 10px;border-radius:10px;
  border:1px solid rgba(255,255,255,.06);
  background:rgba(15,23,42,.45);
  text-align:center;
  transition:border-color .2s,box-shadow .2s;
}
.mb-hero-stats__item:hover{border-color:rgba(57,255,20,.18);box-shadow:0 0 12px rgba(57,255,20,.06)}
.mb-hero-stats__value{
  display:block;font-size:.9rem;font-weight:800;color:#f8fafc;line-height:1.2;margin-bottom:2px;
}
.mb-hero-stats__value--green{color:#39ff14}
.mb-hero-stats__value--cyan{color:#22d3ee}
.mb-hero-stats__value--gold{color:#fbbf24}
.mb-hero-stats__label{font-size:.58rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b}

/* Responsive */
@media(max-width:768px){
  .mb-premium__hero--centered{padding:36px 16px 28px}
  .mb-premium__hero-showcase{margin-top:28px}
  .mb-premium__hero-title{font-size:clamp(1.85rem,6.8vw,2.55rem);line-height:1.04;letter-spacing:-.038em}
  .mb-premium__hero-title-line--l1,
  .mb-premium__hero-title-line--l2{white-space:normal}
  .mb-hero-builder__toolbar-hint{display:none}
  .mb-hero-builder__scroll{
    overflow-x:auto;
    justify-content:flex-start;
    padding-bottom:4px;
  }
  .mb-hero-builder__scale{
    min-width:calc(var(--hb-w) * 1px);
    width:calc(var(--hb-w) * 1px);
    height:calc(var(--hb-h) * 1px);
    min-height:calc(var(--hb-h) * 1px);
    max-height:none;
    flex-shrink:0;
  }
  .mb-hero-builder__canvas-wrap{
    position:relative;left:0;
    transform:none;
    width:calc(var(--hb-w) * 1px);
    height:calc(var(--hb-h) * 1px);
  }
  .mb-hero-stats{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:10px}
  .mb-hero-stats__item{flex:0 0 auto;min-width:110px}
}
@media(max-width:520px){
  .mb-hero-builder__toolbar-back{display:none}
}

@keyframes mb-hero-showcase-in{
  from{opacity:0;transform:translateY(18px)}
  to{opacity:1;transform:none}
}
@keyframes mb-hero-node-in{
  from{opacity:0;transform:translateX(-12px)}
  to{opacity:1;transform:none}
}
@keyframes mb-hero-shell-glow{
  from{box-shadow:0 20px 50px rgba(0,0,0,.45),0 0 24px rgba(57,255,20,.03)}
  to{box-shadow:0 24px 64px rgba(0,0,0,.5),0 0 40px rgba(57,255,20,.05)}
}
@keyframes mb-hero-edge-pulse{to{stroke-dashoffset:-30}}
@keyframes mb-hero-glow-breathe{
  0%,100%{filter:brightness(1)}
  50%{filter:brightness(1.08)}
}
@keyframes mb-hero-dot-travel{
  0%{offset-distance:0%;opacity:0}
  8%{opacity:1}
  92%{opacity:1}
  100%{offset-distance:100%;opacity:0}
}
@media(prefers-reduced-motion:reduce){
  .mb-premium__hero-showcase,.mb-hero-builder__node-item,.mb-hero-builder__shell,.mb-hero-builder__edge,.mb-hero-builder__travel-dot{
    animation:none!important;
  }
  .mb-premium__hero-showcase,.mb-hero-builder__node-item{opacity:1;transform:none}
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

const HERO_STATS = [
  { value: "+128", label: "Leads hoy", tone: "green" },
  { value: "24", label: "Ventas hoy", tone: "" },
  { value: "$486", label: "Ingresos hoy", tone: "cyan" },
  { value: "18.7%", label: "Conversión", tone: "gold" },
  { value: "99.9%", label: "Uptime", tone: "" },
];

const HERO_OPENAI_ICON = `<svg class="openai-agent-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.938 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .742 7.097 5.98 5.98 0 0 0 .511 4.936 6.051 6.051 0 0 0 6.514 2.9 5.985 5.985 0 0 0 4.997-2.9 6.056 6.056 0 0 0 3.997-2.9 5.995 5.995 0 0 0 .336-6.394zm-9.282 8.179a4.475 4.475 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.806 18.329a4.472 4.472 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-5.934-1.621zM2.34 7.895a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.168a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`;

/** Curvas Bézier horizontales — viewBox 920×340 */
const HERO_BUILDER_EDGES = [
  { d: "M 178 160 C 164 160, 152 160, 142 160", tone: "green", dot: "M 178 160 C 164 160, 152 160, 142 160", delay: "0s", dur: "2.4s" },
  { d: "M 342 160 C 328 160, 318 100, 308 100", tone: "green", dot: "M 342 160 C 328 160, 318 100, 308 100", delay: ".3s", dur: "2.4s" },
  { d: "M 450 74 C 478 58, 498 66, 512 78", tone: "orange", dot: "M 450 74 C 478 58, 498 66, 512 78", delay: ".5s", dur: "2.6s" },
  { d: "M 450 96 C 478 86, 498 80, 512 84", tone: "orange", dot: "M 450 96 C 478 86, 498 80, 512 84", delay: ".8s", dur: "2.6s" },
  { d: "M 450 118 C 456 168, 458 210, 462 232", tone: "purple", dot: "M 450 118 C 456 168, 458 210, 462 232", delay: "1s", dur: "3s" },
  { d: "M 640 238 C 642 238, 643 238, 644 238", tone: "cyan", dot: "M 640 238 C 642 238, 643 238, 644 238", delay: "1.2s", dur: "2.2s" },
  { d: "M 700 78 C 694 78, 690 94, 688 94", tone: "cyan", dot: "M 700 78 C 694 78, 690 94, 688 94", delay: "1.4s", dur: "2.4s" },
  { d: "M 836 94 C 828 94, 824 104, 820 104", tone: "orange", dot: "M 836 94 C 828 94, 824 104, 820 104", delay: "1.6s", dur: "2.2s" },
];

function renderHeroBuilderEdgesSvg() {
  const paths = HERO_BUILDER_EDGES.map(
    (edge) =>
      `<path class="mb-hero-builder__edge mb-hero-builder__edge--${edge.tone}" d="${edge.d}"/>`
  ).join("");
  const dots = HERO_BUILDER_EDGES.map(
    (edge) =>
      `<circle class="mb-hero-builder__travel-dot mb-hero-builder__travel-dot--${edge.tone === "green" ? "" : edge.tone}" style="offset-path:path('${edge.dot}');--delay:${edge.delay};--dur:${edge.dur}" cx="0" cy="0" r="3"/>`
  ).join("");
  return `<svg class="mb-hero-builder__edges" viewBox="0 0 920 340" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths}${dots}</svg>`;
}

function renderHeroBuilderStartNode(delay) {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--glow" style="left:0;top:118px;--delay:${delay}">
    <div class="node node-start">
      <h3 class="node-title node-title-start">▶ Inicio del Flujo</h3>
      <p class="node-desc node-desc-start">Aquí comienza tu flujo.</p>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderContentNode(delay) {
  return `
  <div class="mb-hero-builder__node-item" style="left:142px;top:98px;--delay:${delay}">
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

function renderHeroBuilderOpenAINode(delay) {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--glow" style="left:308px;top:48px;--delay:${delay}">
    <div class="node openai-agent-node openai-agent-node--with-routes">
      <div class="openai-agent-node-shell">
        <div class="openai-agent-core-column">
          <div class="openai-agent-circle">
            <span class="openai-agent-status-badge">+ IA Activa</span>
            <div class="openai-agent-icon-wrap">${HERO_OPENAI_ICON}</div>
            <h3 class="openai-agent-title">Agente OpenAI</h3>
            <div class="port in"></div>
          </div>
        </div>
        <div class="openai-agent-routes-branch">
          <div class="openai-agent-routes-stem" aria-hidden="true"></div>
          <ul class="openai-agent-routes-list">
            <li class="openai-agent-route-pill">
              <span class="openai-agent-route-icon">📲</span>
              <span class="openai-agent-route-name">QR</span>
            </li>
            <li class="openai-agent-route-pill">
              <span class="openai-agent-route-icon">🏦</span>
              <span class="openai-agent-route-name">Depósito</span>
            </li>
            <li class="openai-agent-route-pill openai-agent-route-pill--crm">
              <span class="openai-agent-route-icon">🔒</span>
              <span class="openai-agent-route-name">CRM V2</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>`;
}

function renderHeroBuilderSeguimientoNode(delay) {
  return `
  <div class="mb-hero-builder__node-item" style="left:462px;top:218px;--delay:${delay}">
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

function renderHeroBuilderRemarketingNode(delay) {
  return `
  <div class="mb-hero-builder__node-item" style="left:644px;top:218px;--delay:${delay}">
    <div class="node rm24-global-node">
      <div class="port in"></div>
      <h3 class="rm24-title">🎯 Remarketing 24h</h3>
      <p class="rm24-sub">Recupera leads sin respuesta en ventana Meta.</p>
      <span class="rm24-badge">Activo</span>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderLectorNode(delay) {
  return `
  <div class="mb-hero-builder__node-item" style="left:512px;top:0;--delay:${delay}">
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
          <div class="lector-pago-card-title">💵 MONTO</div>
          <div class="lector-pago-card-value">49 USD</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">🌍 MONEDA</div>
          <div class="lector-pago-card-value">USD</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">👤 NOMBRE</div>
          <div class="lector-pago-card-value">Cliente</div>
        </div>
        <div class="lector-pago-card">
          <div class="lector-pago-card-title">± TOLERANCIA</div>
          <div class="lector-pago-card-value">±2 USD</div>
        </div>
      </div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderEtiquetaNode(delay) {
  return `
  <div class="mb-hero-builder__node-item" style="left:688px;top:38px;--delay:${delay}">
    <div class="node node-etiqueta">
      <div class="port in"></div>
      <h3 class="node-title">🏷️ Etiqueta</h3>
      <div class="node-etiqueta-select">VIP · Pagó depósito</div>
      <div class="port out"></div>
    </div>
  </div>`;
}

function renderHeroBuilderConversionNode(delay) {
  return `
  <div class="mb-hero-builder__node-item mb-hero-builder__node-item--glow" style="left:820px;top:56px;--delay:${delay}">
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

function renderHeroStatsBar() {
  const items = HERO_STATS.map((stat) => {
    const toneClass = stat.tone ? ` mb-hero-stats__value--${stat.tone}` : "";
    return `
    <div class="mb-hero-stats__item">
      <span class="mb-hero-stats__value${toneClass}">${escapeHtml(stat.value)}</span>
      <span class="mb-hero-stats__label">${escapeHtml(stat.label)}</span>
    </div>`;
  }).join("");
  return `<div class="mb-hero-stats" aria-label="Métricas en tiempo real">${items}</div>`;
}

function renderHeroBuilderDemo() {
  const nodes = [
    renderHeroBuilderStartNode(0),
    renderHeroBuilderContentNode(1),
    renderHeroBuilderOpenAINode(2),
    renderHeroBuilderLectorNode(3),
    renderHeroBuilderEtiquetaNode(4),
    renderHeroBuilderConversionNode(5),
    renderHeroBuilderSeguimientoNode(6),
    renderHeroBuilderRemarketingNode(7),
  ].join("");

  return `
<div class="mb-hero-builder" aria-label="Vista previa del constructor visual de MacBot">
  <div class="mb-hero-builder__shell">
    <div class="mb-hero-builder__toolbar">
      <div class="mb-hero-builder__toolbar-left">
        <span class="mb-hero-builder__toolbar-back">← Flujos</span>
        <div>
          <p class="mb-hero-builder__toolbar-title">🔀 Ventas WhatsApp</p>
          <p class="mb-hero-builder__toolbar-hint">Constructor visual · Arrastra nodos y conecta automatizaciones</p>
        </div>
      </div>
      <span class="mb-hero-builder__toolbar-pill">● Flujo activo</span>
    </div>
    <div class="mb-hero-builder__stage">
      <div class="mb-hero-builder__scroll">
        <div class="mb-hero-builder__scale">
          <div class="mb-hero-builder__canvas-wrap">
            <div class="mb-hero-builder__grid" aria-hidden="true"></div>
            <div class="mb-hero-builder__zoom" aria-hidden="true"><span>−</span><em>100%</em><span>+</span></div>
            ${renderHeroBuilderEdgesSvg()}
            <div class="mb-hero-builder__nodes">${nodes}</div>
          </div>
        </div>
      </div>
    </div>
    ${renderHeroStatsBar()}
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
