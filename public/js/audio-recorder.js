const btnAudio = document.getElementById("btnAudio");
const appCRM = document.querySelector(".whatsapp");

let mediaRecorder;
let audioChunks = [];
let grabando = false;

if (btnAudio && appCRM) {
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

        await fetch("/inbox/responder", {
          method: "POST",
          body: formData
        });

        window.location.reload();
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
}