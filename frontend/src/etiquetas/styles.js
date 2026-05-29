export const etiquetasStyles = `
.etqPage { min-height: 100%; color: #e2e8f0; }
.etqTopBar {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; flex-wrap: wrap; margin-bottom: 18px;
}
.etqTopBar h1 { margin: 0; font-size: 32px; }
.etqTopBar p { margin: 6px 0 0; color: #94a3b8; max-width: 520px; }
.etqNote {
  background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.25);
  border-radius: 14px; padding: 12px 16px; font-size: 13px; color: #bbf7d0;
  margin-bottom: 18px; line-height: 1.5;
}
.etqConexionHint {
  font-size: 13px; color: #94a3b8; margin: -8px 0 14px; line-height: 1.45;
}
.etqLineaBadge {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 8px; padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; color: #86efac;
  background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.25);
  vertical-align: middle;
}
.etqTagCard h3 {
  margin: 12px 0 6px; font-size: 18px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
}
.etqToolbar {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  margin-bottom: 18px;
}
.etqSearch {
  flex: 1; min-width: 200px; border: 1px solid rgba(148,163,184,.15);
  border-radius: 12px; background: #111827; color: #fff; padding: 11px 14px;
}
.etqViewSwitch {
  display: flex; background: #111827; border-radius: 12px; padding: 4px;
  border: 1px solid rgba(148,163,184,.12);
}
.etqViewSwitch button {
  border: none; background: transparent; color: #94a3b8;
  padding: 8px 14px; border-radius: 9px; cursor: pointer; font-weight: 700; font-size: 13px;
}
.etqViewSwitch button.on {
  background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16;
}
.etqStats {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px;
}
.etqStat {
  background: #0f172a; border: 1px solid rgba(148,163,184,.12);
  border-radius: 16px; padding: 14px 18px; min-width: 120px;
}
.etqStat b { display: block; font-size: 22px; }
.etqStat span { color: #94a3b8; font-size: 13px; }
.etqBtn {
  border: none; border-radius: 12px; padding: 10px 16px; font-weight: 800;
  cursor: pointer; font-size: 13px;
}
.etqBtnPrimary { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.etqBtnGhost { background: #1e293b; color: #e2e8f0; }
.etqBtnDanger { background: rgba(127,29,29,.85); color: #fecaca; }
.etqBtn:disabled { opacity: .5; cursor: not-allowed; }
.etqCard {
  background: #0f172a; border: 1px solid rgba(148,163,184,.12);
  border-radius: 22px; padding: 20px;
}
.etqGrid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px;
}
.etqTagCard {
  background: #111827; border-radius: 18px; padding: 18px;
  border: 1px solid rgba(148,163,184,.1); position: relative; overflow: hidden;
}
.etqTagCard::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px;
  background: var(--tag-color, #22c55e);
}
.etqTagCard .leads { color: #94a3b8; font-size: 13px; margin-bottom: 14px; }
.etqTagCard .actions { display: flex; gap: 8px; }
.etqTable { width: 100%; border-collapse: collapse; }
.etqTable th, .etqTable td {
  text-align: left; padding: 12px 10px; border-bottom: 1px solid rgba(148,163,184,.08);
}
.etqTable th { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.etqDot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 8px; }
.etqModalBackdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 400;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.etqModal {
  width: 100%; max-width: 440px; background: #0f172a; border-radius: 20px;
  border: 1px solid rgba(148,163,184,.15); padding: 22px;
}
.etqModal h2 { margin: 0 0 16px; font-size: 20px; }
.etqField { margin-bottom: 14px; }
.etqField label { display: block; margin-bottom: 6px; color: #94a3b8; font-size: 13px; }
.etqField input { width: 100%; border-radius: 12px; border: 1px solid rgba(148,163,184,.15);
  background: #111827; color: #fff; padding: 11px 14px; }
.etqField input[type="color"] { height: 48px; padding: 6px; }
.etqModalActions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
.etqToast {
  position: fixed; top: 18px; right: 24px; z-index: 500; padding: 12px 18px;
  border-radius: 14px; font-weight: 800; box-shadow: 0 12px 40px rgba(0,0,0,.35);
}
.etqToast.ok { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.etqToast.err { background: #7f1d1d; color: #fecaca; }
.etqEmpty { text-align: center; padding: 40px 20px; color: #94a3b8; }
.etqSkel { background: linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%);
  background-size: 200% 100%; animation: etqSk 1.2s infinite; border-radius: 12px; height: 48px; margin-bottom: 10px; }
@keyframes etqSk { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@media (max-width: 700px) {
  .etqTopBar { flex-direction: column; }
}
`;
