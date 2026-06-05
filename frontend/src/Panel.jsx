import React from "react";
import { usePanel } from "./panel/usePanel";
import { panelStyles } from "./panel/styles";
import { formatNum, formatTendencia } from "./metricas/format";
import ConexionLineaTabs from "./components/conexion/ConexionLineaTabs";
import { useMetricasConexion } from "./hooks/useMetricasConexion";
import { CONEXION_TODAS } from "./utils/conexionesInbox";
import { useOnboardingEstado } from "./onboarding/useOnboardingEstado";
import OnboardingChecklist from "./onboarding/OnboardingChecklist";

function Skel({ className = "" }) {
  return <div className={`skel ${className}`} />;
}

function Trend({ value }) {
  const t = formatTendencia(value);
  if (!t) return <span className="trend muted">—</span>;
  const pos = Number(value) >= 0;
  return <span className={`trend ${pos ? "up" : "down"}`}>{t} vs ayer</span>;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
}

function EmptyBlock({ icon, title, hint }) {
  return (
    <div className="emptyBlock">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{hint}</p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <>
      <div className="statusRow">
        {[1, 2, 3, 4].map((i) => (
          <Skel key={i} className="h40" />
        ))}
      </div>
      <div className="kpiGrid">
        {[1, 2, 3, 4].map((i) => (
          <Skel key={i} className="h80" />
        ))}
      </div>
      <div className="mainGrid">
        <Skel className="h200" />
        <Skel className="h200" />
      </div>
    </>
  );
}

