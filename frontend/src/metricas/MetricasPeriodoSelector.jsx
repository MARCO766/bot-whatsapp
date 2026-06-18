import React, { useEffect, useRef, useState } from "react";
import {
  METRICAS_PERIODOS,
  defaultCustomRangeDraft,
  validateCustomRange,
} from "./format";

export default function MetricasPeriodoSelector({
  value = "7d",
  onChange,
  customRange = null,
  onCustomApply,
  onValidationError,
  disabled = false,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draft, setDraft] = useState(() => defaultCustomRangeDraft(customRange));
  const wrapRef = useRef(null);

  useEffect(() => {
    if (popoverOpen) {
      setDraft(defaultCustomRangeDraft(customRange));
    }
  }, [popoverOpen, customRange]);

  useEffect(() => {
    if (!popoverOpen) return undefined;

    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };

    const onKey = (e) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popoverOpen]);

  const openPopover = () => {
    if (disabled) return;
    setPopoverOpen(true);
  };

  const handleApply = () => {
    const result = validateCustomRange(draft.desde, draft.hasta);
    if (!result.ok) {
      onValidationError?.(result.error);
      return;
    }
    onCustomApply?.({ desde: draft.desde, hasta: draft.hasta });
    setPopoverOpen(false);
  };

  const handleCancel = () => {
    setPopoverOpen(false);
  };

  return (
    <div className="metricasPeriodoWrap" ref={wrapRef}>
      <style>{selectorStyles}</style>
      <div className="metricasPeriodoSelector" role="group" aria-label="Periodo">
        {METRICAS_PERIODOS.map((p) => {
          const isCustom = p.id === "custom";
          const active = isCustom ? value === "custom" : value === p.id;

          return (
            <button
              key={p.id}
              type="button"
              className={`metricasPeriodoBtn${active ? " active" : ""}${isCustom ? " custom" : ""}`}
              aria-pressed={active}
              aria-expanded={isCustom ? popoverOpen : undefined}
              aria-label={isCustom ? "Rango personalizado" : p.label}
              disabled={disabled}
              onClick={() => {
                if (isCustom) {
                  openPopover();
                  return;
                }
                setPopoverOpen(false);
                onChange?.(p.id);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {popoverOpen ? (
        <div className="metricasPeriodoPopover" role="dialog" aria-label="Rango personalizado">
          <div className="metricasPeriodoPopoverHead">Rango personalizado</div>
          <label className="metricasPeriodoField">
            <span>Desde</span>
            <input
              type="date"
              value={draft.desde}
              onChange={(e) => setDraft((d) => ({ ...d, desde: e.target.value }))}
              disabled={disabled}
            />
          </label>
          <label className="metricasPeriodoField">
            <span>Hasta</span>
            <input
              type="date"
              value={draft.hasta}
              onChange={(e) => setDraft((d) => ({ ...d, hasta: e.target.value }))}
              disabled={disabled}
            />
          </label>
          <div className="metricasPeriodoPopoverActions">
            <button type="button" className="metricasPeriodoBtnGhost" onClick={handleCancel}>
              Cancelar
            </button>
            <button type="button" className="metricasPeriodoBtnApply" onClick={handleApply}>
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const selectorStyles = `
.metricasPeriodoWrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.metricasPeriodoSelector {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
  border: 1px solid rgba(148,163,184,.22);
  border-radius: 10px;
  background: rgba(15,23,42,.55);
}
.metricasPeriodoBtn {
  height: 34px;
  min-width: 44px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid rgba(148,163,184,.18);
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.metricasPeriodoBtn:last-child {
  border-right: 0;
}
.metricasPeriodoBtn:hover:not(:disabled):not(.active) {
  background: rgba(255,255,255,.06);
  color: #f1f5f9;
}
.metricasPeriodoBtn.active {
  background: #06b6d4;
  color: #031827;
}
.metricasPeriodoBtn.custom {
  min-width: 40px;
  padding: 0 10px;
  font-size: 14px;
  line-height: 1;
  border-radius: 0 9px 9px 0;
}
.metricasPeriodoBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.metricasPeriodoPopover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 240px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.25);
  background: rgba(15,23,42,.98);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.metricasPeriodoPopoverHead {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.metricasPeriodoField {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.metricasPeriodoField span {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
}
.metricasPeriodoField input[type="date"] {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(148,163,184,.25);
  background: rgba(2,6,23,.6);
  color: #f1f5f9;
  font-size: 13px;
  font-family: inherit;
}
.metricasPeriodoField input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.85);
  cursor: pointer;
}
.metricasPeriodoPopoverActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.metricasPeriodoBtnGhost,
.metricasPeriodoBtnApply {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.metricasPeriodoBtnGhost {
  border: 1px solid rgba(148,163,184,.25);
  background: transparent;
  color: #cbd5e1;
}
.metricasPeriodoBtnGhost:hover {
  background: rgba(255,255,255,.06);
}
.metricasPeriodoBtnApply {
  border: 1px solid rgba(6,182,212,.45);
  background: #06b6d4;
  color: #031827;
}
.metricasPeriodoBtnApply:hover {
  background: #22d3ee;
}
@media (max-width: 760px) {
  .metricasPeriodoSelector {
    width: 100%;
  }
  .metricasPeriodoBtn {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 8px;
  }
  .metricasPeriodoPopover {
    left: 0;
    right: 0;
    min-width: 0;
  }
}
`;
