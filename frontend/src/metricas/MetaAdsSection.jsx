import React, { useEffect, useMemo, useState } from "react";
import { saveMetaAdsConfig } from "./metaAdsApi";
import { formatNum, formatPct } from "./format";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

export const META_CAMPAIGN_TODAS = "";

const META_CAMPAIGN_STATUS_LABELS = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
  IN_PROCESS: "En proceso",
  WITH_ISSUES: "Con incidencias",
};

const META_CAMPAIGN_OBJECTIVE_LABELS = {
  OUTCOME_AWARENESS: "Conciencia",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Ventas",
  OUTCOME_APP_PROMOTION: "Promoción de app",
  LINK_CLICKS: "Clics al enlace",
  BRAND_AWARENESS: "Reconocimiento de marca",
  REACH: "Alcance",
  VIDEO_VIEWS: "Reproducciones de video",
  LEAD_GENERATION: "Generación de leads",
  MESSAGES: "Mensajes",
  CONVERSIONS: "Conversiones",
  CATALOG_SALES: "Ventas de catálogo",
  STORE_VISITS: "Visitas a tienda",
};

export function formatMetaCampaignStatus(status) {
  const key = String(status || "").trim().toUpperCase();
  return META_CAMPAIGN_STATUS_LABELS[key] || key || "—";
}

