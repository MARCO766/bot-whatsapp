import React, { useEffect, useState } from "react";
import { saveMetaAdsConfig } from "./metaAdsApi";
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
          Guarda tu cuenta publicitaria y token con permisos <code>ads_read</code>. Las métricas CTR,
          CPC, CPM y ROAS se sincronizarán en una fase posterior.
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

export function MetaAdsCompactCard({ status, loading, onConnect }) {
  if (loading) {
    return <div className="metaAdsCompact metaAdsCompact--loading">Cargando estado Meta Ads…</div>;
  }

  const pixel = status?.pixel || {};
  const capi = status?.capi || {};
  const ads = status?.ads || {};

  const pixelDetail = pixel.conectado
    ? pixel.pixel_id_masked
      ? `ID ${pixel.pixel_id_masked}`
      : "Configurado"
    : "Pendiente en Ajustes → Meta Ads";
  const capiDetail = capi.conectado ? "Token CAPI guardado" : "Pendiente en Ajustes → Meta Ads";
  const adsDetail = ads.conectado
    ? ads.ad_account_id_masked
      ? `${ads.ad_account_id_masked} · ${ads.mensaje || "Pendiente de sync"}`
      : ads.mensaje || "Conectado"
    : "Pendiente — conecta tu cuenta publicitaria";

  return (
    <div className="metaAdsCompact">
      <div className="metaAdsCompactHead">
        <span className="metaAdsIcon" aria-hidden="true">
          ◆
        </span>
        <div>
          <h3>Meta Ads</h3>
          <p className="metaAdsStatus">Estado de integración</p>
        </div>
        <button type="button" className="metaAdsConnectChip" onClick={onConnect}>
          {ads.conectado ? "Actualizar Ads" : "Conectar Ads"}
        </button>
      </div>

      <div className="metaAdsStatusList">
        <StatusRow label="Pixel" ok={pixel.conectado} detail={pixelDetail} />
        <StatusRow label="CAPI" ok={capi.conectado} detail={capiDetail} />
        <StatusRow
          label="Ads Insights"
          ok={ads.conectado}
          detail={adsDetail}
        />
      </div>

      <p className="metaAdsCopy">
        {ads.conectado ? (
          <>
            <strong>Métricas reales:</strong> pendiente de sincronización. CTR, CPC, CPM, Frecuencia y
            ROAS requieren Ads API activa y sync de insights.
          </>
        ) : (
          <>
            CTR, CPC, CPM, Frecuencia y ROAS requieren <strong>Ads API</strong>. Pixel y CAPI ya
            envían eventos; los números de campaña llegarán al conectar Ads.
          </>
        )}
      </p>
    </div>
  );
}
