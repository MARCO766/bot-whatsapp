export const flujosStyles = `
.flujosPage {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  animation: flFadeIn .35s ease;
}

@keyframes flFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.flTopBar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.flTopBar h1 {
  margin: 0;
  font-size: 1.55rem;
  background: linear-gradient(135deg, #e2e8f0, #22c55e 60%, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.flTopActions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.flBtn {
  border: 0;
  border-radius: 14px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, opacity .15s;
  font-size: 0.88rem;
}

.flBtn:hover { transform: translateY(-1px); }
.flBtn:active { transform: scale(.98); }

.flBtnPrimary {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
  box-shadow: 0 8px 28px rgba(34,197,94,.25);
}

.flBtnGhost {
  background: rgba(15,23,42,.65);
  color: #e2e8f0;
  border: 1px solid rgba(148,163,184,.2);
}

.flBtnDanger {
  background: rgba(127,29,29,.85);
  color: #fecaca;
}

.flApiBanner {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(245,158,11,.12);
  border: 1px solid rgba(245,158,11,.35);
  color: #fcd34d;
  font-size: 0.85rem;
}

.flStatsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.flStatCard {
  background: rgba(15,23,42,.72);
  border: 1px solid rgba(148,163,184,.12);
  border-radius: 18px;
  padding: 14px 16px;
  backdrop-filter: blur(12px);
  transition: border-color .2s, transform .2s;
}

.flStatCard:hover {
  border-color: rgba(34,197,94,.35);
  transform: translateY(-2px);
}

.flStatLabel {
  font-size: 0.72rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 6px;
}

.flStatValue {
  font-size: 1.45rem;
  font-weight: 800;
  color: #f1f5f9;
}

.flStatValue.accentGreen { color: #4ade80; }
.flStatValue.accentCyan { color: #22d3ee; }
.flStatValue.accentWarn { color: #fbbf24; }
.flStatValue.accentError { color: #f87171; }

.flToolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: rgba(15,23,42,.55);
  border: 1px solid rgba(148,163,184,.1);
  border-radius: 18px;
}

.flSearch {
  flex: 1;
  min-width: 200px;
  position: relative;
}

.flSearch input {
  width: 100%;
  padding: 11px 14px 11px 38px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.2);
  background: rgba(2,6,23,.6);
  color: #f1f5f9;
  font-size: 0.9rem;
}

.flSearch span {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: .5;
}

.flSelect {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.2);
  background: rgba(2,6,23,.6);
  color: #e2e8f0;
  font-size: 0.85rem;
}

.flViewToggle {
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,.2);
}

.flViewToggle button {
  padding: 9px 14px;
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
}

.flViewToggle button.active {
  background: linear-gradient(135deg, rgba(34,197,94,.25), rgba(6,182,212,.2));
  color: #4ade80;
}

.flFolders {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flFolderChip {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,.15);
  background: rgba(15,23,42,.5);
  color: #cbd5e1;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}

.flFolderChip:hover,
.flFolderChip.active {
  border-color: rgba(34,197,94,.5);
  background: rgba(34,197,94,.12);
  color: #86efac;
}

.flFolderChip .count {
  margin-left: 6px;
  opacity: .65;
  font-size: 0.75rem;
}

.flGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.flList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flCard {
  background: rgba(15,23,42,.78);
  border: 1px solid rgba(148,163,184,.12);
  border-radius: 20px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color .2s, box-shadow .2s, transform .2s;
  position: relative;
  overflow: hidden;
}

.flCard::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top right, rgba(34,197,94,.06), transparent 55%);
  pointer-events: none;
}

.flCard:hover {
  border-color: rgba(34,197,94,.35);
  box-shadow: 0 12px 40px rgba(0,0,0,.35);
  transform: translateY(-2px);
}

.flCard.listMode {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}

.flCardHead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.flCardTitle {
  font-size: 1.05rem;
  font-weight: 800;
  color: #f8fafc;
  margin: 0;
}

.flBadge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.flBadgeDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.flMetrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  position: relative;
  z-index: 1;
}

.flMetric {
  text-align: center;
  padding: 8px;
  border-radius: 12px;
  background: rgba(2,6,23,.45);
}

.flMetric b {
  display: block;
  font-size: 1rem;
  color: #e2e8f0;
}

.flMetric span {
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
}

.flPreviewWrap {
  height: 88px;
  border-radius: 12px;
  background: rgba(2,6,23,.5);
  border: 1px solid rgba(148,163,184,.08);
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.flPreviewWrap.tall { height: 100px; min-width: 160px; }

.flCardFooter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.75rem;
  color: #64748b;
  position: relative;
  z-index: 1;
}

.flQuickActions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flQuickBtn {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148,163,184,.15);
  background: rgba(15,23,42,.6);
  color: #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all .12s;
}

.flQuickBtn:hover {
  border-color: rgba(34,197,94,.4);
  color: #86efac;
}

.flMenuWrap { position: relative; z-index: 2; }

.flMenuBtn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.2);
  background: rgba(15,23,42,.8);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 1.1rem;
}

.flMenuDropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 200px;
  background: #0f172a;
  border: 1px solid rgba(148,163,184,.2);
  border-radius: 14px;
  padding: 6px;
  box-shadow: 0 20px 50px rgba(0,0,0,.5);
  z-index: 50;
  animation: flMenuIn .15s ease;
}

@keyframes flMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.flMenuDropdown button,
.flMenuDropdown a {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: #e2e8f0;
  text-decoration: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85rem;
  text-align: left;
}

.flMenuDropdown button:hover,
.flMenuDropdown a:hover {
  background: rgba(34,197,94,.12);
}

.flMenuDropdown .danger { color: #f87171; }

.flCampaigns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flCampTag {
  font-size: 0.68rem;
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(6,182,212,.15);
  color: #67e8f9;
  border: 1px solid rgba(6,182,212,.25);
}

.flCampTag.empty {
  background: rgba(100,116,139,.1);
  color: #64748b;
  border-color: rgba(100,116,139,.2);
}

.flTimeline {
  border-top: 1px solid rgba(148,163,184,.1);
  padding-top: 10px;
  margin-top: 4px;
}

.flTimelineItem {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  font-size: 0.78rem;
  color: #94a3b8;
}

.flTimelineDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34,197,94,.6);
}

.flEmpty {
  text-align: center;
  padding: 60px 24px;
  border-radius: 24px;
  border: 1px dashed rgba(148,163,184,.25);
  background: rgba(15,23,42,.4);
}

.flEmptyIcon { font-size: 3rem; margin-bottom: 12px; opacity: .8; }
.flEmpty h3 { margin: 0 0 8px; color: #e2e8f0; }
.flEmpty p { color: #64748b; margin: 0 0 20px; max-width: 400px; margin-inline: auto; }

.flSkeleton {
  border-radius: 20px;
  background: linear-gradient(90deg, rgba(30,41,59,.5) 25%, rgba(51,65,85,.5) 50%, rgba(30,41,59,.5) 75%);
  background-size: 200% 100%;
  animation: flShimmer 1.2s infinite;
  min-height: 180px;
}

@keyframes flShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.flModalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  padding: 20px;
  animation: flFadeIn .2s ease;
}

.flModal {
  width: min(560px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #0f172a;
  border: 1px solid rgba(148,163,184,.2);
  border-radius: 22px;
  padding: 24px;
  box-shadow: 0 30px 80px rgba(0,0,0,.5);
}

.flModal h2 { margin: 0 0 8px; color: #f1f5f9; }
.flModal p.sub { color: #64748b; font-size: 0.9rem; margin: 0 0 20px; }

.flTemplateGrid {
  display: grid;
  gap: 10px;
}

.flTemplateCard {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.15);
  background: rgba(2,6,23,.4);
  cursor: pointer;
  text-align: left;
  transition: all .15s;
  color: inherit;
}

.flTemplateCard:hover {
  border-color: rgba(34,197,94,.4);
  background: rgba(34,197,94,.08);
}

.flToast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  padding: 14px 20px;
  border-radius: 16px;
  font-weight: 700;
  animation: flFadeIn .25s ease;
  box-shadow: 0 12px 40px rgba(0,0,0,.4);
}

.flToast.success {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
}

.flToast.error {
  background: rgba(127,29,29,.95);
  color: #fecaca;
}

.flModalActions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.flInput {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.2);
  background: rgba(2,6,23,.6);
  color: #f1f5f9;
  margin-bottom: 16px;
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .flStatsGrid { grid-template-columns: repeat(2, 1fr); }
  .flCard.listMode { flex-direction: column; }
  .flMetrics { grid-template-columns: repeat(2, 1fr); }
}
`;
