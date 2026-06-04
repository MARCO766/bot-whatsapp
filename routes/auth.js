const express = require("express");
const router = express.Router();

const axios = require("axios");
const bcrypt = require("bcryptjs");
const {
  escapeHtml,
  renderAuthPage,
  PASSWORD_TOGGLE_SCRIPT,
} = require("./authPageLayout");
const {
  renderLoginLandingPage,
  renderRegisterPage,
} = require("./premiumLandingLayout");
const { renderPricingPage } = require("./pricingPageLayout");
const { renderLogoutPage } = require("./logoutPageLayout");
const {
  generarTokenReset,
  validarTokenReset,
  limpiarTokenReset,
} = require("../services/passwordResetService");
const { getAppUrl, sendEmail, isPasswordResetEmailConfigured } = require("../services/emailService");
const {
  startRegistration,
  verifyRegistration,
  resendPin,
} = require("../services/registerVerificationService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const FORGOT_SUCCESS_MSG =
  "Si el correo existe, recibirás instrucciones para restablecer tu contraseña.";

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function buscarUsuarioActivoPorEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const response = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?email=eq.${encodeURIComponent(normalized)}&activo=eq.true&select=id,email,nombre`,
    { headers: supabaseHeaders() }
  );

  return response.data?.[0] || null;
}

async function enviarCorreoReset(usuario, token) {
  const resetLink = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const nombre = usuario.nombre || "usuario";

  await sendEmail({
    to: usuario.email,
    subject: "Restablecer contraseña · MacBot",
    text: [
      `Hola ${nombre},`,
      "",
      "Recibimos una solicitud para restablecer tu contraseña en MacBot.",
      "Si fuiste tú, abre este enlace (válido 1 hora):",
      resetLink,
      "",
      "Si no solicitaste este cambio, ignora este correo.",
      "",
      "— Equipo MacBot",
    ].join("\n"),
    html: [
      `<p>Hola ${escapeHtml(nombre)},</p>`,
      "<p>Recibimos una solicitud para restablecer tu contraseña en MacBot.</p>",
      `<p><a href="${escapeHtml(resetLink)}">Restablecer contraseña</a></p>`,
      "<p>El enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>",
      "<p>— Equipo MacBot</p>",
    ].join(""),
  });
}

function renderForgotPage({ sent = false, emailValue = "" } = {}) {
  const messageHtml = sent
    ? `<p class="mb-login__message mb-login__message--info">${escapeHtml(FORGOT_SUCCESS_MSG)}</p>`
    : "";

  const cardBody = `
      ${messageHtml}
      <form class="mb-login__form" method="POST" action="/forgot-password">
        <div class="mb-login__field">
          <label class="mb-login__label" for="email">Correo electrónico</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>
            </svg>
            <input class="mb-login__input" id="email" name="email" type="email" placeholder="tu@empresa.com" required autocomplete="email" value="${escapeHtml(emailValue)}">
          </div>
        </div>
        <button type="submit" class="mb-login__submit">Enviar instrucciones</button>
      </form>
      <p class="mb-login__secure">🔒 No revelamos si el correo está registrado</p>
      <a href="/login" class="mb-login__back">← Volver a iniciar sesión</a>
  `;

  return renderAuthPage({
    documentTitle: "Recuperar contraseña · MacBot",
    cardTitle: "Recuperar contraseña",
    cardSubtitle: "Te enviaremos un enlace para restablecer tu acceso",
    cardBody,
    scripts: `
<script>
(function(){
  var form=document.querySelector(".mb-login__form");
  if(form){
    form.addEventListener("submit",function(){
      var sub=form.querySelector(".mb-login__submit");
      if(sub&&!sub.disabled){
        sub.disabled=true;
        sub.textContent="Enviando...";
      }
    });
  }
})();
</script>`,
  });
}

function renderResetInvalidPage() {
  const cardBody = `
      <p class="mb-login__message mb-login__message--error">Este enlace no es válido o ha expirado. Solicita uno nuevo.</p>
      <a href="/forgot-password" class="mb-login__submit" style="display:block;text-align:center;text-decoration:none">Solicitar nuevo enlace</a>
      <a href="/login" class="mb-login__back">← Volver a iniciar sesión</a>
  `;

  return renderAuthPage({
    documentTitle: "Enlace inválido · MacBot",
    cardTitle: "Enlace inválido",
    cardSubtitle: "No pudimos validar tu solicitud de restablecimiento",
    cardBody,
  });
}

function renderResetFormPage({ token, errorMsg = "" }) {
  const errorHtml = errorMsg
    ? `<p class="mb-login__message mb-login__message--error">${escapeHtml(errorMsg)}</p>`
    : "";

  const cardBody = `
      ${errorHtml}
      <form class="mb-login__form" method="POST" action="/reset-password">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <div class="mb-login__field">
          <label class="mb-login__label" for="password">Nueva contraseña</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>
            </svg>
            <input class="mb-login__input mb-login__input--password" id="password" name="password" type="password" placeholder="Mínimo 6 caracteres" required minlength="6" autocomplete="new-password">
            <button type="button" class="mb-login__toggle-pwd" aria-label="Mostrar contraseña" data-toggle-password>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-login__eye-open" aria-hidden="true">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-login__eye-closed" style="display:none" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
        <button type="submit" class="mb-login__submit">Guardar nueva contraseña</button>
      </form>
      <p class="mb-login__secure">🔒 El enlace expira en 1 hora</p>
      <a href="/login" class="mb-login__back">← Volver a iniciar sesión</a>
  `;

  return renderAuthPage({
    documentTitle: "Nueva contraseña · MacBot",
    cardTitle: "Nueva contraseña",
    cardSubtitle: "Elige una contraseña segura para tu cuenta",
    cardBody,
    scripts: `${PASSWORD_TOGGLE_SCRIPT}
<script>
(function(){
  var form=document.querySelector(".mb-login__form");
  if(form){
    form.addEventListener("submit",function(){
      var sub=form.querySelector(".mb-login__submit");
      if(sub&&!sub.disabled){
        sub.disabled=true;
        sub.textContent="Guardando...";
      }
    });
  }
})();
</script>`,
  });
}

router.get("/pricing", (req, res) => {
  res.send(renderPricingPage());
});

router.get("/login", (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  res.send(
    renderLoginLandingPage({
      resetOk: req.query.reset === "ok",
    })
  );
});

router.get("/register", (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  res.send(renderRegisterPage());
});

router.post("/register/start", async (req, res) => {
  if (req.session?.usuario) {
    return res.status(400).json({ ok: false, message: "Ya tienes sesión activa." });
  }

  const result = await startRegistration(req.body);
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      errors: result.errors,
      message: result.errors?._global,
    });
  }

  return res.json(result);
});

router.post("/register/verify", async (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  const result = await verifyRegistration(req.body);
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
    });
  }

  const usuario = result.usuario;
  req.session.usuario = {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
  };

  return res.json({ ok: true, redirect: "/" });
});

router.post("/register/resend", async (req, res) => {
  if (req.session?.usuario) {
    return res.status(400).json({ ok: false, message: "Ya tienes sesión activa." });
  }

  const result = await resendPin(req.body);
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      cooldownSeconds: result.cooldownSeconds,
    });
  }

  return res.json({ ok: true, email: result.email });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?email=eq.${encodeURIComponent(email)}&activo=eq.true&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const usuario = response.data?.[0];

    if (!usuario) {
      return res.send("Usuario no encontrado o inactivo");
    }

    const passwordCorrecto = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordCorrecto) {
      return res.send("Contraseña incorrecta");
    }

    req.session.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email
    };

    res.redirect("/");

  } catch (error) {
    console.log("ERROR LOGIN:", error.response?.data || error.message);
    res.send("Error iniciando sesión");
  }
});

router.get("/logout", (req, res) => {
  const finishLogout = () => {
    res.clearCookie("connect.sid");
    res.send(renderLogoutPage());
  };

  if (!req.session) {
    return finishLogout();
  }

  req.session.destroy((err) => {
    if (err) {
      console.error("ERROR LOGOUT:", err.message);
    }
    finishLogout();
  });
});

router.get("/forgot-password", (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  res.send(
    renderForgotPage({
      sent: req.query.sent === "1",
    })
  );
});

router.post("/forgot-password", async (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  const email = normalizeEmail(req.body?.email);

  try {
    const usuario = await buscarUsuarioActivoPorEmail(email);

    if (usuario && isPasswordResetEmailConfigured()) {
      const { token } = await generarTokenReset(usuario.id);
      await enviarCorreoReset(usuario, token);
      console.log(`[passwordReset] correo enviado usuarioId=${usuario.id}`);
    } else if (usuario && !isPasswordResetEmailConfigured()) {
      console.log("[passwordReset] SMTP no configurado — no se envió correo");
    }
  } catch (error) {
    console.log("[passwordReset] error forgot-password:", error.message);
  }

  return res.redirect("/forgot-password?sent=1");
});

router.get("/reset-password", async (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  const token = String(req.query.token || "").trim();
  if (!token) {
    return res.send(renderResetInvalidPage());
  }

  try {
    const validation = await validarTokenReset(token);
    if (!validation.valid) {
      return res.send(renderResetInvalidPage());
    }

    return res.send(renderResetFormPage({ token }));
  } catch (error) {
    console.log("[passwordReset] error GET reset-password:", error.message);
    return res.send(renderResetInvalidPage());
  }
});

router.post("/reset-password", async (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");

  if (!token) {
    return res.send(renderResetInvalidPage());
  }

  try {
    const validation = await validarTokenReset(token);
    if (!validation.valid) {
      return res.send(renderResetInvalidPage());
    }

    if (password.length < 6) {
      return res.send(
        renderResetFormPage({
          token,
          errorMsg: "La contraseña debe tener al menos 6 caracteres.",
        })
      );
    }

    const password_hash = await bcrypt.hash(password, 10);

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(validation.usuarioId)}`,
      { password_hash },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    await limpiarTokenReset(validation.usuarioId);
    console.log(`[passwordReset] contraseña actualizada usuarioId=${validation.usuarioId}`);

    return res.redirect("/login?reset=ok");
  } catch (error) {
    console.log("[passwordReset] error POST reset-password:", error.message);
    return res.send(
      renderResetFormPage({
        token,
        errorMsg: "No se pudo guardar la contraseña. Intenta de nuevo.",
      })
    );
  }
});

module.exports = router;
