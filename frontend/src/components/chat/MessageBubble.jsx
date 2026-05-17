import React from "react";
import { formatHora, messageChecks } from "../../utils/chatFormat";
import { mediaKind } from "../../utils/chatMedia";

export default function MessageBubble({ msg, uploadProgress }) {
  const isMe = msg.direccion === "saliente";
  const isSystem = msg.direccion === "sistema";
  const kind = mediaKind(msg);
  const checks =
    isMe && uploadProgress == null ? messageChecks(msg.estado_envio) : null;

  if (isSystem) {
    return <div className="bubble system">{msg.contenido}</div>;
  }

  return (
    <div className={`bubble ${isMe ? "me" : "client"}`}>
      {msg._localPreview && uploadProgress != null && (
        <UploadPreview preview={msg._localPreview} progress={uploadProgress} />
      )}

      {!msg._localPreview && kind === "image" && (
        <img
          src={msg.imagen_url}
          alt=""
          className="media-img"
          onClick={() => window.open(msg.imagen_url, "_blank")}
        />
      )}
      {!msg._localPreview && kind === "video" && (
        <video controls className="media-video">
          <source src={msg.imagen_url} />
        </video>
      )}
      {!msg._localPreview && kind === "audio" && (
        <audio controls className="media-audio">
          <source src={msg.imagen_url} />
        </audio>
      )}
      {!msg._localPreview && kind === "document" && (
        <a
          href={msg.imagen_url}
          target="_blank"
          rel="noreferrer"
          className="media-doc"
        >
          📄 Abrir documento
        </a>
      )}

      {msg.contenido && !String(msg.contenido).startsWith("http") && (
        <p>{msg.contenido}</p>
      )}

      <span className="time">
        {uploadProgress != null && uploadProgress < 100
          ? `${uploadProgress}%`
          : formatHora(msg.creado_en) || "ahora"}
        {checks && (
          <span className={`msg-status ${checks.className}`}>{checks.text}</span>
        )}
        {isMe && uploadProgress != null && uploadProgress >= 100 && (
          <span className="msg-status delivered">✓✓</span>
        )}
      </span>
    </div>
  );
}

function UploadPreview({ preview, progress }) {
  if (preview.kind === "image") {
    return (
      <div className="upload-card">
        <img src={preview.url} alt="" className="upload-media" />
        <div className="upload-bar">
          <div className="upload-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="upload-doc">
      <div>📄 {preview.name}</div>
      <strong>{progress}%</strong>
    </div>
  );
}
