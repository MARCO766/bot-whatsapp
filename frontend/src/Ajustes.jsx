import React, { useEffect, useState } from "react";
import { useAjustes } from "./ajustes/useAjustes";
import { ajustesStyles } from "./ajustes/styles";
import { logout } from "./ajustes/api";
import { fetchMetaAdsStatus } from "./metricas/metaAdsApi";

const SECCIONES = [
  { id: "perfil", label: "Perfil", icon: "👤" },
  { id: "whatsapp", label: "WhatsApp API", icon: "💬" },
  { id: "meta", label: "Meta Ads", icon: "📊" },
  { id: "auto", label: "Automatización", icon: "⚡" },
  { id: "notif", label: "Notificaciones", icon: "🔔" },
  { id: "seguridad", label: "Seguridad", icon: "🔒" },
];

const IDIOMAS = [
  { v: "es", l: "Español" },
  { v: "en", l: "English" },
  { v: "pt", l: "Português" },
];

const ZONAS = [
  "America/La_Paz",
  "America/Bogota",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
  "Europe/Madrid",
  "UTC",
];

function SwitchRow({ on, onToggle, label, hint }) {
  return (
    <div className="ajSwitchRow">
      <div>
        <strong>{label}</strong>
        {hint && <p>{hint}</p>}
      </div>
      <button type="button" className={`ajSwitch ${on ? "on" : ""}`} onClick={onToggle} aria-pressed={on}>
        <span />
      </button>
    </div>
  );
}

function sortConexiones(list) {
  return [...(list || [])].sort((a, b) => {
    if (a.activo && !b.activo) return -1;
    if (!a.activo && b.activo) return 1;
    return 0;
  });
}

function tokenConfiguredPlaceholder(masked) {
  if (!masked) return "Pega el token de Meta";
  const suffix = String(masked).slice(-4);
  return `Token configurado ••••${suffix}`;
}

function whatsappConectado(c) {
  return Boolean(c?.conectado) || c?.estado === "conectado";
}

function lineaTrackingBadges(c) {
  const waOk = whatsappConectado(c);
  const hasPixel = Boolean(c?.pixel_id || c?.pixelId);
  const hasCapi = Boolean(c?.tiene_capi_token || c?.capi_token_masked || c?.capiTokenMasked);
  return (
    <>
      {waOk ? (
        <span className="waBadge waBadgeOk">WhatsApp conectado</span>
      ) : (
        <span className="waBadge waBadgeWarn">WhatsApp pendiente</span>
      )}
      {hasPixel ? (
        <span className="waBadge waBadgeOk">Pixel activo</span>
      ) : (
        <span className="waBadge waBadgeWarn">Pixel pendiente</span>
      )}
      {hasCapi ? (
        <span className="waBadge waBadgeOk">CAPI activo</span>
      ) : (
        <span className="waBadge waBadgeWarn">CAPI pendiente</span>
      )}
    </>
  );
}

function MetaAjustesStatusRow({ label, ok, detail }) {
  return (
    <div className={`metaAjustesStatusRow ${ok ? "ok" : "pending"}`}>
      <span className="metaAjustesStatusDot" aria-hidden="true">
        {ok ? "✓" : "○"}
      </span>
      <div className="metaAjustesStatusText">
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function tituloModalConexion(form) {
  if (!form?.id) return "Agregar nueva línea";
  const nombre = (form.nombre || "").trim() || "Número";
  return `Configurar ${nombre}`;
}

function copyText(text, showToast) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => showToast("Copiado al portapapeles"));
}

