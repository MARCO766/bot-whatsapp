import React, { useEffect } from "react";
import { upgradeLimitModalStyles } from "./styles";
import { useMiPlan } from "./useMiPlan";
import {
  getUpgradeAction,
  getUpgradeRecommendation,
  shouldShowPlanUpgrade,
} from "./planCatalog";

const PLAN_LABELS = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};

export default function UpgradeLimitModal({ data, onClose, onUpgrade }) {
  const { plan } = useMiPlan(Boolean(data));

  useEffect(() => {
    if (!data) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  if (!data) return null;

  const planKey = (plan?.nombre || data.planKey || "free").toLowerCase();
  const planNombre = PLAN_LABELS[planKey] || planKey;
  const recommendation = getUpgradeRecommendation(planKey) || data.recommendation;
  const showUpgrade = shouldShowPlanUpgrade(planKey);
  const action = getUpgradeAction(planKey);

  function handleUpgrade() {
    if (action.type === "contact" && action.href) {
      window.location.href = action.href;
      return;
    }
    onUpgrade?.();
  }

  return (
    <>
      <style>{upgradeLimitModalStyles}</style>
      <div
        className="upgradeLimitBackdrop"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        className="upgradeLimitModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgradeLimitTitle"
      >
        <div className="upgradeLimitGlow" aria-hidden="true" />
        <p className="upgradeLimitEyebrow">MacBot SaaS</p>
        <h2 id="upgradeLimitTitle">{data.title}</h2>
        <p className="upgradeLimitSub">{data.subtitle}</p>

        <div className="upgradeLimitStats">
          <div className="upgradeLimitStat">
            <span>Plan actual</span>
            <strong>{planNombre}</strong>
          </div>
          <div className="upgradeLimitStat">
            <span>Límite</span>
            <strong>{data.limiteLabel}</strong>
          </div>
          <div className="upgradeLimitStat">
            <span>Usados</span>
            <strong>{data.usadosLabel}</strong>
          </div>
        </div>

        {recommendation && <p className="upgradeLimitReco">{recommendation}</p>}

        <div className="upgradeLimitActions">
          <button type="button" className="upgradeLimitBtnGhost" onClick={onClose}>
            Cerrar
          </button>
          {showUpgrade && action.type !== "none" && (
            <button type="button" className="upgradeLimitBtnPrimary" onClick={handleUpgrade}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
