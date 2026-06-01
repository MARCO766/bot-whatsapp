import React from "react";

export default function RevenueMonedaTabs({ monedas = [], value, onChange, disabled = false }) {
  if (!monedas.length) return null;

  return (
    <div className="revenueMonedaTabs periodos" role="tablist" aria-label="Moneda">
      {monedas.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          className={value === m ? "active" : ""}
          onClick={() => onChange(m)}
          disabled={disabled}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
