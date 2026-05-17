import React, { useRef, useState } from "react";
import {
  buildMessageFormData,
  sendMessageWithProgress,
} from "../../services/chatService";
import { previewKindFromFile, tipoFromFile } from "../../utils/chatMedia";

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
    const mimeType = (file.type || "").toLowerCase();
    const kind = previewKindFromFile(file);
    if (kind === "document") {
      return { kind: "document", name: file.name, mimeType };
    }
    return {
      kind,
      url: URL.createObjectURL(file),
      name: file.name,
      mimeType,
    };
  }

  async function enviar(texto, file) {
    if (!numero || bloqueado) return;
    if (!texto?.trim() && !file) return;

    const tempId = `temp-${Date.now()}`;
    const preview = file ? localPreview(file) : null;

    const tempMsg = {
      id: tempId,
      direccion: "saliente",
      tipo: file ? tipoFromFile(file) : "texto",
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
    <footer className="composerDock">
      {archivo && (
        <div className="previewBar">
          <span className="previewFile">
            <span className="previewIcon">📎</span>
            {archivo.name}
          </span>
          <button
            type="button"
            className="previewRemove"
            onClick={() => setArchivo(null)}
            aria-label="Quitar archivo"
          >
            ✕
          </button>
        </div>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <button
          type="button"
          className="composerBtn attach"
          disabled={bloqueado || enviando}
          onClick={() => fileRef.current?.click()}
          aria-label="Adjuntar archivo"
          title="Adjuntar"
        >
          <span className="composerBtnIcon">+</span>
        </button>

        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={onFileChange}
        />

        <div className="composerInputWrap">
          <textarea
            placeholder={bloqueado ? "Contacto bloqueado" : "Escribe un mensaje…"}
            disabled={bloqueado || enviando}
            value={mensaje}
            rows={1}
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
          />
        </div>

        <button
          type="button"
          className={`composerBtn audioBtn ${grabando ? "recording" : ""}`}
          disabled={bloqueado || enviando}
          onClick={toggleAudio}
          aria-label={grabando ? "Detener grabación" : "Grabar audio"}
          title="Audio"
        >
          <span className="composerBtnIcon">{grabando ? "⏹" : "🎤"}</span>
        </button>

        <button
          type="submit"
          className="composerBtn send"
          disabled={bloqueado || enviando}
          aria-label="Enviar"
          title="Enviar"
        >
          <span className="composerBtnIcon sendIcon">➤</span>
        </button>
      </form>
    </footer>
  );
}
