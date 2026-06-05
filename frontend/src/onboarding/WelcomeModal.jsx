import React, { useEffect } from "react";

const STEPS = [
  { num: 1, title: "Conecta tu WhatsApp", desc: "Vincula tu línea con Meta Cloud API." },
  { num: 2, title: "Crea tu primer flujo", desc: "Diseña tu embudo visual en minutos." },
  { num: 3, title: "Activa IA", desc: "Añade un nodo IA Pro o Agente OpenAI." },
  { num: 4, title: "Recibe tu primer lead", desc: "Centraliza conversaciones en la bandeja." },
];

export default function WelcomeModal({ open, onClose, onStart }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="wmOverlay" role="dialog" aria-modal="true" aria-labelledby="wmTitle">
      <style>{styles}</style>
      <button type="button" className="wmOverlay__backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="wmCard">
        <div className="wmCard__glow" aria-hidden="true" />
        <button type="button" className="wmCard__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <h2 id="wmTitle" className="wmCard__title">
          Bienvenido a MacBot 🚀
        </h2>
        <p className="wmCard__sub">
          En pocos minutos tendrás WhatsApp, flujos e IA listos para vender en automático.
        </p>
        <ol className="wmCard__steps">
          {STEPS.map((s) => (
            <li key={s.num} className="wmCard__step">
              <span className="wmCard__stepNum">{s.num}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="wmCard__cta" onClick={onStart}>
          Empezar ahora
        </button>
      </div>
    </div>
  );
}

const styles = `
.wmOverlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: wmFadeIn .25s ease both;
}

.wmOverlay__backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(5, 8, 22, .72);
  backdrop-filter: blur(8px);
  cursor: pointer;
}

.wmCard {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  padding: 32px 28px 28px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, .18);
  background: rgba(15, 23, 42, .82);
  backdrop-filter: blur(24px);
  box-shadow:
    0 0 0 1px rgba(57, 255, 20, .06) inset,
    0 32px 80px rgba(0, 0, 0, .45);
  animation: wmSlideUp .35s cubic-bezier(.4, 0, .2, 1) both;
}

.wmCard__glow {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  height: 200px;
  background: radial-gradient(circle, rgba(57, 255, 20, .2), transparent 70%);
  pointer-events: none;
}

.wmCard__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, .06);
  color: #94a3b8;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  transition: background .2s, color .2s;
}
.wmCard__close:hover {
  background: rgba(255, 255, 255, .1);
  color: #e2e8f0;
}

.wmCard__title {
  margin: 0 0 10px;
  font-size: clamp(1.4rem, 4vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -.03em;
  text-align: center;
}

.wmCard__sub {
  margin: 0 0 22px;
  text-align: center;
  font-size: .9375rem;
  line-height: 1.55;
  color: #94a3b8;
}

.wmCard__steps {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wmCard__step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, .07);
  background: rgba(7, 12, 24, .5);
  transition: border-color .2s, transform .2s;
}
.wmCard__step:hover {
  border-color: rgba(57, 255, 20, .2);
  transform: translateX(2px);
}

.wmCard__stepNum {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .8rem;
  font-weight: 800;
  color: #050816;
  background: linear-gradient(135deg, #39ff14, #22c55e);
}

.wmCard__step strong {
  display: block;
  font-size: .9rem;
  margin-bottom: 2px;
}
.wmCard__step p {
  margin: 0;
  font-size: .78rem;
  color: #64748b;
  line-height: 1.4;
}

.wmCard__cta {
  width: 100%;
  padding: 15px 22px;
  border: none;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  color: #050816;
  background: linear-gradient(135deg, #39ff14, #22c55e);
  box-shadow: 0 0 32px rgba(57, 255, 20, .28);
  transition: transform .15s, box-shadow .2s;
}
.wmCard__cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(57, 255, 20, .38);
}

@keyframes wmFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes wmSlideUp {
  from { opacity: 0; transform: translateY(20px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 480px) {
  .wmCard { padding: 28px 20px 24px; border-radius: 22px; }
}
`;
