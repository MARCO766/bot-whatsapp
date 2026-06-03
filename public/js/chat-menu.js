function toggleChatMenu(chatKey){
  event.stopPropagation();

  const safeId = String(chatKey || "").replace(/::/g, "__");

  document.querySelectorAll(".chat-menu").forEach(menu => {
    if(menu.id !== "chat_menu_" + safeId){
      menu.style.display = "none";
    }
  });

  const menu = document.getElementById("chat_menu_" + safeId);

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