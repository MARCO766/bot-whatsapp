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

    previewArchivo.innerHTML =
      "📎 " + file.name;

  });

});