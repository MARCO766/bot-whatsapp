import React, { useCallback, useEffect, useId, useRef, useState } from "react";

const ALL_VALUE = "";

export default function FlujoCampanaSelect({ value, onChange, options = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  const selectedLabel =
    value === ALL_VALUE
      ? "Todos los flujos"
      : options.find((f) => f.id === value)?.nombre || "Todos los flujos";

  const close = useCallback(() => setOpen(false), []);

  const select = useCallback(
    (id) => {
      onChange(id);
      close();
    },
    [onChange, close]
  );

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const items = [{ id: ALL_VALUE, nombre: "Todos los flujos" }, ...options];

  return (
    <div className="flujoSelect" ref={rootRef}>
      <style>{styles}</style>
      <button
        id="flujo-campana-select"
        type="button"
        className={`flujoSelectTrigger ${open ? "open" : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="flujoSelectValue">{selectedLabel}</span>
        <span className={`flujoSelectChevron ${open ? "up" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <ul id={listId} className="flujoSelectMenu" role="listbox">
          {items.map((item) => {
            const active = value === item.id;
            return (
              <li key={item.id || "all"} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`flujoSelectOption ${active ? "active" : ""}`}
                  onClick={() => select(item.id)}
                >
                  {item.nombre}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const styles = `
.flujoSelect {
  position: relative;
  width: 100%;
  min-width: 200px;
}

.flujoSelectTrigger {
  position: relative;
  width: 100%;
  min-height: 48px;
  padding: 0 42px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 17px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0b1020;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
  text-align: left;
}

.flujoSelectTrigger:hover:not(:disabled) {
  border-color: rgba(34, 211, 238, 0.35);
  background: linear-gradient(135deg, rgba(11, 16, 32, 1), rgba(6, 182, 212, 0.08));
}

.flujoSelectTrigger:focus-visible {
  outline: none;
  border-color: rgba(34, 211, 238, 0.55);
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.18), 0 0 24px rgba(34, 197, 94, 0.12);
}

.flujoSelectTrigger.open {
  border-color: rgba(34, 197, 94, 0.45);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14), 0 8px 28px rgba(6, 182, 212, 0.12);
}

.flujoSelectTrigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.flujoSelectValue {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.flujoSelectChevron {
  position: absolute;
  right: 14px;
  color: #67e8f9;
  font-size: 14px;
  transition: transform 0.22s ease, color 0.22s ease;
}

.flujoSelectChevron.up {
  transform: rotate(180deg);
  color: #86efac;
}

.flujoSelectMenu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 40;
  margin: 0;
  padding: 6px;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #0b1020;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(34, 211, 238, 0.08);
  animation: flujoMenuIn 0.2s ease both;
  scrollbar-width: thin;
  scrollbar-color: rgba(34, 197, 94, 0.45) rgba(255, 255, 255, 0.06);
}

.flujoSelectMenu::-webkit-scrollbar {
  width: 8px;
}

.flujoSelectMenu::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
}

.flujoSelectMenu::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #22c55e, #06b6d4);
  border-radius: 999px;
}

.flujoSelectOption {
  width: 100%;
  border: 0;
  border-radius: 12px;
  padding: 11px 12px;
  background: transparent;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.flujoSelectOption:hover {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(6, 182, 212, 0.14));
  color: #fff;
}

.flujoSelectOption.active {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(6, 182, 212, 0.2));
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.25);
}

@keyframes flujoMenuIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`;
