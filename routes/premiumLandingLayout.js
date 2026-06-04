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
.mb-premium__particles{
  position:absolute;inset:0;overflow:hidden;pointer-events:none;
}
.mb-premium__particle{
  position:absolute;width:3px;height:3px;border-radius:50%;
  background:rgba(57,255,20,.35);
  box-shadow:0 0 8px rgba(57,255,20,.4);
  animation:mb-prem-particle 14s ease-in-out infinite;
  animation-delay:calc(var(--d,0) * -.9s);
  opacity:.5;
}
.mb-premium__particle:nth-child(1){left:8%;top:18%}
.mb-premium__particle:nth-child(2){left:22%;top:62%;background:rgba(34,211,238,.4)}
.mb-premium__particle:nth-child(3){left:45%;top:12%;width:2px;height:2px}
.mb-premium__particle:nth-child(4){left:68%;top:44%}
.mb-premium__particle:nth-child(5){left:82%;top:22%;background:rgba(167,139,250,.45)}
.mb-premium__particle:nth-child(6){left:15%;top:78%}
.mb-premium__particle:nth-child(7){left:55%;top:72%;background:rgba(34,211,238,.35)}
.mb-premium__particle:nth-child(8){left:90%;top:58%}
.mb-premium__particle:nth-child(9){left:35%;top:38%;opacity:.35}
.mb-premium__particle:nth-child(10){left:72%;top:82%}
.mb-premium__particle:nth-child(11){left:5%;top:48%}
.mb-premium__particle:nth-child(12){left:58%;top:28%}
.mb-premium__particle:nth-child(13){left:38%;top:88%;background:rgba(57,255,20,.25)}
.mb-premium__particle:nth-child(14){left:92%;top:35%}
.mb-premium__wrap{position:relative;z-index:1}
.mb-premium__reveal{
  opacity:0;transform:translateY(28px);
  transition:opacity .65s cubic-bezier(.22,1,.36,1),transform .65s cubic-bezier(.22,1,.36,1);
}
.mb-premium__reveal.is-visible{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){
  .mb-premium__reveal{opacity:1;transform:none;transition:none}
  .mb-premium__particle,.mb-premium__flow-spark,.mb-premium__metric-value,.mb-builder__canvas-inner,.mb-builder__node,.mb-builder__edge-spark{animation:none!important}
}

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
  display:flex;flex-direction:column;align-items:center;text-align:center;
  max-width:920px;margin:0 auto;padding:72px 24px 40px;
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
  margin:0 0 18px;font-size:clamp(1.85rem,4.5vw,2.85rem);
  font-weight:700;letter-spacing:-.03em;line-height:1.12;color:#f8fafc;
}
.mb-premium__hero-title span{
  display:block;margin-top:.15em;
  background:linear-gradient(135deg,#39ff14 0%,#22d3ee 50%,#a78bfa 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.mb-premium__hero-sub{
  margin:0 auto 24px;font-size:1.0625rem;line-height:1.7;color:#94a3b8;max-width:640px;
}
.mb-premium__hero-chips{
  display:flex;flex-wrap:wrap;gap:10px;justify-content:center;
  margin:0 auto 32px;max-width:720px;
}
.mb-premium__chip{
  padding:8px 14px;border-radius:999px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.55);
  font-size:.78rem;font-weight:500;color:#cbd5e1;
  backdrop-filter:blur(8px);
  transition:border-color .2s,box-shadow .2s,transform .2s;
}
.mb-premium__chip:hover{
  border-color:rgba(57,255,20,.28);
  box-shadow:0 0 16px rgba(57,255,20,.08);
  transform:translateY(-1px);
}
.mb-premium__chip strong{color:#86efac;font-weight:600;margin-right:4px}
.mb-premium__hero-cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
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

/* Builder mockup */
.mb-premium__flow-section{padding-top:16px;padding-bottom:72px}
.mb-builder{
  max-width:1140px;margin:0 auto;padding:0 24px;
}
.mb-builder__shell{
  border-radius:20px;
  border:1px solid rgba(57,255,20,.12);
  background:rgba(8,12,18,.92);
  box-shadow:0 28px 72px rgba(0,0,0,.5),0 0 48px rgba(57,255,20,.05);
  overflow:hidden;
}
.mb-builder__stats{
  display:grid;grid-template-columns:repeat(4,1fr);gap:1px;
  background:rgba(255,255,255,.06);
  border-bottom:1px solid rgba(255,255,255,.06);
}
@media(max-width:640px){
  .mb-builder__stats{grid-template-columns:repeat(2,1fr)}
}
.mb-builder__stat{
  padding:12px 16px;background:rgba(10,15,22,.95);
  display:flex;flex-direction:column;gap:4px;
}
.mb-builder__stat span{font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
.mb-builder__stat strong{font-size:1rem;font-weight:700;color:#f1f5f9;font-variant-numeric:tabular-nums}
.mb-builder__stat strong em{font-style:normal;color:#39ff14}
.mb-builder__workspace{
  display:grid;grid-template-columns:1fr minmax(200px,248px);gap:0;
  min-height:380px;
}
@media(max-width:900px){
  .mb-builder__workspace{grid-template-columns:1fr}
}
.mb-builder__canvas-zone{
  position:relative;border-right:1px solid rgba(255,255,255,.06);
  overflow:hidden;
}
@media(max-width:900px){
  .mb-builder__canvas-zone{border-right:none;border-bottom:1px solid rgba(255,255,255,.06)}
}
.mb-builder__canvas-scroll{
  overflow-x:auto;-webkit-overflow-scrolling:touch;
  padding:12px;
}
.mb-builder__canvas-inner{
  position:relative;min-width:min(100%,520px);max-width:720px;margin:0 auto;
  aspect-ratio:16/10;min-height:300px;
  animation:mb-builder-pan 18s ease-in-out infinite alternate;
  transform-origin:center center;
}
@media(max-width:640px){
  .mb-builder__canvas-inner{min-width:480px;min-height:340px}
}
.mb-builder__canvas{
  position:absolute;inset:0;border-radius:14px;
  background:radial-gradient(ellipse 80% 60% at 50% 40%,rgba(57,255,20,.04),transparent 55%),#070b12;
  border:1px solid rgba(255,255,255,.07);
  overflow:hidden;
}
.mb-builder__canvas-grid{
  position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:22px 22px;
  mask-image:radial-gradient(ellipse 95% 85% at 50% 45%,#000 20%,transparent 78%);
}
.mb-builder__edges{
  position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;
}
.mb-builder__edge{
  fill:none;stroke:url(#mbBuilderEdgeGrad);stroke-width:.55;
  stroke-linecap:round;stroke-linejoin:round;
  filter:url(#mbBuilderGlow);opacity:.75;
}
.mb-builder__edge-spark{
  fill:none;stroke:#39ff14;stroke-width:.65;stroke-linecap:round;
  stroke-dasharray:2.5 36;opacity:.95;
  filter:drop-shadow(0 0 3px rgba(57,255,20,.8));
  animation:mb-builder-edge-flow 2s linear infinite;
}
.mb-builder__edge-spark--d1{animation-delay:-.35s;stroke:#22d3ee}
.mb-builder__edge-spark--d2{animation-delay:-.9s}
.mb-builder__edge-spark--d3{animation-delay:-1.4s;stroke:#a78bfa}
.mb-builder__edge-spark--d4{animation-delay:-.6s;stroke:#22d3ee}
.mb-builder__edge-spark--d5{animation-delay:-1.1s}
.mb-builder__edge-spark--d6{animation-delay:-1.65s;stroke:#a78bfa}
.mb-builder__edge-spark--d7{animation-delay:-.2s}
.mb-builder__nodes{position:absolute;inset:0;z-index:2}
.mb-builder__node{
  position:absolute;left:var(--x);top:var(--y);
  transform:translate(-50%,-50%);
  display:flex;align-items:center;gap:8px;
  padding:9px 12px 9px 10px;border-radius:12px;
  background:rgba(12,18,28,.78);
  backdrop-filter:blur(12px);
  border:1px solid var(--border);
  box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 20px var(--glow);
  font-size:.72rem;font-weight:600;color:#f1f5f9;
  white-space:nowrap;cursor:default;
  animation:mb-builder-float 5s ease-in-out infinite;
  animation-delay:calc(var(--float,0) * -.55s);
  transition:border-color .25s,box-shadow .25s,transform .25s;
}
.mb-builder__node:hover{
  z-index:3;
  animation-play-state:paused;
  box-shadow:0 12px 32px rgba(0,0,0,.45),0 0 32px var(--glow);
  transform:translate(-50%,-50%) scale(1.04);
}
.mb-builder__node--green{--border:rgba(57,255,20,.35);--glow:rgba(57,255,20,.12);--port:#39ff14}
.mb-builder__node--cyan{--border:rgba(34,211,238,.35);--glow:rgba(34,211,238,.12);--port:#22d3ee}
.mb-builder__node--purple{--border:rgba(167,139,250,.35);--glow:rgba(167,139,250,.12);--port:#a78bfa}
.mb-builder__node--gold{--border:rgba(251,191,36,.35);--glow:rgba(251,191,36,.1);--port:#fbbf24}
.mb-builder__node-icon{
  width:28px;height:28px;border-radius:8px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:.85rem;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
}
.mb-builder__port{
  position:absolute;width:7px;height:7px;border-radius:50%;
  background:var(--port,#39ff14);
  border:2px solid #070b12;
  box-shadow:0 0 8px var(--port,#39ff14);
  z-index:1;
}
.mb-builder__port--t{top:-5px;left:50%;transform:translateX(-50%)}
.mb-builder__port--b{bottom:-5px;left:50%;transform:translateX(-50%)}
.mb-builder__port--l{left:-5px;top:50%;transform:translateY(-50%)}
.mb-builder__port--r{right:-5px;top:50%;transform:translateY(-50%)}
.mb-builder__panel{
  padding:16px 14px;background:rgba(10,14,22,.96);
  display:flex;flex-direction:column;gap:12px;
}
.mb-builder__panel-head{
  display:flex;align-items:center;gap:8px;
  font-size:.9rem;font-weight:700;color:#f8fafc;
  padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08);
}
.mb-builder__panel-dot{
  width:8px;height:8px;border-radius:50%;background:#39ff14;
  box-shadow:0 0 10px rgba(57,255,20,.6);
  animation:mb-prem-pulse 2s ease-in-out infinite;
}
.mb-builder__panel-row{
  padding:10px 11px;border-radius:10px;
  background:rgba(15,23,42,.55);
  border:1px solid rgba(255,255,255,.06);
}
.mb-builder__panel-row span{
  display:block;font-size:.65rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;
}
.mb-builder__panel-row strong{font-size:.8rem;color:#e2e8f0;font-weight:600}
.mb-builder__panel-routes{
  display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;
}
.mb-builder__route-tag{
  padding:4px 8px;border-radius:6px;font-size:.68rem;font-weight:600;
  background:rgba(34,211,238,.1);color:#67e8f9;border:1px solid rgba(34,211,238,.25);
}
.mb-builder__panel-status{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 10px;border-radius:999px;
  background:rgba(57,255,20,.1);color:#86efac;
  font-size:.72rem;font-weight:600;border:1px solid rgba(57,255,20,.25);
}
/* Metrics */
.mb-premium__metrics-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;
}
.mb-premium__metric{
  padding:24px 18px;border-radius:16px;text-align:center;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(15,23,42,.5);
  backdrop-filter:blur(12px);
  transition:border-color .25s,transform .25s,box-shadow .25s;
}
.mb-premium__metric:hover{
  border-color:rgba(57,255,20,.22);
  transform:translateY(-4px);
  box-shadow:0 12px 32px rgba(0,0,0,.28),0 0 24px rgba(57,255,20,.06);
}
.mb-premium__metric-icon{font-size:1.75rem;margin-bottom:10px;display:block}
.mb-premium__metric-label{
  font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;
}
.mb-premium__metric-value{
  font-size:1.35rem;font-weight:700;color:#f8fafc;line-height:1.2;
}
.mb-premium__metric-value--gradient{
  background:linear-gradient(135deg,#39ff14,#22d3ee);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
/* Final CTA */
.mb-premium__final-cta{
  max-width:800px;margin:0 auto 56px;padding:48px 32px;text-align:center;
  border-radius:24px;
  border:1px solid rgba(57,255,20,.2);
  background:linear-gradient(145deg,rgba(57,255,20,.08),rgba(15,23,42,.8) 45%,rgba(34,211,238,.06));
  box-shadow:0 24px 60px rgba(0,0,0,.35),0 0 48px rgba(57,255,20,.08);
  backdrop-filter:blur(16px);
}
.mb-premium__final-cta h2{margin:0 0 12px;font-size:clamp(1.5rem,3vw,2rem);font-weight:700}
.mb-premium__final-cta p{margin:0 auto 28px;max-width:480px;color:#94a3b8;line-height:1.6}
.mb-premium__final-cta-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
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
.mb-premium__plan--popular{
  position:relative;
  border-color:rgba(74,222,128,.5);
  box-shadow:
    0 0 72px rgba(34,197,94,.22),
    0 0 40px rgba(167,139,250,.16),
    inset 0 0 0 1px rgba(57,255,20,.1);
  transform:scale(1.02);
  z-index:1;
}
@media(max-width:768px){.mb-premium__plan--popular{transform:none}}
.mb-premium__plan-badge{
  position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  padding:5px 14px;border-radius:999px;
  background:linear-gradient(135deg,#a78bfa,#39ff14);
  color:#060a10;font-size:.65rem;font-weight:800;letter-spacing:.08em;
  white-space:nowrap;box-shadow:0 0 20px rgba(167,139,250,.4);
}
.mb-premium__plan-price{
  margin:0 0 12px;font-size:1.125rem;font-weight:600;color:#22d3ee;
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
.mb-premium__plan-btn--contact{
  background:rgba(34,211,238,.1);color:#67e8f9;
  border:1px solid rgba(34,211,238,.35);
}
.mb-premium__plan-btn--contact:hover{
  background:rgba(34,211,238,.18);box-shadow:0 0 24px rgba(34,211,238,.15);
  transform:translateY(-1px);
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
@keyframes mb-prem-particle{
  0%,100%{transform:translate(0,0) scale(1);opacity:.35}
  50%{transform:translate(8px,-14px) scale(1.2);opacity:.7}
}
@keyframes mb-prem-spark{
  0%{top:-30%;opacity:0}
  15%{opacity:1}
  85%{opacity:1}
  100%{top:110%;opacity:0}
}
@keyframes mb-builder-pan{
  0%{transform:scale(1) translate(0,0)}
  100%{transform:scale(1.025) translate(-6px,4px)}
}
@keyframes mb-builder-float{
  0%,100%{transform:translate(-50%,-50%) translateY(0)}
  50%{transform:translate(-50%,-50%) translateY(-5px)}
}
@keyframes mb-builder-edge-flow{to{stroke-dashoffset:-38.5}}
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
    <a href="/pricing" class="mb-premium__nav-link">Planes</a>
    <a href="/login#login" class="mb-premium__nav-link">Iniciar sesión</a>
  </nav>
  <div class="mb-premium__nav-actions">
    <a href="/login#login" class="mb-premium__btn-ghost">Iniciar sesión</a>
    <a href="/register" class="mb-premium__btn-primary">Crear cuenta</a>
  </div>
</header>`;
}

const HERO_CHIPS = [
  "IA integrada",
  "CRM WhatsApp",
  "Remarketing 24h",
  "Seguimientos automáticos",
  "Lector de pagos",
  "Multi WhatsApp",
];

const BUILDER_NODES = [
  { id: "wa", type: "green", icon: "📱", label: "Activador WhatsApp", x: 50, y: 9, float: 0, ports: "b" },
  { id: "ia", type: "cyan", icon: "🤖", label: "Agente IA", x: 50, y: 27, float: 1, ports: "tb" },
  { id: "crm", type: "purple", icon: "🔄", label: "Seguimiento CRM", x: 20, y: 47, float: 2, ports: "trb" },
  { id: "qr", type: "cyan", icon: "📲", label: "Enviar QR", x: 80, y: 47, float: 3, ports: "tlb" },
  { id: "rm", type: "purple", icon: "🎯", label: "Remarketing 24h", x: 20, y: 67, float: 4, ports: "trb" },
  { id: "pay", type: "gold", icon: "💰", label: "Lector de pagos", x: 80, y: 67, float: 5, ports: "tlb" },
  { id: "conv", type: "green", icon: "📈", label: "Conversión", x: 50, y: 87, float: 6, ports: "t" },
];

const BUILDER_EDGES = [
  "M50 14 L50 21",
  "M50 33 L50 37 L20 37 L20 43",
  "M50 33 L50 37 L80 37 L80 43",
  "M20 51 L20 59",
  "M80 51 L80 59",
  "M20 63 L20 73 L50 73 L50 81",
  "M80 63 L80 73 L50 73",
];

function renderBuilderEdgesSvg() {
  const base = BUILDER_EDGES.map((d) => `<path class="mb-builder__edge" d="${d}"/>`).join("");
  const sparks = BUILDER_EDGES.map(
    (d, i) => `<path class="mb-builder__edge-spark mb-builder__edge-spark--d${(i % 7) + 1}" d="${d}"/>`
  ).join("");
  return `
<svg class="mb-builder__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="mbBuilderEdgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#39ff14" stop-opacity=".9"/>
      <stop offset="50%" stop-color="#22d3ee" stop-opacity=".85"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity=".8"/>
    </linearGradient>
    <filter id="mbBuilderGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation=".6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${base}${sparks}
</svg>`;
}

function renderBuilderPort(port) {
  if (port === "t") return '<span class="mb-builder__port mb-builder__port--t"></span>';
  if (port === "b") return '<span class="mb-builder__port mb-builder__port--b"></span>';
  if (port === "l") return '<span class="mb-builder__port mb-builder__port--l"></span>';
  if (port === "r") return '<span class="mb-builder__port mb-builder__port--r"></span>';
  if (port === "tb") {
    return '<span class="mb-builder__port mb-builder__port--t"></span><span class="mb-builder__port mb-builder__port--b"></span>';
  }
  if (port === "trb") {
    return '<span class="mb-builder__port mb-builder__port--t"></span><span class="mb-builder__port mb-builder__port--r"></span><span class="mb-builder__port mb-builder__port--b"></span>';
  }
  if (port === "tlb") {
    return '<span class="mb-builder__port mb-builder__port--t"></span><span class="mb-builder__port mb-builder__port--l"></span><span class="mb-builder__port mb-builder__port--b"></span>';
  }
  return "";
}

function renderBuilderPorts(portsStr) {
  return String(portsStr || "")
    .split("")
    .map((p) => renderBuilderPort(p))
    .join("");
}

function renderBuilderNode(node) {
  const ports = renderBuilderPorts(node.ports);
  return `
  <div class="mb-builder__node mb-builder__node--${node.type}" style="--x:${node.x}%;--y:${node.y}%;--float:${node.float}" title="${escapeHtml(node.label)}">
    ${ports}
    <span class="mb-builder__node-icon">${node.icon}</span>
    <span>${escapeHtml(node.label)}</span>
  </div>`;
}

function renderBuilderPanel() {
  return `
<aside class="mb-builder__panel" aria-label="Panel de configuración del nodo">
  <div class="mb-builder__panel-head">
    <span class="mb-builder__panel-dot" aria-hidden="true"></span>
    Agente IA
  </div>
  <div class="mb-builder__panel-row">
    <span>Intención</span>
    <strong>Comprar</strong>
  </div>
  <div class="mb-builder__panel-row">
    <span>Respuesta automática</span>
    <strong>Activa · tono ventas</strong>
  </div>
  <div class="mb-builder__panel-row">
    <span>Rutas</span>
    <div class="mb-builder__panel-routes">
      <span class="mb-builder__route-tag">QR</span>
      <span class="mb-builder__route-tag">Depósito</span>
      <span class="mb-builder__route-tag">Dudas</span>
    </div>
  </div>
  <div class="mb-builder__panel-row">
    <span>Estado</span>
    <span class="mb-builder__panel-status"><span class="mb-builder__panel-dot" aria-hidden="true"></span> Activo</span>
  </div>
</aside>`;
}

function renderParticles() {
  const dots = Array.from({ length: 14 }, (_, i) => `<span class="mb-premium__particle" style="--d:${i}"></span>`).join("");
  return `<div class="mb-premium__particles" aria-hidden="true">${dots}</div>`;
}

function renderHeroSection() {
  const chips = HERO_CHIPS.map(
    (c) => `<span class="mb-premium__chip"><strong>✓</strong>${escapeHtml(c)}</span>`
  ).join("");

  return `
<section class="mb-premium__hero mb-premium__reveal is-visible">
  <div class="mb-premium__hero-badge">
    <span>●</span> Plataforma SaaS para ventas por WhatsApp
  </div>
  <h1 class="mb-premium__hero-title">
    Automatiza ventas por WhatsApp con IA,
    <span>CRM y Flujos Visuales</span>
  </h1>
  <p class="mb-premium__hero-sub">
    MacBot convierte conversaciones en ventas usando inteligencia artificial, seguimiento automático, remarketing, lector de pagos y automatizaciones visuales.
  </p>
  <div class="mb-premium__hero-chips">${chips}</div>
  <div class="mb-premium__hero-cta">
    <a href="/register" class="mb-premium__btn-lg mb-premium__btn-lg--neon">Crear cuenta gratis</a>
    <a href="/pricing" class="mb-premium__btn-lg mb-premium__btn-lg--outline">Ver planes</a>
  </div>
</section>`;
}

function renderFlowSection() {
  const nodes = BUILDER_NODES.map(renderBuilderNode).join("");

  return `
<section class="mb-premium__section mb-premium__flow-section mb-premium__reveal" id="como-funciona">
  <h2 class="mb-premium__section-title">Construye embudos visuales para vender por WhatsApp</h2>
  <p class="mb-premium__section-sub">Arrastra nodos, conecta automatizaciones y deja que MacBot responda, haga seguimiento, lea pagos y registre ventas.</p>
  <div class="mb-builder">
    <div class="mb-builder__shell">
      <div class="mb-builder__stats" aria-label="Métricas del flujo">
        <div class="mb-builder__stat"><span>Leads hoy</span><strong>128</strong></div>
        <div class="mb-builder__stat"><span>Ventas</span><strong>24</strong></div>
        <div class="mb-builder__stat"><span>Ingresos</span><strong><em>$</em>486</strong></div>
        <div class="mb-builder__stat"><span>Conversión</span><strong>18.7%</strong></div>
      </div>
      <div class="mb-builder__workspace">
        <div class="mb-builder__canvas-zone">
          <div class="mb-builder__canvas-scroll">
            <div class="mb-builder__canvas-inner">
              <div class="mb-builder__canvas">
                <div class="mb-builder__canvas-grid" aria-hidden="true"></div>
                ${renderBuilderEdgesSvg()}
                <div class="mb-builder__nodes">${nodes}</div>
              </div>
            </div>
          </div>
        </div>
        ${renderBuilderPanel()}
      </div>
    </div>
  </div>
</section>`;
}

const PRODUCT_CARDS = [
  { icon: "g", emoji: "📥", title: "Bandeja WhatsApp", desc: "Gestiona todas tus conversaciones." },
  { icon: "c", emoji: "🤖", title: "IA Conversacional", desc: "Responde automáticamente a clientes." },
  { icon: "p", emoji: "🔄", title: "Seguimientos CRM", desc: "Automatiza recordatorios y cierres." },
  { icon: "g", emoji: "🎯", title: "Remarketing 24h", desc: "Recupera clientes que no compraron." },
  { icon: "c", emoji: "💰", title: "Lector de pagos", desc: "Valida comprobantes automáticamente." },
  { icon: "p", emoji: "📈", title: "Conversiones", desc: "Mide ventas y resultados." },
  { icon: "g", emoji: "🏷", title: "Etiquetas", desc: "Segmenta contactos fácilmente." },
  { icon: "c", emoji: "🌐", title: "Multi WhatsApp", desc: "Administra varias líneas." },
];

const METRICS = [
  { icon: "⚡", label: "Automatizaciones visuales", count: 10, suffix: "+ nodos", text: null },
  { icon: "🤖", label: "Inteligencia artificial", count: null, suffix: null, text: "Integrada" },
  { icon: "📱", label: "WhatsApp", count: null, suffix: null, text: "Multi número" },
  { icon: "📈", label: "Seguimientos", count: null, suffix: null, text: "Automáticos" },
  { icon: "🎯", label: "Remarketing", count: 24, suffix: " horas", text: null },
  { icon: "💰", label: "Ventas", count: null, suffix: null, text: "Conversión automática" },
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
<section class="mb-premium__section mb-premium__reveal" id="producto">
  <h2 class="mb-premium__section-title">Todo lo que incluye MacBot</h2>
  <p class="mb-premium__section-sub">Herramientas premium para equipos que venden y escalan por WhatsApp.</p>
  <div class="mb-premium__cards">${cards}</div>
</section>`;
}

function renderMetricsSection() {
  const cards = METRICS.map((m) => {
    const valueHtml = m.count != null
      ? `<div class="mb-premium__metric-value mb-premium__metric-value--gradient" data-count="${m.count}" data-suffix="${escapeHtml(m.suffix || "")}">0${escapeHtml(m.suffix || "")}</div>`
      : `<div class="mb-premium__metric-value">${escapeHtml(m.text)}</div>`;
    return `
    <article class="mb-premium__metric">
      <span class="mb-premium__metric-icon">${m.icon}</span>
      <div class="mb-premium__metric-label">${escapeHtml(m.label)}</div>
      ${valueHtml}
    </article>`;
  }).join("");

  return `
<section class="mb-premium__section mb-premium__reveal" id="metricas">
  <h2 class="mb-premium__section-title">MacBot en números</h2>
  <p class="mb-premium__section-sub">Capacidades clave de la plataforma para automatizar tu operación comercial.</p>
  <div class="mb-premium__metrics-grid">${cards}</div>
</section>`;
}

const PLANS = [
  {
    id: "free",
    popular: false,
    price: "Gratis",
    items: ["1 WhatsApp · 100 contactos · 1 flujo", "Agente Rápido", "CRM básico", "Bandeja WhatsApp"],
    tag: "Ideal para probar MacBot.",
    cta: "Empezar gratis",
    href: "/register",
    soon: false,
    contact: false,
  },
  {
    id: "starter",
    popular: false,
    price: "$18/mes",
    items: [
      "1 WhatsApp · 1.000 contactos · 10 flujos",
      "Remarketing 24h · Lector de pagos",
      "Seguimientos CRM · Conversiones",
    ],
    tag: "Ideal para emprendedores, afiliados e infoproductores.",
    cta: "Próximamente",
    soon: true,
    contact: false,
  },
  {
    id: "pro",
    popular: true,
    price: "$35/mes",
    items: [
      "1 WhatsApp · 2.000 contactos · 20 flujos",
      "Todo Starter + IA avanzada",
      "Dashboard ventas · Versionado flujos",
      "Soporte prioritario",
    ],
    tag: "Ideal para negocios que ya venden y quieren escalar.",
    cta: "Próximamente",
    soon: true,
    contact: false,
  },
  {
    id: "agency",
    popular: false,
    price: "Contactar ventas",
    items: [
      "Límites personalizados",
      "Todo Pro + implementación a medida",
      "Soporte VIP y asesoría directa",
    ],
    tag: "Para agencias y empresas.",
    cta: "Contactar ventas",
    href: "mailto:ventas@macbot.app?subject=Plan%20Agency%20MacBot",
    soon: false,
    contact: true,
  },
];

function renderPlansSection() {
  const plans = PLANS.map((p) => {
    let btnClass = "mb-premium__plan-btn--active";
    if (p.soon) btnClass = "mb-premium__plan-btn--soon";
    else if (p.contact) btnClass = "mb-premium__plan-btn--contact";

    const btn = p.soon
      ? `<span class="mb-premium__plan-btn ${btnClass}">${escapeHtml(p.cta)}</span>`
      : `<a href="${escapeHtml(p.href)}" class="mb-premium__plan-btn ${btnClass}">${escapeHtml(p.cta)}</a>`;

    const feat = p.popular ? " mb-premium__plan--popular" : "";
    const badge = p.popular ? '<span class="mb-premium__plan-badge">MÁS POPULAR</span>' : "";
    const priceHtml = p.price ? `<p class="mb-premium__plan-price">${escapeHtml(p.price)}</p>` : "";
    const list = p.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    return `
    <article class="mb-premium__plan${feat}">
      ${badge}
      <h3 class="mb-premium__plan-name">${escapeHtml(p.id.charAt(0).toUpperCase() + p.id.slice(1))}</h3>
      ${priceHtml}
      <p class="mb-premium__plan-tag">${escapeHtml(p.tag)}</p>
      <ul class="mb-premium__plan-list">${list}</ul>
      ${btn}
    </article>`;
  }).join("");

  return `
<section class="mb-premium__section mb-premium__reveal" id="planes">
  <h2 class="mb-premium__section-title">Planes MacBot</h2>
  <p class="mb-premium__section-sub">Empieza gratis y escala cuando tu operación lo necesite. <a href="/pricing" style="color:#22d3ee;text-decoration:none">Ver comparativa completa →</a></p>
  <div class="mb-premium__plans">${plans}</div>
</section>`;
}

function renderFinalCtaSection() {
  return `
<section class="mb-premium__section mb-premium__reveal" style="padding-top:0;padding-bottom:32px">
  <div class="mb-premium__final-cta">
    <h2>Empieza gratis hoy</h2>
    <p>Crea tu cuenta en menos de 1 minuto y conecta tu primer WhatsApp.</p>
    <div class="mb-premium__final-cta-actions">
      <a href="/register" class="mb-premium__btn-lg mb-premium__btn-lg--neon">Crear cuenta gratis</a>
      <a href="/pricing" class="mb-premium__btn-lg mb-premium__btn-lg--outline">Ver planes</a>
    </div>
  </div>
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
    · <a href="/pricing">Ver planes</a>
  </p>
</div>`;
}

const REGISTER_EXTRA_STYLES = `
.mb-register__steps{display:flex;gap:8px;justify-content:center;margin:0 0 20px}
.mb-register__step{flex:1;max-width:140px;text-align:center;font-size:.7rem;color:#64748b;padding:8px 4px;border-radius:8px;border:1px solid rgba(255,255,255,.08)}
.mb-register__step.is-active{color:#39ff14;border-color:rgba(57,255,20,.35);background:rgba(57,255,20,.06)}
.mb-register__step.is-done{color:#94a3b8}
.mb-register__panel[hidden]{display:none!important}
.mb-register__email-hint{margin:0 0 16px;color:#94a3b8;font-size:.9rem;text-align:center}
.mb-register__email-hint strong{color:#e2e8f0}
.mb-register__actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px}
.mb-register__link-btn{background:none;border:none;color:#39ff14;font-size:.85rem;cursor:pointer;padding:4px 8px;text-decoration:underline}
.mb-register__link-btn:disabled{opacity:.5;cursor:not-allowed}
.mb-register__pin-input{letter-spacing:.35em;text-align:center;font-size:1.25rem;font-variant-numeric:tabular-nums}
`;

const REGISTER_FLOW_SCRIPT = `
<script>
(function(){
  var PASSWORD_REGEX=/^(?=.*[A-Za-z])(?=.*\\d).{8,}$/;
  var PASSWORD_MSG="La contraseña debe tener mínimo 8 caracteres, una letra y un número.";
  var step1=document.getElementById("registerStep1");
  var step2=document.getElementById("registerStep2");
  var stepInd1=document.getElementById("registerStepInd1");
  var stepInd2=document.getElementById("registerStepInd2");
  var form1=document.getElementById("registerForm1");
  var form2=document.getElementById("registerForm2");
  var globalErr=document.getElementById("registerGlobalErr");
  var verifyErr=document.getElementById("registerVerifyErr");
  var verifyEmailEl=document.getElementById("registerVerifyEmail");
  var pendingEmail="";
  var resendBtn=document.getElementById("registerResendBtn");
  var changeEmailBtn=document.getElementById("registerChangeEmailBtn");

  function showErr(el,msg){
    if(!el)return;
    if(msg){el.textContent=msg;el.style.display="block";}
    else{el.textContent="";el.style.display="none";}
  }
  function fieldErr(name,msg){
    var el=document.getElementById("err-"+name);
    if(el){el.textContent=msg||"";el.style.display=msg?"block":"none";}
  }
  function clearFieldErrs(){
    ["nombre","email","password","password_confirm"].forEach(function(n){fieldErr(n,"");});
    showErr(globalErr,"");
    showErr(verifyErr,"");
  }
  function goStep(n,email){
    if(n===2){
      step1&&step1.setAttribute("hidden","");
      step2&&step2.removeAttribute("hidden");
      stepInd1&&stepInd1.classList.add("is-done");
      stepInd2&&stepInd2.classList.add("is-active");
      pendingEmail=email||pendingEmail;
      if(verifyEmailEl)verifyEmailEl.textContent=pendingEmail;
    }else{
      step2&&step2.setAttribute("hidden","");
      step1&&step1.removeAttribute("hidden");
      stepInd2&&stepInd2.classList.remove("is-active");
      stepInd1&&stepInd1.classList.add("is-active");
      stepInd1&&stepInd1.classList.remove("is-done");
      showErr(verifyErr,"");
    }
  }
  function validateStep1(){
    clearFieldErrs();
    var ok=true;
    var nombre=(document.getElementById("nombre")||{}).value||"";
    var email=(document.getElementById("email")||{}).value||"";
    var password=(document.getElementById("password")||{}).value||"";
    var confirm=(document.getElementById("password_confirm")||{}).value||"";
    if(nombre.trim().length<2){fieldErr("nombre","Ingresa tu nombre (mínimo 2 caracteres).");ok=false;}
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim())){fieldErr("email","Correo electrónico no válido.");ok=false;}
    if(!PASSWORD_REGEX.test(password)){fieldErr("password",PASSWORD_MSG);ok=false;}
    if(password!==confirm){fieldErr("password_confirm","Las contraseñas no coinciden.");ok=false;}
    return ok?{nombre:nombre.trim(),email:email.trim().toLowerCase(),password:password,confirmPassword:confirm}:null;
  }
  async function postJson(url,body){
    var res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});
    var data={};
    try{data=await res.json();}catch(e){}
    return {res:res,data:data};
  }
  if(form1){
    form1.addEventListener("submit",async function(ev){
      ev.preventDefault();
      var payload=validateStep1();
      if(!payload)return;
      var sub=form1.querySelector(".mb-premium__submit");
      if(sub){sub.disabled=true;sub.textContent="Enviando código...";}
      showErr(globalErr,"");
      try{
        var out=await postJson("/register/start",payload);
        if(!out.res.ok){
          var errs=out.data.errors||{};
          Object.keys(errs).forEach(function(k){
            if(k==="_global")showErr(globalErr,errs[k]);
            else fieldErr(k,errs[k]);
          });
          if(!errs._global&&out.data.message)showErr(globalErr,out.data.message);
          return;
        }
        goStep(2,out.data.email);
      }catch(e){
        showErr(globalErr,"No se pudo conectar. Intenta de nuevo.");
      }finally{
        if(sub){sub.disabled=false;sub.textContent="Crear cuenta gratis";}
      }
    });
  }
  if(form2){
    form2.addEventListener("submit",async function(ev){
      ev.preventDefault();
      var pin=String((document.getElementById("registerPin")||{}).value||"").replace(/\\D/g,"");
      if(pin.length!==6){showErr(verifyErr,"Ingresa el código de 6 dígitos.");return;}
      var sub=form2.querySelector(".mb-premium__submit");
      if(sub){sub.disabled=true;sub.textContent="Verificando...";}
      showErr(verifyErr,"");
      try{
        var out=await postJson("/register/verify",{email:pendingEmail,pin:pin});
        if(!out.res.ok){
          showErr(verifyErr,out.data.message||"No se pudo verificar el código.");
          return;
        }
        window.location.href=out.data.redirect||"/";
      }catch(e){
        showErr(verifyErr,"No se pudo conectar. Intenta de nuevo.");
      }finally{
        if(sub){sub.disabled=false;sub.textContent="Verificar cuenta";}
      }
    });
  }
  if(resendBtn){
    resendBtn.addEventListener("click",async function(){
      if(!pendingEmail)return;
      resendBtn.disabled=true;
      showErr(verifyErr,"");
      try{
        var out=await postJson("/register/resend",{email:pendingEmail});
        if(!out.res.ok){
          showErr(verifyErr,out.data.message||"No se pudo reenviar.");
          return;
        }
        showErr(verifyErr,"");
        resendBtn.textContent="Código reenviado";
        setTimeout(function(){resendBtn.textContent="Reenviar código";},3000);
      }catch(e){
        showErr(verifyErr,"No se pudo conectar.");
      }finally{
        resendBtn.disabled=false;
      }
    });
  }
  if(changeEmailBtn){
    changeEmailBtn.addEventListener("click",function(){goStep(1);});
  }
})();
</script>`;

function renderRegisterForm({ errors = {}, values = {} } = {}) {
  const globalErr = errors._global
    ? `<p id="registerGlobalErr" class="mb-premium__msg mb-premium__msg--err" style="display:block">${escapeHtml(errors._global)}</p>`
    : `<p id="registerGlobalErr" class="mb-premium__msg mb-premium__msg--err" style="display:none"></p>`;

  const field = (name, label, type, placeholder, autocomplete, extraAttrs = "") => {
    const err = errors[name]
      ? `<span id="err-${name}" style="display:block;color:#fca5a5;font-size:.75rem">${escapeHtml(errors[name])}</span>`
      : `<span id="err-${name}" style="display:none;color:#fca5a5;font-size:.75rem"></span>`;
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
        <input class="mb-premium__input${pwdClass}" id="${name}" name="${name}" type="${type}" placeholder="${escapeHtml(placeholder)}" required ${autocomplete ? `autocomplete="${autocomplete}"` : ""} value="${val}" ${extraAttrs}>
        ${toggle}
      </div>
      ${err}
    </div>`;
  };

  return `
<div class="mb-premium__auth">
  <div class="mb-register__steps" aria-hidden="true">
    <div class="mb-register__step is-active" id="registerStepInd1">1 · Crear cuenta</div>
    <div class="mb-register__step" id="registerStepInd2">2 · Verificar correo</div>
  </div>
  <div id="registerStep1" class="mb-register__panel">
    <h2 class="mb-premium__auth-title">Crear cuenta</h2>
    <p class="mb-premium__auth-sub">Plan Free incluido · Empieza en minutos</p>
    ${globalErr}
    <form id="registerForm1" class="mb-premium__form" novalidate>
      ${field("nombre", "Nombre", "text", "Tu nombre", "name")}
      ${field("email", "Correo electrónico", "email", "tu@empresa.com", "email")}
      ${field(
        "password",
        "Contraseña",
        "password",
        "Mínimo 8 caracteres, letras y números",
        "new-password",
        'minlength="8" pattern="(?=.*[A-Za-z])(?=.*\\d).{8,}"'
      )}
      ${field("password_confirm", "Confirmar contraseña", "password", "Repite tu contraseña", "new-password")}
      <button type="submit" class="mb-premium__submit">Crear cuenta gratis</button>
    </form>
  </div>
  <div id="registerStep2" class="mb-register__panel" hidden>
    <h2 class="mb-premium__auth-title">Verifica tu correo</h2>
    <p class="mb-premium__auth-sub">Paso 2 de 2</p>
    <p class="mb-register__email-hint">Enviamos un código de 6 dígitos a <strong id="registerVerifyEmail"></strong>. Escríbelo para activar tu cuenta.</p>
    <p id="registerVerifyErr" class="mb-premium__msg mb-premium__msg--err" style="display:none"></p>
    <form id="registerForm2" class="mb-premium__form" novalidate>
      <div class="mb-premium__field">
        <label class="mb-premium__label" for="registerPin">Código de verificación</label>
        <div class="mb-premium__input-wrap">
          <input class="mb-premium__input mb-register__pin-input" id="registerPin" name="pin" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required autocomplete="one-time-code">
        </div>
      </div>
      <button type="submit" class="mb-premium__submit">Verificar cuenta</button>
      <div class="mb-register__actions">
        <button type="button" class="mb-register__link-btn" id="registerResendBtn">Reenviar código</button>
        <button type="button" class="mb-register__link-btn" id="registerChangeEmailBtn">Cambiar correo</button>
      </div>
    </form>
  </div>
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

const LANDING_EFFECTS_SCRIPT = `
<script>
(function(){
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  var reveals=document.querySelectorAll(".mb-premium__reveal");
  if(reveals.length&&"IntersectionObserver"in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target);}
      });
    },{threshold:.12,rootMargin:"0px 0px -40px 0px"});
    reveals.forEach(function(el){io.observe(el);});
  }else{reveals.forEach(function(el){el.classList.add("is-visible");});}
  function animateCount(el){
    var target=parseInt(el.getAttribute("data-count"),10);
    var suffix=el.getAttribute("data-suffix")||"";
    if(isNaN(target))return;
    var start=performance.now(),dur=1200;
    function tick(now){
      var p=Math.min(1,(now-start)/dur);
      var eased=1-Math.pow(1-p,3);
      el.textContent=Math.round(target*eased)+suffix;
      if(p<1)requestAnimationFrame(tick);
      else el.textContent=target+suffix;
    }
    requestAnimationFrame(tick);
  }
  var counters=document.querySelectorAll("[data-count]");
  if(counters.length&&"IntersectionObserver"in window){
    var cio=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting&&!e.target.dataset.done){
          e.target.dataset.done="1";
          animateCount(e.target);
          cio.unobserve(e.target);
        }
      });
    },{threshold:.5});
    counters.forEach(function(el){cio.observe(el);});
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

function renderPremiumLandingPage({
  documentTitle,
  mainContent,
  scripts = "",
  extraStyles = "",
  skipNavbar = false,
} = {}) {
  const nav = skipNavbar ? "" : renderNavbar();
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>${PREMIUM_STYLES}${extraStyles}</style>
</head>
<body class="mb-premium">
<div class="mb-premium__bg" aria-hidden="true">
  <div class="mb-premium__grid"></div>
  ${renderParticles()}
  <span class="mb-premium__code mb-premium__code--1">flow.trigger("whatsapp")</span>
  <span class="mb-premium__code mb-premium__code--2">ai.reply(context)</span>
  <span class="mb-premium__code mb-premium__code--3">crm.track(conversion)</span>
  <span class="mb-premium__code mb-premium__code--4">rm24h.schedule()</span>
</div>
<div class="mb-premium__wrap">
  ${nav}
  ${mainContent}
  <footer class="mb-premium__page-footer">© MacBot CRM · WhatsApp automatizado con IA</footer>
</div>
${NAV_SCRIPT}${FORM_SUBMIT_SCRIPT}${PREMIUM_PASSWORD_TOGGLE}${LANDING_EFFECTS_SCRIPT}${scripts}
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
  ${renderFlowSection()}
  ${renderProductSection()}
  ${renderMetricsSection()}
  ${renderPlansSection()}
  ${renderFinalCtaSection()}
  <section class="mb-premium__section mb-premium__reveal">
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
    extraStyles: REGISTER_EXTRA_STYLES,
    scripts: REGISTER_FLOW_SCRIPT,
  });
}

module.exports = {
  renderLoginLandingPage,
  renderRegisterPage,
  renderLoginForm,
  renderPremiumLandingPage,
};
