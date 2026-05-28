export const ajustesStyles = `
.ajustesPage { min-height: 100%; color: #e2e8f0; }
.ajustesLayout { display: flex; gap: 20px; align-items: flex-start; }
.ajustesSide {
  width: 220px; flex-shrink: 0; position: sticky; top: 12px;
  background: #0f172a; border: 1px solid rgba(148,163,184,.12);
  border-radius: 20px; padding: 12px;
}
.ajustesSide button {
  width: 100%; text-align: left; border: none; background: transparent;
  color: #94a3b8; padding: 12px 14px; border-radius: 14px; cursor: pointer;
  font-weight: 600; font-size: 14px; margin-bottom: 4px;
}
.ajustesSide button.active {
  background: linear-gradient(135deg, rgba(34,197,94,.2), rgba(6,182,212,.15));
  color: #fff;
}
.ajustesMain { flex: 1; min-width: 0; }
.ajustesTop { margin-bottom: 20px; }
.ajustesTop h1 { margin: 0; font-size: 32px; }
.ajustesTop p { margin: 6px 0 0; color: #94a3b8; }
.ajCard {
  background: #0f172a; border: 1px solid rgba(148,163,184,.12);
  border-radius: 22px; padding: 22px; margin-bottom: 16px;
}
.ajCard h2 { margin: 0 0 16px; font-size: 18px; }
.ajField { margin-bottom: 14px; }
.ajField label { display: block; margin-bottom: 6px; color: #94a3b8; font-size: 13px; }
.ajField input, .ajField select, .ajField textarea {
  width: 100%; border: 1px solid rgba(148,163,184,.15); border-radius: 12px;
  background: #111827; color: #fff; padding: 12px 14px; font-size: 14px;
}
.ajField textarea { min-height: 90px; resize: vertical; }
.ajRow2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ajBtnRow { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.ajBtn {
  border: none; border-radius: 12px; padding: 10px 16px; font-weight: 700;
  cursor: pointer; font-size: 13px;
}
.ajBtn.primary { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.ajBtn.ghost { background: #1e293b; color: #e2e8f0; }
.ajBtn.danger { background: rgba(127,29,29,.85); color: #fecaca; }
.ajBtn:disabled { opacity: .5; cursor: not-allowed; }
.ajSwitchRow {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 14px 0; border-bottom: 1px solid rgba(148,163,184,.08);
}
.ajSwitchRow:last-child { border-bottom: none; }
.ajSwitchRow p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
.ajSwitch {
  width: 56px; height: 30px; border: none; border-radius: 999px;
  background: #1e293b; position: relative; cursor: pointer; flex-shrink: 0;
}
.ajSwitch span {
  width: 22px; height: 22px; border-radius: 50%; background: #fff;
  position: absolute; top: 4px; left: 4px; transition: .2s;
}
.ajSwitch.on { background: linear-gradient(135deg,#22c55e,#06b6d4); }
.ajSwitch.on span { left: 30px; }
.badge {
  display: inline-block; padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 700;
}
.badge.ok { background: rgba(34,197,94,.2); color: #86efac; }
.badge.warn { background: rgba(234,179,8,.2); color: #fde047; }
.badge.err { background: rgba(239,68,68,.2); color: #fca5a5; }
.badge.muted { background: #1e293b; color: #94a3b8; }
.ajConnHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }

/* —— Conexiones WhatsApp (grid premium) —— */
.waConnectionsWrap { overflow: hidden; }
.waSectionHead { margin-bottom: 22px; }
.waSectionTitle { margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.waSectionSub { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }

.waConnGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 8px;
}
@media (max-width: 768px) {
  .waConnGrid { grid-template-columns: 1fr; }
}

.waConnPremium {
  position: relative;
  border-radius: 24px;
  padding: 1px;
  background: linear-gradient(135deg, rgba(34,197,94,.35), rgba(6,182,212,.2), rgba(148,163,184,.12));
  box-shadow: 0 8px 32px rgba(0,0,0,.25), 0 0 48px rgba(34,197,94,.06);
  transition: transform .25s ease, box-shadow .25s ease;
}
.waConnPremium:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 48px rgba(0,0,0,.35), 0 0 64px rgba(34,197,94,.14);
}
.waConnPremiumInner {
  border-radius: 23px;
  padding: 22px;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.waConnTop { display: flex; flex-direction: column; gap: 12px; }
.waConnName {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #f8fafc;
}
.waConnBadges { display: flex; flex-wrap: wrap; gap: 8px; }
.waBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
}
.waBadgeOk { background: rgba(34,197,94,.15); color: #86efac; border-color: rgba(34,197,94,.25); }
.waBadgeErr { background: rgba(239,68,68,.15); color: #fca5a5; border-color: rgba(239,68,68,.25); }
.waBadgeWarn { background: rgba(234,179,8,.15); color: #fde047; border-color: rgba(234,179,8,.25); }
.waBadgeMuted { background: rgba(148,163,184,.1); color: #94a3b8; border-color: rgba(148,163,184,.2); }
.waBadgePrincipal {
  background: linear-gradient(135deg, rgba(234,179,8,.2), rgba(251,191,36,.1));
  color: #fde68a;
  border-color: rgba(251,191,36,.35);
}
.waBadgeSecondary { background: rgba(148,163,184,.08); color: #cbd5e1; border-color: rgba(148,163,184,.18); }

.waConnMeta { display: flex; flex-direction: column; gap: 10px; }
.waConnMetaRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.45);
  border: 1px solid rgba(148,163,184,.08);
}
.waConnMetaLabel { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.waConnMetaValue { font-size: 14px; color: #e2e8f0; font-weight: 600; text-align: right; word-break: break-all; }
.waConnMetaValue.mono { font-family: ui-monospace, monospace; font-size: 13px; color: #a5f3fc; }

.waTokenRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.55);
  border: 1px solid rgba(6,182,212,.15);
}
.waTokenCode {
  flex: 1;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: #67e8f9;
  letter-spacing: .02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.waBtnCopy {
  flex-shrink: 0;
  border: 1px solid rgba(34,197,94,.35);
  background: rgba(34,197,94,.12);
  color: #86efac;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background .2s, border-color .2s;
}
.waBtnCopy:hover { background: rgba(34,197,94,.22); border-color: rgba(34,197,94,.5); }

.waConnActions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}
.waBtn {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 11px 16px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: transform .15s, box-shadow .2s, opacity .2s;
}
.waBtn:disabled { opacity: .5; cursor: not-allowed; }
.waBtn:not(:disabled):hover { transform: translateY(-1px); }
.waBtnPrimary {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #052e16;
  box-shadow: 0 4px 20px rgba(34,197,94,.25);
}
.waBtnPrimary:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(34,197,94,.35); }
.waBtnGhost {
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  border: 1px solid rgba(148,163,184,.15);
}
.waBtnGhost:hover:not(:disabled) { background: rgba(51, 65, 85, 0.95); border-color: rgba(148,163,184,.25); }
.waBtnDanger {
  background: rgba(127, 29, 29, 0.75);
  color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.2);
}
.waBtnDanger:hover:not(:disabled) { background: rgba(153, 27, 27, 0.9); }

.waConnAdd {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 220px;
  border-radius: 24px;
  border: 2px dashed rgba(34,197,94,.35);
  background: rgba(15, 23, 42, 0.4);
  color: #94a3b8;
  cursor: pointer;
  transition: transform .25s ease, border-color .25s, background .25s, box-shadow .25s;
  padding: 24px;
}
.waConnAdd:hover {
  transform: translateY(-4px);
  border-color: rgba(34,197,94,.6);
  background: rgba(34,197,94,.06);
  box-shadow: 0 0 48px rgba(34,197,94,.1);
  color: #e2e8f0;
}
.waConnAddIcon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
  background: linear-gradient(135deg, rgba(34,197,94,.2), rgba(6,182,212,.15));
  color: #86efac;
  border: 1px solid rgba(34,197,94,.25);
}
.waConnAddLabel { font-size: 16px; font-weight: 800; color: #f1f5f9; }
.waConnAddHint { font-size: 12px; color: #64748b; text-align: center; max-width: 200px; line-height: 1.4; }

.waTestField { margin-top: 20px; padding-top: 4px; border-top: 1px solid rgba(148,163,184,.08); }
.ajHint { color: #64748b; font-size: 13px; margin: 8px 0 0; line-height: 1.5; }
.ajCode {
  display: block; background: #020617; border-radius: 10px; padding: 10px 12px;
  font-family: ui-monospace, monospace; font-size: 12px; color: #a5f3fc;
  word-break: break-all; margin: 8px 0;
}
.skel { background: linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%);
  background-size: 200% 100%; animation: sk 1.2s infinite; border-radius: 12px; }
.skel.h40 { height: 40px; margin-bottom: 10px; }
.skel.h120 { height: 120px; }
@keyframes sk { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.ajToast {
  position: fixed; top: 18px; right: 24px; z-index: 600; padding: 12px 18px;
  border-radius: 14px; font-weight: 800; box-shadow: 0 12px 40px rgba(0,0,0,.35);
}
.ajToast.ok { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.ajToast.err { background: #7f1d1d; color: #fecaca; }
.ajErrorBox {
  background: rgba(127,29,29,.3); border: 1px solid rgba(248,113,113,.3);
  border-radius: 16px; padding: 16px; color: #fecaca; margin-bottom: 16px;
}
.tagRow { display: flex; align-items: center; gap: 10px; padding: 10px 0;
  border-bottom: 1px solid rgba(148,163,184,.08); }
.tagDot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
@media (max-width: 900px) {
  .ajustesLayout { flex-direction: column; }
  .ajustesSide { width: 100%; position: static; display: flex; flex-wrap: wrap; gap: 6px; }
  .ajustesSide button { width: auto; flex: 1 1 auto; min-width: 120px; }
  .ajRow2 { grid-template-columns: 1fr; }
}
`;