export function formatMetaCampaignObjective(objective) {
  const key = String(objective || "").trim().toUpperCase();
  if (!key) return "—";
  if (META_CAMPAIGN_OBJECTIVE_LABELS[key]) return META_CAMPAIGN_OBJECTIVE_LABELS[key];
  return key
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function MetaAdsConnectModal({ open, onClose, conexionWhatsappId, onSaved }) {
  const [adAccountId, setAdAccountId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [adsAccessToken, setAdsAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdAccountId("");
    setBusinessId("");
    setAdsAccessToken("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const conn = apiConexionWhatsappParam(conexionWhatsappId);
      await saveMetaAdsConfig({
        ...(conn ? { conexion_whatsapp_id: conn } : {}),
        ad_account_id: adAccountId.trim(),
        business_id: businessId.trim() || undefined,
        ads_access_token: adsAccessToken.trim(),
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="metaAdsModalBackdrop" onClick={onClose} role="presentation">
      <div
        className="metaAdsModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="meta-ads-modal-title"
      >
        <div className="metaAdsModalHead">
          <h2 id="meta-ads-modal-title">Conectar Meta Ads</h2>
          <button type="button" className="metaAdsModalClose" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <p className="metaAdsModalHint">
          Guarda tu cuenta publicitaria y token con permisos <code>ads_read</code> y{" "}
          <code>read_insights</code>.
        </p>
        <form onSubmit={handleSubmit} className="metaAdsModalForm">
          <label>
            Ad Account ID
            <input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="act_1234567890"
              required
              autoComplete="off"
            />
          </label>
          <label>
            Business ID <span className="metaAdsOptional">(opcional)</span>
            <input
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="123456789012345"
              autoComplete="off"
            />
          </label>
          <label>
            Ads Access Token
            <input
              type="password"
              value={adsAccessToken}
              onChange={(e) => setAdsAccessToken(e.target.value)}
              placeholder="Token con ads_read / read_insights"
              required
              autoComplete="off"
            />
          </label>
          {error ? <p className="metaAdsModalError">{error}</p> : null}
          <div className="metaAdsModalActions">
            <button type="button" className="metaAdsBtn ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="metaAdsBtn primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar conexión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, detail }) {
  return (
    <div className={`metaAdsStatusRow ${ok ? "ok" : "pending"}`}>
      <span className="metaAdsStatusDot" aria-hidden="true">
        {ok ? "✓" : "○"}
      </span>
      <div className="metaAdsStatusText">
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function formatSpend(amount, currency) {
  const v = Number(amount);
  if (!Number.isFinite(v)) return "0";
  const cur = currency ? String(currency).toUpperCase() : "";
  const formatted = formatNum(Math.round(v * 100) / 100);
  if (cur === "USD") return `$ ${formatted}`;
  if (cur === "BOB" || cur === "BS") return `Bs ${formatted}`;
  return cur ? `${cur} ${formatted}` : formatted;
}

function formatTimeAgo(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function MetricMini({ label, value, hint }) {
  return (
    <div className="metaAdsMetricMini">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function MetaAdsCampaignSelect({ campaigns, value, onChange, disabled }) {
  return (
    <label className="metaAdsCampaignSelect">
      <span>Campaña Meta</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value={META_CAMPAIGN_TODAS}>Todas las campañas</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetaAdsCampaignsTable({ rows }) {
  if (!rows.length) {
    return <p className="metaAdsSyncHint">No hay campañas para mostrar.</p>;
  }

  return (
    <div className="metaAdsCampaignsTableWrap">
      <table className="metaAdsCampaignsTable">
        <thead>
          <tr>
            <th>Campaña</th>
            <th>Estado</th>
            <th>Objetivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="metaAdsCampaignName">{c.name}</td>
              <td>
                <span className={`metaAdsCampaignStatus metaAdsCampaignStatus--${String(c.status || "").toLowerCase()}`}>
                  {formatMetaCampaignStatus(c.status)}
                </span>
              </td>
              <td>{formatMetaCampaignObjective(c.objective)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetaAdsCampaignsBlock({
  campaigns,
  campaignsLoading,
  campaignsError,
  campaignsMensaje,
  selectedCampaignId,
  onSelectCampaign,
}) {
  const visibleRows = useMemo(() => {
    if (!selectedCampaignId) return campaigns;
    return campaigns.filter((c) => String(c.id) === String(selectedCampaignId));
  }, [campaigns, selectedCampaignId]);

  if (campaignsLoading) {
    return <p className="metaAdsSyncHint">Cargando campañas desde Meta…</p>;
  }

  return (
    <div className="metaAdsCampaignsBlock">
      <MetaAdsCampaignSelect
        campaigns={campaigns}
        value={selectedCampaignId}
        onChange={onSelectCampaign}
        disabled={!campaigns.length}
      />
      {campaignsMensaje && !campaigns.length ? (
        <p className="metaAdsSyncHint">{campaignsMensaje}</p>
      ) : null}
      <MetaAdsCampaignsTable rows={visibleRows} />
      {campaignsError ? <p className="metaAdsModalError">{campaignsError}</p> : null}
    </div>
  );
}

function MetaAdsMetricsGrid({ insights }) {
  const m = insights?.metrics || {};
  const currency = insights?.meta?.account_currency;

  return (
    <div className="metaAdsMetricsGrid">
      <MetricMini label="Inversión" value={formatSpend(m.spend, currency)} />
      <MetricMini label="Impresiones" value={formatNum(m.impressions)} />
      <MetricMini label="Alcance" value={formatNum(m.reach)} />
      <MetricMini label="Clicks" value={formatNum(m.clicks)} />
      <MetricMini label="CTR" value={formatPct(m.ctr)} />
      <MetricMini label="CPC" value={formatSpend(m.cpc, currency)} />
      <MetricMini label="CPM" value={formatSpend(m.cpm, currency)} />
      <MetricMini label="Frecuencia" value={m.frequency != null ? String(m.frequency) : "—"} />
      <MetricMini
        label="ROAS híbrido"
        value={m.roas_hibrido != null ? `${m.roas_hibrido}x` : "—"}
        hint={m.mensaje_roas || (m.ingresos_crm > 0 ? `CRM ${formatNum(m.ingresos_crm)}` : null)}
      />
    </div>
  );
}

export function MetaAdsCompactCard({
  status,
  statusLoading,
  insights,
  insightsLoading,
  refreshing,
  insightsError,
  campaigns,
  campaignsLoading,
  campaignsError,
  campaignsMensaje,
  selectedCampaignId,
  onSelectCampaign,
  onConnect,
  onRefresh,
}) {
  const campaignList = campaigns || [];
  const isCampaignScope = Boolean(selectedCampaignId);
  const selectedCampaign = isCampaignScope
    ? campaignList.find((c) => String(c.id) === String(selectedCampaignId))
    : null;
  const syncLabel = isCampaignScope ? "Sincronizar campaña" : "Sincronizar";
  const syncLabelPending = isCampaignScope ? "Sincronizando campaña…" : "Sincronizando…";
  const syncLabelInline = isCampaignScope ? "Sync campaña" : "Sincronizar";

  if (statusLoading) {
    return <div className="metaAdsCompact metaAdsCompact--loading">Cargando estado Meta Ads…</div>;
  }

  const pixel = status?.pixel || {};
  const capi = status?.capi || {};
  const ads = status?.ads || {};
  const adsConectado = Boolean(ads.conectado);

  const pixelDetail = pixel.conectado
    ? pixel.pixel_id_masked
      ? `ID ${pixel.pixel_id_masked}`
      : "Configurado"
    : "Pendiente en Ajustes → Meta Ads";
  const capiDetail = capi.conectado ? "Token CAPI guardado" : "Pendiente en Ajustes → Meta Ads";

  const hasCache = Boolean(insights?.cached && insights?.metrics);
  const syncedLabel = formatTimeAgo(insights?.synced_at);
  const showMetrics = adsConectado && hasCache && !insightsLoading;

  let adsDetail = "Pendiente — conecta tu cuenta publicitaria";
  if (adsConectado) {
    if (hasCache) {
      adsDetail = ads.ad_account_id_masked
        ? `${ads.ad_account_id_masked} · sincronizado`
        : "Insights sincronizados";
    } else {
      adsDetail = ads.ad_account_id_masked
        ? `${ads.ad_account_id_masked} · pendiente de sync`
        : "Conectado — pendiente de sincronización";
    }
  }

  return (
    <div className={`metaAdsCompact ${refreshing ? "metaAdsCompact--syncing" : ""}`}>
      <div className="metaAdsCompactHead">
        <span className="metaAdsIcon" aria-hidden="true">
          ◆
        </span>
        <div>
          <h3>Meta Ads</h3>
          <p className="metaAdsStatus">Estado de integración</p>
        </div>
        <button type="button" className="metaAdsConnectChip" onClick={onConnect}>
          {adsConectado ? "Actualizar Ads" : "Conectar Ads"}
        </button>
      </div>

      <div className="metaAdsStatusList">
        <StatusRow label="Pixel" ok={pixel.conectado} detail={pixelDetail} />
        <StatusRow label="CAPI" ok={capi.conectado} detail={capiDetail} />
        <StatusRow label="Ads Insights" ok={adsConectado && hasCache} detail={adsDetail} />
      </div>

      {adsConectado ? (
        <div className="metaAdsInsightsBlock">
          <MetaAdsCampaignsBlock
            campaigns={campaignList}
            campaignsLoading={campaignsLoading}
            campaignsError={campaignsError}
            campaignsMensaje={campaignsMensaje}
            selectedCampaignId={selectedCampaignId}
            onSelectCampaign={onSelectCampaign}
          />

          {insightsLoading && !hasCache ? (
            <p className="metaAdsSyncHint">
              {isCampaignScope
                ? "Cargando insights de campaña desde caché…"
                : "Cargando insights desde caché…"}
            </p>
          ) : null}

          {!hasCache && !insightsLoading ? (
            <>
              <p className="metaAdsSyncHint">
                <strong>Conectado — pendiente de sincronización.</strong>
                {isCampaignScope && selectedCampaign ? (
                  <>
                    {" "}
                    Campaña: <strong>{selectedCampaign.name}</strong>.
                  </>
                ) : null}{" "}
                CTR, CPC, CPM, Frecuencia y ROAS requieren Ads API.
              </p>
              <button
                type="button"
                className="metaAdsSyncBtn"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? syncLabelPending : isCampaignScope ? syncLabel : "Sincronizar ahora"}
              </button>
            </>
          ) : null}

          {showMetrics ? (
            <>
              {isCampaignScope && selectedCampaign ? (
                <p className="metaAdsSyncHint">
                  Métricas de campaña: <strong>{selectedCampaign.name}</strong>
                </p>
              ) : null}
              <div className="metaAdsSyncMeta">
                {syncedLabel ? (
                  <span className="metaAdsSyncTime">Última sincronización: {syncedLabel}</span>
                ) : null}
                {insights?.stale ? <span className="metaAdsStaleBadge">Datos antiguos</span> : null}
                <button
                  type="button"
                  className="metaAdsSyncBtn metaAdsSyncBtn--inline"
                  onClick={onRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? "Sync…" : syncLabelInline}
                </button>
              </div>
              <MetaAdsMetricsGrid insights={insights} />
              {insights?.mensaje ? <p className="metaAdsFootnote">{insights.mensaje}</p> : null}
            </>
          ) : null}

          {refreshing ? (
            <p className="metaAdsSyncHint">
              {isCampaignScope ? "Consultando campaña en Meta Ads…" : "Consultando Meta Ads…"}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="metaAdsCopy">
          CTR, CPC, CPM, Frecuencia y ROAS requieren <strong>Ads API</strong>. Pixel y CAPI ya envían
          eventos; conecta Ads para ver inversión y rendimiento.
        </p>
      )}

      {insightsError ? <p className="metaAdsModalError">{insightsError}</p> : null}
    </div>
  );
}
