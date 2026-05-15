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

    agregarMensajeSaliente(texto, archivo);

    textarea.value = "";

    if (archivoInput) archivoInput.value = "";
    if (previewArchivo) previewArchivo.innerHTML = "";

    try {
      const btnEnviar = form.querySelector('button[type="submit"]');
      if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = "✓";
      }

      await enviarConProgreso(formData);

      if (!res.ok) {
        alert("❌ Error enviando mensaje");
      }

      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = "➤";
      }

    } catch (error) {
      console.log("ERROR ENVIANDO:", error);
      alert("❌ Error de conexión");

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
          <img src="${urlLocal}" style="max-width:260px;border-radius:10px;display:block;margin-bottom:6px;">
        `;
      }

      if (archivo.type.startsWith("video/")) {
        mediaHtml = `
          <video controls style="max-width:280px;border-radius:10px;display:block;margin-bottom:6px;">
            <source src="${urlLocal}">
          </video>
        `;
      }

      if (archivo.type.startsWith("audio/")) {
        mediaHtml = `
          <audio controls style="width:260px;display:block;margin-bottom:6px;">
            <source src="${urlLocal}">
          </audio>
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
          <div style="
            background:#202c33;
            color:#25d366;
            padding:12px;
            border-radius:10px;
            margin-bottom:6px;
          ">
            📄 ${archivo.name}
          </div>
        `;
      }
    }

    div.innerHTML =
      mediaHtml +
      escapeHtml(texto) +
      `<span class="time">enviando...</span>`;

    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;

    setTimeout(() => {
      const time = div.querySelector(".time");
      if (time) time.innerText = "ahora ✓";
    }, 700);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text || "";
    return div.innerHTML;
  }
  function enviarConProgreso(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", "/inbox/responder", true);

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);

        const progress = document.getElementById("uploadProgress");
        const percentText = document.getElementById("uploadPercent");
        const status = document.getElementById("uploadStatus");

        if (progress) progress.style.width = percent + "%";
        if (percentText) percentText.innerText = percent + "%";

        if (status) {
          status.innerText =
            percent < 100
              ? "Subiendo archivo..."
              : "Procesando envío...";
        }
      }
    };

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 400) {
        const status = document.getElementById("uploadStatus");
        if (status) status.innerText = "✅ Enviado correctamente";
        resolve(xhr.responseText);
      } else {
        reject(new Error("Error enviando"));
      }
    };

    xhr.onerror = function () {
      reject(new Error("Error de conexión"));
    };

    xhr.send(formData);
  });
}
});