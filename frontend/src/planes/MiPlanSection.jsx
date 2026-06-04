import React, { useEffect, useState } from "react";
import { useMiPlan } from "./useMiPlan";
import { miPlanStyles } from "./styles";
import { goToPricing } from "./goToPricing";

const PLAN_LABELS = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};

const ESTADO_LABELS = {
  activo: "Activo",
  trial: "Trial",
  vencido: "Vencido",
  suspendido: "Suspendido",
};

const BENEFICIOS = [
  "IA",
  "CRM",
  "Flujos",
  "Seguimientos",
  "Remarketing",
  "Bandeja WhatsApp",
];

function formatFecha(iso) {
  if (!iso) return "Sin fecha de vencimiento";
  try {
    return new Date(iso).toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function esLimiteIlimitado(limite) {
  return limite === null || limite === undefined || limite === -1;
}

function calcPorcentaje(usados, limite) {
  if (esLimiteIlimitado(limite)) return null;
  const max = Number(limite);
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.round((Number(usados || 0) / max) * 100);
}

function colorPorcentaje(pct) {
  if (pct == null) return "ok";
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warn";
  return "ok";
}

function AnimatedCounter({ value, duration = 700 }) {
  const target = Math.max(0, Number(value) || 0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = display;
    const delta = target - from;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <>{display.toLocaleString("es-BO")}</>;
}

function PlanBadge({ nombre }) {
  const key = (nombre || "free").toLowerCase();
  const label = PLAN_LABELS[key] || nombre || "Free";
  return <span className={`miPlanBadge miPlanBadge--${key}`}>{label}</span>;
}

function EstadoBadge({ estado }) {
  const key = (estado || "activo").toLowerCase();
  const label = ESTADO_LABELS[key] || estado;
  return <span className={`miPlanEstadoBadge miPlanEstadoBadge--${key}`}>{label}</span>;
}

function UsageResourceRow({ label, icon, usados, limite }) {
  const ilimitado = esLimiteIlimitado(limite);
  const pct = calcPorcentaje(usados, limite);
  const tone = colorPorcentaje(pct);
  const barWidth = ilimitado ? 0 : Math.min(100, pct ?? 0);

  return (
    <div className="miPlanUsageRow">
      <div className="miPlanLimitHead">
        <strong>
          {icon} {label}
        </strong>
        {ilimitado ? (
          <span className="miPlanUnlimited">∞ Ilimitado</span>
        ) : (
          <span className={`miPlanPct miPlanPct--${tone}`}>{pct}%</span>
        )}
      </div>
      {ilimitado ? (
        <p className="miPlanUsageText">
          {Number(usados || 0).toLocaleString("es-BO")} usados · sin tope en tu plan
        </p>
      ) : (
        <>
          <p className="miPlanUsageText">
            {Number(usados || 0).toLocaleString("es-BO")} / {Number(limite).toLocaleString("es-BO")}{" "}
            usados
          </p>
          <div className="miPlanBarTrack" role="progressbar" aria-valuenow={barWidth} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`miPlanBarFill miPlanBarFill--${tone}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function maxUsoPorcentaje(uso, limites) {
  const pairs = [
    [uso?.whatsapp_usados, limites?.whatsapp],
    [uso?.contactos_usados, limites?.contactos],
    [uso?.flujos_usados, limites?.flujos],
  ];
  let max = 0;
  for (const [u, l] of pairs) {
    const p = calcPorcentaje(u, l);
    if (p != null && p > max) max = p;
  }
  return max;
}

export default function MiPlanSection() {
  const { plan, loading, error, reload } = useMiPlan(true);

  function handleUpgrade() {
    goToPricing();
  }

  if (loading) {
    return (
      <div className="miPlanWrap">
        <style>{miPlanStyles}</style>
        <div className="ajCard">
          <div className="skel h40" />
          <div className="skel h120" />
          <div className="skel h40" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="miPlanWrap">
        <style>{miPlanStyles}</style>
        <div className="ajErrorBox">
          <strong>No se pudo cargar tu plan</strong>
          <p>{error}</p>
          <div className="ajBtnRow">
            <button type="button" className="ajBtn ghost" onClick={() => reload()}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nombre = plan?.nombre || "free";
  const estado = plan?.estado || "activo";
  const limites = plan?.limites || {};
  const uso = plan?.uso || {};
  const pctMax = maxUsoPorcentaje(uso, limites);
  const cercaLimite = pctMax >= 80 && pctMax < 100;
  const enLimite = pctMax >= 100;

  return (
    <div className="miPlanWrap">
      <style>{miPlanStyles}</style>

      <section className="miPlanHero">
        <div className="miPlanHeroGlow" aria-hidden="true" />
        <div className="miPlanHeroText">
          <p className="miPlanEyebrow">Suscripción MacBot</p>
          <h2>Plan actual</h2>
          <p>
            Uso real de WhatsApp, contactos y flujos. Los porcentajes se actualizan con tus datos en
            la plataforma.
          </p>
          <div className="miPlanHeroMeta">
            <span>
              Estado: <EstadoBadge estado={estado} />
            </span>
            {plan?.fecha_vencimiento && (
              <span className="miPlanHeroVence">Vence: {formatFecha(plan.fecha_vencimiento)}</span>
            )}
          </div>
        </div>
        <div className="miPlanHeroActions">
          <PlanBadge nombre={nombre} />
          <button type="button" className="miPlanUpgradeBtn" onClick={handleUpgrade}>
            Mejorar plan
          </button>
        </div>
      </section>

      {(cercaLimite || enLimite) && (
        <div className={`miPlanAlert ${enLimite ? "miPlanAlert--limit" : "miPlanAlert--warn"}`}>
          <p>
            {enLimite
              ? "🚀 Actualiza tu plan para seguir creciendo."
              : "⚠️ Estás cerca del límite de tu plan."}
          </p>
          <button type="button" className="miPlanUpgradeBtn miPlanUpgradeBtn--sm" onClick={handleUpgrade}>
            Mejorar Plan
          </button>
        </div>
      )}

      <div className="miPlanQuickGrid">
        <article className="miPlanQuickCard">
          <span className="miPlanQuickIcon">📱</span>
          <strong>
            <AnimatedCounter value={uso.whatsapp_usados} />
          </strong>
          <span className="label">WhatsApps conectados</span>
        </article>
        <article className="miPlanQuickCard">
          <span className="miPlanQuickIcon">👤</span>
          <strong>
            <AnimatedCounter value={uso.contactos_usados} />
          </strong>
          <span className="label">Contactos CRM</span>
        </article>
        <article className="miPlanQuickCard">
          <span className="miPlanQuickIcon">🔄</span>
          <strong>
            <AnimatedCounter value={uso.flujos_usados} />
          </strong>
          <span className="label">Flujos creados</span>
        </article>
      </div>

      <div className="miPlanLimitsCard miPlanGlass">
        <h3>Uso de recursos</h3>
        <p>Consumo actual frente a la capacidad de tu plan.</p>

        <UsageResourceRow
          label="WhatsApp"
          icon="📱"
          usados={uso.whatsapp_usados}
          limite={limites.whatsapp}
        />
        <UsageResourceRow
          label="Contactos"
          icon="👤"
          usados={uso.contactos_usados}
          limite={limites.contactos}
        />
        <UsageResourceRow
          label="Flujos"
          icon="🔄"
          usados={uso.flujos_usados}
          limite={limites.flujos}
        />
      </div>

      <div className="miPlanBenefitsCard miPlanGlass">
        <h3>Tu plan incluye</h3>
        <ul className="miPlanBenefitsList">
          {BENEFICIOS.map((b) => (
            <li key={b}>
              <span className="miPlanCheck">✓</span> {b}
            </li>
          ))}
        </ul>
      </div>

      <p className="miPlanFootNote">
        Plan {PLAN_LABELS[nombre] || nombre} · estado {ESTADO_LABELS[estado] || estado}. Los conteos
        reflejan tus conexiones, clientes CRM y flujos en MacBot.
      </p>
    </div>
  );
}
