import React, { useMemo, useState } from "react";
import { useMetricas } from "./metricas/useMetricas";
import { useMetaAdsStatus } from "./metricas/useMetaAdsStatus";
import { formatMoney, formatNum, formatPct, formatTendencia } from "./metricas/format";
import FlujoCampanaSelect from "./metricas/FlujoCampanaSelect";
import RevenuePremiumSection from "./metricas/revenue/RevenuePremiumSection";
import MetaAdsConnectModal, { MetaAdsCompactCard } from "./metricas/MetaAdsSection";
import ConexionLineaTabs from "./components/conexion/ConexionLineaTabs";
import { useMetricasConexion } from "./hooks/useMetricasConexion";
import { CONEXION_TODAS } from "./utils/conexionesInbox";

const PERIODOS = ["Hoy", "7 días", "30 días"];

/** Fase 1 — ocultar secciones en UI; lógica, fetch y componentes siguen intactos */
const UI_OCULTAR_FASE1 = {
  indicadoresClave: true,
  embudoReal: true,
  heatmapHorario: true,
  metricasPorFlujo: true,
};

function Skeleton({ className = "" }) {
  return <div className={`skel ${className}`} />;
}

function EmptyBlock({ title, hint }) {
  return (
    <div className="emptyBlock">
      <span>📊</span>
      <strong>{title}</strong>
      <p>{hint}</p>
    </div>
  );
}

function TrendBadge({ value }) {
  const t = formatTendencia(value);
  if (!t) return <span className="trend muted">Sin datos previos</span>;
  const pos = Number(value) >= 0;
  return <span className={`trend ${pos ? "up" : "down"}`}>{t}</span>;
}

