import React from "react";

export default function OnboardingChecklist({ checklist = [], progreso, compact = false }) {
  const pct = progreso?.porcentaje ?? 0;
  const completados = progreso?.completados ?? 0;
  const total = progreso?.total ?? (checklist.length || 5);

  return (
    <div className={`obChecklist ${compact ? "obChecklist--compact" : ""}`}>
      <style>{styles}</style>

      <div className="obChecklist__head">
        <div>
          <span className="obChecklist__eyebrow">Tu progreso</span>
          <strong className="obChecklist__pct">{pct}%</strong>
        </div>
        <span className="obChecklist__count">
          {completados}/{total} pasos
        </span>
      </div>

      <div className="obChecklist__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="obChecklist__barFill" style={{ width: `${pct}%` }} />
      </div>

      <ul className="obChecklist__list">
        {checklist.map((item) => (
          <li
            key={item.id}
            className={`obChecklist__item ${item.done ? "is-done" : ""}`}
          >
            <span className="obChecklist__mark" aria-hidden="true">
              {item.done ? "✅" : "⬜"}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = `
.obChecklist {
  width: 100%;
  padding: 20px 22px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .55);
  backdrop-filter: blur(16px);
  box-shadow: 0 0 0 1px rgba(57, 255, 20, .03) inset;
  animation: obCheckFade .4s ease both;
}

.obChecklist--compact {
  padding: 16px 18px;
  border-radius: 16px;
}

.obChecklist__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.obChecklist__eyebrow {
  display: block;
  font-size: .7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #64748b;
  margin-bottom: 4px;
}

.obChecklist__pct {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -.03em;
  background: linear-gradient(135deg, #39ff14, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.obChecklist--compact .obChecklist__pct {
  font-size: 1.25rem;
}

.obChecklist__count {
  font-size: .78rem;
  color: #94a3b8;
  font-weight: 600;
}

.obChecklist__bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .06);
  overflow: hidden;
  margin-bottom: 16px;
}

.obChecklist__barFill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #39ff14, #06b6d4);
  transition: width .5s cubic-bezier(.4, 0, .2, 1);
  box-shadow: 0 0 16px rgba(57, 255, 20, .35);
}

.obChecklist__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.obChecklist__item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: .9rem;
  color: #94a3b8;
  transition: color .2s;
}

.obChecklist__item.is-done {
  color: #e2e8f0;
}

.obChecklist__mark {
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1;
}

@keyframes obCheckFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
