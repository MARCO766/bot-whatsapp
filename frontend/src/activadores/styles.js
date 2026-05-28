export const activadoresStyles = `
.actPage {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: actFadeIn .35s ease;
}

@keyframes actFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.actTopBar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.actTopBar h1 {
  margin: 0;
  font-size: 1.55rem;
  background: linear-gradient(135deg, #e2e8f0, #facc15 50%, #f97316);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.actConexionPicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.actConexionTab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid #2a3140;
  background: #11151c;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.actConexionTab:hover {
  border-color: #3d4a5c;
  color: #e2e8f0;
}

.actConexionTab--active {
  border-color: #22c55e66;
  background: #22c55e14;
  color: #86efac;
}

.actConexionPrincipal {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.85;
  color: #22c55e;
}

.actConexionHint {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #1c212c;
  border: 1px solid #2a3140;
  color: #94a3b8;
  font-size: 0.85rem;
}

.actStats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 900px) {
  .actStats { grid-template-columns: repeat(2, 1fr); }
}

.actStatCard {
  border-radius: 20px;
  padding: 16px 18px;
  background: rgba(15, 23, 42, .72);
  border: 1px solid rgba(148, 163, 184, .14);
  position: relative;
  overflow: hidden;
}

.actStatCard span {
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.actStatCard h3 {
  margin: 8px 0 0;
  font-size: 1.65rem;
}

.actStatCard.yellow h3 { color: #fde047; }
.actStatCard.green h3 { color: #86efac; }
.actStatCard.gray h3 { color: #cbd5e1; }
.actStatCard.cyan h3 { color: #67e8f9; }

.actToolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.actSearch {
  flex: 1;
  min-width: 200px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.18);
  background: rgba(15,23,42,.65);
  color: #e2e8f0;
  padding: 0 14px;
  outline: none;
  font-weight: 600;
}

.actSelect {
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.18);
  background: rgba(15,23,42,.65);
  color: #e2e8f0;
  padding: 0 12px;
  font-weight: 700;
}

.actBtn {
  border: 0;
  border-radius: 14px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  font-size: 0.88rem;
}

.actBtn:hover { transform: translateY(-1px); }

.actBtnPrimary {
  background: linear-gradient(135deg, #facc15, #f97316);
  color: #1c1917;
  box-shadow: 0 8px 28px rgba(250,204,21,.22);
}

.actBtnGhost {
  background: rgba(15,23,42,.65);
  color: #e2e8f0;
  border: 1px solid rgba(148,163,184,.2);
}

.actBtnDanger {
  background: rgba(127,29,29,.85);
  color: #fecaca;
}

.actGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.actCard {
  border-radius: 22px;
  padding: 18px;
  background: rgba(15, 23, 42, .72);
  border: 1px solid rgba(148, 163, 184, .14);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color .2s, box-shadow .2s;
}

.actCard:hover {
  border-color: rgba(250, 204, 21, .35);
  box-shadow: 0 12px 40px rgba(0,0,0,.22);
}

.actCardTop {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.actKeyword {
  font-size: 1.25rem;
  font-weight: 900;
  color: #fde047;
  word-break: break-word;
}

.actBadge {
  font-size: 0.72rem;
  font-weight: 900;
  padding: 5px 10px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.actBadge.activo {
  background: rgba(34,197,94,.18);
  color: #86efac;
}

.actBadge.pausado {
  background: rgba(148,163,184,.15);
  color: #94a3b8;
}

.actMeta {
  display: grid;
  gap: 6px;
  font-size: 0.84rem;
  color: #94a3b8;
}

.actMeta b { color: #e2e8f0; font-weight: 800; }

.actCardActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

.actEmpty {
  text-align: center;
  padding: 48px 24px;
  border-radius: 24px;
  background: rgba(15,23,42,.55);
  border: 1px dashed rgba(148,163,184,.25);
}

.actEmpty h2 { margin: 0 0 8px; }
.actEmpty p { color: #94a3b8; margin: 0 0 20px; }

.actSkeleton {
  border-radius: 22px;
  height: 180px;
  background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%);
  background-size: 200% 100%;
  animation: actShimmer 1.2s infinite;
}

@keyframes actShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.actToast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10001;
  padding: 14px 20px;
  border-radius: 14px;
  font-weight: 800;
  box-shadow: 0 16px 48px rgba(0,0,0,.35);
  animation: actToastIn .25s ease both;
}

.actToast.success {
  background: linear-gradient(135deg, #166534, #14532d);
  color: #bbf7d0;
  border: 1px solid rgba(34,197,94,.4);
}

.actToast.error {
  background: linear-gradient(135deg, #7f1d1d, #450a0a);
  color: #fecaca;
  border: 1px solid rgba(248,113,113,.4);
}

@keyframes actToastIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}

.actApiBanner {
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(127,29,29,.2);
  border: 1px solid rgba(248,113,113,.4);
  color: #fecaca;
  font-size: 0.85rem;
}

.actModalOverlay,
.actConfirmOverlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(2,6,23,.78);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: actFadeIn .2s ease;
}

.actConfirmModal {
  width: min(440px, 100%);
  border-radius: 24px;
  background: rgba(15,23,42,.98);
  border: 1px solid rgba(248,113,113,.25);
  padding: 26px;
  box-shadow: 0 32px 90px rgba(0,0,0,.5);
}

.actConfirmModal h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
  color: #f8fafc;
}

.actConfirmText {
  margin: 0 0 22px;
  color: #94a3b8;
  font-size: 0.92rem;
  line-height: 1.55;
}

.actHint {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(250, 204, 21, .08);
  border: 1px solid rgba(250, 204, 21, .2);
  color: #fde68a;
  font-size: 0.85rem;
  line-height: 1.45;
}

.actTipoBadge {
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #94a3b8;
  margin-bottom: 4px;
}

.actModal {
  width: 100%;
  max-width: 480px;
  border-radius: 24px;
  background: rgba(15,23,42,.96);
  border: 1px solid rgba(148,163,184,.2);
  padding: 24px;
  box-shadow: 0 32px 90px rgba(0,0,0,.45);
}

.actModal h2 {
  margin: 0 0 6px;
  font-size: 1.25rem;
}

.actModal .sub {
  color: #94a3b8;
  font-size: 0.88rem;
  margin: 0 0 18px;
}

.actField {
  margin-bottom: 14px;
}

.actField label {
  display: block;
  font-size: 0.78rem;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-bottom: 6px;
}

.actField input,
.actField select,
.actField textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.2);
  background: rgba(2,6,23,.6);
  color: #f8fafc;
  padding: 12px 14px;
  font-weight: 600;
  outline: none;
}

.actField textarea { min-height: 72px; resize: vertical; }

.actRow2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.actModalActions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 18px;
}
`;
