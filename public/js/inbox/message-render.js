function renderIncomingMessage(msg) {
  const div = document.createElement("div");

  div.className = "message entrante";

  const mediaHtml = renderMedia(msg);

  div.innerHTML =
    mediaHtml +
    (msg.contenido || "") +
    '<span class="time">ahora</span>';

  return div;
}