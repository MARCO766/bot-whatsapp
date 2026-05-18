import React, { useState, useEffect } from "react";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-BO", {
    timeZone: "America/La_Paz",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function LeadProfile({
  perfil,
  timeline,
  loading,
  meta,
  flujos,
  saving,
  onClose,
  onGuardarNotas,
  onCambiarEmbudo,
  onAgregarEtiqueta,
  onMarcarCompra,
  onRecordatorio,
  onBloquear,
  onDesbloquear,
  onArchivar,
  onEliminar,
  onIniciarFlujo,
  onCancelarFlujo,
  onIrBandeja,
}) {
  const [notas, setNotas] = useState("");
  const [etiquetaSel, setEtiquetaSel] = useState("");
  const [flujoSel, setFlujoSel] = useState("");
  const [valorCompra, setValorCompra] = useState("39");

  useEffect(() => {
    if (perfil?.cliente) setNotas(perfil.cliente.notas || "");
  }, [perfil?.cliente?.numero, perfil?.cliente?.notas]);

  if (!perfil?.cliente && !loading) return null;

  const c = perfil?.cliente;
  const m = perfil?.metricas || {};
  const pendientes = perfil?.seguimientosPendientes || [];

  function recordatorioRapido(dias, nota) {
    if (!c) return;
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(10, 0, 0, 0);
    onRecordatorio(c.numero, { nota, run_at: d.toISOString() });
  }

  return (
    <>
      <DrawerBackdrop onClose={onClose} />
      <div className="crmDrawer">
        <button type="button" className="crmDrawerClose" onClick={onClose}>
          ×
        </button>

        {loading ? (
          <>
            <div className="crmSkel" style={{ height: 120, marginBottom: 12 }} />
            <div className="crmSkel" />
          </>
        ) : (
          <>
            <div className="crmUserCell" style={{ marginBottom: 16 }}>
              <div className="crmAvatar" style={{ width: 56, height: 56, fontSize: 22 }}>
                {(c.nombre || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{c.nombre}</h2>
                <p style={{ margin: "4px 0", color: "#94a3b8" }}>{c.numero}</p>
                <span className="crmScore" title={c.score}>
                  {c.scoreEmoji} {c.score}
                </span>
                {c.sinResponder && <span className="crmBadgeUnread" title="Sin responder" />}
              </div>
            </div>

            {pendientes.length > 0 && (
              <div className="crmAlert">
                ⏰ {pendientes.length} seguimiento(s) pendiente(s)
              </div>
            )}

            <div className="crmSection">
              <h3>Info</h3>
              <p>
                <strong>País:</strong> {c.pais || "—"} · <strong>Fuente:</strong> {c.fuente}
              </p>
              <p>
                <strong>Creado:</strong> {fmtDate(c.creadoEn)} · <strong>Última actividad:</strong>{" "}
                {fmtDate(c.ultimaActividad)}
              </p>
              <div style={{ margin: "10px 0" }}>
                {c.etiquetas?.map((t) => (
                  <span
                    key={t.nombre}
                    className="crmChip"
                    style={{ color: t.color, borderColor: t.color }}
                  >
                    {t.nombre}
                  </span>
                ))}
              </div>
              <span className="crmEmbudo">{c.estadoEmbudoLabel}</span>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas privadas..."
                style={{
                  width: "100%",
                  marginTop: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,.15)",
                  background: "#111827",
                  color: "#fff",
                  padding: 12,
                  minHeight: 80,
                }}
              />
              <button
                type="button"
                className="crmBtn crmBtnGhost"
                style={{ marginTop: 8 }}
                disabled={saving}
                onClick={() => onGuardarNotas(c.numero, notas)}
              >
                Guardar notas
              </button>
            </div>

            <div className="crmSection">
              <h3>Métricas</h3>
              <div className="crmMetrics">
                <div className="crmMetric">
                  <span>Compras</span>
                  <b>{m.totalCompras ?? c.compras ?? 0}</b>
                </div>
                <div className="crmMetric">
                  <span>Ingresos</span>
                  <b>${m.ingresos ?? c.totalGastado ?? 0}</b>
                </div>
                <div className="crmMetric">
                  <span>Tasa respuesta</span>
                  <b>{m.tasaRespuesta ?? 0}%</b>
                </div>
                <div className="crmMetric">
                  <span>Tiempo resp. (min)</span>
                  <b>{m.tiempoRespuestaMin ?? "—"}</b>
                </div>
              </div>
            </div>

            <div className="crmSection">
              <h3>Acciones rápidas</h3>
              <div className="crmQuickActions">
                <button type="button" className="crmBtn crmBtnPrimary" onClick={() => onIrBandeja(c.numero)}>
                  💬 Mensaje
                </button>
                <select
                  value={c.estadoEmbudo}
                  onChange={(e) => onCambiarEmbudo(c.numero, e.target.value)}
                  style={{ borderRadius: 10, padding: 8, background: "#111827", color: "#fff" }}
                >
                  {(meta?.embudos || []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
                <select
                  value={etiquetaSel}
                  onChange={(e) => setEtiquetaSel(e.target.value)}
                  style={{ borderRadius: 10, padding: 8, background: "#111827", color: "#fff" }}
                >
                  <option value="">+ Etiqueta</option>
                  {(meta?.etiquetas || []).map((t) => (
                    <option key={t.nombre} value={t.nombre}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="crmBtn crmBtnGhost"
                  disabled={!etiquetaSel || saving}
                  onClick={() => {
                    onAgregarEtiqueta(c.numero, etiquetaSel);
                    setEtiquetaSel("");
                  }}
                >
                  Aplicar
                </button>
              </div>
              <div className="crmQuickActions" style={{ marginTop: 8 }}>
                <button type="button" className="crmBtn crmBtnGhost" onClick={() => recordatorioRapido(1, "Escribir mañana")}>
                  Mañana
                </button>
                <button type="button" className="crmBtn crmBtnGhost" onClick={() => recordatorioRapido(3, "Seguimiento 3 días")}>
                  3 días
                </button>
                <input
                  type="number"
                  value={valorCompra}
                  onChange={(e) => setValorCompra(e.target.value)}
                  style={{
                    width: 70,
                    borderRadius: 8,
                    padding: 8,
                    background: "#111827",
                    color: "#fff",
                    border: "none",
                  }}
                />
                <button
                  type="button"
                  className="crmBtn crmBtnPrimary"
                  disabled={saving}
                  onClick={() => onMarcarCompra(c.numero, parseFloat(valorCompra) || 0)}
                >
                  💰 Compra
                </button>
              </div>
              <div className="crmQuickActions" style={{ marginTop: 8 }}>
                <select
                  value={flujoSel}
                  onChange={(e) => setFlujoSel(e.target.value)}
                  style={{ flex: 1, borderRadius: 10, padding: 8, background: "#111827", color: "#fff" }}
                >
                  <option value="">Iniciar flujo...</option>
                  {(flujos?.flujos || []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="crmBtn crmBtnGhost"
                  disabled={!flujoSel || saving}
                  onClick={() => onIniciarFlujo(c.numero, flujoSel)}
                >
                  ▶
                </button>
                <button type="button" className="crmBtn crmBtnGhost" disabled={saving} onClick={() => onCancelarFlujo(c.numero)}>
                  ⏹
                </button>
                {c.bloqueado ? (
                  <button type="button" className="crmBtn crmBtnGhost" disabled={saving} onClick={() => onDesbloquear(c.numero)}>
                    Desbloquear
                  </button>
                ) : (
                  <button type="button" className="crmBtn crmBtnDanger" disabled={saving} onClick={() => onBloquear(c.numero)}>
                    Bloquear
                  </button>
                )}
                <button type="button" className="crmBtn crmBtnGhost" disabled={saving} onClick={() => onArchivar(c.numero)}>
                  Archivar
                </button>
                <button
                  type="button"
                  className="crmBtn crmBtnDanger"
                  disabled={saving}
                  onClick={() => {
                    if (confirm("¿Eliminar lead y todo su historial?")) onEliminar(c.numero);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div className="crmSection">
              <h3>Timeline</h3>
              <div className="crmTimeline">
                {timeline.length === 0 && <p className="crmEmpty">Sin eventos</p>}
                {timeline.map((ev) => (
                  <div key={ev.id} className="crmTimelineItem">
                    <time>{fmtDate(ev.fecha)}</time>
                    <div>
                      <strong>{ev.titulo}</strong>
                      {ev.detalle && (
                        <p style={{ margin: "4px 0", color: "#94a3b8", fontSize: 13 }}>{ev.detalle}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DrawerBackdrop({ onClose }) {
  return <div className="crmDrawerBackdrop" onClick={onClose} role="presentation" />;
}
