document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".chat-bottom form");
  const mensajes = document.getElementById("mensajes");
  const textarea = document.querySelector('.chat-bottom textarea[name="respuesta"]');
  const archivoInput = document.getElementById("archivoChat");
  const previewArchivo = document.getElementById("previewArchivo");

  if (!form || !mensajes || !textarea) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const texto = textarea.value.trim();
    const archivo = archivoInput?.files?.[0];

    if (!texto && !archivo) return;

    const formData = new FormData(form);

    const mensajeTemporal = agregarMensajeSaliente(texto, archivo);

    textarea.value = "";

    if (archivoInput) archivoInput.value = "";
    if (previewArchivo) previewArchivo.innerHTML = "";

    try {
      const btnEnviar = form.querySelector('button[type="submit"]');
      if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = "✓";
      }

      await enviarConProgreso(formData, mensajeTemporal);

      if (!res.ok) {
        alert("❌ Error enviando mensaje");
      }

      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = "➤";
      }

    } catch (error) {
      console.log("ERROR ENVIANDO:", error);
      

      const btnEnviar = form.querySelector('button[type="submit"]');
      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = "➤";
      }
    }
  });

  function agregarMensajeSaliente(texto, archivo) {

  const div = document.createElement("div");

  div.className = "message saliente";

  let mediaHtml = "";

  if (archivo) {

    const urlLocal = URL.createObjectURL(archivo);

    if (archivo.type.startsWith("image/")) {

      mediaHtml = `
        <div class="wa-upload-card">

          <img src="${urlLocal}" class="wa-upload-media">

          <div class="wa-upload-overlay">
            <span class="wa-upload-percent">0%</span>
          </div>

          <div class="wa-upload-bar">
            <div class="wa-upload-bar-fill"></div>
          </div>

        </div>
      `;

    }

    if (archivo.type.startsWith("video/")) {

      mediaHtml = `
        <div class="wa-upload-card">

          <video class="wa-upload-media" muted>
            <source src="${urlLocal}">
          </video>

          <div class="wa-upload-overlay">
            ▶ <span class="wa-upload-percent">0%</span>
          </div>

          <div class="wa-upload-bar">
            <div class="wa-upload-bar-fill"></div>
          </div>

        </div>
      `;

    }

    if (
      archivo.type.includes("pdf") ||
      archivo.name.endsWith(".doc") ||
      archivo.name.endsWith(".docx") ||
      archivo.name.endsWith(".xls") ||
      archivo.name.endsWith(".xlsx")
    ) {

      mediaHtml = `
        <div class="wa-upload-doc" data-url="${urlLocal}">

          <div>📄 ${archivo.name}</div>

          <strong class="wa-upload-percent">0%</strong>

          <div class="wa-upload-bar">
            <div class="wa-upload-bar-fill"></div>
          </div>

        </div>
      `;

    }

  }

  div.innerHTML =
    mediaHtml +
    escapeHtml(texto) +
    `<span class="time">subiendo...</span>`;

  mensajes.appendChild(div);

  mensajes.scrollTop = mensajes.scrollHeight;

  return div;

}

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text || "";
    return div.innerHTML;
  }
function enviarConProgreso(formData, mensajeTemporal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", "/inbox/responder", true);

    xhr.upload.onprogress = function (e) {

      if (e.lengthComputable && mensajeTemporal) {

        const percent = Math.round((e.loaded / e.total) * 100);

        const bar = mensajeTemporal.querySelector(".wa-upload-bar-fill");

        const text = mensajeTemporal.querySelector(".wa-upload-percent");

        if (bar) {
          bar.style.width = percent + "%";
        }

        if (text) {
          text.innerText = percent + "%";
        }

      }

    };

    xhr.onload = function () {

      if (xhr.status >= 200 && xhr.status < 400) {

        if (mensajeTemporal) {

          const percent = mensajeTemporal.querySelector(".wa-upload-percent");

          const status = mensajeTemporal.querySelector(".time");

          if (percent) {
            percent.innerText = "100%";
          }

          if (status) {
            status.innerText = "ahora ✓";
          }
          activarPreviewArchivo(mensajeTemporal);

        }

        resolve(xhr.responseText);

      } else {

        reject(new Error("Error enviando"));

      }

    };

    xhr.onerror = function () {

      reject(new Error("Error conexión"));

    };

    xhr.send(formData);

  });
}
});

function mostrarToast(texto){

  const toast = document.createElement("div");

  toast.className = "macbot-toast";

  toast.innerText = texto;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 50);

  setTimeout(() => {

    toast.classList.remove("show");

    setTimeout(() => {
      toast.remove();
    }, 300);

  }, 2500);

}

function activarPreviewArchivo(mensajeTemporal) {
  if (!mensajeTemporal) return;

  const overlay = mensajeTemporal.querySelector(".wa-upload-overlay");
  const bar = mensajeTemporal.querySelector(".wa-upload-bar");

  if (overlay) overlay.remove();
  if (bar) bar.remove();

  const video = mensajeTemporal.querySelector("video");

  if (video) {
    video.setAttribute("controls", "true");
    video.muted = false;
    video.style.opacity = "1";
  }

  const img = mensajeTemporal.querySelector("img");

  if (img) {
    img.style.opacity = "1";
    img.style.cursor = "pointer";

    img.onclick = () => {
      window.open(img.src, "_blank");
    };
  }

  const doc = mensajeTemporal.querySelector(".wa-upload-doc");

  if (doc) {
    doc.style.cursor = "pointer";

    const link = doc.dataset.url;

    if (link) {
      doc.onclick = () => {
        window.open(link, "_blank");
      };
    }
  }
}