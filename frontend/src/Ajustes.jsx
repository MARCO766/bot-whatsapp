import React, { useEffect, useState } from "react";
import { useAjustes } from "./ajustes/useAjustes";
import { ajustesStyles } from "./ajustes/styles";
import { logout } from "./ajustes/api";

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

function estadoBadge(estado) {
  if (estado === "conectado") return <span className="badge ok">Conectado</span>;
  if (estado === "error") return <span className="badge err">Error</span>;
  if (estado === "inactivo") return <span className="badge muted">Inactivo</span>;
  return <span className="badge warn">Incompleto</span>;
}

function copyText(text, showToast) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => showToast("Copiado al portapapeles"));
}

export default function Ajustes() {
  const {
    data,
    loading,
    saving,
    error,
    toast,
    showToast,
    savePerfil,
    saveConexion,
    desconectar,
    probarWhatsapp,
    savePassword,
    probarMetaEvento,
  } = useAjustes();

  const [seccion, setSeccion] = useState("perfil");

  const [perfil, setPerfil] = useState({});
  const [auto, setAuto] = useState({});
  const [notif, setNotif] = useState({});
  const [meta, setMeta] = useState({});
  const [pwd, setPwd] = useState({ actual: "", nueva: "", confirm: "" });

  const [connForm, setConnForm] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [showCapi, setShowCapi] = useState(false);
  const [testNumero, setTestNumero] = useState("");

  useEffect(() => {
    if (!data) return;
    setPerfil({ ...data.perfil });
    setAuto({ ...data.automatizacion });
    setNotif({ ...data.notificaciones });
    const c = data.conexionActiva || data.conexionesWhatsapp?.[0];
    setMeta({
      pixelId: data.meta?.pixelId || c?.pixel_id || c?.pixelId || "",
      pixelNombre: data.meta?.pixelNombre || c?.nombre || "",
      activo: data.meta?.activo || false,
      capiToken: "",
    });
  }, [data]);

  const conexionActiva = data?.conexionActiva || data?.conexionesWhatsapp?.[0] || null;
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

  async function handleSaveMeta(e) {
    e.preventDefault();
    const c = conexionActiva;
    if (!c?.token && !meta.capiToken) {
      showToast("Primero configura WhatsApp con TOKEN y PHONE_ID", "error");
      return;
    }
    const ok = await saveConexion({
      nombre: c?.nombre || meta.pixelNombre,
      numero: c?.numero,
      token: c?.token,
      phone_id: c?.phone_id || c?.phoneNumberId,
      pixel_id: meta.pixelId,
      capi_token: meta.capiToken || c?.capi_token || undefined,
    });
    if (ok) setMeta((m) => ({ ...m, capiToken: "" }));
  }

  function abrirConfigurar() {
    const c = conexionActiva;
    setConnForm({
      nombre: c?.nombre || "",
      numero: c?.numero || "",
      token: c?.token || "",
      phone_id: c?.phone_id || c?.phoneNumberId || "",
      pixel_id: c?.pixel_id || c?.pixelId || "",
      capi_token: c?.capi_token || "",
    });
    setShowToken(false);
    setShowCapi(false);
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
    setShowToken(false);
  }

  async function handleSaveConexion(e) {
    e.preventDefault();
    const token = connForm.token || connForm.accessToken;
    const phone_id = connForm.phone_id || connForm.phoneNumberId;
    if (!token?.trim() || !phone_id?.trim()) {
      showToast("TOKEN y PHONE_ID son obligatorios", "error");
      return;
    }
    const ok = await saveConexion({
      nombre: connForm.nombre,
      numero: connForm.numero,
      token,
      phone_id,
      pixel_id: connForm.pixel_id,
      capi_token: connForm.capi_token,
    });
    if (ok) setConnForm(null);
  }

  async function handleDesconectar() {
    if (!confirm("¿Desconectar WhatsApp? Se eliminarán las credenciales guardadas.")) return;
    await desconectar();
    setConnForm(null);
  }

  async function handleProbar() {
    await probarWhatsapp(testNumero);
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
      return (
        <>
          <div className="ajCard">
            <h2>Webhook global</h2>
            <p className="ajHint">{webhook.instrucciones}</p>
            <label className="ajHint">Webhook URL</label>
            <code className="ajCode">{webhook.webhookUrl}</code>
            <button type="button" className="ajBtn ghost" onClick={() => copyText(webhook.webhookUrl, showToast)}>Copiar URL</button>
            <label className="ajHint" style={{ marginTop: 12 }}>Verify Token</label>
            <code className="ajCode">{webhook.verifyToken}</code>
            <button type="button" className="ajBtn ghost" onClick={() => copyText(webhook.verifyToken, showToast)}>Copiar token</button>
          </div>

          <div className="ajCard">
            <div className="ajConnHead">
              <h2>WhatsApp API</h2>
              <button type="button" className="ajBtn primary" onClick={abrirNuevaConexion}>+ Conectar WhatsApp</button>
            </div>
            <p className="ajHint">Una conexión activa por cuenta (igual que el panel admin Conexiones).</p>

            {!conexionActiva && <p className="ajHint">Sin conexiones. Agrega TOKEN y PHONE_ID de Meta.</p>}

            {conexionActiva && [conexionActiva].map((c) => (
              <div key={c.id} className="ajConnCard">
                <div className="ajConnHead">
                  <div>
                    <strong>{c.nombre || "WhatsApp"}</strong> {estadoBadge(c.estado)}
                    <p className="ajHint">{c.numero || "Sin número"} · PHONE_ID {c.phone_id || c.phoneNumberId}</p>
                    {c.tokenMasked && <p className="ajHint">Token: {c.tokenMasked}</p>}
                  </div>
                </div>
                <div className="ajBtnRow">
                  <button type="button" className="ajBtn primary" onClick={abrirConfigurar}>Configurar</button>
                  <button type="button" className="ajBtn ghost" onClick={handleProbar} disabled={saving}>Probar conexión</button>
                  <button type="button" className="ajBtn danger" onClick={handleDesconectar}>Desconectar</button>
                </div>
              </div>
            ))}

            <div className="ajField" style={{ marginTop: 12 }}>
              <label>Número para prueba (código país, sin +)</label>
              <input value={testNumero} onChange={(e) => setTestNumero(e.target.value)} placeholder="59170000000" />
            </div>
          </div>

          {connForm && (
            <form className="ajCard" onSubmit={handleSaveConexion}>
              <h2>{connForm.id ? "Editar conexión" : "Nueva conexión"}</h2>
              <div className="ajRow2">
                <div className="ajField">
                  <label>Nombre de conexión</label>
                  <input value={connForm.nombre} onChange={(e) => setConnForm({ ...connForm, nombre: e.target.value })} required />
                </div>
                <div className="ajField">
                  <label>Número visible</label>
                  <input value={connForm.numero} onChange={(e) => setConnForm({ ...connForm, numero: e.target.value })} placeholder="+591..." />
                </div>
              </div>
              <div className="ajField">
                <label>Phone Number ID</label>
                <input value={connForm.phoneNumberId} onChange={(e) => setConnForm({ ...connForm, phoneNumberId: e.target.value })} required />
              </div>
              <div className="ajField">
                <label>Access Token {connForm.id && <span className="ajHint">(dejar vacío para mantener)</span>}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showToken ? "text" : "password"}
                    value={connForm.accessToken}
                    onChange={(e) => setConnForm({ ...connForm, accessToken: e.target.value })}
                    placeholder={connForm.id ? "••••••••" : "EAAxxxx..."}
                    required={!connForm.id}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="ajBtn ghost" onClick={() => setShowToken((v) => !v)}>
                    {showToken ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>
              <div className="ajField">
                <label>WABA ID (opcional)</label>
                <input value={connForm.wabaId} onChange={(e) => setConnForm({ ...connForm, wabaId: e.target.value })} />
              </div>
              <SwitchRow
                label="Conexión principal (activa para envíos)"
                on={connForm.hacerPrincipal}
                onToggle={() => setConnForm({ ...connForm, hacerPrincipal: !connForm.hacerPrincipal })}
              />
              <div className="ajBtnRow">
                <button type="submit" className="ajBtn primary" disabled={saving}>Guardar conexión</button>
                <button type="button" className="ajBtn ghost" onClick={() => setConnForm(null)}>Cancelar</button>
              </div>
            </form>
          )}
        </>
      );
    }

    if (seccion === "meta") {
      return (
        <form className="ajCard" onSubmit={handleSaveMeta}>
          <h2>Meta Ads / Tracking</h2>
          <p className="ajHint">Pixel y CAPI se guardan en conexiones_whatsapp (misma tabla que Conexiones).</p>
          <div className="ajField">
            <label>Nombre del pixel</label>
            <input value={meta.pixelNombre || ""} onChange={(e) => setMeta({ ...meta, pixelNombre: e.target.value })} />
          </div>
          <div className="ajRow2">
            <div className="ajField">
              <label>Pixel ID</label>
              <input value={meta.pixelId || ""} onChange={(e) => setMeta({ ...meta, pixelId: e.target.value })} />
            </div>
            <div className="ajField">
              <label>Estado</label>
              <select value={meta.activo ? "1" : "0"} onChange={(e) => setMeta({ ...meta, activo: e.target.value === "1" })}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="ajField">
            <label>CAPI Token {data?.meta?.tieneCapiToken && <span className="ajHint">(guardado: {data.meta.capiTokenMasked})</span>}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={showCapi ? "text" : "password"}
                value={meta.capiToken}
                onChange={(e) => setMeta({ ...meta, capiToken: e.target.value })}
                placeholder="Dejar vacío para mantener el actual"
                style={{ flex: 1 }}
              />
              <button type="button" className="ajBtn ghost" onClick={() => setShowCapi((v) => !v)}>
                {showCapi ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>
          <div className="ajBtnRow">
            <button type="submit" className="ajBtn primary" disabled={saving}>Guardar Meta</button>
            <button type="button" className="ajBtn ghost" disabled={saving} onClick={() => probarMetaEvento()}>
              Enviar evento de prueba
            </button>
          </div>
        </form>
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
