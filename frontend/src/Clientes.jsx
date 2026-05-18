import React, { useEffect, useState } from "react";
import { clientesStyles } from "./clientes/styles";
import { useClientes } from "./clientes/useClientes";
import LeadProfile from "./clientes/LeadProfile";
import { loginUrl, fetchFlujos } from "./clientes/api";

function fmtRel(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Hace minutos";
  if (h < 24) return `Hace ${h}h`;
  const days = Math.floor(h / 24);
  return `Hace ${days}d`;
}

function NewLeadModal({ open, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    nombre: "",
    numero: "",
    pais: "",
    fuente: "whatsapp",
    notas: "",
  });

  useEffect(() => {
    if (open) {
      setForm({ nombre: "", numero: "", pais: "", fuente: "whatsapp", notas: "" });
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="crmModalBackdrop" onClick={onClose}>
      <div className="crmModal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo lead</h2>
        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <input
          placeholder="Número WhatsApp"
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: e.target.value })}
        />
        <input
          placeholder="País"
          value={form.pais}
          onChange={(e) => setForm({ ...form, pais: e.target.value })}
        />
        <select value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })}>
          <option value="whatsapp">WhatsApp directo</option>
          <option value="meta_ads">Meta Ads</option>
          <option value="tiktok">TikTok</option>
          <option value="landing">Landing</option>
          <option value="qr">QR</option>
          <option value="organico">Orgánico</option>
        </select>
        <textarea
          placeholder="Notas"
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
        />
        <button
          type="button"
          className="crmBtn crmBtnPrimary"
          style={{ width: "100%", marginBottom: 8 }}
          disabled={saving || !form.numero.trim()}
          onClick={() => onSave(form)}
        >
          Crear lead
        </button>
        <button type="button" className="crmBtn crmBtnGhost" style={{ width: "100%" }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function LeadRow({ c, onOpen }) {
  return (
    <tr onClick={() => onOpen(c.numero)}>
      <td>
        <div className="crmUserCell">
          <div className="crmAvatar">{(c.nombre || "?").charAt(0)}</div>
          <div>
            <strong>{c.nombre}</strong>
            <p>{c.numero}</p>
          </div>
        </div>
      </td>
      <td>{c.pais || "—"}</td>
      <td>
        {c.etiquetas?.map((t) => (
          <span key={t.nombre} className="crmChip" style={{ color: t.color, borderColor: t.color }}>
            {t.nombre}
          </span>
        ))}
      </td>
      <td><span className="crmEmbudo">{c.estadoEmbudoLabel}</span></td>
      <td>{fmtRel(c.ultimaActividad)}</td>
      <td>{c.compras}</td>
      <td>${c.totalGastado}</td>
      <td>{c.fuente}</td>
      <td><span className="crmScore">{c.scoreEmoji}</span></td>
      <td>
        <button type="button" className="crmBtn crmBtnGhost" onClick={(e) => { e.stopPropagation(); onOpen(c.numero); }}>
          Ver
        </button>
      </td>
    </tr>
  );
}

function LeadCard({ c, onOpen }) {
  return (
    <div className="crmLeadCard" onClick={() => onOpen(c.numero)}>
      <div className="crmLeadCardHead">
        <div className="crmAvatar">{(c.nombre || "?").charAt(0)}</div>
        <div style={{ flex: 1 }}>
          <strong>{c.nombre}</strong>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>{c.numero}</p>
        </div>
        <span className="crmScore">{c.scoreEmoji}</span>
      </div>
      <div className="crmLeadCardMeta">
        <span>{c.pais}</span>
        <span className="crmEmbudo">{c.estadoEmbudoLabel}</span>
      </div>
      <div>
        {c.etiquetas?.slice(0, 3).map((t) => (
          <span key={t.nombre} className="crmChip" style={{ color: t.color, borderColor: t.color }}>
            {t.nombre}
          </span>
        ))}
      </div>
      <div className="crmLeadCardMeta" style={{ marginTop: 12 }}>
        <span>💰 ${c.totalGastado}</span>
        <span>{c.compras} compras</span>
        <span>{fmtRel(c.ultimaActividad)}</span>
      </div>
      <button type="button" className="crmBtn crmBtnPrimary" style={{ width: "100%", marginTop: 12 }}>
        Abrir perfil
      </button>
    </div>
  );
}

export default function Clientes({ cambiarVista }) {
  const crm = useClientes();
  const [modalNuevo, setModalNuevo] = useState(false);
  const [flujos, setFlujos] = useState(null);
  const [dragNumero, setDragNumero] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const d = crm.dashboard;

  useEffect(() => {
    fetchFlujos().then(setFlujos).catch(() => setFlujos({ flujos: [] }));
  }, []);

  async function handleKanbanDrop(colId) {
    if (!dragNumero) return;
    await crm.cambiarEmbudo(dragNumero, colId);
    setDragNumero(null);
  }

  function irBandeja(numero) {
    if (cambiarVista) {
      sessionStorage.setItem("macbot_inbox_numero", numero);
      cambiarVista("inbox");
    }
  }

  async function handleEliminar(numero) {
    const ok = await crm.eliminar(numero);
    if (ok) crm.closePerfil();
  }

  return (
    <div className="crmPage">
      <style>{clientesStyles}</style>

      {crm.toast && (
        <div className={`crmToast ${crm.toast.type === "error" ? "err" : "ok"}`}>{crm.toast.message}</div>
      )}

      <div className="crmTop">
        <div>
          <h1>👥 Clientes CRM</h1>
          <p>Centro de ventas — leads, embudo y seguimiento en tiempo real</p>
        </div>
        <div className="crmActions">
          <button type="button" className="crmBtn crmBtnPrimary" onClick={() => setModalNuevo(true)}>
            + Nuevo lead
          </button>
        </div>
      </div>

      {crm.apiError && (
        <div className="crmAlert" style={{ borderColor: "rgba(248,113,113,.4)", color: "#fecaca" }}>
          {crm.apiError.message}
          {crm.apiError.code === "NO_AUTH" && (
            <>
              {" "}
              <a href={loginUrl()} style={{ color: "#67e8f9" }}>
                Iniciar sesión
              </a>
            </>
          )}
        </div>
      )}

      {d && (
        <div className="crmDash">
          <div className="crmDashCard"><span>Total leads</span><b>{d.totalLeads}</b></div>
          <div className="crmDashCard"><span>Activos</span><b>{d.leadsActivos}</b></div>
          <div className="crmDashCard accent"><span>Compradores</span><b>{d.compradores}</b></div>
          <div className="crmDashCard accent"><span>Ingresos</span><b>${d.ingresosTotales}</b></div>
          <div className="crmDashCard"><span>🔥 Calientes</span><b>{d.leadsCalientes}</b></div>
          <div className="crmDashCard"><span>Sin responder</span><b>{d.sinResponder}</b></div>
          <div className="crmDashCard"><span>Nuevos hoy</span><b>{d.nuevosHoy}</b></div>
          <div className="crmDashCard"><span>Conversión</span><b>{d.tasaConversion}%</b></div>
        </div>
      )}

      <div className="crmToolbar">
        <input
          className="crmSearch"
          placeholder="Buscar nombre, número, etiqueta, país o texto en mensajes..."
          value={crm.filters.q}
          onChange={(e) => crm.setFilter("q", e.target.value)}
        />
        <button type="button" className="crmBtn crmBtnGhost" onClick={() => setShowFilters(!showFilters)}>
          Filtros {crm.activeFilterCount > 0 ? `(${crm.activeFilterCount})` : ""}
        </button>
        <div className="crmViewSwitch">
          {["tabla", "tarjetas", "kanban"].map((v) => (
            <button
              key={v}
              type="button"
              className={crm.vistaLista === v ? "on" : ""}
              onClick={() => crm.setVistaLista(v)}
            >
              {v === "tabla" ? "Tabla" : v === "tarjetas" ? "Tarjetas" : "Kanban"}
            </button>
          ))}
        </div>
      </div>

      {showFilters && crm.meta && (
        <div className="crmFilters">
          <select value={crm.filters.etiqueta} onChange={(e) => crm.setFilter("etiqueta", e.target.value)}>
            <option value="">Todas las etiquetas</option>
            {crm.meta.etiquetas?.map((t) => (
              <option key={t.nombre} value={t.nombre}>{t.nombre}</option>
            ))}
          </select>
          <select value={crm.filters.pais} onChange={(e) => crm.setFilter("pais", e.target.value)}>
            <option value="">Todos los países</option>
            {crm.meta.paises?.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={crm.filters.estado_embudo} onChange={(e) => crm.setFilter("estado_embudo", e.target.value)}>
            <option value="">Estado embudo</option>
            {crm.meta.embudos?.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          <select value={crm.filters.score} onChange={(e) => crm.setFilter("score", e.target.value)}>
            <option value="">Score</option>
            <option value="caliente">🔥 Caliente</option>
            <option value="medio">🟡 Medio</option>
            <option value="frio">❄️ Frío</option>
          </select>
          <select value={crm.filters.fuente} onChange={(e) => crm.setFilter("fuente", e.target.value)}>
            <option value="">Fuente</option>
            {crm.meta.fuentes?.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select value={crm.filters.comprador} onChange={(e) => crm.setFilter("comprador", e.target.value)}>
            <option value="">Comprador</option>
            <option value="true">Sí compró</option>
            <option value="false">No compró</option>
          </select>
          <select value={crm.filters.sin_responder} onChange={(e) => crm.setFilter("sin_responder", e.target.value)}>
            <option value="">Respuesta</option>
            <option value="true">Sin responder</option>
          </select>
          <input
            type="date"
            value={crm.filters.fecha_desde}
            onChange={(e) => crm.setFilter("fecha_desde", e.target.value)}
            title="Creado desde"
          />
          <button type="button" className="crmBtn crmBtnGhost" onClick={crm.resetFilters}>
            Limpiar
          </button>
        </div>
      )}

      {crm.loading ? (
        <div className="crmSkel" style={{ height: 200 }} />
      ) : crm.vistaLista === "kanban" && crm.kanban ? (
        <div className="crmKanban">
          {Object.entries(crm.kanban).map(([colId, leads]) => (
            <div
              key={colId}
              className="crmKanbanCol"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleKanbanDrop(colId)}
            >
              <h3>
                {colId.replace(/_/g, " ")}
                <span className="count">{leads.length}</span>
              </h3>
              {leads.map((c) => (
                <div
                  key={c.numero}
                  className="crmKanbanCard"
                  draggable
                  onDragStart={() => setDragNumero(c.numero)}
                  onClick={() => crm.openPerfil(c.numero)}
                >
                  <strong>{c.nombre}</strong>
                  <p style={{ margin: "4px 0", fontSize: 12, color: "#94a3b8" }}>{c.numero}</p>
                  <span>{c.scoreEmoji} · ${c.totalGastado}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : crm.clientes.length === 0 ? (
        <div className="crmEmpty">No hay leads con estos filtros. Crea uno o espera mensajes de WhatsApp.</div>
      ) : crm.vistaLista === "tarjetas" ? (
        <div className="crmGrid">
          {crm.clientes.map((c) => (
            <LeadCard key={c.numero} c={c} onOpen={crm.openPerfil} />
          ))}
        </div>
      ) : (
        <div className="crmTableWrap">
          <table className="crmTable">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>País</th>
                <th>Etiquetas</th>
                <th>Embudo</th>
                <th>Última interacción</th>
                <th>Compras</th>
                <th>Total</th>
                <th>Fuente</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {crm.clientes.map((c) => (
                <LeadRow key={c.numero} c={c} onOpen={crm.openPerfil} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crm.vistaLista !== "kanban" && crm.pagination.pages > 1 && (
        <div className="crmPagination">
          <button
            type="button"
            className="crmBtn crmBtnGhost"
            disabled={crm.page <= 1}
            onClick={() => crm.setPage(crm.page - 1)}
          >
            ←
          </button>
          <span>
            Página {crm.page} / {crm.pagination.pages} ({crm.pagination.total} leads)
          </span>
          <button
            type="button"
            className="crmBtn crmBtnGhost"
            disabled={crm.page >= crm.pagination.pages}
            onClick={() => crm.setPage(crm.page + 1)}
          >
            →
          </button>
        </div>
      )}

      {crm.perfilNumero && (
        <LeadProfile
          perfil={crm.perfil}
          timeline={crm.timeline}
          loading={crm.perfilLoading}
          meta={crm.meta}
          flujos={flujos}
          saving={crm.saving}
          onClose={crm.closePerfil}
          onGuardarNotas={crm.guardarNotas}
          onCambiarEmbudo={crm.cambiarEmbudo}
          onAgregarEtiqueta={crm.agregarEtiqueta}
          onMarcarCompra={crm.marcarCompra}
          onRecordatorio={crm.recordatorio}
          onBloquear={crm.bloquear}
          onDesbloquear={crm.desbloquear}
          onArchivar={crm.archivar}
          onEliminar={handleEliminar}
          onIniciarFlujo={crm.iniciarFlujo}
          onCancelarFlujo={crm.cancelarFlujo}
          onIrBandeja={irBandeja}
        />
      )}

      <NewLeadModal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        saving={crm.saving}
        onSave={async (form) => {
          const ok = await crm.crear(form);
          if (ok) setModalNuevo(false);
        }}
      />
    </div>
  );
}