export default function Panel({ cambiarVista }) {
  const {
    conexionesInbox,
    conexionSeleccionadaId,
    conexionesLoading,
    seleccionarConexion,
    etiquetaTabConexion,
  } = useMetricasConexion();
  const { data, loading, error, reload } = usePanel(
    conexionSeleccionadaId,
    conexionesLoading
  );
  const { onboarding } = useOnboardingEstado({ manageWelcomeModal: false });
  const showChecklist =
    onboarding?.progreso?.porcentaje != null && onboarding.progreso.porcentaje < 100;

  const conexionActiva = conexionesInbox.find(
    (c) => String(c.id) === String(conexionSeleccionadaId)
  );
  const lineaLabel =
    conexionSeleccionadaId === CONEXION_TODAS
      ? "Todas las líneas"
      : conexionActiva
        ? etiquetaTabConexion(conexionActiva)
        : null;

  const sistema = data?.sistema || {};
  const kpis = data?.kpis || {};
  const actividad = data?.actividad || [];
  const leads = data?.leadsSinRespuesta || { total: 0, items: [] };
  const embudo = data?.embudo || { vacio: true, pasos: [] };

  const statusItems = [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "api", label: "API" },
    { key: "supabase", label: "Supabase" },
    { key: "webhook", label: "Webhook" },
  ];

  const kpiCards = [
    { label: "Leads hoy", value: kpis.leadsHoy, trend: kpis.tendenciaLeads },
    {
      label: "Conversaciones activas",
      value: kpis.conversacionesActivas,
      trend: kpis.tendenciaConversaciones,
    },
    { label: "Ventas hoy", value: kpis.ventasHoy, trend: kpis.tendenciaVentas },
    { label: "Flujos activos", value: kpis.flujosActivos, trend: null },
  ];

  const acciones = [
    { icon: "🧩", label: "Nuevo flujo", vista: "flujos", accent: true },
    { icon: "⚡", label: "Nuevo activador", vista: "activadores", accent: false },
    { icon: "💬", label: "Abrir bandeja", vista: "inbox", accent: false },
    { icon: "📊", label: "Ver métricas", vista: "metricas", accent: false },
  ];

  const warnings = statusItems
    .map((s) => sistema[s.key]?.warning)
    .filter(Boolean);

  return (
    <div className="panelDash">
      <style>{panelStyles}</style>

      <section className="hero">
        <div className="heroGlow" />
        <div>
          <span className="eyebrow">Resumen operativo</span>
          <h1>Tu CRM en un vistazo</h1>
          <p>
            KPIs reales de hoy, estado del sistema y actividad reciente. Sin métricas inventadas.
            {lineaLabel ? ` Vista: ${lineaLabel}.` : ""}
          </p>
        </div>
        <div className="heroMeta">
          <strong>{data?.source === "supabase" ? "Datos en vivo" : "—"}</strong>
          <span>
            {data?.timestamp
              ? `Actualizado ${new Date(data.timestamp).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`
              : "Cargando…"}
          </span>
          <button type="button" className="refreshBtn" onClick={reload} disabled={loading}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </section>

      <ConexionLineaTabs
        conexionesInbox={conexionesInbox}
        conexionSeleccionadaId={conexionSeleccionadaId}
        onSeleccionar={seleccionarConexion}
        etiquetaTabConexion={etiquetaTabConexion}
      />

      {showChecklist && (
        <div className="panelOnboardingCheck">
          <OnboardingChecklist
            checklist={onboarding.checklist}
            progreso={onboarding.progreso}
            compact
          />
        </div>
      )}

      {error && (
        <div className="errorBanner">
          <span>{error}</span>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      {loading && !data ? (
        <PanelSkeleton />
      ) : (
        <>
          <div className="statusRow">
            {statusItems.map((item, i) => {
              const st = sistema[item.key] || {};
              const ok = Boolean(st.ok);
              return (
                <div
                  key={item.key}
                  className={`statusChip ${!ok || st.warning ? "warn" : ""}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                  title={st.warning || ""}
                >
                  <span className={`statusDot ${ok ? "ok" : "bad"}`} />
                  <div>
                    <span>{item.label}</span>
                    <strong>{st.label || "—"}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {warnings.length > 0 && (
            <div
              className="errorBanner"
              style={{
                background: "rgba(249,115,22,.1)",
                borderColor: "rgba(249,115,22,.35)",
                color: "#fed7aa",
              }}
            >
              <span>{warnings[0]}</span>
            </div>
          )}

          <div className="kpiGrid">
            {kpiCards.map((k, i) => (
              <div key={k.label} className="kpiCard" style={{ animationDelay: `${i * 0.05}s` }}>
                <span>{k.label}</span>
                <h3>{formatNum(k.value)}</h3>
                {k.trend !== null && k.trend !== undefined ? (
                  <Trend value={k.trend} />
                ) : (
                  <span className="trend muted">Tiempo real</span>
                )}
              </div>
            ))}
          </div>

          <div className="mainGrid">
            <div className="card">
              <h2>Actividad en tiempo real</h2>
              <p>Últimos eventos desde mensajes, flujos y conversiones.</p>
              {actividad.length === 0 ? (
                <EmptyBlock
                  icon="📡"
                  title="Sin actividad reciente"
                  hint="Cuando lleguen mensajes o se ejecuten flujos, verás el feed aquí."
                />
              ) : (
                <div className="feedList">
                  {actividad.map((ev, idx) => (
                    <div className="feedItem" key={`${ev.fecha}-${idx}`}>
                      <span className={`feedDot ${ev.dot || "cyan"}`} />
                      <div>
                        <strong>{ev.titulo}</strong>
                        {ev.detalle ? (
                          <>
                            <br />
                            <small>{ev.detalle}</small>
                          </>
                        ) : null}
                        <br />
                        <small>{timeAgo(ev.fecha)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Leads sin respuesta</h2>
              <p>
                {leads.total > 0
                  ? `${leads.total} lead${leads.total === 1 ? "" : "s"} esperando respuesta`
                  : "Bandeja al día — sin pendientes con mensajes no leídos."}
              </p>
              {leads.total === 0 ? (
                <EmptyBlock
                  icon="✓"
                  title="Todo respondido"
                  hint="No hay chats con mensajes sin leer en este momento."
                />
              ) : (
                <>
                  {leads.items.map((lead) => (
                    <div className="leadRow" key={lead.numero}>
                      <div className="leadBadge">{lead.noLeidos || 1}</div>
                      <div className="leadInfo">
                        <strong>{lead.nombre || lead.numero}</strong>
                        <p>{lead.ultimoMensaje || "Mensaje pendiente"}</p>
                      </div>
                      <small>{timeAgo(lead.ultimoMensajeEn)}</small>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="refreshBtn"
                    style={{ marginTop: 12, width: "100%" }}
                    onClick={() => cambiarVista("inbox")}
                  >
                    Abrir bandeja →
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mainGrid">
            <div className="card">
              <h2>Mini embudo · Hoy</h2>
              <p>Leads → Conversaciones → Ventas (datos reales del día).</p>
              {embudo.vacio ? (
                <EmptyBlock
                  icon="📈"
                  title="Sin movimiento hoy"
                  hint="Cuando registres leads, conversaciones o ventas aparecerán aquí."
                />
              ) : (
                <div className="funnelSteps">
                  {(embudo.pasos || []).map((paso) => (
                    <div className="funnelStep" key={paso.nombre}>
                      <span>{paso.nombre}</span>
                      <div className="funnelBar">
                        <div style={{ width: `${paso.pct || 0}%` }} />
                      </div>
                      <strong>{formatNum(paso.cantidad)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Acciones rápidas</h2>
              <p>Atajos a las tareas más frecuentes del CRM.</p>
              <div className="actionsGrid">
                {acciones.map((a) => (
                  <button
                    key={a.vista}
                    type="button"
                    className={`actionBtn ${a.accent ? "accent" : ""}`}
                    onClick={() => cambiarVista(a.vista)}
                  >
                    <span>{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
