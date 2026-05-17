import React, { useMemo, useState } from "react";
import { useMetricas } from "./metricas/useMetricas";
import { formatMoney, formatNum, formatPct, formatTendencia } from "./metricas/format";

const PERIODOS = ["Hoy", "7 días", "30 días"];

const META_PLACEHOLDER = "Conecta Meta Ads para ver esta métrica";

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

function MiniChart({ data, keyField, color }) {
  if (!data?.length) return <EmptyBlock title="Sin datos" hint="Aún no hay actividad en este periodo." />;
  const max = Math.max(...data.map((d) => d[keyField] || 0), 1);
  const hasData = data.some((d) => (d[keyField] || 0) > 0);
  if (!hasData) return <EmptyBlock title="Sin datos" hint="Aún no hay actividad en este periodo." />;

  return (
    <div className="miniChart">
      {data.map((d) => (
        <div
          key={d.fecha}
          className="miniBarCol"
          title={`${d.fecha}: ${d[keyField]}`}
        >
          <div
            className={`miniBar ${color}`}
            style={{ height: `${Math.max(4, ((d[keyField] || 0) / max) * 100)}%` }}
          />
          <small>{d.fecha?.slice(5)}</small>
        </div>
      ))}
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

function MetaMetricCard({ titulo, ayuda }) {
  return (
    <div className="performanceCard metaPlaceholder">
      <div>
        <span>{titulo}</span>
        <h3>—</h3>
        <p>{ayuda}</p>
      </div>
      <b className="warning">{META_PLACEHOLDER}</b>
    </div>
  );
}

export default function Metricas() {
  const [periodo, setPeriodo] = useState("7 días");
  const [flujoId, setFlujoId] = useState("");
  const { resumen, funnel, series, flujos, diagnostico, heatmap, flujosLista, loading, error, reload } =
    useMetricas(periodo, flujoId);

  const kpis = resumen?.kpis || {};
  const salud = resumen?.salud || { score: 0, label: "Sin datos" };
  const metaAds = resumen?.metaAds || { conectado: false, mensaje: META_PLACEHOLDER };

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
    { label: "Pendientes", val: kpis.seguimientosActivos },
    { label: "Enviados", val: kpis.seguimientosEnviados },
    { label: "Cancelados", val: kpis.seguimientosCancelados },
    { label: "Respondidos", val: kpis.seguimientosRespondidos },
  ];

  const flujoNombre = flujosLista.find((f) => f.id === flujoId)?.nombre;

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

      <section className="controlBar">
        <div className="selectorBox">
          <label>Flujo / campaña</label>
          <select value={flujoId} onChange={(e) => setFlujoId(e.target.value)} disabled={loading}>
            <option value="">Todos los flujos</option>
            {flujosLista.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
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

      <section className="bodyGrid">
        <div className="leftColumn">
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

          <div className="panelCard">
            <div className="panelTop">
              <div>
                <h2>Tendencia diaria</h2>
                <p>Leads, mensajes y ventas por día.</p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="chartSkel" />
            ) : (
              <div className="chartsRow">
                <div className="chartBox">
                  <h4>Leads</h4>
                  <MiniChart data={series?.diario} keyField="leads" color="green" />
                </div>
                <div className="chartBox">
                  <h4>Mensajes</h4>
                  <MiniChart data={series?.diario} keyField="mensajes" color="cyan" />
                </div>
                <div className="chartBox">
                  <h4>Ventas</h4>
                  <MiniChart data={series?.diario} keyField="ventas" color="purple" />
                </div>
              </div>
            )}
          </div>

          <div className="panelCard">
            <div className="panelTop">
              <div>
                <h2>Heatmap horario</h2>
                <p>Horas con más mensajes y leads (hora local del navegador).</p>
              </div>
            </div>
            {loading ? <Skeleton className="heatmapSkel" /> : <HeatmapGrid heatmap={heatmap?.heatmap} />}
          </div>
        </div>

        <div className="rightColumn">
          <div className="panelCard moneyCard">
            <span className="eyebrow">Meta Ads</span>
            {loading ? (
              <Skeleton className="moneySkel" />
            ) : (
              <>
                <h2>{metaAds.conectado ? "Pixel conectado" : "Sin integración Ads"}</h2>
                <p>{metaAds.mensaje}</p>
                <div className="moneyList">
                  <MetaMetricCard titulo="ROAS" ayuda="Ingresos / inversión publicitaria" />
                  <MetaMetricCard titulo="CTR" ayuda="Clicks / impresiones" />
                  <MetaMetricCard titulo="CPC" ayuda="Costo por click" />
                </div>
                <div className="moneyList" style={{ marginTop: 10 }}>
                  <MetaMetricCard titulo="CPM" ayuda="Costo por mil impresiones" />
                  <MetaMetricCard titulo="Frecuencia" ayuda="Veces que ven el anuncio" />
                  <div className="metaNote">
                    <span>Inversión</span>
                    <strong>—</strong>
                    <small>{META_PLACEHOLDER}</small>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panelCard">
            <h2>Seguimientos</h2>
            {loading ? (
              <Skeleton className="segSkel" />
            ) : (
              <div className="segGrid">
                {segCards.map((s) => (
                  <div key={s.label} className="segItem">
                    <span>{s.label}</span>
                    <strong>{formatNum(s.val)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panelCard">
            <h2>Diagnóstico inteligente</h2>
            {loading ? (
              <Skeleton className="diagSkel" />
            ) : (
              <div className="diagnostico">
                {(diagnostico?.items || []).map((d, i) => (
                  <div className={`diagItem ${d.tipo}`} key={i}>
                    <span>{d.tipo === "ok" ? "✓" : d.tipo === "alerta" ? "!" : "i"}</span>
                    <p>{d.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panelCard recommendation">
            <span className="eyebrow">Recomendación</span>
            {loading ? (
              <Skeleton className="recSkel" />
            ) : (
              <>
                <h2>{salud.score >= 60 ? "Embudo saludable" : "Optimiza el embudo"}</h2>
                <p>{diagnostico?.recomendacion || "Revisa seguimientos y respuestas."}</p>
              </>
            )}
          </div>

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
        </div>
      </section>
    </div>
  );
}

const styles = `
.metricasMeta { min-height: 100%; color: #e5e7eb; }
.hero { min-height: 200px; border-radius: 34px; padding: 30px; margin-bottom: 18px; background: radial-gradient(circle at 88% 18%, rgba(34,211,238,.28), transparent 28%), radial-gradient(circle at 15% 90%, rgba(168,85,247,.18), transparent 30%), linear-gradient(135deg, rgba(15,23,42,.86), rgba(6,182,212,.16)); border: 1px solid rgba(148,163,184,.16); display: flex; justify-content: space-between; align-items: center; gap: 24px; animation: fadeUp .35s ease both; }
.eyebrow { color: #67e8f9; font-size: 12px; font-weight: 1000; letter-spacing: 2.4px; text-transform: uppercase; }
.hero h1 { margin: 12px 0; font-size: 36px; line-height: 1.05; letter-spacing: -1px; max-width: 800px; }
.hero p { margin: 0; color: #b6c4d8; max-width: 720px; line-height: 1.55; }
.heroScore { width: 160px; min-width: 160px; padding: 16px; border-radius: 28px; background: rgba(255,255,255,.065); border: 1px solid rgba(255,255,255,.13); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.scoreRing { width: 88px; height: 88px; border-radius: 50%; border: 3px solid rgba(34,211,238,.45); display: flex; align-items: center; justify-content: center; }
.scoreRing strong { font-size: 32px; }
.scoreRing span { color: #94a3b8; font-size: 12px; }
.heroScore b { color: #86efac; }
.heroScore small { color: #94a3b8; }
.controlBar { border-radius: 26px; padding: 16px; margin-bottom: 18px; background: rgba(15,23,42,.72); border: 1px solid rgba(148,163,184,.14); display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: end; }
.selectorBox label { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 7px; font-weight: 900; }
.selectorBox select { width: 100%; min-width: 200px; height: 48px; border: 1px solid rgba(148,163,184,.14); border-radius: 17px; background: rgba(255,255,255,.07); color: white; padding: 0 14px; font-weight: 700; }
.periodos { display: flex; gap: 8px; flex-wrap: wrap; }
.periodos button { height: 42px; border: 0; border-radius: 14px; padding: 0 14px; color: white; background: rgba(255,255,255,.08); cursor: pointer; font-weight: 900; }
.periodos button.active { background: linear-gradient(135deg, #22c55e, #06b6d4); color: #031827; }
.controlActions { display: flex; gap: 10px; align-items: center; }
.refreshBtn { height: 42px; border: 0; border-radius: 14px; padding: 0 16px; background: rgba(255,255,255,.1); color: white; font-weight: 900; cursor: pointer; }
.liveBadge { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 14px; background: rgba(255,255,255,.06); }
.liveDot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: pulse 1.5s infinite; }
.mainGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 18px; }
.mainCard { min-height: 160px; border-radius: 28px; padding: 20px; position: relative; overflow: hidden; border: 1px solid rgba(148,163,184,.14); background: rgba(15,23,42,.72); animation: fadeUp .35s ease both; }
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
.bodyGrid { display: grid; grid-template-columns: 1.25fr .75fr; gap: 18px; }
.leftColumn, .rightColumn { display: flex; flex-direction: column; gap: 18px; }
.panelCard { border-radius: 28px; padding: 20px; background: rgba(15,23,42,.72); border: 1px solid rgba(148,163,184,.14); animation: fadeUp .35s ease both; }
.panelTop { margin-bottom: 16px; }
.panelTop h2, .panelCard h2 { margin: 0 0 6px; font-size: 20px; }
.panelTop p { margin: 0; color: #94a3b8; font-size: 13px; }
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
.chartsRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.chartBox h4 { margin: 0 0 10px; color: #94a3b8; font-size: 12px; }
.miniChart { display: flex; align-items: flex-end; gap: 4px; height: 100px; }
.miniBarCol { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.miniBar { width: 100%; min-height: 4px; border-radius: 6px 6px 2px 2px; transition: height .3s; }
.miniBar.green { background: linear-gradient(180deg, #22c55e, #16a34a); }
.miniBar.cyan { background: linear-gradient(180deg, #06b6d4, #0891b2); }
.miniBar.purple { background: linear-gradient(180deg, #a855f7, #7c3aed); }
.miniBarCol small { font-size: 9px; color: #64748b; margin-top: 4px; }
.heatmapGrid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
.heatCell { padding: 8px 4px; border-radius: 10px; background: linear-gradient(135deg, #06b6d4, #22c55e); text-align: center; font-size: 11px; }
.heatCell b { display: block; }
.heatCell small { color: rgba(255,255,255,.8); }
.moneyCard { background: radial-gradient(circle at 85% 12%, rgba(34,211,238,.12), transparent 32%), rgba(15,23,42,.72); }
.moneyList { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.metaNote { padding: 10px; border-radius: 14px; background: rgba(255,255,255,.04); }
.metaNote span { display: block; color: #94a3b8; font-size: 11px; }
.metaNote strong { display: block; margin: 4px 0; }
.metaNote small { color: #fdba74; font-size: 10px; line-height: 1.3; }
.segGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
.segItem { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.05); }
.segItem span { color: #94a3b8; font-size: 12px; }
.segItem strong { display: block; margin-top: 6px; font-size: 22px; }
.diagnostico { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.diagItem { display: flex; gap: 10px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,.045); }
.diagItem span { width: 24px; height: 24px; min-width: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; }
.diagItem.ok span { background: #22c55e; color: #031827; }
.diagItem.alerta span { background: #f97316; color: #031827; }
.diagItem.info span { background: #06b6d4; color: #031827; }
.diagItem p { margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.4; }
.recommendation { background: radial-gradient(circle at 80% 12%, rgba(168,85,247,.15), transparent 32%), linear-gradient(135deg, rgba(34,197,94,.08), rgba(15,23,42,.75)); }
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
.skel, .skelCard, .perfSkel, .funnelSkel, .chartSkel, .heatmapSkel, .moneySkel, .segSkel, .diagSkel, .recSkel, .flowSkel, .scoreSkel {
  background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.1) 50%, rgba(255,255,255,.04) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 16px;
}
.skelCard { min-height: 160px; }
.perfSkel { height: 90px; }
.funnelSkel, .chartSkel { height: 120px; }
.heatmapSkel { height: 80px; }
.errorPanel { margin: 40px auto; max-width: 480px; padding: 32px; text-align: center; border-radius: 24px; background: rgba(15,23,42,.9); border: 1px solid rgba(239,68,68,.3); }
.errorPanel button { margin-top: 16px; height: 44px; padding: 0 20px; border: 0; border-radius: 14px; background: linear-gradient(135deg, #22c55e, #06b6d4); color: #031827; font-weight: 900; cursor: pointer; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes shine { 0% { transform: translateX(-70%); } 45%,100% { transform: translateX(70%); } }
@keyframes growBar { from { width: 0; } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@media (max-width: 1200px) { .mainGrid { grid-template-columns: repeat(2, 1fr); } .bodyGrid { grid-template-columns: 1fr; } .chartsRow { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .hero { flex-direction: column; align-items: flex-start; } .controlBar { grid-template-columns: 1fr; } .mainGrid, .performanceGrid, .moneyList, .heatmapGrid { grid-template-columns: 1fr; } .funnelRow { grid-template-columns: 1fr; } .hero h1 { font-size: 28px; } }
`;
