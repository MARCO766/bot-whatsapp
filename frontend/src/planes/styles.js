export const miPlanStyles = `
.miPlanWrap { animation: miPlanFade .35s ease both; }
.miPlanWrap .skel {
  background: rgba(30, 41, 59, .85);
  animation: none;
}
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
  border: 1px solid rgba(148, 163, 184, .2);
  background:
    radial-gradient(circle at 88% 12%, rgba(34, 211, 238, .22), transparent 36%),
    radial-gradient(circle at 8% 88%, rgba(139, 92, 246, .16), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, .88), rgba(8, 14, 32, .82));
  backdrop-filter: blur(14px);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, .06) inset,
    0 20px 50px rgba(0, 0, 0, .28);
}

.miPlanHeroGlow {
  position: absolute;
  width: 320px;
  height: 320px;
  right: -100px;
  top: -140px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(34, 197, 94, .28), rgba(6, 182, 212, .2) 42%, rgba(139, 92, 246, .14) 68%, transparent 72%);
  filter: blur(16px);
  opacity: .2;
  pointer-events: none;
  animation: none;
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
  margin: 0 0 8px;
  color: #e2e8f0;
  font-size: 15px;
  max-width: 520px;
  line-height: 1.5;
  font-weight: 600;
}
.miPlanHeroSub {
  color: #94a3b8 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  margin-bottom: 12px !important;
}
.miPlanHeroMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #94a3b8;
}
.miPlanHeroVence { font-size: 12px; color: #64748b; }

.miPlanHeroActions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.miPlanBadge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: .5px;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.miPlanBadge--free {
  color: #e2e8f0;
  background: rgba(148, 163, 184, .16);
  border-color: rgba(148, 163, 184, .32);
}
.miPlanBadge--starter {
  color: #a5f3fc;
  background: rgba(6, 182, 212, .18);
  border-color: rgba(34, 211, 238, .4);
  box-shadow: 0 0 28px rgba(6, 182, 212, .14);
}
.miPlanBadge--pro {
  color: #bbf7d0;
  background: rgba(34, 197, 94, .18);
  border-color: rgba(74, 222, 128, .4);
  box-shadow: 0 0 28px rgba(34, 197, 94, .16);
}
.miPlanBadge--macbot {
  color: #bbf7d0;
  background: rgba(34, 197, 94, .18);
  border-color: rgba(74, 222, 128, .4);
  box-shadow: 0 0 28px rgba(34, 197, 94, .16);
}
.miPlanBadge--agency {
  color: #ddd6fe;
  background: rgba(139, 92, 246, .22);
  border-color: rgba(167, 139, 250, .45);
  box-shadow: 0 0 32px rgba(139, 92, 246, .18);
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

.miPlanAlert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 14px 18px;
  border-radius: 18px;
  backdrop-filter: blur(10px);
}
.miPlanAlert p {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}
.miPlanAlert--warn {
  background: rgba(234, 179, 8, .1);
  border: 1px solid rgba(250, 204, 21, .28);
  color: #fde68a;
}
.miPlanAlert--limit {
  background: rgba(239, 68, 68, .1);
  border: 1px solid rgba(248, 113, 113, .28);
  color: #fecaca;
}

.miPlanQuickGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.miPlanQuickCard {
  position: relative;
  border-radius: 20px;
  padding: 20px 16px;
  text-align: center;
  border: 1px solid rgba(148, 163, 184, .16);
  background: rgba(15, 23, 42, .55);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, .2);
  transition: transform .2s ease, box-shadow .2s ease;
}
.miPlanQuickCard:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(6, 182, 212, .12);
}
.miPlanQuickIcon {
  display: block;
  font-size: 26px;
  margin-bottom: 6px;
}
.miPlanQuickCard strong {
  display: block;
  font-size: 28px;
  margin: 4px 0 6px;
  letter-spacing: -.4px;
  background: linear-gradient(135deg, #f8fafc, #67e8f9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.miPlanQuickCard span.label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .6px;
}

.miPlanGlass {
  backdrop-filter: blur(14px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .04) inset,
    0 16px 48px rgba(0, 0, 0, .22);
}

.miPlanLimitsCard {
  border-radius: 24px;
  padding: 22px 20px;
  border: 1px solid rgba(148, 163, 184, .16);
  background: rgba(15, 23, 42, .58);
  margin-bottom: 16px;
}
.miPlanLimitsCard h3 {
  margin: 0 0 6px;
  font-size: 18px;
}
.miPlanLimitsCard > p {
  margin: 0 0 20px;
  color: #64748b;
  font-size: 13px;
}

.miPlanUsageRow + .miPlanUsageRow { margin-top: 18px; }
.miPlanLimitHead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.miPlanLimitHead strong { font-size: 15px; }
.miPlanUsageText {
  margin: 0 0 8px;
  font-size: 13px;
  color: #94a3b8;
  font-weight: 600;
}
.miPlanUnlimited {
  color: #c4b5fd;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: .3px;
}
.miPlanPct {
  font-size: 13px;
  font-weight: 900;
}
.miPlanPct--ok { color: #4ade80; }
.miPlanPct--warn { color: #facc15; }
.miPlanPct--danger { color: #f87171; }

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
  transition: width .65s cubic-bezier(.22, 1, .36, 1);
  min-width: 2px;
}
.miPlanBarFill--ok {
  background: linear-gradient(90deg, #06b6d4, #22c55e);
  box-shadow: 0 0 12px rgba(34, 197, 94, .35);
}
.miPlanBarFill--warn {
  background: linear-gradient(90deg, #eab308, #f59e0b);
  box-shadow: 0 0 12px rgba(234, 179, 8, .35);
}
.miPlanBarFill--danger {
  background: linear-gradient(90deg, #f97316, #ef4444);
  box-shadow: 0 0 12px rgba(239, 68, 68, .35);
}

.miPlanBenefitsCard {
  border-radius: 24px;
  padding: 22px 20px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .52);
  margin-bottom: 16px;
}
.miPlanBenefitsCard h3 {
  margin: 0 0 14px;
  font-size: 17px;
}
.miPlanBenefitsList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 16px;
}
.miPlanBenefitsList li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #cbd5e1;
  font-weight: 600;
}
.miPlanCheck {
  color: #4ade80;
  font-weight: 900;
}

.miPlanBuyCard {
  border-radius: 24px;
  padding: 22px 20px;
  border: 1px solid rgba(148, 163, 184, .16);
  background: rgba(15, 23, 42, .58);
  margin-bottom: 16px;
}
.miPlanBuyCard h3 {
  margin: 0 0 6px;
  font-size: 18px;
}
.miPlanBuyCard > p {
  margin: 0 0 16px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}
.miPlanLedgerHint {
  margin: 0 0 16px !important;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(6, 182, 212, .08);
  border: 1px solid rgba(34, 211, 238, .16);
  color: #cbd5e1 !important;
  font-size: 13px !important;
}
.miPlanLedgerHint span {
  color: #64748b;
  font-weight: 500;
}
.miPlanBuyGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.miPlanBuyOption {
  border-radius: 18px;
  padding: 18px 16px;
  border: 1px solid rgba(148, 163, 184, .16);
  background: rgba(8, 14, 32, .55);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.miPlanBuyOption strong {
  font-size: 16px;
}
.miPlanBuyPrice {
  color: #67e8f9;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -.3px;
}
.miPlanBuyBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  margin-top: 6px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 900;
  font-size: 14px;
  color: #052e16;
  background: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%);
  box-shadow: 0 8px 24px rgba(6, 182, 212, .22);
}
.miPlanBuyBtn:hover { filter: brightness(1.06); }

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
.miPlanUpgradeBtn--sm {
  height: 38px;
  padding: 0 16px;
  font-size: 13px;
  flex-shrink: 0;
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
  .miPlanQuickGrid { grid-template-columns: 1fr; }
  .miPlanBenefitsList { grid-template-columns: 1fr; }
  .miPlanBuyGrid { grid-template-columns: 1fr; }
  .miPlanHero { flex-direction: column; }
  .miPlanHeroActions { align-items: flex-start; }
}
`;

