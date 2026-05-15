document.addEventListener("DOMContentLoaded", () => {

  const btnAudio = document.getElementById("btnAudio");
  const appCRM = document.querySelector(".whatsapp");

  let mediaRecorder;
  let audioChunks = [];
  let grabando = false;

  if (!btnAudio || !appCRM) return;

  btnAudio.addEventListener("click", async () => {

    if (!grabando) {

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {

        const audioBlob = new Blob(audioChunks, {
          type: "audio/webm"
        });

        const formData = new FormData();

        formData.append("numero", appCRM.dataset.chat);
        formData.append("archivo", audioBlob, "audio.webm");
         agregarAudioSaliente(audioBlob);
        await fetch("/inbox/responder", {
          method: "POST",
          body: formData
        });

        
      };

      mediaRecorder.start();

      grabando = true;
      btnAudio.style.background = "#ff3b30";
      btnAudio.innerHTML = "⏹";

    } else {

      mediaRecorder.stop();

      grabando = false;
      btnAudio.style.background = "#202c33";
      btnAudio.innerHTML = "🎤";

    }

  });
function agregarAudioSaliente(audioBlob) {
  const mensajes = document.getElementById("mensajes");

  if (!mensajes) return;

  const audioURL = URL.createObjectURL(audioBlob);

  const div = document.createElement("div");
  div.className = "message saliente";

  div.innerHTML =
    '<audio controls style="width:260px;display:block;margin-bottom:6px;">' +
      '<source src="' + audioURL + '">' +
    '</audio>' +
    '<span class="time">enviando...</span>';

  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;

  setTimeout(() => {
    const time = div.querySelector(".time");
    if (time) time.innerText = "ahora ✓";
  }, 700);
}
});