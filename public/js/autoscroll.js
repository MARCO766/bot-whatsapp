document.addEventListener("DOMContentLoaded", () => {
  const mensajes = document.getElementById("mensajes");

  if (!mensajes) return;

  mensajes.style.scrollBehavior = "auto";
  mensajes.scrollTop = mensajes.scrollHeight;
});