export const upgradeLimitModalStyles = `
.upgradeLimitBackdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(2, 6, 23, .72);
  backdrop-filter: blur(8px);
  animation: upgradeLimitFade .2s ease both;
}

.upgradeLimitModal {
  position: fixed;
  z-index: 901;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(460px, calc(100vw - 32px));
  border-radius: 28px;
  padding: 28px 26px 22px;
  border: 1px solid rgba(148, 163, 184, .22);
  background:
    radial-gradient(circle at 90% 8%, rgba(34, 211, 238, .2), transparent 40%),
    radial-gradient(circle at 10% 92%, rgba(34, 197, 94, .16), transparent 42%),
    linear-gradient(160deg, rgba(15, 23, 42, .96), rgba(8, 14, 32, .94));
  box-shadow:
    0 24px 80px rgba(0, 0, 0, .45),
    0 0 0 1px rgba(34, 211, 238, .08) inset;
  animation: upgradeLimitPop .28s ease both;
}

.upgradeLimitGlow {
  position: absolute;
  inset: -40px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, rgba(34, 197, 94, .22), rgba(6, 182, 212, .16) 40%, rgba(139, 92, 246, .1) 65%, transparent 72%);
  filter: blur(16px);
  opacity: .14;
  pointer-events: none;
  z-index: -1;
  animation: none;
}

.upgradeLimitEyebrow {
  margin: 0 0 8px;
  color: #67e8f9;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.upgradeLimitModal h2 {
  margin: 0 0 10px;
  font-size: 24px;
  line-height: 1.15;
  letter-spacing: -.4px;
}

.upgradeLimitSub {
  margin: 0 0 18px;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.5;
}

.upgradeLimitStats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.upgradeLimitStat {
  border-radius: 16px;
  padding: 12px 10px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .65);
  text-align: center;
}

.upgradeLimitStat span {
  display: block;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-bottom: 4px;
}

.upgradeLimitStat strong {
  font-size: 16px;
  letter-spacing: -.2px;
}

.upgradeLimitReco {
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #cbd5e1;
  background: rgba(6, 182, 212, .08);
  border: 1px solid rgba(34, 211, 238, .18);
}

.upgradeLimitActions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.upgradeLimitBtnPrimary {
  height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
  font-size: 14px;
  color: #052e16;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  box-shadow: 0 8px 24px rgba(6, 182, 212, .22);
}

.upgradeLimitBtnGhost {
  height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 800;
  font-size: 14px;
  color: #cbd5e1;
  background: rgba(255, 255, 255, .04);
  border: 1px solid rgba(148, 163, 184, .2);
}

@keyframes upgradeLimitFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes upgradeLimitPop {
  from { opacity: 0; transform: translate(-50%, -46%) scale(.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@media (max-width: 520px) {
  .upgradeLimitStats { grid-template-columns: 1fr; }
  .upgradeLimitActions { flex-direction: column-reverse; }
  .upgradeLimitBtnPrimary, .upgradeLimitBtnGhost { width: 100%; }
}
`;
