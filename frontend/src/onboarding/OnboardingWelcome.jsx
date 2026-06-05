import React from "react";
import OnboardingChecklist from "./OnboardingChecklist";

const STEPS = [
  {
    icon: "💬",
    title: "Conecta tu WhatsApp",
    desc: "Vincula tu número con Meta Cloud API en unos minutos.",
    color: "green",
  },
  {
    icon: "🧩",
    title: "Crea tu primer flujo",
    desc: "Diseña embudos visuales con condiciones y conversiones.",
    color: "purple",
  },
  {
    icon: "🤖",
    title: "Activa IA",
    desc: "Añade IA Pro o Agente OpenAI a tu embudo.",
    color: "cyan",
  },
  {
    icon: "📥",
    title: "Recibe tu primer lead",
    desc: "Centraliza conversaciones en la bandeja MacBot.",
    color: "orange",
  },
];

export default function OnboardingWelcome({
  onConnectWhatsApp,
  onViewPlans,
  checklist = [],
  progreso,
}) {
  return (
    <div className="obWelcome">
      <style>{styles}</style>

      <div className="obWelcome__glow obWelcome__glow--1" aria-hidden="true" />
      <div className="obWelcome__glow obWelcome__glow--2" aria-hidden="true" />

      <div className="obWelcome__inner">
        <div className="obWelcome__badge">Paso 1 de 4 · Conectar WhatsApp</div>

        <h1 className="obWelcome__title">Bienvenido a MacBot 🚀</h1>
        <p className="obWelcome__sub">
          Conecta tu primera línea de WhatsApp para empezar a automatizar ventas con IA, flujos y CRM.
        </p>

        {checklist.length > 0 && (
          <div className="obWelcome__checklistWrap">
            <OnboardingChecklist checklist={checklist} progreso={progreso} />
          </div>
        )}

        <div className="obWelcome__flow" aria-hidden="true">
          <span className="obWelcome__node">WA</span>
          <span className="obWelcome__line" />
          <span className="obWelcome__node obWelcome__node--ai">IA</span>
          <span className="obWelcome__line" />
          <span className="obWelcome__node obWelcome__node--crm">CRM</span>
          <span className="obWelcome__line" />
          <span className="obWelcome__node obWelcome__node--sale">$</span>
        </div>

        <ul className="obWelcome__checklist">
          {STEPS.map((step, i) => (
            <li key={step.title} className={`obWelcome__card obWelcome__card--${step.color}`}>
              <span className="obWelcome__stepNum">{i + 1}</span>
              <span className="obWelcome__cardIcon">{step.icon}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="obWelcome__actions">
          <button type="button" className="obWelcome__btnMain" onClick={onConnectWhatsApp}>
            Conectar mi WhatsApp
          </button>
          <button type="button" className="obWelcome__btnSec" onClick={onViewPlans}>
            Ver planes
          </button>
        </div>

        <p className="obWelcome__hint">
          Ajustes y Mi Plan siguen disponibles en el menú mientras configuras tu línea.
        </p>
      </div>
    </div>
  );
}

const styles = `
.obWelcome {
  position: relative;
  min-height: calc(100vh - 140px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px 40px;
  overflow: hidden;
}

.obWelcome__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  opacity: .35;
}
.obWelcome__glow--1 {
  width: 320px; height: 320px;
  top: 5%; left: 10%;
  background: #22c55e;
}
.obWelcome__glow--2 {
  width: 280px; height: 280px;
  bottom: 10%; right: 8%;
  background: #06b6d4;
}

.obWelcome__inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 720px;
  padding: 36px 32px 32px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .72);
  backdrop-filter: blur(20px);
  box-shadow:
    0 0 0 1px rgba(57, 255, 20, .04) inset,
    0 28px 70px rgba(0, 0, 0, .35);
  animation: obRise .45s ease both;
}

.obWelcome__badge {
  display: inline-flex;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: .75rem;
  font-weight: 700;
  color: #86efac;
  background: rgba(34, 197, 94, .12);
  border: 1px solid rgba(34, 197, 94, .25);
  margin-bottom: 18px;
}

.obWelcome__title {
  margin: 0 0 12px;
  font-size: clamp(1.65rem, 4vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -.03em;
  line-height: 1.15;
}

.obWelcome__checklistWrap {
  margin-bottom: 24px;
}

.obWelcome__sub {
  margin: 0 0 24px;
  font-size: 1rem;
  line-height: 1.6;
  color: #94a3b8;
  max-width: 560px;
}

.obWelcome__flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.obWelcome__node {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .75rem;
  font-weight: 800;
  background: rgba(34, 197, 94, .15);
  border: 1px solid rgba(34, 197, 94, .35);
  color: #86efac;
  box-shadow: 0 0 20px rgba(34, 197, 94, .15);
}
.obWelcome__node--ai {
  background: rgba(6, 182, 212, .12);
  border-color: rgba(6, 182, 212, .35);
  color: #67e8f9;
  box-shadow: 0 0 20px rgba(6, 182, 212, .12);
}
.obWelcome__node--crm {
  background: rgba(168, 85, 247, .12);
  border-color: rgba(168, 85, 247, .35);
  color: #c4b5fd;
}
.obWelcome__node--sale {
  background: rgba(57, 255, 20, .1);
  border-color: rgba(57, 255, 20, .4);
  color: #39ff14;
}

.obWelcome__line {
  width: 28px;
  height: 2px;
  background: linear-gradient(90deg, #22c55e, #06b6d4, #a855f7);
  border-radius: 2px;
  opacity: .7;
}

.obWelcome__checklist {
  list-style: none;
  margin: 0 0 28px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.obWelcome__card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, .08);
  background: rgba(7, 12, 24, .55);
  transition: border-color .2s, transform .2s;
}
.obWelcome__card:hover {
  border-color: rgba(255, 255, 255, .14);
  transform: translateY(-2px);
}
.obWelcome__card--green:hover { border-color: rgba(34, 197, 94, .3); }
.obWelcome__card--purple:hover { border-color: rgba(168, 85, 247, .3); }
.obWelcome__card--cyan:hover { border-color: rgba(6, 182, 212, .3); }
.obWelcome__card--orange:hover { border-color: rgba(249, 115, 22, .3); }

.obWelcome__stepNum {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 8px;
  font-size: .7rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, .08);
  color: #94a3b8;
}

.obWelcome__cardIcon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.obWelcome__card strong {
  display: block;
  font-size: .9rem;
  margin-bottom: 4px;
}
.obWelcome__card p {
  margin: 0;
  font-size: .78rem;
  color: #94a3b8;
  line-height: 1.45;
}

.obWelcome__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.obWelcome__btnMain {
  flex: 1;
  min-width: 200px;
  padding: 15px 22px;
  border: none;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  color: #050816;
  background: linear-gradient(135deg, #39ff14, #22c55e);
  box-shadow: 0 0 32px rgba(57, 255, 20, .25);
  transition: transform .15s, box-shadow .2s;
}
.obWelcome__btnMain:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(57, 255, 20, .35);
}

.obWelcome__btnSec {
  padding: 15px 20px;
  border-radius: 14px;
  border: 1px solid rgba(6, 182, 212, .35);
  background: rgba(6, 182, 212, .08);
  color: #67e8f9;
  font-size: .9375rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background .2s;
}
.obWelcome__btnSec:hover {
  background: rgba(6, 182, 212, .14);
}

.obWelcome__hint {
  margin: 0;
  font-size: .75rem;
  color: #64748b;
  text-align: center;
}

@keyframes obRise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 560px) {
  .obWelcome__inner { padding: 28px 20px; }
  .obWelcome__checklist { grid-template-columns: 1fr; }
  .obWelcome__actions { flex-direction: column; }
}
`;
