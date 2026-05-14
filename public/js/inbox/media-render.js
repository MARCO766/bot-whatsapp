function renderMedia(msg){

  let mediaHtml = "";

  if (msg.tipo === "image" && msg.imagen_url) {

    mediaHtml =
      '<img src="' + msg.imagen_url + '" style="max-width:260px;border-radius:10px;display:block;margin-bottom:6px;">';

  }

  if (msg.tipo === "video" && msg.imagen_url) {

    mediaHtml =
      '<video controls style="max-width:280px;border-radius:10px;display:block;margin-bottom:6px;">' +
      '<source src="' + msg.imagen_url + '">' +
      '</video>';

  }

  if (msg.tipo === "audio" && msg.imagen_url) {

    mediaHtml =
      '<audio controls style="width:260px;display:block;margin-bottom:6px;">' +
      '<source src="' + msg.imagen_url + '">' +
      '</audio>';

  }

  if (msg.tipo === "document" && msg.imagen_url) {

    mediaHtml =
      '<a href="' + msg.imagen_url + '" target="_blank" style="display:block;background:#202c33;color:#25d366;padding:12px;border-radius:10px;text-decoration:none;margin-bottom:6px;">📄 Abrir documento</a>';

  }

  return mediaHtml;

}