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
      alert("⚠️ El video será comprimido automáticamente al enviar");
    }

    const urlLocal = URL.createObjectURL(file);

    if(file.type.startsWith("image/")){
      previewArchivo.innerHTML = `
        <div class="file-mini-preview">
          <img src="${urlLocal}">
          <span>${file.name}</span>
        </div>
      `;
      return;
    }

    if(file.type.startsWith("video/")){
      previewArchivo.innerHTML = `
        <div class="file-mini-preview">
          <video muted>
            <source src="${urlLocal}">
          </video>
          <span>${file.name}</span>
        </div>
      `;
      return;
    }

    previewArchivo.innerHTML = `
      <div class="file-mini-preview doc">
        <div>📄</div>
        <span>${file.name}</span>
      </div>
    `;

  });

});