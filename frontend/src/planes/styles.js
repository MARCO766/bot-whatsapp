export const miPlanStyles = `
.miPlanWrap { animation: miPlanFade .35s ease both; }
@keyframes miPlanFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.miPlanHero {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 26px 28px;
  margin-bottom: 18px;
  border: 1px solid rgba(148, 163, 184, .18);
  background:
    radial-gradient(circle at 88% 12%, rgba(34, 211, 238, .24), transparent 36%),
    radial-gradient(circle at 8% 88%, rgba(139, 92, 246, .18), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, .94), rgba(8, 14, 32, .9));
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.miPlanHeroGlow {
  position: absolute;
  width: 320px;
  height: 320px;
  right: -100px;
  top: -140px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, #22c55e, #06b6d4, #8b5cf6, #f59e0b, #22c55e);
  filter: blur(48px);
  opacity: .14;
  pointer-events: none;
}

.miPlanHeroText { position: relative; z-index: 1; }
.miPlanEyebrow {
  color: #67e8f9;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0 0 8px;
}
.miPlanHero h2 {
  margin: 0 0 8px;
  font-size: 28px;
  letter-spacing: -.5px;
  line-height: 1.1;
}
.miPlanHero p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  max-width: 480px;
  line-height: 1.5;
}

.miPlanHeroActions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.miPlanBadge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: .4px;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.miPlanBadge--free {
  color: #e2e8f0;
  background: rgba(148, 163, 184, .14);
  border-color: rgba(148, 163, 184, .28);
}
.miPlanBadge--starter {
  color: #a5f3fc;
  background: rgba(6, 182, 212, .16);
  border-color: rgba(34, 211, 238, .35);
  box-shadow: 0 0 24px rgba(6, 182, 212, .12);
}
.miPlanBadge--pro {
  color: #ddd6fe;
  background: rgba(139, 92, 246, .2);
  border-color: rgba(167, 139, 250, .4);
  box-shadow: 0 0 28px rgba(139, 92, 246, .15);
}
.miPlanBadge--agency {
  color: #fde68a;
  background: linear-gradient(135deg, rgba(245, 158, 11, .22), rgba(234, 88, 12, .14));
  border-color: rgba(251, 191, 36, .45);
  box-shadow: 0 0 28px rgba(245, 158, 11, .14);
}

.miPlanEstadoBadge {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: capitalize;
}
.miPlanEstadoBadge--activo { color: #86efac; background: rgba(34, 197, 94, .14); border: 1px solid rgba(74, 222, 128, .3); }
.miPlanEstadoBadge--trial { color: #93c5fd; background: rgba(59, 130, 246, .14); border: 1px solid rgba(96, 165, 250, .3); }
.miPlanEstadoBadge--vencido { color: #fdba74; background: rgba(249, 115, 22, .14); border: 1px solid rgba(251, 146, 60, .3); }
.miPlanEstadoBadge--suspendido { color: #fca5a5; background: rgba(239, 68, 68, .14); border: 1px solid rgba(248, 113, 113, .3); }

.miPlanGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.miPlanStatCard {
  border-radius: 20px;
  padding: 18px 16px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .72);
}
.miPlanStatCard strong {
  display: block;
  font-size: 22px;
  margin: 6px 0 4px;
  letter-spacing: -.3px;
}
.miPlanStatCard span.label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .6px;
}
.miPlanStatCard span.hint {
  color: #94a3b8;
  font-size: 12px;
}

.miPlanLimitsCard {
  border-radius: 24px;
  padding: 22px 20px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .68);
  margin-bottom: 16px;
}
.miPlanLimitsCard h3 {
  margin: 0 0 6px;
  font-size: 18px;
}
.miPlanLimitsCard > p {
  margin: 0 0 18px;
  color: #64748b;
  font-size: 13px;
}

.miPlanLimitRow + .miPlanLimitRow { margin-top: 16px; }
.miPlanLimitHead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.miPlanLimitHead strong { font-size: 14px; }
.miPlanLimitHead span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}
.miPlanBarTrack {
  height: 10px;
  border-radius: 999px;
  background: rgba(30, 41, 59, .9);
  border: 1px solid rgba(148, 163, 184, .12);
  overflow: hidden;
}
.miPlanBarFill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #06b6d4, #22c55e);
  transition: width .4s ease;
  min-width: 2px;
}
.miPlanBarFill--placeholder {
  width: 0% !important;
  min-width: 0;
}
.miPlanBarCap {
  margin-top: 6px;
  font-size: 11px;
  color: #64748b;
}

.miPlanUpgradeBtn {
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 900;
  font-size: 14px;
  color: #052e16;
  background: linear-gradient(135deg, #22c55e 0%, #06b6d4 45%, #8b5cf6 100%);
  box-shadow: 0 10px 32px rgba(6, 182, 212, .25);
  transition: transform .15s ease, box-shadow .15s ease;
}
.miPlanUpgradeBtn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 36px rgba(6, 182, 212, .32);
}
.miPlanUpgradeBtn:active { transform: translateY(0); }

.miPlanFootNote {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 900px) {
  .miPlanGrid { grid-template-columns: 1fr; }
  .miPlanHero { flex-direction: column; }
  .miPlanHeroActions { align-items: flex-start; }
}
`;
