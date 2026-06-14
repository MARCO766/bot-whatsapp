export const panelStyles = `
.panelDash {
  min-height: 100%;
  position: relative;
}

.panelDash .panelOnboardingCheck {
  margin-bottom: 18px;
}

.panelDash .eyebrow {
  color: #67e8f9;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: 2.2px;
}

.panelDash .hero {
  border-radius: 32px;
  padding: 28px 30px;
  margin-bottom: 18px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, .16);
  background:
    radial-gradient(circle at 85% 15%, rgba(34, 211, 238, .22), transparent 32%),
    radial-gradient(circle at 12% 90%, rgba(34, 197, 94, .14), transparent 34%),
    linear-gradient(135deg, rgba(15, 23, 42, .92), rgba(8, 14, 32, .88));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.panelDash .heroGlow {
  position: absolute;
  width: 380px;
  height: 380px;
  right: -120px;
  top: -180px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(34, 197, 94, .26), rgba(6, 182, 212, .18) 42%, rgba(139, 92, 246, .12) 68%, transparent 72%);
  filter: blur(16px);
  opacity: .18;
  pointer-events: none;
  animation: none;
}

.panelDash .hero h1 {
  margin: 10px 0 8px;
  font-size: 34px;
  letter-spacing: -1px;
  line-height: 1.05;
}

.panelDash .hero p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  max-width: 520px;
  line-height: 1.5;
}

.panelDash .heroMeta {
  position: relative;
  z-index: 2;
  text-align: right;
}

.panelDash .heroMeta strong {
  display: block;
  font-size: 13px;
  color: #86efac;
}

.panelDash .heroMeta span {
  color: #64748b;
  font-size: 12px;
}

.panelDash .refreshBtn {
  margin-top: 10px;
  height: 36px;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 12px;
  background: rgba(255,255,255,.06);
  color: #cbd5e1;
  padding: 0 14px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
}

.panelDash .refreshBtn:hover {
  background: rgba(34, 211, 238, .12);
  color: white;
}

.panelDash .statusRow {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

.panelDash .statusChip {
  border-radius: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .72);
  display: flex;
  align-items: center;
  gap: 10px;
}

.panelDash .statusChip.warn {
  border-color: rgba(249, 115, 22, .35);
  background: linear-gradient(135deg, rgba(249, 115, 22, .12), rgba(15, 23, 42, .8));
}

.panelDash .statusDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.panelDash .statusDot.ok {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, .45);
}

.panelDash .statusDot.bad {
  background: #f97316;
  box-shadow: 0 0 6px rgba(249, 115, 22, .4);
}

.panelDash .statusChip span {
  display: block;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.panelDash .statusChip strong {
  display: block;
  font-size: 14px;
  margin-top: 2px;
}

.panelDash .kpiGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.panelDash .kpiCard {
  border-radius: 24px;
  padding: 18px 20px;
  border: 1px solid rgba(148, 163, 184, .13);
  background: rgba(15, 23, 42, .68);
  position: relative;
  overflow: hidden;
}

.panelDash .kpiCard::after {
  content: "";
  position: absolute;
  width: 100px;
  height: 100px;
  right: -44px;
  top: -44px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 211, 238, .08), transparent 70%);
  pointer-events: none;
}

.panelDash .kpiCard span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
}

.panelDash .kpiCard h3 {
  margin: 10px 0 6px;
  font-size: 32px;
  letter-spacing: -1px;
}

.panelDash .trend {
  font-size: 12px;
  font-weight: 900;
}

.panelDash .trend.up { color: #86efac; }
.panelDash .trend.down { color: #fca5a5; }
.panelDash .trend.muted { color: #64748b; }

.panelDash .mainGrid {
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  gap: 16px;
  margin-bottom: 16px;
}

.panelDash .card {
  border-radius: 26px;
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, .14);
  background: rgba(15, 23, 42, .74);
  box-shadow: 0 10px 28px rgba(0,0,0,.14);
}

.panelDash .card h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.panelDash .card > p {
  margin: 0 0 16px;
  color: #94a3b8;
  font-size: 13px;
}

.panelDash .feedList {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 380px;
  overflow-y: auto;
}

.panelDash .feedItem {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(148, 163, 184, .08);
}

.panelDash .feedDot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.panelDash .feedDot.green { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, .5); }
.panelDash .feedDot.cyan { background: #06b6d4; box-shadow: 0 0 6px rgba(6, 182, 212, .5); }
.panelDash .feedDot.purple { background: #a855f7; box-shadow: 0 0 6px rgba(168, 85, 247, .5); }
.panelDash .feedDot.orange { background: #f97316; box-shadow: 0 0 6px rgba(249, 115, 22, .5); }

.panelDash .feedItem strong {
  display: block;
  font-size: 13px;
  line-height: 1.35;
}

.panelDash .feedItem small {
  color: #64748b;
  font-size: 11px;
}

.panelDash .leadRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(148, 163, 184, .08);
}

.panelDash .leadRow:last-child {
  border-bottom: 0;
}

.panelDash .leadBadge {
  min-width: 28px;
  height: 28px;
  border-radius: 10px;
  background: rgba(249, 115, 22, .18);
  color: #fdba74;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 1000;
  font-size: 12px;
}

.panelDash .leadInfo strong {
  display: block;
  font-size: 14px;
}

.panelDash .leadInfo p {
  margin: 3px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.panelDash .funnelSteps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
}

.panelDash .funnelStep {
  display: grid;
  grid-template-columns: 100px 1fr 48px;
  align-items: center;
  gap: 12px;
}

.panelDash .funnelBar {
  height: 10px;
  border-radius: 99px;
  background: rgba(255,255,255,.08);
  overflow: hidden;
}

.panelDash .funnelBar div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #06b6d4);
  transition: width .6s ease;
}

.panelDash .actionsGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.panelDash .actionBtn {
  min-height: 88px;
  border: 1px solid rgba(148, 163, 184, .14);
  border-radius: 22px;
  background: rgba(15, 23, 42, .7);
  color: white;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 16px 18px;
  font-weight: 900;
  transition: .2s ease;
}

.panelDash .actionBtn:hover {
  transform: translateY(-2px);
  border-color: rgba(34, 211, 238, .35);
  box-shadow: 0 8px 24px rgba(6, 182, 212, .1);
}

.panelDash .actionBtn span {
  font-size: 22px;
}

.panelDash .actionBtn.accent {
  background: linear-gradient(135deg, rgba(34, 197, 94, .2), rgba(6, 182, 212, .14));
}

.panelDash .emptyBlock {
  text-align: center;
  padding: 36px 20px;
  color: #94a3b8;
}

.panelDash .emptyBlock span {
  font-size: 32px;
  display: block;
  margin-bottom: 10px;
}

.panelDash .emptyBlock strong {
  display: block;
  color: #e5e7eb;
  margin-bottom: 6px;
}

.panelDash .errorBanner {
  border-radius: 18px;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: rgba(239, 68, 68, .12);
  border: 1px solid rgba(239, 68, 68, .3);
  color: #fecaca;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panelDash .errorBanner button {
  border: 0;
  border-radius: 12px;
  padding: 8px 14px;
  background: rgba(255,255,255,.1);
  color: white;
  cursor: pointer;
  font-weight: 800;
}

.panelDash .skel {
  border-radius: 12px;
  background: rgba(255,255,255,.07);
  animation: none;
}

.panelDash .skel.h40 { height: 40px; }
.panelDash .skel.h80 { height: 80px; }
.panelDash .skel.h120 { height: 120px; }
.panelDash .skel.h200 { height: 200px; }

@media (max-width: 1100px) {
  .panelDash .statusRow,
  .panelDash .kpiGrid,
  .panelDash .actionsGrid {
    grid-template-columns: repeat(2, 1fr);
  }
  .panelDash .mainGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .panelDash .statusRow,
  .panelDash .kpiGrid,
  .panelDash .actionsGrid {
    grid-template-columns: 1fr;
  }
  .panelDash .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .panelDash .hero h1 {
    font-size: 26px;
  }
}
`;
