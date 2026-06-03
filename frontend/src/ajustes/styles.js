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

/* —— WhatsApp API (lista compacta + modal) —— */
.waAccordion {
  margin-bottom: 12px;
  border: 1px solid rgba(148,163,184,.12);
  border-radius: 16px;
  background: #0f172a;
  overflow: hidden;
}
.waAccordionBtn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.waAccordionBtn:hover { background: rgba(30,41,59,.45); }
.waAccordionChevron {
  color: #64748b;
  font-size: 12px;
  transition: transform .2s;
}
.waAccordion.open .waAccordionChevron { transform: rotate(180deg); }
.waAccordionBody {
  padding: 0 18px 16px;
  border-top: 1px solid rgba(148,163,184,.08);
}
.waAccordionBody .ajCode { margin-top: 8px; }

.waConnectionsWrap { padding: 18px 20px; }
.waSectionHead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.waSectionHeadText { min-width: 0; }
.waSectionTitle { margin: 0 0 4px; font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
.waSectionSub { margin: 0; color: #64748b; font-size: 12px; line-height: 1.4; }

.waBtnAddLine {
  flex-shrink: 0;
  border: 1px solid rgba(34,197,94,.35);
  background: rgba(34,197,94,.1);
  color: #86efac;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background .2s, border-color .2s;
}
.waBtnAddLine:hover {
  background: rgba(34,197,94,.18);
  border-color: rgba(34,197,94,.5);
}

.waConnList { display: flex; flex-direction: column; gap: 8px; }
.waConnRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148,163,184,.1);
  background: rgba(2, 6, 23, 0.35);
  transition: border-color .2s, background .2s, box-shadow .2s;
}
.waConnRow:hover { border-color: rgba(148,163,184,.2); background: rgba(15,23,42,.65); }
.waConnRowPrincipal {
  border-color: rgba(251,191,36,.28);
  background: linear-gradient(90deg, rgba(234,179,8,.08), rgba(15,23,42,.5));
}
.waConnRowEditing {
  border-color: rgba(34,197,94,.45);
  box-shadow: 0 0 0 1px rgba(34,197,94,.2);
  background: rgba(34,197,94,.06);
}

.waConnRowMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.waConnRowTop {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.waConnName {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.waConnNumero { font-size: 12px; color: #94a3b8; font-weight: 600; }
.waConnRowMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.waBadge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid transparent;
  line-height: 1.4;
}
.waBadgeOk { background: rgba(34,197,94,.12); color: #86efac; border-color: rgba(34,197,94,.2); }
.waBadgeErr { background: rgba(239,68,68,.12); color: #fca5a5; border-color: rgba(239,68,68,.2); }
.waBadgeWarn { background: rgba(234,179,8,.12); color: #fde047; border-color: rgba(234,179,8,.2); }
.waBadgeMuted { background: rgba(148,163,184,.08); color: #94a3b8; border-color: rgba(148,163,184,.15); }
.waBadgePrincipal {
  background: rgba(251,191,36,.15);
  color: #fde68a;
  border-color: rgba(251,191,36,.3);
}
.waBadgeEditing {
  background: rgba(34,197,94,.15);
  color: #86efac;
  border-color: rgba(34,197,94,.3);
}
.waChipMeta {
  font-size: 10px;
  font-weight: 700;
  color: #67e8f9;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(6,182,212,.1);
  border: 1px solid rgba(6,182,212,.2);
}

.waConnRowActions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.waActBtn {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .2s, background .2s;
}
.waActBtn:disabled { opacity: .45; cursor: not-allowed; }
.waActBtnPrimary {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #052e16;
}
.waActBtnGhost {
  background: rgba(30,41,59,.9);
  color: #cbd5e1;
  border: 1px solid rgba(148,163,184,.12);
}
.waActBtnGhost:hover:not(:disabled) { background: rgba(51,65,85,.95); }
.waActBtnDanger {
  background: transparent;
  color: #f87171;
  border: 1px solid rgba(248,113,113,.2);
}
.waActBtnDanger:hover:not(:disabled) { background: rgba(127,29,29,.35); }

.waTestField {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(148,163,184,.08);
}
.waTestField label { font-size: 12px; }
.waTestField input { padding: 10px 12px; font-size: 13px; }

.waEmptyHint {
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  border: 1px dashed rgba(148,163,184,.15);
  border-radius: 14px;
}

/* Modal / panel configuración */
.waModalBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.65);
  z-index: 500;
  backdrop-filter: blur(4px);
}
.waModalPanel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  z-index: 510;
  background: #0f172a;
  border-left: 1px solid rgba(148,163,184,.15);
  box-shadow: -12px 0 40px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.waModalHead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(148,163,184,.1);
  flex-shrink: 0;
}
.waModalHead h2 { margin: 0; font-size: 16px; font-weight: 800; }
.waModalClose {
  border: none;
  background: #1e293b;
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}
.waModalClose:hover { color: #e2e8f0; background: #334155; }
.waModalBody {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 24px;
}
.waModalBody .ajField { margin-bottom: 12px; }
.waModalBody .ajField label { font-size: 12px; margin-bottom: 4px; }
.waModalBody .ajField input { padding: 10px 12px; font-size: 13px; }
.waModalFoot {
  padding: 14px 20px;
  border-top: 1px solid rgba(148,163,184,.1);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}
.waModalDivider {
  margin: 14px 0 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(148,163,184,.08);
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.waModalGroup {
  margin-bottom: 4px;
}
.waModalGroup + .waModalGroup {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(148,163,184,.1);
}
.waModalGroupTitle {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 800;
  color: #cbd5e1;
  letter-spacing: .02em;
}
.waModalGroupHint {
  margin: -6px 0 12px;
  font-size: 11px;
  line-height: 1.4;
  color: #64748b;
}
.waModalTestBtn {
  margin-top: 4px;
  width: 100%;
}

.metaAjustesIntro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: #94a3b8;
}
.metaAjustesIntro strong { color: #e2e8f0; font-weight: 700; }
.metaAjustesStatusList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.metaAjustesStatusRow {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(148,163,184,.12);
}
.metaAjustesStatusRow.ok {
  border-color: rgba(34,197,94,.22);
  background: rgba(34,197,94,.06);
}
.metaAjustesStatusRow.pending { border-color: rgba(148,163,184,.12); }
.metaAjustesStatusDot {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  background: rgba(148,163,184,.15);
  color: #94a3b8;
}
.metaAjustesStatusRow.ok .metaAjustesStatusDot {
  background: rgba(34,197,94,.25);
  color: #4ade80;
}
.metaAjustesStatusText strong {
  display: block;
  font-size: 12px;
  color: #e2e8f0;
}
.metaAjustesStatusText small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #64748b;
}
.metaAjustesLoading {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 12px;
}
.metaAjustesNote {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.45;
  color: #94a3b8;
  background: rgba(6,182,212,.08);
  border: 1px solid rgba(6,182,212,.18);
}

@media (max-width: 640px) {
  .waConnRow {
    flex-direction: column;
    align-items: stretch;
  }
  .waConnRowActions { justify-content: flex-start; }
  .waConnName { max-width: none; }
  .waModalPanel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: 92vh;
    border-left: none;
    border-top: 1px solid rgba(148,163,184,.15);
    border-radius: 20px 20px 0 0;
  }
}
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
