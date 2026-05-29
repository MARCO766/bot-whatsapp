export const flujosStyles = `
.flujosPage {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  animation: flFadeIn .35s ease;
  position: relative;
  z-index: 0;
}

@keyframes flFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.flTopBar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 4px 0 8px;
}

.flPageHeader {
  flex: 1;
  min-width: 240px;
}

.flPageEyebrow {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #22d3ee;
  margin-bottom: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.flTopBar h1 {
  margin: 0;
  font-size: clamp(1.45rem, 2.5vw, 1.85rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  background: linear-gradient(120deg, #f8fafc 0%, #86efac 45%, #22d3ee 85%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.flPageSubtitle {
  margin: 8px 0 0;
  max-width: 520px;
  color: #94a3b8;
  font-size: 0.9rem;
  line-height: 1.55;
}

.flTopActions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.flConexionPicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.flConexionTab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(2, 6, 23, 0.55);
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s, box-shadow 0.15s;
}

.flConexionTab:hover {
  border-color: #3d4a5c;
  color: #e2e8f0;
}

.flConexionTab--active {
  border-color: rgba(34, 197, 94, 0.55);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(6, 182, 212, 0.12));
  color: #bbf7d0;
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.15);
}

.flConexionPrincipal {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.85;
  color: #22c55e;
}

.flConexionHint {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #1c212c;
  border: 1px solid #2a3140;
  color: #94a3b8;
  font-size: 0.85rem;
}

.flBadgeLinea {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  background: #0ea5e922;
  color: #7dd3fc;
  border: 1px solid #0ea5e944;
}

.flBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(245,158,11,.12);
  border: 1px solid rgba(245,158,11,.35);
  color: #fcd34d;
  font-size: 0.85rem;
  line-height: 1.5;
}

.flApiBanner.error {
  background: rgba(127,29,29,.2);
  border-color: rgba(248,113,113,.4);
  color: #fecaca;
}

.flApiBanner code {
  font-size: 0.78rem;
  background: rgba(0,0,0,.35);
  padding: 2px 6px;
  border-radius: 6px;
  word-break: break-all;
}

.flApiBannerActions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.flHeaderStats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.flHeaderStats4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 1100px) {
  .flHeaderStats4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .flHeaderStats,
  .flHeaderStats4 {
    grid-template-columns: 1fr;
  }
}

.flHeaderStatCard {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 20px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.72));
  border: 1px solid rgba(148, 163, 184, 0.14);
  backdrop-filter: blur(14px);
  position: relative;
  min-height: 96px;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.flHeaderStatCard::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 100% 0%, var(--fl-kpi-glow, rgba(34, 197, 94, 0.12)), transparent 58%);
  pointer-events: none;
}

.flHeaderStatCard:hover {
  border-color: rgba(148, 163, 184, 0.28);
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

.flHeaderStatCard--cyan { --fl-kpi-glow: rgba(34, 211, 238, 0.2); }
.flHeaderStatCard--violet { --fl-kpi-glow: rgba(167, 139, 250, 0.2); }
.flHeaderStatCard--green { --fl-kpi-glow: rgba(34, 197, 94, 0.22); }
.flHeaderStatCard--emerald { --fl-kpi-glow: rgba(52, 211, 153, 0.2); }

.flHeaderStatIcon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.25);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.flHeaderStatIcon--cyan {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.3);
}

.flHeaderStatIcon--violet {
  background: rgba(167, 139, 250, 0.12);
  border-color: rgba(167, 139, 250, 0.3);
}

.flHeaderStatIcon--green {
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.35);
}

.flHeaderStatIcon--emerald {
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.3);
}

.flHeaderStatBody {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.flHeaderStatLabel {
  display: block;
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
  font-weight: 600;
}

.flHeaderStatValue {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.flHeaderStatSub {
  display: block;
  margin-top: 2px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #4ade80;
}

.flHeaderStatTrend {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 999px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  letter-spacing: 0.02em;
}

.flHeaderStatTrend.up {
  color: #4ade80;
  background: rgba(34,197,94,.12);
}

.flHeaderStatTrend.down {
  color: #f87171;
  background: rgba(127,29,29,.25);
}

.flHeaderStatsError {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 10px;
  border-radius: 12px;
  background: rgba(127,29,29,.2);
  border: 1px solid rgba(248,113,113,.3);
  color: #fecaca;
  font-size: 0.82rem;
}

.flStatsGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

.flStatsGridCompact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 900px) {
  .flStatsGridCompact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .flStatsGridCompact {
    grid-template-columns: 1fr;
  }
}

.flStatsGrid .flStatValue {
  font-size: 1.15rem;
  line-height: 1.2;
  word-break: break-word;
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
  align-items: flex-end;
  padding: 16px 18px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.45));
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.flSearch {
  flex: 1 1 220px;
  min-width: 200px;
  position: relative;
}

.flSearch input {
  width: 100%;
  padding: 12px 14px 12px 40px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.65);
  color: #f1f5f9;
  font-size: 0.9rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.flSearch input:focus {
  outline: none;
  border-color: rgba(34, 197, 94, 0.45);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
}

.flSearch input::placeholder {
  color: #64748b;
}

.flSearchIcon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 1rem;
  pointer-events: none;
}

.flFilterGroup {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.flFilterField {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.flFilterLabel {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
  padding-left: 2px;
}

.flSelect {
  padding: 10px 28px 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.65);
  color: #e2e8f0;
  font-size: 0.84rem;
  cursor: pointer;
  transition: border-color 0.15s;
}

.flSelect:hover,
.flSelect:focus {
  border-color: rgba(34, 197, 94, 0.35);
  outline: none;
}

.flViewToggle {
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.5);
  flex-shrink: 0;
}

.flViewToggle button {
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.flViewToggle button:hover {
  color: #cbd5e1;
}

.flViewToggle button.active {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(6, 182, 212, 0.22));
  color: #bbf7d0;
}

.flFoldersPremium {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.55));
  border: 1px solid rgba(148, 163, 184, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.flFoldersPremiumHead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.flFoldersPremiumTitle {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #f1f5f9;
}

.flFoldersPremiumSub {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: #64748b;
  max-width: 420px;
  line-height: 1.45;
}

.flFoldersPremiumLoading {
  font-size: 0.72rem;
  font-weight: 600;
  color: #22d3ee;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.flFoldersGroup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flFoldersGroupLabel {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  padding-left: 2px;
}

.flFolders {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flFolderChip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.55);
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.flFolderChipIcon {
  font-size: 0.95rem;
  line-height: 1;
}

.flFolderChipLabel {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flFolderChipLine {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flFolderChipTag {
  font-size: 0.58rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(168, 85, 247, 0.18);
  color: #d8b4fe;
}

.flFolderChip--all.active {
  border-color: rgba(34, 197, 94, 0.55);
}

.flFolderChip--muted {
  opacity: 0.92;
}

.flFolderChip--custom {
  border-style: dashed;
}

.flFolderChip:hover,
.flFolderChip.active {
  border-color: rgba(34, 197, 94, 0.5);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(6, 182, 212, 0.08));
  color: #bbf7d0;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.1);
}

.flFolderChip .count {
  margin-left: 2px;
  opacity: .65;
  font-size: 0.75rem;
}

.flGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  position: relative;
  z-index: 0;
}

.flList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flCard {
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.78));
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 22px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  position: relative;
  overflow: visible;
  isolation: isolate;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.flCard.flCardMenuOpen {
  z-index: 30;
  border-color: rgba(34,197,94,.45);
  box-shadow: 0 16px 48px rgba(0,0,0,.45), 0 0 0 1px rgba(34,197,94,.15);
}

.flCard::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at top right, rgba(34,197,94,.07), transparent 55%);
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
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
  gap: 12px;
  position: relative;
  z-index: 2;
}

.flCardHeadMain {
  flex: 1;
  min-width: 0;
}

.flCardMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  align-items: center;
}

.flMetaChip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(2, 6, 23, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.flMetaChipLinea {
  color: #7dd3fc;
  background: rgba(14, 165, 233, 0.1);
  border-color: rgba(14, 165, 233, 0.25);
}

.flMetaChipIcon {
  font-size: 0.68rem;
  opacity: 0.85;
}

.flCardTitle {
  font-size: 1.12rem;
  font-weight: 800;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.01em;
  line-height: 1.25;
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
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  position: relative;
  z-index: 1;
}

.flMetricsCompact .flMetric {
  padding: 10px 8px;
}

.flMetricsCompact .flMetric b {
  font-size: 1.1rem;
}

.flMetrics5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 1100px) {
  .flMetrics5 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .flMetrics5 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.flCardActivity {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(2, 6, 23, 0.55), rgba(15, 23, 42, 0.4));
  border: 1px solid rgba(148, 163, 184, 0.1);
  position: relative;
  z-index: 1;
}

.flCardActivityItem {
  flex: 1;
  min-width: 140px;
}

.flCardActivityLabel {
  display: block;
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.flCardActivityValue {
  font-size: 0.88rem;
  color: #e2e8f0;
  font-weight: 600;
}

.flCardActivityLead {
  color: #86efac;
}

.flMetric {
  text-align: center;
  padding: 10px 8px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.08);
  transition: border-color 0.15s, background 0.15s;
}

.flMetric:hover {
  border-color: rgba(34, 197, 94, 0.2);
  background: rgba(2, 6, 23, 0.65);
}

.flMetric b {
  display: block;
  font-size: 1.08rem;
  font-weight: 800;
  color: #f1f5f9;
  letter-spacing: -0.02em;
}

.flMetric span {
  display: block;
  margin-top: 2px;
  font-size: 0.65rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.flPreviewWrap {
  height: 96px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.1);
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.flPreviewWrap.tall {
  height: 108px;
  min-width: 160px;
}

.flPreviewInner {
  width: 100%;
  height: 100%;
  position: relative;
  background:
    linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
  background-size: 14px 14px;
}

.flPreviewInner::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(34, 197, 94, 0.08), transparent 70%);
  pointer-events: none;
}

.flPreviewEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 500;
}

.flPreviewEmptyIcon {
  font-size: 1.1rem;
  opacity: 0.5;
  color: #475569;
}

.flCardFooter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  position: relative;
  z-index: 1;
}

.flCardModified {
  font-size: 0.72rem;
  color: #64748b;
}

.flQuickActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flQuickBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 11px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.7);
  color: #cbd5e1;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.12s;
}

.flQuickBtn:hover {
  border-color: rgba(34, 197, 94, 0.4);
  color: #bbf7d0;
  background: rgba(34, 197, 94, 0.08);
}

.flQuickBtnPrimary {
  border-color: rgba(34, 197, 94, 0.45);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(6, 182, 212, 0.15));
  color: #dcfce7;
}

.flQuickBtnPrimary:hover {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.32), rgba(6, 182, 212, 0.22));
  color: #f0fdf4;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.2);
}

.flQuickBtnActive {
  border-color: rgba(6, 182, 212, 0.45);
  background: rgba(6, 182, 212, 0.12);
  color: #a5f3fc;
}

.flQuickBtnIcon {
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.9;
}

.flMenuWrap {
  position: relative;
  z-index: 5;
  flex-shrink: 0;
}

.flMenuBtn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(15,23,42,.9);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 1.15rem;
  line-height: 1;
  transition: background .15s, border-color .15s, box-shadow .15s;
}

.flMenuBtn:hover,
.flMenuBtn.active {
  background: rgba(34,197,94,.15);
  border-color: rgba(34,197,94,.45);
  box-shadow: 0 0 20px rgba(34,197,94,.2);
}

.flMenuBackdrop {
  position: fixed;
  inset: 0;
  z-index: 10040;
  background: rgba(2, 6, 23, 0.35);
  backdrop-filter: blur(2px);
}

.flMenuPortal {
  background: rgba(12,18,32,.97);
  border: 1px solid rgba(148,163,184,.22);
  border-radius: 16px;
  padding: 6px;
  box-shadow:
    0 24px 64px rgba(0,0,0,.55),
    0 0 0 1px rgba(255,255,255,.04),
    0 0 40px rgba(34,197,94,.08);
  backdrop-filter: blur(16px);
  animation: flMenuIn .18s cubic-bezier(.2,.8,.2,1);
  max-height: min(70vh, 420px);
  display: flex;
  flex-direction: column;
}

.flMenuPortalUp {
  animation-name: flMenuInUp;
}

@keyframes flMenuIn {
  from { opacity: 0; transform: translateY(-6px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes flMenuInUp {
  from { opacity: 0; transform: translateY(-100%) translateY(6px) scale(.98); }
  to { opacity: 1; transform: translateY(-100%) scale(1); }
}

.flMenuPortal a,
.flMenuPortal button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: #e2e8f0;
  text-decoration: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.86rem;
  text-align: left;
  transition: background .12s, color .12s;
}

.flMenuPortal a:hover,
.flMenuPortal button:hover {
  background: rgba(148,163,184,.1);
}

.flMenuPortal button.active {
  background: rgba(34,197,94,.14);
  color: #86efac;
}

.flMenuIcon {
  width: 22px;
  text-align: center;
  flex-shrink: 0;
  opacity: 0.9;
}

.flMenuDivider {
  height: 1px;
  background: rgba(148,163,184,.15);
  margin: 4px 8px;
}

.flMenuSection {
  padding: 6px 12px 4px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.flMenuScroll {
  max-height: 180px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

.flMenuScroll::-webkit-scrollbar {
  width: 5px;
}

.flMenuScroll::-webkit-scrollbar-thumb {
  background: rgba(148,163,184,.3);
  border-radius: 4px;
}

.flMenuDanger {
  color: #fca5a5 !important;
}

.flMenuDanger:hover {
  background: rgba(127,29,29,.35) !important;
}

.flMenuItemDisabled {
  opacity: 0.55;
  cursor: not-allowed !important;
  justify-content: space-between !important;
}

.flMenuItemDisabled:hover {
  background: transparent !important;
}

.flMenuSoon {
  margin-left: auto;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.12);
}

.flMiniToast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10060;
  padding: 12px 20px;
  border-radius: 14px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  animation: flFadeIn 0.2s ease;
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

.flModalWide {
  width: min(640px, 100%);
}

.flImportJsonBlock {
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px dashed rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.06);
  margin-bottom: 18px;
}

.flImportJsonHead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  color: #e2e8f0;
}

.flImportJsonHint {
  font-size: 0.75rem;
  color: #64748b;
}

.flImportJsonWarn {
  margin: 0;
  font-size: 0.85rem;
  color: #fbbf24;
  line-height: 1.45;
}

.flImportJsonLabel {
  display: inline-block;
  cursor: pointer;
}

.flImportJsonInput {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.flImportJsonBtn {
  display: inline-block;
  pointer-events: none;
}

.flImportDivider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 14px;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.flImportDivider::before,
.flImportDivider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(148, 163, 184, 0.15);
}

.flVersionsModal .flVersionsList {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  max-height: min(52vh, 420px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flVersionRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 23, 0.45);
}

.flVersionMotivo {
  display: block;
  font-weight: 700;
  color: #e2e8f0;
  font-size: 0.88rem;
}

.flVersionMeta {
  display: block;
  font-size: 0.78rem;
  color: #64748b;
  margin-top: 2px;
}

.flVersionDate {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 4px;
}

.flVersionActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.flVersionsEmpty {
  margin: 0 0 16px;
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 0.88rem;
  border-radius: 14px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
}

.flBtnMuted {
  opacity: 0.55;
  cursor: not-allowed;
}

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
