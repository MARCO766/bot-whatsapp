import React, { useRef, useState } from "react";
import {
  buildMessageFormData,
  sendMessageWithProgress,
} from "../../services/chatService";

export default function ChatComposer({
  numero,
  bloqueado,
  onSent,
  onPreviewList,
  moverChatArriba,
}) {
  const [mensaje, setMensaje] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  function localPreview(file) {
    if (!file) return null;
    if (file.type.startsWith("image/")) {
      return { kind: "image", url: URL.createObjectURL(file), name: file.name };
    }
    return { kind: "file", name: file.name };
  }

  async function enviar(texto, file) {
    if (!numero || bloqueado) return;
    if (!texto?.trim() && !file) return;

    const tempId = `temp-${Date.now()}`;
    const preview = file ? localPreview(file) : null;

    const tempMsg = {
      id: tempId,
      direccion: "saliente",
      tipo: file ? (file.type.startsWith("image/") ? "image" : "document") : "texto",
      contenido: texto || "",
      creado_en: new Date().toISOString(),
      _localPreview: preview,
      _uploadProgress: 0,
    };

    onSent?.(tempMsg);
    moverChatArriba?.(numero, texto || file?.name || "");

    const formData = buildMessageFormData(numero, texto, file);
    setEnviando(true);

    try {
      await sendMessageWithProgress(formData, (pct) => {
        onPreviewList?.(tempId, { _uploadProgress: pct });
      });
      onPreviewList?.(tempId, { _uploadProgress: 100 });
    } catch (err) {
      console.error(err);
      alert("No se pudo enviar el mensaje");
    } finally {
      setEnviando(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const texto = mensaje;
    const file = archivo;
    setMensaje("");
    setArchivo(null);
    enviar(texto, file);
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setArchivo(file);
    e.target.value = "";
  }

  async function toggleAudio() {
    if (!numero || bloqueado) return;

    if (!grabando) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "audio.webm", { type: "audio/webm" });
        await enviar("", file);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setGrabando(true);
    } else {
      mediaRecorderRef.current?.stop();
      setGrabando(false);
    }
  }

  return (
    <>
      {archivo && (
        <div className="previewBar">
          <div>📎 {archivo.name}</div>
          <button type="button" onClick={() => setArchivo(null)}>
            ✕
          </button>
        </div>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <button
          type="button"
          className="attach"
          disabled={bloqueado || enviando}
          onClick={() => fileRef.current?.click()}
        >
          +
        </button>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={onFileChange}
        />

        <textarea
          placeholder={bloqueado ? "Bloqueado" : "Escribe..."}
          disabled={bloqueado || enviando}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
        />

        <button
          type="button"
          className={`audioBtn ${grabando ? "recording" : ""}`}
          disabled={bloqueado || enviando}
          onClick={toggleAudio}
        >
          {grabando ? "⏹" : "🎤"}
        </button>

        <button type="submit" className="send" disabled={bloqueado || enviando}>
          Enviar
        </button>
      </form>
    </>
  );
}
