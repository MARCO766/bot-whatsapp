/**
 * Correo de bienvenida MacBot CRM — tras verificar PIN de registro.
 */
const { sendEmail, getAppUrl, isPasswordResetEmailConfigured } = require("./emailService");
const { escapeHtml } = require("../routes/authPageLayout");

const SUBJECT = "🎉 Bienvenido a MacBot CRM";

const PRIMEROS_PASOS = [
  "Conecta tu WhatsApp en Ajustes",
  "Crea tu primer flujo en el builder",
  "Activa un nodo de IA en tu embudo",
  "Recibe y atiende tu primer lead en la bandeja",
];

/**
 * @param {{ nombre: string, email: string }} usuario
 */
async function enviarCorreoBienvenida(usuario) {
  if (!isPasswordResetEmailConfigured()) {
    console.log("[welcome] correo no configurado — omitiendo bienvenida");
    return { ok: false, skipped: true };
  }

  const nombre = String(usuario?.nombre || "usuario").trim() || "usuario";
  const email = String(usuario?.email || "").trim().toLowerCase();
  if (!email) {
    return { ok: false, skipped: true };
  }

  const crmUrl = getAppUrl() || "https://app.macbot.io";
  const pasosHtml = PRIMEROS_PASOS.map(
    (p, i) =>
      `<li style="margin:0 0 10px;padding-left:4px"><span style="color:#22c55e;font-weight:700">${i + 1}.</span> ${escapeHtml(p)}</li>`
  ).join("");

  const text = [
    `Hola ${nombre},`,
    "",
    "Tu cuenta en MacBot CRM ya está activada.",
    "",
    `Entra al CRM: ${crmUrl}`,
    "",
    "Primeros pasos:",
    ...PRIMEROS_PASOS.map((p, i) => `${i + 1}. ${p}`),
    "",
    "— Equipo MacBot",
  ].join("\n");

  const html = [
    '<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a;background:#f8fafc;border-radius:16px">',
    '<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#22c55e;letter-spacing:.04em">MACBOT CRM</p>',
    `<h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a">Hola ${escapeHtml(nombre)} 👋</h1>`,
    '<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569">Tu cuenta está <strong style="color:#0f172a">activada</strong>. Ya puedes automatizar ventas por WhatsApp con flujos, IA y CRM en un solo lugar.</p>',
    `<p style="margin:0 0 24px"><a href="${escapeHtml(crmUrl)}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#39ff14,#22c55e);color:#050816;font-weight:800;text-decoration:none;border-radius:12px;font-size:15px">Entrar al CRM</a></p>`,
    '<p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f172a">Tus primeros pasos</p>',
    `<ol style="margin:0 0 24px;padding-left:20px;color:#475569;font-size:15px;line-height:1.5">${pasosHtml}</ol>`,
    '<p style="margin:0;font-size:13px;color:#94a3b8">— Equipo MacBot</p>',
    "</div>",
  ].join("");

  await sendEmail({ to: email, subject: SUBJECT, text, html });
  console.log(`[welcome] correo enviado email=${email}`);
  return { ok: true };
}

module.exports = {
  SUBJECT,
  enviarCorreoBienvenida,
};
