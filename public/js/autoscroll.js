setTimeout(() => {
  const mensajes = document.getElementById("mensajes");

  if(mensajes){
    mensajes.scrollTop = mensajes.scrollHeight;
  }
}, 100);