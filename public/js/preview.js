document.addEventListener("DOMContentLoaded", () => {

  const archivoChat = document.getElementById("archivoChat");
  const previewArchivo = document.getElementById("previewArchivo");

  if (!archivoChat || !previewArchivo) return;

  archivoChat.addEventListener("change", function(){

    if(!this.files[0]) return;

    const file = this.files[0];

    const mb = file.size / 1024 / 1024;

    if(file.type.startsWith("image/") && mb > 2){

      alert("❌ Imagen máxima 2MB");

      this.value = "";

      previewArchivo.innerHTML = "";

      return;

    }

    if(file.type.startsWith("video/") && mb > 15){

      alert("⚠️ El video será comprimido automáticamente");

    }

    previewArchivo.innerHTML = `
      <div class="file-upload-preview">
        <div class="file-upload-top">
          <span>📎 ${file.name}</span>
          <strong id="uploadPercent">1%</strong>
        </div>

        <div class="file-upload-bar">
          <div id="uploadProgress"></div>
        </div>

        <div id="uploadStatus" class="file-upload-status">
          Preparando archivo...
        </div>
      </div>
    `;

    const progress = document.getElementById("uploadProgress");
    const percent = document.getElementById("uploadPercent");
    const status = document.getElementById("uploadStatus");

    let value = 1;

    const timer = setInterval(() => {

      value += Math.floor(Math.random() * 12) + 4;

      if(value >= 100){
        value = 100;
        clearInterval(timer);

        if(status){
          status.innerHTML = "✅ Archivo listo para enviar";
        }
      }

      if(progress){
        progress.style.width = value + "%";
      }

      if(percent){
        percent.innerText = value + "%";
      }

    }, 120);

  });

});