function MiniChart({ data, keyField, color, formatValue }) {
  if (!data?.length) {
    return <div className="trendEmpty">Sin actividad en el periodo</div>;
  }
  const max = Math.max(...data.map((d) => d[keyField] || 0), 1);
  const hasData = data.some((d) => (d[keyField] || 0) > 0);
  if (!hasData) return <div className="trendEmpty">Sin actividad en el periodo</div>;

  const fmt = formatValue || ((v) => formatNum(v));

  return (
    <div className="miniChart">
      {data.map((d) => (
        <div
          key={d.fecha}
          className="miniBarCol"
          title={`${d.fecha}: ${fmt(d[keyField] || 0)}`}
        >
          <div
            className={`miniBar ${color}`}
            style={{ height: `${Math.max(3, ((d[keyField] || 0) / max) * 100)}%` }}
          />
          <small>{d.fecha?.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function TrendMetric({ label, total, data, keyField, color, formatValue }) {
  return (
    <div className="trendMetric">
      <div className="trendMetricHead">
        <span className="trendMetricLabel">{label}</span>
        <strong className="trendMetricTotal">{total}</strong>
      </div>
      <MiniChart data={data} keyField={keyField} color={color} formatValue={formatValue} />
    </div>
  );
}

function HeatmapGrid({ heatmap }) {
  const horas = heatmap?.horas || [];
  const max = heatmap?.max || 0;
  if (!max) return <EmptyBlock title="Sin actividad horaria" hint="Cuando lleguen mensajes o leads verás el mapa de calor." />;

  return (
    <div className="heatmapGrid">
      {horas.map((h) => {
        const intensity = max > 0 ? (h.total / max) * 100 : 0;
        return (
          <div
            key={h.hora}
            className="heatCell"
            style={{ opacity: 0.25 + (intensity / 100) * 0.75 }}
            title={`${h.hora}:00 — ${h.mensajes} msgs, ${h.leads} leads`}
          >
            <b>{h.hora}</b>
            <small>{h.total}</small>
          </div>
        );
      })}
    </div>
  );
}

export default function Metricas() {
  const [periodo, setPeriodo] = useState("7 días");
  const [flujoId, setFlujoId] = useState("");
  const [metaAdsModalOpen, setMetaAdsModalOpen] = useState(false);
  const {
    conexionesInbox,
    conexionSeleccionadaId,
    conexionesLoading,
    seleccionarConexion,
    etiquetaTabConexion,
  } = useMetricasConexion();
  const { resumen, funnel, series, flujos, diagnostico, heatmap, flujosLista, loading, error, reload } =
    useMetricas(periodo, flujoId, conexionSeleccionadaId, conexionesLoading);
  const {
    status: metaAdsStatus,
    loading: metaAdsLoading,
    reload: reloadMetaAds,
  } = useMetaAdsStatus(conexionSeleccionadaId, conexionesLoading);

  const kpis = resumen?.kpis || {};
  const salud = resumen?.salud || { score: 0, label: "Sin datos" };

  const mainCards = useMemo(
    () => [
      {
        titulo: "Leads",
        valor: formatNum(kpis.leads),
        detalle: "Clientes registrados",
        icono: "⚡",
        color: "green",
        tendencia: kpis.tendenciaLeads,
      },
      {
        titulo: "Conversaciones",
        valor: formatNum(kpis.conversaciones),
        detalle: "Chats con actividad",
        icono: "💬",
        color: "cyan",
        tendencia: kpis.tendenciaConversaciones,
      },
      {
        titulo: "Ventas",
        valor: formatNum(kpis.ventas),
        detalle: "Conversiones CRM",
        icono: "💎",
        color: "purple",
        tendencia: kpis.tendenciaVentas,
      },
      {
        titulo: "Ingresos",
        valor: formatMoney(kpis.ingresos, kpis.moneda),
        detalle: kpis.ventas > 0 ? `Desde ${kpis.ventas} venta(s)` : "Sin ventas en el periodo",
        icono: "🚀",
        color: "orange",
        tendencia: null,
      },
    ],
    [kpis]
  );

  const performanceCards = useMemo(
    () => [
      {
        titulo: "Tasa de cierre",
        valor: formatPct(kpis.tasaCierre),
        ayuda: "Ventas / conversaciones",
        estado: kpis.tasaCierre >= 10 ? "Fuerte" : kpis.conversaciones > 0 ? "Mejorar" : "Sin datos",
        color: kpis.tasaCierre >= 10 ? "good" : "warning",
        real: true,
      },
      {
        titulo: "Conversión",
        valor: formatPct(kpis.conversion),
        ayuda: "Ventas / leads",
        estado: kpis.conversion >= 5 ? "Buena" : kpis.leads > 0 ? "Baja" : "Sin datos",
        color: kpis.conversion >= 5 ? "good" : "warning",
        real: true,
      },
      {
        titulo: "Mensajes enviados",
        valor: formatNum(kpis.mensajesEnviados),
        ayuda: "Salientes por WhatsApp",
        estado: kpis.mensajesEnviados > 0 ? "Activo" : "Sin envíos",
        color: kpis.mensajesEnviados > 0 ? "good" : "warning",
        real: true,
      },
      {
        titulo: "Respuestas",
        valor: formatNum(kpis.respuestas),
        ayuda: "Leads que respondieron",
        estado: kpis.respuestas > 0 ? "Engagement" : "Sin respuestas",
        color: kpis.respuestas > 0 ? "good" : "warning",
        real: true,
      },
    ],
    [kpis]
  );

  const segCards = [
    { label: "Enviados", val: kpis.seguimientosEnviados, tone: "cyan" },
    { label: "Respondidos", val: kpis.seguimientosRespondidos, tone: "green" },
    { label: "Cancelados", val: kpis.seguimientosCancelados, tone: "muted" },
  ];

  const diario = series?.diario || [];
  const trendTotals = useMemo(() => {
    const sum = (key) => diario.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
    return {
      leads: formatNum(sum("leads")),
      ventas: formatNum(sum("ventas")),
      ingresos: formatMoney(sum("ingresos"), kpis.moneda),
    };
  }, [diario, kpis.moneda]);

  const insightTitulo = salud.score >= 60 ? "Embudo saludable" : "Optimiza el embudo";

  const flujoNombre = flujosLista.find((f) => f.id === flujoId)?.nombre;
  const conexionActiva = conexionesInbox.find(
    (c) => String(c.id) === String(conexionSeleccionadaId)
  );
  const lineaLabel =
    conexionSeleccionadaId === CONEXION_TODAS
      ? "Todas las líneas"
      : conexionActiva
        ? etiquetaTabConexion(conexionActiva)
        : null;

  if (error && !loading) {
    return (
      <div className="metricasMeta">
        <style>{styles}</style>
        <div className="errorPanel">
          <h2>No se pudieron cargar las métricas</h2>
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="metricasMeta">
      <style>{styles}</style>

      <section className="hero">
        <div>
          <span className="eyebrow">MacBot CRM Intelligence</span>
          <h1>Métricas reales de tu embudo WhatsApp</h1>
          <p>
            Leads, conversaciones, ventas e ingresos desde Supabase. Sin datos inventados.
            {lineaLabel ? ` Vista: ${lineaLabel}.` : ""}
            {flujoNombre ? ` Filtrando: ${flujoNombre}.` : ""}
          </p>
        </div>

        <div className="heroScore">
          {loading ? (
            <Skeleton className="scoreSkel" />
          ) : (
            <>
              <div className="scoreRing">
                <strong>{salud.score}</strong>
                <span>/100</span>
              </div>
              <b>{salud.label}</b>
              <small>Salud del embudo</small>
            </>
          )}
        </div>
      </section>

      <ConexionLineaTabs
        conexionesInbox={conexionesInbox}
        conexionSeleccionadaId={conexionSeleccionadaId}
        onSeleccionar={seleccionarConexion}
        etiquetaTabConexion={etiquetaTabConexion}
      />

      <section className="controlBar">
        <div className="selectorBox">
          <label htmlFor="flujo-campana-select">Flujo / campaña</label>
          <FlujoCampanaSelect
            value={flujoId}
            onChange={setFlujoId}
            options={flujosLista}
            disabled={loading}
          />
        </div>

        <div className="periodos">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              className={periodo === p ? "active" : ""}
              onClick={() => setPeriodo(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="controlActions">
          <button type="button" className="refreshBtn" onClick={reload} disabled={loading}>
            {loading ? "Cargando…" : "Actualizar"}
          </button>
          <div className="liveBadge">
            <span className="liveDot" />
            <div>
              <strong>LIVE</strong>
              <small>Datos Supabase</small>
            </div>
          </div>
        </div>
      </section>

      <section className="mainGrid">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mainCard skelCard" />
            ))
          : mainCards.map((card, i) => (
              <div
                className={`mainCard ${card.color}`}
                key={card.titulo}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="shine" />
                <div className="cardTop">
                  <div className="icon">{card.icono}</div>
                  <TrendBadge value={card.tendencia} />
                </div>
                <h2>{card.valor}</h2>
                <strong>{card.titulo}</strong>
                <p>{card.detalle}</p>
              </div>
            ))}
      </section>

      <RevenuePremiumSection
        flujoId={flujoId}
        conexionSeleccionadaId={conexionSeleccionadaId}
        conexionesLoading={conexionesLoading}
      />

      <section className="dashBottom">
        <div className="dashMain">
          {!UI_OCULTAR_FASE1.indicadoresClave && (
            <div className="panelCard">
              <div className="panelTop">
                <div>
                  <h2>Indicadores clave</h2>
                  <p>Métricas internas del CRM en el periodo seleccionado.</p>
                </div>
              </div>
              {loading ? (
                <div className="performanceGrid">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="perfSkel" />
                  ))}
                </div>
              ) : (
                <div className="performanceGrid">
                  {performanceCards.map((item) => (
                    <div className="performanceCard" key={item.titulo}>
                      <div>
                        <span>{item.titulo}</span>
                        <h3>{item.valor}</h3>
                        <p>{item.ayuda}</p>
                      </div>
                      <b className={item.color}>{item.estado}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!UI_OCULTAR_FASE1.embudoReal && (
            <div className="panelCard">
              <div className="panelTop">
                <div>
                  <h2>Embudo real</h2>
                  <p>Leads → Conversaciones → Respuestas → Seguimientos → Ventas</p>
                </div>
              </div>
              {loading ? (
                <Skeleton className="funnelSkel" />
              ) : funnel?.vacio ? (
                <EmptyBlock title="Embudo vacío" hint="Registra leads y conversaciones para ver el embudo." />
              ) : (
                <div className="funnel">
                  {(funnel?.etapas || []).map((f) => (
                    <div className="funnelRow" key={f.nombre}>
                      <div className="funnelName">
                        <strong>{f.nombre}</strong>
                        <span>{formatNum(f.cantidad)}</span>
                      </div>
                      <div className="funnelBar">
                        <div className={f.color} style={{ width: `${f.porcentaje}%` }} />
                      </div>
                      <b>{f.tasaVsLeads > 0 ? `${f.tasaVsLeads}%` : "—"}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="panelCard panelCard--trend">
            <div className="panelTop panelTop--compact">
              <div>
                <h2>Tendencia diaria</h2>
                <p>Leads, ventas e ingresos por día en el periodo.</p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="chartSkel" />
            ) : (
              <div className="trendBusinessRow">
                <TrendMetric
                  label="Leads"
                  total={trendTotals.leads}
                  data={diario}
                  keyField="leads"
                  color="green"
                />
                <TrendMetric
                  label="Ventas"
                  total={trendTotals.ventas}
                  data={diario}
                  keyField="ventas"
                  color="purple"
                />
                <TrendMetric
                  label="Ingresos"
                  total={trendTotals.ingresos}
                  data={diario}
                  keyField="ingresos"
                  color="orange"
                  formatValue={(v) => formatMoney(v, kpis.moneda)}
                />
              </div>
            )}
          </div>

          {!UI_OCULTAR_FASE1.heatmapHorario && (
            <div className="panelCard">
              <div className="panelTop">
                <div>
                  <h2>Heatmap horario</h2>
                  <p>Horas con más mensajes y leads (hora local del navegador).</p>
                </div>
              </div>
              {loading ? <Skeleton className="heatmapSkel" /> : <HeatmapGrid heatmap={heatmap?.heatmap} />}
            </div>
          )}

          <div className="panelCard panelCard--diag">
            <div className="panelTop panelTop--compact">
              <h2>Diagnóstico inteligente</h2>
            </div>
            {loading ? (
              <Skeleton className="diagSkel" />
            ) : (
              <div className="diagnostico diagnostico--premium">
                {(diagnostico?.items || []).map((d, i) => (
                  <div className={`diagItem ${d.tipo}`} key={i}>
                    <span className="diagIcon" aria-hidden="true">
                      {d.tipo === "ok" ? "✓" : d.tipo === "alerta" ? "!" : "i"}
                    </span>
                    <p>{d.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="dashAside">
          <div className="panelCard panelCard--compact">
            {loading ? (
              <Skeleton className="metaSkel" />
            ) : (
              <MetaAdsCompactCard
                status={metaAdsStatus}
                loading={metaAdsLoading}
                onConnect={() => setMetaAdsModalOpen(true)}
              />
            )}
          </div>

          <div className="panelCard panelCard--compact">
            <div className="panelTop panelTop--compact">
              <h2>Seguimientos</h2>
            </div>
            {loading ? (
              <Skeleton className="segSkel" />
            ) : (
              <div className="segStrip">
                {segCards.map((s) => (
                  <div key={s.label} className={`segStripItem ${s.tone}`}>
                    <span>{s.label}</span>
                    <strong>{formatNum(s.val)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panelCard panelCard--insight">
            {loading ? (
              <Skeleton className="recSkel" />
            ) : (
              <div className="insightCard">
                <span className="insightEmoji" aria-hidden="true">
                  💡
                </span>
                <div className="insightBody">
                  <strong>{insightTitulo}</strong>
                  <p>{diagnostico?.recomendacion || "Revisa seguimientos y respuestas."}</p>
                </div>
              </div>
            )}
          </div>

          {!UI_OCULTAR_FASE1.metricasPorFlujo && (
            <div className="panelCard">
              <h2>Métricas por flujo</h2>
              {loading ? (
                <Skeleton className="flowSkel" />
              ) : flujos?.flujos?.length ? (
                <div className="flowHighlights">
                  {flujos.destacados?.masLeads && (
                    <div className="flowHighlight">
                      <small>Más leads</small>
                      <strong>{flujos.destacados.masLeads.nombre}</strong>
                      <span>{formatNum(flujos.destacados.masLeads.leads)}</span>
                    </div>
                  )}
                  {flujos.destacados?.masRespuestas && (
                    <div className="flowHighlight">
                      <small>Más respuestas</small>
                      <strong>{flujos.destacados.masRespuestas.nombre}</strong>
                      <span>{formatNum(flujos.destacados.masRespuestas.respuestas)}</span>
                    </div>
                  )}
                  {flujos.destacados?.masConversiones && (
                    <div className="flowHighlight">
                      <small>Más conversiones</small>
                      <strong>{flujos.destacados.masConversiones.nombre}</strong>
                      <span>{formatNum(flujos.destacados.masConversiones.conversiones)}</span>
                    </div>
                  )}
                  {flujos.destacados?.masPendientes && (
                    <div className="flowHighlight warn">
                      <small>Más pendientes</small>
                      <strong>{flujos.destacados.masPendientes.nombre}</strong>
                      <span>{formatNum(flujos.destacados.masPendientes.seguimientosPendientes)}</span>
                    </div>
                  )}
                  {flujos.sinActividad?.length > 0 && (
                    <div className="flowInactive">
                      <small>Sin actividad ({flujos.sinActividad.length})</small>
                      <p>{flujos.sinActividad.map((f) => f.nombre).join(", ")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyBlock title="Sin flujos" hint="Crea flujos en el módulo Flujos para ver ranking." />
              )}
            </div>
          )}
        </aside>
      </section>

      <MetaAdsConnectModal
        open={metaAdsModalOpen}
        onClose={() => setMetaAdsModalOpen(false)}
        conexionWhatsappId={conexionSeleccionadaId}
        onSaved={reloadMetaAds}
      />
    </div>
  );
}

const styles = `
.metricasMeta { min-height: 100%; color: #e5e7eb; }
.hero { min-height: 148px; border-radius: 28px; padding: 22px 26px; margin-bottom: 14px; background: radial-gradient(circle at 88% 18%, rgba(34,211,238,.28), transparent 28%), radial-gradient(circle at 15% 90%, rgba(168,85,247,.18), transparent 30%), linear-gradient(135deg, rgba(15,23,42,.86), rgba(6,182,212,.16)); border: 1px solid rgba(148,163,184,.16); display: flex; justify-content: space-between; align-items: center; gap: 24px; animation: fadeUp .35s ease both; }
.eyebrow { color: #67e8f9; font-size: 12px; font-weight: 1000; letter-spacing: 2.4px; text-transform: uppercase; }
.hero h1 { margin: 12px 0; font-size: 36px; line-height: 1.05; letter-spacing: -1px; max-width: 800px; }
.hero p { margin: 0; color: #b6c4d8; max-width: 720px; line-height: 1.55; }
.heroScore { width: 160px; min-width: 160px; padding: 16px; border-radius: 28px; background: rgba(255,255,255,.065); border: 1px solid rgba(255,255,255,.13); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.scoreRing { width: 88px; height: 88px; border-radius: 50%; border: 3px solid rgba(34,211,238,.45); display: flex; align-items: center; justify-content: center; }
.scoreRing strong { font-size: 32px; }
.scoreRing span { color: #94a3b8; font-size: 12px; }
.heroScore b { color: #86efac; }
.heroScore small { color: #94a3b8; }
.controlBar { border-radius: 22px; padding: 14px; margin-bottom: 14px; background: rgba(15,23,42,.72); border: 1px solid rgba(148,163,184,.14); display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: end; }
.selectorBox label { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 7px; font-weight: 900; }
.periodos { display: flex; gap: 8px; flex-wrap: wrap; }
.periodos button { height: 42px; border: 0; border-radius: 14px; padding: 0 14px; color: white; background: rgba(255,255,255,.08); cursor: pointer; font-weight: 900; }
.periodos button.active { background: linear-gradient(135deg, #22c55e, #06b6d4); color: #031827; }
.controlActions { display: flex; gap: 10px; align-items: center; }
.refreshBtn { height: 42px; border: 0; border-radius: 14px; padding: 0 16px; background: rgba(255,255,255,.1); color: white; font-weight: 900; cursor: pointer; }
.liveBadge { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 14px; background: rgba(255,255,255,.06); }
.liveDot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: pulse 1.5s infinite; }
.mainGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.mainCard { min-height: 148px; border-radius: 24px; padding: 18px; position: relative; overflow: hidden; border: 1px solid rgba(148,163,184,.14); background: rgba(15,23,42,.72); animation: fadeUp .35s ease both; }
.mainCard.green { background: linear-gradient(135deg, rgba(34,197,94,.24), rgba(15,23,42,.78)); }
.mainCard.cyan { background: linear-gradient(135deg, rgba(6,182,212,.24), rgba(15,23,42,.78)); }
.mainCard.purple { background: linear-gradient(135deg, rgba(168,85,247,.24), rgba(15,23,42,.78)); }
.mainCard.orange { background: linear-gradient(135deg, rgba(249,115,22,.24), rgba(15,23,42,.78)); }
.shine { position: absolute; inset: -80px; background: linear-gradient(120deg, transparent 35%, rgba(255,255,255,.08), transparent 65%); animation: shine 5s infinite; }
.cardTop { display: flex; justify-content: space-between; align-items: center; position: relative; }
.icon { width: 44px; height: 44px; border-radius: 14px; background: rgba(255,255,255,.09); display: flex; align-items: center; justify-content: center; font-size: 20px; }
.trend { font-size: 11px; font-weight: 900; padding: 5px 8px; border-radius: 999px; }
.trend.up { background: rgba(34,197,94,.15); color: #86efac; }
.trend.down { background: rgba(239,68,68,.15); color: #fca5a5; }
.trend.muted { color: #94a3b8; background: rgba(255,255,255,.06); }
.mainCard h2 { margin: 16px 0 6px; font-size: 32px; position: relative; }
.mainCard p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; position: relative; }
.dashBottom { display: grid; grid-template-columns: 1fr minmax(260px, 300px); gap: 14px; align-items: start; }
.dashMain, .dashAside { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.panelCard { border-radius: 22px; padding: 16px 18px; background: rgba(15,23,42,.72); border: 1px solid rgba(148,163,184,.14); animation: fadeUp .35s ease both; }
.panelCard--compact { padding: 14px 16px; }
.panelCard--trend { padding-bottom: 14px; }
.panelCard--diag { padding-bottom: 14px; }
.panelCard--insight { padding: 12px 14px; background: linear-gradient(135deg, rgba(34,197,94,.07), rgba(15,23,42,.82)); border-color: rgba(34,197,94,.18); }
.panelTop { margin-bottom: 12px; }
.panelTop--compact { margin-bottom: 10px; }
.panelTop h2, .panelCard h2 { margin: 0 0 4px; font-size: 17px; letter-spacing: -.2px; }
.panelTop p { margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.4; }
.panelCard--compact h2 { font-size: 15px; margin: 0; }
.performanceGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.performanceCard { padding: 16px; border-radius: 20px; background: rgba(255,255,255,.045); display: flex; justify-content: space-between; gap: 10px; }
.performanceCard span { color: #94a3b8; font-size: 12px; font-weight: 900; }
.performanceCard h3 { margin: 8px 0 4px; font-size: 26px; }
.performanceCard p { margin: 0; color: #94a3b8; font-size: 12px; }
.performanceCard b { height: 28px; padding: 0 10px; border-radius: 999px; display: flex; align-items: center; font-size: 11px; white-space: nowrap; }
.good { background: rgba(34,197,94,.15); color: #86efac; }
.warning { background: rgba(249,115,22,.16); color: #fdba74; }
.metaPlaceholder h3 { color: #64748b; }
.funnel { display: flex; flex-direction: column; gap: 14px; }
.funnelRow { display: grid; grid-template-columns: 180px 1fr 52px; gap: 12px; align-items: center; }
.funnelName span { color: #94a3b8; font-size: 13px; display: block; }
.funnelBar { height: 12px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
.funnelBar div { height: 100%; border-radius: inherit; animation: growBar .6s ease both; }
.funnelBar .blue { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
.funnelBar .cyan { background: linear-gradient(90deg, #06b6d4, #22c55e); }
.funnelBar .green { background: linear-gradient(90deg, #22c55e, #84cc16); }
.funnelBar .orange { background: linear-gradient(90deg, #f97316, #eab308); }
.funnelBar .purple { background: linear-gradient(90deg, #a855f7, #ec4899); }
.trendBusinessRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.trendMetric { padding: 10px 12px; border-radius: 16px; background: rgba(255,255,255,.035); border: 1px solid rgba(148,163,184,.1); }
.trendMetricHead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.trendMetricLabel { font-size: 11px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
.trendMetricTotal { font-size: 15px; color: #f1f5f9; letter-spacing: -.3px; }
.trendEmpty { font-size: 11px; color: #64748b; text-align: center; padding: 18px 8px; min-height: 56px; display: flex; align-items: center; justify-content: center; }
.miniChart { display: flex; align-items: flex-end; gap: 3px; height: 56px; }
.miniBarCol { flex: 1; display: flex; flex-direction: column; align-items: center; height: 56px; justify-content: flex-end; min-width: 0; }
.miniBar { width: 100%; max-width: 18px; min-height: 3px; border-radius: 4px 4px 2px 2px; transition: height .3s; }
.miniBar.green { background: linear-gradient(180deg, #4ade80, #16a34a); }
.miniBar.cyan { background: linear-gradient(180deg, #06b6d4, #0891b2); }
.miniBar.purple { background: linear-gradient(180deg, #c084fc, #7c3aed); }
.miniBar.orange { background: linear-gradient(180deg, #fb923c, #ea580c); }
.miniBarCol small { font-size: 8px; color: #64748b; margin-top: 3px; }
.heatmapGrid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
.heatCell { padding: 8px 4px; border-radius: 10px; background: linear-gradient(135deg, #06b6d4, #22c55e); text-align: center; font-size: 11px; }
.heatCell b { display: block; }
.heatCell small { color: rgba(255,255,255,.8); }
.metaAdsCompact { display: flex; flex-direction: column; gap: 10px; }
.metaAdsCompactHead { display: flex; align-items: flex-start; gap: 10px; }
.metaAdsIcon { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #67e8f9; background: linear-gradient(135deg, rgba(6,182,212,.2), rgba(59,130,246,.12)); border: 1px solid rgba(34,211,238,.25); flex-shrink: 0; }
.metaAdsCompact h3 { margin: 0; font-size: 15px; }
.metaAdsStatus { margin: 2px 0 0; font-size: 11px; color: #94a3b8; }
.metaAdsConnectChip { margin-left: auto; flex-shrink: 0; height: 28px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 10px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; color: #67e8f9; background: rgba(6,182,212,.12); border: 1px solid rgba(34,211,238,.35); cursor: pointer; transition: background .15s, border-color .15s; }
.metaAdsConnectChip:hover { background: rgba(6,182,212,.2); border-color: rgba(34,211,238,.55); }
.metaAdsStatusList { display: flex; flex-direction: column; gap: 8px; }
.metaAdsStatusRow { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.03); border: 1px solid rgba(148,163,184,.1); }
.metaAdsStatusRow.ok { border-color: rgba(34,197,94,.22); background: rgba(34,197,94,.06); }
.metaAdsStatusRow.pending { border-color: rgba(148,163,184,.12); }
.metaAdsStatusDot { width: 20px; height: 20px; min-width: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; background: rgba(148,163,184,.15); color: #94a3b8; }
.metaAdsStatusRow.ok .metaAdsStatusDot { background: rgba(34,197,94,.25); color: #4ade80; }
.metaAdsStatusText strong { display: block; font-size: 12px; color: #e2e8f0; }
.metaAdsStatusText small { display: block; margin-top: 2px; font-size: 10px; line-height: 1.35; color: #94a3b8; word-break: break-all; }
.metaAdsCompact--loading { font-size: 12px; color: #94a3b8; padding: 8px 0; }
.metaAdsCopy { margin: 0; font-size: 12px; line-height: 1.45; color: #94a3b8; }
.metaAdsCopy strong { color: #cbd5e1; font-weight: 700; }
.metaAdsModalBackdrop { position: fixed; inset: 0; z-index: 1200; background: rgba(2,6,23,.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.metaAdsModal { width: min(440px, 100%); border-radius: 18px; padding: 20px; background: linear-gradient(180deg, #0f172a, #020617); border: 1px solid rgba(148,163,184,.18); box-shadow: 0 24px 60px rgba(0,0,0,.45); }
.metaAdsModalHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.metaAdsModalHead h2 { margin: 0; font-size: 18px; color: #f8fafc; }
.metaAdsModalClose { width: 32px; height: 32px; border: none; border-radius: 10px; background: rgba(255,255,255,.06); color: #cbd5e1; font-size: 22px; line-height: 1; cursor: pointer; }
.metaAdsModalHint { margin: 0 0 14px; font-size: 12px; line-height: 1.45; color: #94a3b8; }
.metaAdsModalHint code { font-size: 11px; color: #67e8f9; }
.metaAdsModalForm { display: flex; flex-direction: column; gap: 12px; }
.metaAdsModalForm label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
.metaAdsModalForm input { height: 40px; border-radius: 12px; border: 1px solid rgba(148,163,184,.2); background: rgba(15,23,42,.8); color: #f8fafc; padding: 0 12px; font-size: 13px; }
.metaAdsOptional { font-weight: 500; text-transform: none; letter-spacing: 0; color: #64748b; }
.metaAdsModalError { margin: 0; font-size: 12px; color: #fca5a5; }
.metaAdsModalActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.metaAdsBtn { height: 36px; padding: 0 14px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
.metaAdsBtn.ghost { background: transparent; border-color: rgba(148,163,184,.25); color: #cbd5e1; }
.metaAdsBtn.primary { background: linear-gradient(135deg, #06b6d4, #2563eb); color: #fff; }
.metaAdsBtn:disabled { opacity: .6; cursor: not-allowed; }
.segStrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.segStripItem { padding: 10px 8px; border-radius: 14px; text-align: center; background: rgba(255,255,255,.04); border: 1px solid rgba(148,163,184,.1); }
.segStripItem span { display: block; color: #94a3b8; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; }
.segStripItem strong { display: block; margin-top: 5px; font-size: 20px; line-height: 1; color: #f8fafc; }
.segStripItem.cyan { border-color: rgba(6,182,212,.22); background: linear-gradient(180deg, rgba(6,182,212,.1), rgba(255,255,255,.03)); }
.segStripItem.green { border-color: rgba(34,197,94,.22); background: linear-gradient(180deg, rgba(34,197,94,.1), rgba(255,255,255,.03)); }
.segStripItem.muted strong { color: #cbd5e1; }
.diagnostico { display: flex; flex-direction: column; gap: 6px; }
.diagnostico--premium .diagItem { padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(148,163,184,.08); }
.diagItem { display: flex; gap: 8px; align-items: flex-start; }
.diagIcon { width: 20px; height: 20px; min-width: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10px; }
.diagItem.ok .diagIcon { background: #22c55e; color: #031827; }
.diagItem.alerta .diagIcon { background: #f97316; color: #031827; }
.diagItem.info .diagIcon { background: #06b6d4; color: #031827; }
.diagItem p { margin: 0; color: #cbd5e1; font-size: 12px; line-height: 1.35; }
.insightCard { display: flex; align-items: flex-start; gap: 10px; }
.insightEmoji { font-size: 18px; line-height: 1; flex-shrink: 0; }
.insightBody strong { display: block; font-size: 13px; color: #ecfdf5; margin-bottom: 3px; }
.insightBody p { margin: 0; font-size: 11px; line-height: 1.35; color: #94a3b8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.flowHighlights { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.flowHighlight { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.05); }
.flowHighlight small { color: #94a3b8; font-size: 11px; }
.flowHighlight strong { display: block; margin: 4px 0; }
.flowHighlight.warn { border: 1px solid rgba(249,115,22,.3); }
.flowInactive { padding: 12px; border-radius: 14px; background: rgba(239,68,68,.08); }
.flowInactive p { margin: 6px 0 0; color: #94a3b8; font-size: 12px; }
.emptyBlock { text-align: center; padding: 28px 16px; color: #94a3b8; }
.emptyBlock span { font-size: 28px; display: block; margin-bottom: 8px; }
.emptyBlock strong { color: #e2e8f0; display: block; margin-bottom: 6px; }
.skel, .skelCard, .perfSkel, .funnelSkel, .chartSkel, .heatmapSkel, .metaSkel, .segSkel, .diagSkel, .recSkel, .flowSkel, .scoreSkel {
  background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.04) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 16px;
}
.skelCard { min-height: 160px; }
.perfSkel { height: 90px; }
.funnelSkel { height: 120px; }
.chartSkel { height: 88px; }
.heatmapSkel { height: 80px; }
.metaSkel { height: 72px; }
.segSkel { height: 52px; }
.diagSkel { height: 72px; }
.recSkel { height: 44px; }
.errorPanel { margin: 40px auto; max-width: 480px; padding: 32px; text-align: center; border-radius: 24px; background: rgba(15,23,42,.9); border: 1px solid rgba(239,68,68,.3); }
.errorPanel button { margin-top: 16px; height: 44px; padding: 0 20px; border: 0; border-radius: 14px; background: linear-gradient(135deg, #22c55e, #06b6d4); color: #031827; font-weight: 900; cursor: pointer; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes shine { 0% { transform: translateX(-70%); } 45%,100% { transform: translateX(70%); } }
@keyframes growBar { from { width: 0; } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@media (max-width: 1200px) {
  .mainGrid { grid-template-columns: repeat(2, 1fr); }
  .dashBottom { grid-template-columns: 1fr; }
  .trendBusinessRow { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .hero { flex-direction: column; align-items: flex-start; min-height: auto; }
  .controlBar { grid-template-columns: 1fr; }
  .mainGrid, .performanceGrid, .heatmapGrid, .segStrip { grid-template-columns: 1fr; }
  .funnelRow { grid-template-columns: 1fr; }
  .hero h1 { font-size: 28px; }
  .metaAdsCompactHead { flex-wrap: wrap; }
  .metaSoonChip { margin-left: 0; }
}
`;
