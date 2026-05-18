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
.ajConnCard {
  border: 1px solid rgba(148,163,184,.12); border-radius: 16px;
  padding: 16px; margin-bottom: 12px; background: #111827;
}
.ajConnHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
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
