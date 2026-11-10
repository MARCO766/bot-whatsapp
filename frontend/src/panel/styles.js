export const panelStyles = `
.panelDash {
  min-height: 100%;
  color: #e2e8f0;
}

.panelDash .welcome {
  max-width: 720px;
}

.panelDash .eyebrow {
  margin: 0 0 12px;
  color: #67e8f9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.panelDash h1 {
  margin: 0;
  color: #f8fafc;
  font-size: 40px;
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.panelDash .nameSkel {
  width: min(280px, 70%);
  height: 42px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.12);
}

.panelDash .lead {
  margin: 14px 0 0;
  max-width: 42ch;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1.6;
}

.panelDash .waCard {
  margin-top: 36px;
  padding: 8px 22px 6px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 22px;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.22);
}

.panelDash .waHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
}

.panelDash .waHead h2 {
  margin: 0;
  color: #f1f5f9;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.panelDash .refresh {
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: transparent;
  color: #cbd5e1;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.panelDash .refresh:hover:not(:disabled) {
  border-color: rgba(103, 232, 249, 0.45);
  color: #ecfeff;
}

.panelDash .refresh:disabled {
  opacity: 0.55;
  cursor: default;
}

.panelDash .waList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.panelDash .waRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.panelDash .waRow strong {
  display: block;
  color: #f8fafc;
  font-size: 15px;
  font-weight: 650;
}

.panelDash .waRow p {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.4;
}

.panelDash .pill {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.panelDash .pill::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.panelDash .pill.configurada {
  color: #86efac;
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.28);
}

.panelDash .pill.sin-numero {
  color: #cbd5e1;
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.24);
}

.panelDash .pill.sin-configurar {
  color: #fdba74;
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.3);
}

.panelDash .waError {
  margin: 0 0 16px;
  color: #fecaca;
  font-size: 14px;
  line-height: 1.45;
}

.panelDash .waSkeleton span {
  display: block;
  height: 52px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.08),
    rgba(148, 163, 184, 0.16),
    rgba(148, 163, 184, 0.08)
  );
  background-size: 200% 100%;
}

@media (max-width: 720px) {
  .panelDash h1 {
    font-size: 32px;
  }

  .panelDash .waCard {
    padding-right: 16px;
    padding-left: 16px;
  }

  .panelDash .waRow {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
`;
