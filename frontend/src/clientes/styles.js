export const clientesStyles = `
.crmPage { min-height: 100%; color: #e2e8f0; }
.crmTop {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; flex-wrap: wrap; margin-bottom: 20px;
}
.crmTop h1 { margin: 0; font-size: 34px; background: linear-gradient(135deg,#fff,#94a3b8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.crmTop p { margin: 6px 0 0; color: #94a3b8; }
.crmActions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.crmDash {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px; margin-bottom: 22px;
}
.crmDashCard {
  background: rgba(15,23,42,.85); backdrop-filter: blur(12px);
  border: 1px solid rgba(148,163,184,.12); border-radius: 18px;
  padding: 16px 18px; position: relative; overflow: hidden;
  transition: transform .2s, box-shadow .2s, border-color .2s;
}
.crmDashCard:hover {
  transform: translateY(-2px);
  border-color: rgba(34,197,94,.35);
  box-shadow: 0 8px 32px rgba(6,182,212,.12);
}
.crmDashCard::after {
  content: ""; position: absolute; top: -40px; right: -40px; width: 80px; height: 80px;
  background: radial-gradient(circle, rgba(34,197,94,.15), transparent 70%);
}
.crmDashCard span { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 6px; }
.crmDashCard b { font-size: 26px; font-weight: 900; }
.crmDashCard.accent b { color: #67e8f9; }
.crmToolbar {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  margin-bottom: 16px; padding: 14px 16px;
  background: rgba(15,23,42,.6); border-radius: 18px;
  border: 1px solid rgba(148,163,184,.1);
}
.crmSearch {
  flex: 1; min-width: 200px; border: 1px solid rgba(148,163,184,.15);
  border-radius: 14px; background: #0b1220; color: #fff; padding: 11px 14px;
}
.crmSearch:focus { outline: none; border-color: rgba(6,182,212,.5); box-shadow: 0 0 0 3px rgba(6,182,212,.12); }
.crmViewSwitch {
  display: flex; background: #0b1220; border-radius: 12px; padding: 4px;
  border: 1px solid rgba(148,163,184,.12);
}
.crmViewSwitch button {
  border: none; background: transparent; color: #94a3b8;
  padding: 8px 12px; border-radius: 9px; cursor: pointer; font-weight: 700; font-size: 12px;
}
.crmViewSwitch button.on {
  background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16;
}
.crmFilters {
  display: flex; flex-wrap: wrap; gap: 8px; width: 100%; margin-top: 8px;
}
.crmFilters select, .crmFilters input[type="date"] {
  border: 1px solid rgba(148,163,184,.12); border-radius: 10px;
  background: #0b1220; color: #e2e8f0; padding: 8px 10px; font-size: 12px;
}
.crmBtn {
  border: none; border-radius: 12px; padding: 10px 16px; font-weight: 800;
  cursor: pointer; font-size: 13px; transition: transform .15s, opacity .15s;
}
.crmBtn:hover:not(:disabled) { transform: scale(1.02); }
.crmBtn:disabled { opacity: .5; cursor: not-allowed; }
.crmBtnPrimary { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.crmBtnGhost { background: #1e293b; color: #e2e8f0; }
.crmBtnDanger { background: rgba(127,29,29,.85); color: #fecaca; }
.crmTableWrap {
  overflow: auto; background: rgba(15,23,42,.7); backdrop-filter: blur(8px);
  border: 1px solid rgba(148,163,184,.12); border-radius: 22px;
}
.crmTable { width: 100%; border-collapse: collapse; min-width: 900px; }
.crmTable th {
  text-align: left; padding: 14px 16px; color: #94a3b8; font-size: 11px;
  text-transform: uppercase; letter-spacing: .05em; background: rgba(17,24,39,.8);
  position: sticky; top: 0; z-index: 1;
}
.crmTable td { padding: 14px 16px; border-top: 1px solid rgba(148,163,184,.06); vertical-align: middle; }
.crmTable tr { cursor: pointer; transition: background .15s; }
.crmTable tr:hover td { background: rgba(34,197,94,.04); }
.crmAvatar {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16;
  display: flex; align-items: center; justify-content: center; font-weight: 900;
  box-shadow: 0 0 20px rgba(6,182,212,.25);
}
.crmUserCell { display: flex; align-items: center; gap: 12px; }
.crmUserCell p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
.crmChip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
  border: 1px solid currentColor; margin: 2px;
  box-shadow: 0 0 12px currentColor;
}
.crmEmbudo {
  display: inline-flex; padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
  background: rgba(139,92,246,.15); color: #c4b5fd; border: 1px solid rgba(139,92,246,.3);
}
.crmScore { font-size: 18px; }
.crmGrid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
}
.crmLeadCard {
  background: rgba(15,23,42,.9); border: 1px solid rgba(148,163,184,.12);
  border-radius: 20px; padding: 18px; cursor: pointer;
  transition: transform .2s, border-color .2s, box-shadow .2s;
  position: relative; overflow: hidden;
}
.crmLeadCard::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(34,197,94,.06), rgba(6,182,212,.04));
  opacity: 0; transition: opacity .2s;
}
.crmLeadCard:hover {
  transform: translateY(-3px); border-color: rgba(6,182,212,.4);
  box-shadow: 0 12px 40px rgba(0,0,0,.35);
}
.crmLeadCard:hover::before { opacity: 1; }
.crmLeadCardHead { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; position: relative; }
.crmLeadCardMeta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #94a3b8; margin: 10px 0; }
.crmKanban {
  display: flex; gap: 14px; overflow-x: auto; padding-bottom: 12px; min-height: 420px;
}
.crmKanbanCol {
  flex: 0 0 260px; background: rgba(15,23,42,.5); border-radius: 18px;
  border: 1px solid rgba(148,163,184,.1); padding: 12px;
}
.crmKanbanCol h3 {
  margin: 0 0 12px; font-size: 13px; color: #94a3b8; text-transform: uppercase;
  letter-spacing: .04em;
}
.crmKanbanCol .count {
  float: right; background: #1e293b; padding: 2px 8px; border-radius: 8px; font-size: 11px;
}
.crmKanbanCard {
  background: #111827; border-radius: 14px; padding: 12px; margin-bottom: 8px;
  border: 1px solid rgba(148,163,184,.08); cursor: grab;
  transition: box-shadow .15s;
}
.crmKanbanCard.dragging { opacity: .5; }
.crmKanbanCol.dragOver { border-color: rgba(6,182,212,.5); background: rgba(6,182,212,.05); }
.crmDrawerBackdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 300;
  backdrop-filter: blur(4px);
}
.crmDrawer {
  position: fixed; top: 0; right: 0; width: min(520px, 100vw); height: 100vh;
  background: #0a0f1a; border-left: 1px solid rgba(148,163,184,.15);
  z-index: 310; overflow-y: auto; padding: 24px;
  box-shadow: -20px 0 60px rgba(0,0,0,.5);
  animation: crmSlideIn .25s ease;
}
@keyframes crmSlideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.crmDrawerClose {
  position: absolute; top: 16px; right: 16px; border: none;
  background: #1e293b; color: #fff; width: 36px; height: 36px;
  border-radius: 10px; cursor: pointer; font-size: 18px;
}
.crmSection { margin: 22px 0; }
.crmSection h3 { margin: 0 0 12px; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
.crmMetrics {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
}
.crmMetric {
  background: #111827; border-radius: 14px; padding: 12px; border: 1px solid rgba(148,163,184,.08);
}
.crmMetric span { color: #64748b; font-size: 11px; }
.crmMetric b { display: block; font-size: 20px; margin-top: 4px; }
.crmTimeline { border-left: 2px solid rgba(6,182,212,.3); margin-left: 8px; padding-left: 16px; }
.crmTimelineItem { margin-bottom: 16px; position: relative; }
.crmTimelineItem::before {
  content: ""; position: absolute; left: -23px; top: 4px; width: 10px; height: 10px;
  border-radius: 50%; background: #06b6d4; box-shadow: 0 0 10px #06b6d4;
}
.crmTimelineItem time { font-size: 11px; color: #64748b; }
.crmQuickActions { display: flex; flex-wrap: wrap; gap: 8px; }
.crmAlert {
  background: rgba(234,179,8,.12); border: 1px solid rgba(234,179,8,.35);
  color: #fde68a; border-radius: 12px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px;
}
.crmToast {
  position: fixed; top: 18px; right: 24px; z-index: 500; padding: 12px 18px;
  border-radius: 14px; font-weight: 800; box-shadow: 0 12px 40px rgba(0,0,0,.35);
}
.crmToast.ok { background: linear-gradient(135deg,#22c55e,#06b6d4); color: #052e16; }
.crmToast.err { background: #7f1d1d; color: #fecaca; }
.crmModalBackdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 400;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.crmModal {
  width: 100%; max-width: 440px; background: #0f172a; border-radius: 20px;
  border: 1px solid rgba(148,163,184,.15); padding: 22px;
}
.crmModal h2 { margin: 0 0 16px; }
.crmModal input, .crmModal select, .crmModal textarea {
  width: 100%; border: 1px solid rgba(148,163,184,.15); border-radius: 12px;
  background: #111827; color: #fff; padding: 12px; margin-bottom: 10px;
}
.crmModal textarea { min-height: 90px; resize: vertical; }
.crmPagination { display: flex; gap: 8px; justify-content: center; margin-top: 18px; align-items: center; }
.crmBadgeUnread {
  width: 8px; height: 8px; border-radius: 50%; background: #f43f5e;
  box-shadow: 0 0 8px #f43f5e; display: inline-block; margin-left: 6px;
}
.crmEmpty { text-align: center; padding: 48px 20px; color: #64748b; }
.crmSkel {
  background: linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%);
  background-size: 200% 100%; animation: crmSk .9s infinite; border-radius: 12px; height: 56px;
}
@keyframes crmSk { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@media (max-width: 768px) {
  .crmDrawer { width: 100vw; }
  .crmDash { grid-template-columns: repeat(2, 1fr); }
}
`;
