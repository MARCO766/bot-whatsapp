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
  generarTokenReset,
  validarTokenReset,
  limpiarTokenReset,
} = require("../services/passwordResetService");
const { getAppUrl, sendEmail, isPasswordResetEmailConfigured } = require("../services/emailService");

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

router.get("/login", (req, res) => {
  if (req.session?.usuario) {
    return res.redirect("/");
  }

  const resetOk = req.query.reset === "ok";
  const resetBanner = resetOk
    ? `<p class="mb-login__message mb-login__message--success">Tu contraseña fue actualizada. Ya puedes iniciar sesión.</p>`
    : "";

  const cardBody = `
      ${resetBanner}
      <button type="button" class="mb-login__google" aria-label="Continuar con Google (próximamente)">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continuar con Google
      </button>

      <div class="mb-login__divider" role="separator">o</div>

      <form class="mb-login__form" method="POST" action="/login">
        <div class="mb-login__field">
          <label class="mb-login__label" for="email">Correo electrónico</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>
            </svg>
            <input class="mb-login__input" id="email" name="email" type="email" placeholder="tu@empresa.com" required autocomplete="email">
          </div>
        </div>

        <div class="mb-login__field">
          <label class="mb-login__label" for="password">Contraseña</label>
          <div class="mb-login__input-wrap">
            <svg class="mb-login__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>
            </svg>
            <input class="mb-login__input mb-login__input--password" id="password" name="password" type="password" placeholder="••••••••••" required autocomplete="current-password">
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

        <div class="mb-login__row">
          <label class="mb-login__remember">
            <input type="checkbox" tabindex="-1">
            Recordarme en este dispositivo
          </label>
          <a href="/forgot-password" class="mb-login__forgot">¿Olvidaste tu contraseña?</a>
        </div>

        <button type="submit" class="mb-login__submit">Entrar a MacBot</button>
      </form>

      <p class="mb-login__secure">🔒 Acceso seguro · Sesión protegida</p>
  `;

  res.send(
    renderAuthPage({
      documentTitle: "Iniciar sesión · MacBot",
      cardTitle: "Iniciar sesión",
      cardSubtitle: "Accede a tu panel MacBot",
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
        sub.textContent="Verificando...";
      }
    });
  }
  var googleBtn=document.querySelector(".mb-login__google");
  if(googleBtn){
    googleBtn.addEventListener("click",function(e){
      e.preventDefault();
    });
  }
})();
</script>`,
    })
  );
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
  req.session.destroy(() => {
    res.redirect("/login");
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