export default function Ajustes({ cambiarVista }) {
  const {
    data,
    loading,
    saving,
    error,
    toast,
    showToast,
    savePerfil,
    saveConexion,
    desconectarPorId,
    hacerPrincipal,
    probarWhatsappPorId,
    savePassword,
    probarMetaEvento,
  } = useAjustes();

  const [seccion, setSeccion] = useState("perfil");

  const [perfil, setPerfil] = useState({});
  const [auto, setAuto] = useState({});
  const [notif, setNotif] = useState({});
  const [pwd, setPwd] = useState({ actual: "", nueva: "", confirm: "" });

  const [connForm, setConnForm] = useState(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [testNumero, setTestNumero] = useState("");
  const [metaAdsStatus, setMetaAdsStatus] = useState(null);
  const [metaAdsStatusLoading, setMetaAdsStatusLoading] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPerfil({ ...data.perfil });
    setAuto({ ...data.automatizacion });
    setNotif({ ...data.notificaciones });
  }, [data]);

  const conexionActiva = data?.conexionActiva || data?.conexionesWhatsapp?.[0] || null;

  useEffect(() => {
    if (seccion !== "meta" || !data) return;
    let cancelled = false;
    const connId = conexionActiva?.id;
    const params = connId != null ? { conexion_whatsapp_id: String(connId) } : {};

    async function loadMetaAdsStatus() {
      setMetaAdsStatusLoading(true);
      try {
        const res = await fetchMetaAdsStatus(params);
        if (!cancelled) setMetaAdsStatus(res);
      } catch {
        if (!cancelled) setMetaAdsStatus(null);
      } finally {
        if (!cancelled) setMetaAdsStatusLoading(false);
      }
    }

    loadMetaAdsStatus();
    return () => {
      cancelled = true;
    };
  }, [seccion, data, conexionActiva?.id]);
  const webhook = data?.webhook || {};
  async function handleSavePerfil(e) {
    e.preventDefault();
    await savePerfil({ nombre: perfil.nombre, email: perfil.email });
  }

  function handleSaveAuto() {
    showToast("Preferencias de automatización (próximamente en servidor)");
  }

  function handleSaveNotif() {
    showToast("Preferencias de notificaciones (próximamente en servidor)");
  }

  function irAMetricasMetaAds() {
    if (cambiarVista) cambiarVista("metricas");
    else showToast("Abre Métricas desde el menú lateral", "error");
  }

  function abrirConfigurar(c = conexionActiva) {
    setConnForm({
      id: c?.id,
      nombre: c?.nombre || "",
      numero: c?.numero || "",
      token: "",
      token_masked: c?.token_masked || c?.tokenMasked || null,
      phone_id: c?.phone_id || c?.phoneNumberId || "",
      pixel_id: c?.pixel_id || c?.pixelId || "",
      capi_token: "",
      capi_token_masked: c?.capi_token_masked || c?.capiTokenMasked || null,
    });
  }

  function abrirNuevaConexion() {
    setConnForm({
      nombre: "",
      numero: "",
      token: "",
      phone_id: "",
      pixel_id: "",
      capi_token: "",
    });
  }

  async function handleSaveConexion(e) {
    e.preventDefault();
    const token = (connForm.token || connForm.accessToken || "").trim();
    const phone_id = (connForm.phone_id || connForm.phoneNumberId || "").trim();
    const esEdicion = Boolean(connForm.id);

    if (!phone_id) {
      showToast("PHONE_ID es obligatorio", "error");
      return;
    }
    if (!esEdicion && !token) {
      showToast("TOKEN es obligatorio en una conexión nueva", "error");
      return;
    }
    if (esEdicion && !token && !connForm.token_masked && !connForm.tokenMasked) {
      showToast("Indica el TOKEN o reconecta la conexión", "error");
      return;
    }

    const body = {
      nombre: connForm.nombre,
      numero: connForm.numero,
      phone_id,
      pixel_id: connForm.pixel_id,
    };
    if (connForm.id) body.id = connForm.id;
    if (token) body.token = token;
    const capi = (connForm.capi_token || "").trim();
    if (capi) body.capi_token = capi;

    const ok = await saveConexion(body);
    if (ok) setConnForm(null);
  }

  async function handleDesconectarId(id) {
    if (!confirm("¿Desconectar esta conexión de WhatsApp?")) return;
    await desconectarPorId(id);
    setConnForm(null);
  }

  async function handleProbarId(id) {
    await probarWhatsappPorId(id, testNumero);
  }

  async function handleHacerPrincipal(id) {
    await hacerPrincipal(id);
  }

  async function handlePassword(e) {
    e.preventDefault();
    if (pwd.nueva !== pwd.confirm) {
      showToast("Las contraseñas no coinciden", "error");
      return;
    }
    const ok = await savePassword({ actual: pwd.actual, nueva: pwd.nueva });
    if (ok) setPwd({ actual: "", nueva: "", confirm: "" });
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="ajCard">
          <div className="skel h40" />
          <div className="skel h40" />
          <div className="skel h120" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="ajErrorBox">
          <strong>No se pudieron cargar los ajustes</strong>
          <p>{error}</p>
          <p className="ajHint">Inicia sesión en <a href="/login" style={{ color: "#86efac" }}>/login</a> y vuelve aquí.</p>
        </div>
      );
    }

    if (seccion === "perfil") {
      return (
        <form className="ajCard" onSubmit={handleSavePerfil}>
          <h2>Perfil</h2>
          <div className="ajRow2">
            <div className="ajField">
              <label>Nombre</label>
              <input value={perfil.nombre || ""} onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })} />
            </div>
            <div className="ajField">
              <label>Email</label>
              <input type="email" value={perfil.email || ""} onChange={(e) => setPerfil({ ...perfil, email: e.target.value })} />
            </div>
          </div>
          <div className="ajField">
            <label>Empresa</label>
            <input value={perfil.empresa || ""} onChange={(e) => setPerfil({ ...perfil, empresa: e.target.value })} />
          </div>
          <div className="ajRow2">
            <div className="ajField">
              <label>Zona horaria</label>
              <select value={perfil.zonaHoraria || ZONAS[0]} onChange={(e) => setPerfil({ ...perfil, zonaHoraria: e.target.value })}>
                {ZONAS.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div className="ajField">
              <label>Idioma</label>
              <select value={perfil.idioma || "es"} onChange={(e) => setPerfil({ ...perfil, idioma: e.target.value })}>
                {IDIOMAS.map((i) => (
                  <option key={i.v} value={i.v}>{i.l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="ajBtnRow">
            <button type="submit" className="ajBtn primary" disabled={saving}>Guardar perfil</button>
          </div>
        </form>
      );
    }

    if (seccion === "whatsapp") {
      const conexionesOrdenadas = sortConexiones(data?.conexionesWhatsapp);
      const editandoId = connForm?.id ? String(connForm.id) : null;

      return (
        <>
          <div className={`waAccordion ${webhookOpen ? "open" : ""}`}>
            <button
              type="button"
              className="waAccordionBtn"
              onClick={() => setWebhookOpen((v) => !v)}
              aria-expanded={webhookOpen}
            >
              <span>Webhook y verificación</span>
              <span className="waAccordionChevron">▼</span>
            </button>
            {webhookOpen && (
              <div className="waAccordionBody">
                <p className="ajHint">{webhook.instrucciones}</p>
                <label className="ajHint">Webhook URL</label>
                <code className="ajCode">{webhook.webhookUrl}</code>
                <button type="button" className="ajBtn ghost" onClick={() => copyText(webhook.webhookUrl, showToast)}>
                  Copiar URL
                </button>
                <label className="ajHint" style={{ marginTop: 12 }}>Verify Token</label>
                <code className="ajCode">{webhook.verifyToken}</code>
                <button type="button" className="ajBtn ghost" onClick={() => copyText(webhook.verifyToken, showToast)}>
                  Copiar token
                </button>
              </div>
            )}
          </div>

          <div className="ajCard waConnectionsWrap">
            <header className="waSectionHead">
              <div className="waSectionHeadText">
                <h2 className="waSectionTitle">Líneas WhatsApp</h2>
                <p className="waSectionSub">Multi-número · principal primero</p>
              </div>
              <button type="button" className="waBtnAddLine" onClick={abrirNuevaConexion}>
                + Agregar línea
              </button>
            </header>

            <div className="waConnList">
              {conexionesOrdenadas.length === 0 && (
                <p className="waEmptyHint">Sin líneas conectadas. Usa «+ Agregar línea» para empezar.</p>
              )}
              {conexionesOrdenadas.map((c) => {
                const isEditing = editandoId && String(c.id) === editandoId;
                return (
                  <article
                    key={c.id}
                    className={`waConnRow ${c.activo ? "waConnRowPrincipal" : ""} ${isEditing ? "waConnRowEditing" : ""}`}
                  >
                    <div className="waConnRowMain">
                      <div className="waConnRowTop">
                        <h3 className="waConnName">{c.nombre || "WhatsApp"}</h3>
                        <span className="waConnNumero">{c.numero || "Sin número"}</span>
                      </div>
                      <div className="waConnRowMeta">
                        {lineaTrackingBadges(c)}
                        {c.activo && <span className="waBadge waBadgePrincipal">Principal</span>}
                        {isEditing && <span className="waBadge waBadgeEditing">Editando</span>}
                      </div>
                    </div>
                    <div className="waConnRowActions">
                      <button type="button" className="waActBtn waActBtnPrimary" onClick={() => abrirConfigurar(c)}>
                        Configurar
                      </button>
                      <button
                        type="button"
                        className="waActBtn waActBtnGhost"
                        onClick={() => handleProbarId(c.id)}
                        disabled={saving}
                      >
                        Probar
                      </button>
                      {!c.activo && (
                        <button
                          type="button"
                          className="waActBtn waActBtnGhost"
                          onClick={() => handleHacerPrincipal(c.id)}
                          disabled={saving}
                        >
                          Principal
                        </button>
                      )}
                      <button type="button" className="waActBtn waActBtnDanger" onClick={() => handleDesconectarId(c.id)}>
                        Desconectar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="ajField waTestField">
              <label>Número para prueba (código país, sin +)</label>
              <input value={testNumero} onChange={(e) => setTestNumero(e.target.value)} placeholder="59170000000" />
            </div>
          </div>

          {connForm && (
            <>
              <div className="waModalBackdrop" onClick={() => setConnForm(null)} aria-hidden />
              <form className="waModalPanel" onSubmit={handleSaveConexion} role="dialog" aria-modal="true">
                <div className="waModalHead">
                  <h2>{tituloModalConexion(connForm)}</h2>
                  <button type="button" className="waModalClose" onClick={() => setConnForm(null)} aria-label="Cerrar">
                    ×
                  </button>
                </div>
                <div className="waModalBody">
                  <section className="waModalGroup">
                    <h3 className="waModalGroupTitle">WhatsApp API</h3>
                    <div className="ajField">
                      <label>Número</label>
                      <input
                        value={connForm.numero}
                        onChange={(e) => setConnForm({ ...connForm, numero: e.target.value })}
                        placeholder="+591…"
                      />
                    </div>
                    <div className="ajField">
                      <label>Phone ID</label>
                      <input
                        value={connForm.phone_id}
                        onChange={(e) => setConnForm({ ...connForm, phone_id: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ajField">
                      <label>
                        Access Token
                        {connForm.id && <span className="ajHint"> (vacío = conservar)</span>}
                      </label>
                      <input
                        type="password"
                        value={connForm.token}
                        onChange={(e) => setConnForm({ ...connForm, token: e.target.value })}
                        placeholder={
                          connForm.id
                            ? tokenConfiguredPlaceholder(connForm.token_masked || connForm.tokenMasked)
                            : "EAAxxxx…"
                        }
                        autoComplete="off"
                        required={!connForm.id}
                      />
                    </div>
                    <div className="ajField">
                      <label>Nombre de la línea</label>
                      <input
                        value={connForm.nombre}
                        onChange={(e) => setConnForm({ ...connForm, nombre: e.target.value })}
                        placeholder="Ventas, Soporte…"
                        required
                      />
                    </div>
                  </section>
                  <section className="waModalGroup">
                    <h3 className="waModalGroupTitle">Tracking Meta de esta línea</h3>
                    <p className="waModalGroupHint">
                      Pixel y CAPI de esta línea. No uses la sección Meta Ads global para esto.
                    </p>
                    <div className="ajField">
                      <label>Pixel ID</label>
                      <input
                        value={connForm.pixel_id}
                        onChange={(e) => setConnForm({ ...connForm, pixel_id: e.target.value })}
                        placeholder="ID del pixel"
                      />
                    </div>
                    <div className="ajField">
                      <label>
                        CAPI Token
                        {connForm.id && <span className="ajHint"> (vacío = conservar)</span>}
                      </label>
                      <input
                        type="password"
                        value={connForm.capi_token}
                        onChange={(e) => setConnForm({ ...connForm, capi_token: e.target.value })}
                        placeholder={tokenConfiguredPlaceholder(
                          connForm.capi_token_masked || connForm.capiTokenMasked
                        )}
                        autoComplete="off"
                      />
                    </div>
                    {connForm.id ? (
                      <button
                        type="button"
                        className="ajBtn ghost waModalTestBtn"
                        disabled={saving}
                        onClick={() => probarMetaEvento({ conexion_whatsapp_id: connForm.id })}
                      >
                        Enviar evento de prueba de esta línea
                      </button>
                    ) : null}
                  </section>
                </div>
                <div className="waModalFoot">
                  <button type="submit" className="ajBtn primary" disabled={saving}>
                    Guardar
                  </button>
                  <button type="button" className="ajBtn ghost" onClick={() => setConnForm(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            </>
          )}
        </>
      );
    }

    if (seccion === "meta") {
      const ads = metaAdsStatus?.ads || {};
      const adsConectado = Boolean(ads.conectado);
      const insightsOk = adsConectado && Boolean(ads.ultimo_sync);
      const cuentaDetail = adsConectado
        ? ads.ad_account_id_masked
          ? `Cuenta ${ads.ad_account_id_masked}`
          : "Cuenta publicitaria configurada"
        : "Conecta Ad Account y token en Métricas";
      const insightsDetail = insightsOk
        ? "Insights sincronizados"
        : adsConectado
          ? "Conectado — sincroniza en Métricas"
          : "Requiere cuenta publicitaria conectada";

      return (
        <div className="ajCard">
          <h2>Meta Ads</h2>
          <p className="metaAjustesIntro">
            <strong>Pixel y CAPI se configuran dentro de cada línea WhatsApp.</strong> Esta sección es solo
            para métricas publicitarias y Ads Insights.
          </p>
          <p className="metaAjustesNote">
            Ve a <strong>WhatsApp API</strong> en el menú lateral para Pixel ID, CAPI Token y eventos de prueba
            por línea.
          </p>

          {metaAdsStatusLoading ? (
            <p className="metaAjustesLoading">Cargando estado de integración…</p>
          ) : (
            <div className="metaAjustesStatusList">
              <MetaAjustesStatusRow
                label="Cuenta publicitaria"
                ok={adsConectado}
                detail={cuentaDetail}
              />
              <MetaAjustesStatusRow
                label="Ads Insights"
                ok={insightsOk}
                detail={insightsDetail}
              />
            </div>
          )}

          <div className="ajBtnRow">
            <button type="button" className="ajBtn primary" onClick={irAMetricasMetaAds}>
              {adsConectado ? "Ir a Métricas Meta Ads" : "Configurar Ads en Métricas"}
            </button>
          </div>
        </div>
      );
    }

    if (seccion === "auto") {
      return (
        <div className="ajCard">
          <h2>Automatización</h2>
          <SwitchRow
            label="Detener seguimientos si el lead responde"
            hint="Cancela seguimientos pendientes al recibir mensaje del cliente."
            on={!!auto.detenerSeguimientosSiResponde}
            onToggle={() => setAuto({ ...auto, detenerSeguimientosSiResponde: !auto.detenerSeguimientosSiResponde })}
          />
          <SwitchRow
            label="Evitar activar el mismo flujo dos veces"
            hint="Reduce activaciones duplicadas en paralelo."
            on={!!auto.evitarFlujoDuplicado}
            onToggle={() => setAuto({ ...auto, evitarFlujoDuplicado: !auto.evitarFlujoDuplicado })}
          />
          <SwitchRow
            label="Modo seguro anti-spam"
            on={!!auto.modoSeguroAntiSpam}
            onToggle={() => setAuto({ ...auto, modoSeguroAntiSpam: !auto.modoSeguroAntiSpam })}
          />
          <div className="ajField">
            <label>Zona horaria (automatización)</label>
            <select value={auto.zonaHoraria || ZONAS[0]} onChange={(e) => setAuto({ ...auto, zonaHoraria: e.target.value })}>
              {ZONAS.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>
          <div className="ajField">
            <label>Cooldown global de activadores (minutos)</label>
            <input
              type="number"
              min={0}
              max={1440}
              value={auto.cooldownActivadoresMin ?? 5}
              onChange={(e) => setAuto({ ...auto, cooldownActivadoresMin: Number(e.target.value) })}
            />
          </div>
          <div className="ajBtnRow">
            <button type="button" className="ajBtn primary" disabled={saving} onClick={handleSaveAuto}>Guardar automatización</button>
          </div>
        </div>
      );
    }

    if (seccion === "notif") {
      return (
        <div className="ajCard">
          <h2>Notificaciones</h2>
          <SwitchRow label="Sonido nuevo mensaje" on={!!notif.sonidoNuevoMensaje} onToggle={() => setNotif({ ...notif, sonidoNuevoMensaje: !notif.sonidoNuevoMensaje })} />
          <SwitchRow label="Alerta lead sin responder" on={!!notif.alertaLeadSinResponder} onToggle={() => setNotif({ ...notif, alertaLeadSinResponder: !notif.alertaLeadSinResponder })} />
          <SwitchRow label="Alerta conversión" on={!!notif.alertaConversion} onToggle={() => setNotif({ ...notif, alertaConversion: !notif.alertaConversion })} />
          <SwitchRow label="Alerta error de conexión" on={!!notif.alertaErrorConexion} onToggle={() => setNotif({ ...notif, alertaErrorConexion: !notif.alertaErrorConexion })} />
          <div className="ajBtnRow">
            <button type="button" className="ajBtn primary" disabled={saving} onClick={handleSaveNotif}>Guardar notificaciones</button>
          </div>
        </div>
      );
    }

    if (seccion === "seguridad") {
      return (
        <>
          <form className="ajCard" onSubmit={handlePassword}>
            <h2>Cambiar contraseña</h2>
            <div className="ajField">
              <label>Contraseña actual</label>
              <input type="password" value={pwd.actual} onChange={(e) => setPwd({ ...pwd, actual: e.target.value })} autoComplete="current-password" />
            </div>
            <div className="ajRow2">
              <div className="ajField">
                <label>Nueva contraseña</label>
                <input type="password" value={pwd.nueva} onChange={(e) => setPwd({ ...pwd, nueva: e.target.value })} autoComplete="new-password" />
              </div>
              <div className="ajField">
                <label>Confirmar</label>
                <input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" />
              </div>
            </div>
            <button type="submit" className="ajBtn primary" disabled={saving}>Actualizar contraseña</button>
          </form>
          <div className="ajCard">
            <h2>Sesión</h2>
            <p className="ajHint">Los tokens de API nunca se guardan en el navegador. Solo en el servidor.</p>
            <div className="ajBtnRow">
              <button type="button" className="ajBtn danger" onClick={() => logout()}>Cerrar sesión</button>
            </div>
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="ajustesPage">
      <style>{ajustesStyles}</style>

      {toast && (
        <div className={`ajToast ${toast.type === "error" ? "err" : "ok"}`}>{toast.message}</div>
      )}

      <div className="ajustesTop">
        <h1>Ajustes</h1>
        <p>Conecta tu CRM, WhatsApp y preferencias de cuenta.</p>
      </div>

      <div className="ajustesLayout">
        <nav className="ajustesSide">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={seccion === s.id ? "active" : ""}
              onClick={() => setSeccion(s.id)}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </nav>
        <main className="ajustesMain">{renderContent()}</main>
      </div>
    </div>
  );
}
