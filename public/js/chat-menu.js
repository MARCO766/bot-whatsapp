function toggleChatMenu(numero){
  event.stopPropagation();

  document.querySelectorAll(".chat-menu").forEach(menu => {
    if(menu.id !== "chat_menu_" + numero){
      menu.style.display = "none";
    }
  });

  const menu = document.getElementById("chat_menu_" + numero);

  if(menu){
    menu.style.display =
      menu.style.display === "block"
      ? "none"
      : "block";
  }
}

document.addEventListener("click", () => {
  document.querySelectorAll(".chat-menu").forEach(menu => {
    menu.style.display = "none";
  });
});