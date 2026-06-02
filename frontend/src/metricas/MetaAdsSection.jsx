import React, { useEffect, useState } from "react";
import { saveMetaAdsConfig } from "./metaAdsApi";
import { formatNum, formatPct } from "./format";
import { apiConexionWhatsappParam } from "../utils/conexionesInbox";

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
  onConnect,
  onRefresh,
}) {
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
          {insightsLoading && !hasCache ? (
            <p className="metaAdsSyncHint">Cargando insights desde caché…</p>
          ) : null}

          {!hasCache && !insightsLoading ? (
            <>
              <p className="metaAdsSyncHint">
                <strong>Conectado — pendiente de sincronización.</strong> CTR, CPC, CPM, Frecuencia y
                ROAS requieren Ads API.
              </p>
              <button
                type="button"
                className="metaAdsSyncBtn"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
            </>
          ) : null}

          {showMetrics ? (
            <>
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
                  {refreshing ? "Sync…" : "Sincronizar"}
                </button>
              </div>
              <MetaAdsMetricsGrid insights={insights} />
              {insights?.mensaje ? <p className="metaAdsFootnote">{insights.mensaje}</p> : null}
            </>
          ) : null}

          {refreshing ? <p className="metaAdsSyncHint">Consultando Meta Ads…</p> : null}
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
