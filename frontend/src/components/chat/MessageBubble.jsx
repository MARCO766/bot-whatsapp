import React from "react";
import { formatHora, messageChecks } from "../../utils/chatFormat";
import { mediaKind, docDisplayName, docExtension } from "../../utils/chatMedia";

export default function MessageBubble({ msg, uploadProgress }) {
  const isMe = msg.direccion === "saliente";
  const isSystem = msg.direccion === "sistema";
  const kind = mediaKind(msg);
  const hasMedia = Boolean(kind) || Boolean(msg._localPreview);
  const checks =
    isMe && uploadProgress == null ? messageChecks(msg.estado_envio) : null;

  const timeLabel =
    uploadProgress != null && uploadProgress < 100
      ? `${uploadProgress}%`
      : formatHora(msg.creado_en) || "ahora";

  const textContent =
    msg.contenido && !String(msg.contenido).startsWith("http")
      ? msg.contenido
      : null;

  const docName = kind === "document" ? docDisplayName(msg) : "";
  const captionBelowMedia =
    textContent && kind && ["image", "video", "audio"].includes(kind);
  const textOnly = textContent && !kind;
  const docExtraText =
    textContent && kind === "document" && textContent !== docName;

  if (isSystem) {
    return (
      <div className="messageRow system">
        <div className="bubble system">{msg.contenido}</div>
      </div>
    );
  }

  return (
    <div className={`messageRow ${isMe ? "out" : "in"}`}>
      <div
        className={`bubble ${isMe ? "me" : "client"} ${hasMedia ? "hasMedia" : ""}`}
      >
        <div className="bubbleInner">
          {msg._localPreview && uploadProgress != null && (
            <UploadPreview preview={msg._localPreview} progress={uploadProgress} />
          )}

          {!msg._localPreview && kind === "image" && (
            <div className="mediaCard">
              <img
                src={msg.imagen_url}
                alt=""
                className="media-img"
                onClick={() => window.open(msg.imagen_url, "_blank")}
              />
            </div>
          )}

          {!msg._localPreview && kind === "video" && (
            <div className="mediaCard">
              <video controls className="media-video" preload="metadata">
                <source src={msg.imagen_url} />
              </video>
            </div>
          )}

          {!msg._localPreview && kind === "audio" && (
            <div className="audioCard">
              <span className="audioIcon" aria-hidden>
                🎧
              </span>
              <audio controls className="media-audio" preload="metadata">
                <source src={msg.imagen_url} />
              </audio>
            </div>
          )}

          {!msg._localPreview && kind === "document" && (
            <a
              href={msg.imagen_url}
              target="_blank"
              rel="noreferrer"
              className="docCard"
            >
              <span className="docIcon">{docExtension(docName)}</span>
              <span className="docInfo">
                <span className="docName">{docName}</span>
                <span className="docAction">Toca para abrir</span>
              </span>
            </a>
          )}

          {textOnly && <p className="bubbleText">{textContent}</p>}
          {captionBelowMedia && <p className="bubbleCaption">{textContent}</p>}
          {docExtraText && <p className="bubbleCaption">{textContent}</p>}

          <div className="bubbleMeta">
            <span className="metaTime">{timeLabel}</span>
            {checks && (
              <span className={`msg-status ${checks.className}`}>{checks.text}</span>
            )}
            {isMe && uploadProgress != null && uploadProgress >= 100 && !checks && (
              <span className="msg-status delivered">✓✓</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadPreview({ preview, progress }) {
  if (preview.kind === "image") {
    return (
      <div className="mediaCard upload-card">
        <img src={preview.url} alt="" className="media-img" />
        <div className="upload-bar">
          <div className="upload-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="docCard upload-doc">
      <span className="docIcon">FILE</span>
      <span className="docInfo">
        <span className="docName">{preview.name}</span>
        <span className="docAction">{progress}%</span>
      </span>
    </div>
  );
}
