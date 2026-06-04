import React from "react";
import { useMiPlan } from "./useMiPlan";
import { miPlanStyles } from "./styles";

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

function LimitRow({ label, icon, max, hint }) {
  const limite = Number(max) >= 0 ? Number(max) : 0;
  return (
    <div className="miPlanLimitRow">
      <div className="miPlanLimitHead">
        <strong>
          {icon} {label}
        </strong>
        <span>Límite: {limite.toLocaleString("es-BO")}</span>
      </div>
      <div className="miPlanBarTrack" aria-hidden="true">
        <div className="miPlanBarFill miPlanBarFill--placeholder" style={{ width: "0%" }} />
      </div>
      <p className="miPlanBarCap">
        Uso en tiempo real próximamente · capacidad hasta {limite.toLocaleString("es-BO")}
      </p>
      {hint && <p className="ajHint" style={{ marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

export default function MiPlanSection({ showToast }) {
  const { plan, loading, error, reload } = useMiPlan(true);

  function handleUpgrade() {
    if (showToast) {
      showToast("Mejorar plan — disponible próximamente", "ok");
    }
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

  return (
    <div className="miPlanWrap">
      <style>{miPlanStyles}</style>

      <section className="miPlanHero">
        <div className="miPlanHeroGlow" aria-hidden="true" />
        <div className="miPlanHeroText">
          <p className="miPlanEyebrow">Suscripción MacBot</p>
          <h2>Tu plan actual</h2>
          <p>
            Consulta el estado de tu suscripción y los límites incluidos. El control de uso se
            activará en una próxima fase.
          </p>
        </div>
        <div className="miPlanHeroActions">
          <PlanBadge nombre={nombre} />
          <EstadoBadge estado={estado} />
          <button type="button" className="miPlanUpgradeBtn" onClick={handleUpgrade}>
            Mejorar plan
          </button>
        </div>
      </section>

      <div className="miPlanGrid">
        <article className="miPlanStatCard">
          <span className="label">Plan</span>
          <strong>{PLAN_LABELS[nombre] || nombre}</strong>
          <span className="hint">Nivel de tu cuenta</span>
        </article>
        <article className="miPlanStatCard">
          <span className="label">Estado</span>
          <strong style={{ textTransform: "capitalize" }}>{ESTADO_LABELS[estado] || estado}</strong>
          <span className="hint">Facturación y acceso</span>
        </article>
        <article className="miPlanStatCard">
          <span className="label">Vencimiento</span>
          <strong style={{ fontSize: plan?.fecha_vencimiento ? 16 : 22 }}>
            {plan?.fecha_vencimiento ? formatFecha(plan.fecha_vencimiento) : "—"}
          </strong>
          <span className="hint">
            {plan?.fecha_vencimiento ? "Renovación programada" : "Sin fecha de vencimiento"}
          </span>
        </article>
      </div>

      <div className="miPlanLimitsCard">
        <h3>Límites del plan</h3>
        <p>Visualización de capacidad máxima. El conteo de uso se mostrará aquí más adelante.</p>

        <LimitRow
          label="Líneas WhatsApp"
          icon="💬"
          max={limites.whatsapp}
          hint="Números conectados permitidos en tu cuenta."
        />
        <LimitRow
          label="Contactos"
          icon="👥"
          max={limites.contactos}
          hint="Contactos totales en el CRM."
        />
        <LimitRow
          label="Flujos"
          icon="🧩"
          max={limites.flujos}
          hint="Flujos de automatización que puedes crear."
        />
      </div>

      <p className="miPlanFootNote">
        Los límites son informativos por ahora: puedes seguir creando recursos con normalidad hasta
        que se active la validación en el servidor.
      </p>
    </div>
  );
}
