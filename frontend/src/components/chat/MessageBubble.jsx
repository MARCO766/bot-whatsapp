import React from "react";
import { formatFechaHoraMensaje, messageChecks } from "../../utils/chatFormat";
import {
  resolveMediaKind,
  mediaUrl,
  docDisplayName,
  docExtension,
  visibleCaption,
} from "../../utils/chatMedia";

function messageMime(msg) {
  return String(
    msg?.mime_type ||
      msg?.mimeType ||
      msg?.mimetype ||
      msg?.mediaType ||
      msg?.media_type ||
      msg?._localPreview?.mimeType ||
      ""
  ).trim();
}

export default function MessageBubble({ msg, uploadProgress, onMediaLayout }) {
  const isMe = msg.direccion === "saliente";
  const isSystem = msg.direccion === "sistema";
  const kind = resolveMediaKind(msg);
  const hasMedia = Boolean(kind) || Boolean(msg._localPreview);
  const url = mediaUrl(msg);
  const mime = messageMime(msg);
  const checks =
    isMe && uploadProgress == null ? messageChecks(msg.estado_envio) : null;

  const notifyMediaLayout = () => onMediaLayout?.();

  const timeLabel =
    uploadProgress != null && uploadProgress < 100
      ? `${uploadProgress}%`
      : formatFechaHoraMensaje(msg.creado_en) || "ahora";

  const caption = visibleCaption(msg, kind);
  const textOnly = caption && !kind && !msg._localPreview;

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
        className={`bubble ${isMe ? "me" : "client"}${hasMedia ? " hasMedia" : ""}`}
      >
        {msg._localPreview && uploadProgress != null && (
          <UploadPreview
            preview={msg._localPreview}
            progress={uploadProgress}
            onMediaLayout={notifyMediaLayout}
          />
        )}

        {!msg._localPreview && kind === "image" && url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mediaCard"
          >
            <img
              src={url}
              alt=""
              className="media-img"
              loading="lazy"
              onLoad={notifyMediaLayout}
            />
          </a>
        )}

        {!msg._localPreview && kind === "video" && url && (
          <div className="mediaCard">
            <video
              src={url}
              controls
              className="media-video"
              preload="metadata"
              playsInline
              onLoadedMetadata={notifyMediaLayout}
            >
              {mime ? <source src={url} type={mime} /> : null}
            </video>
          </div>
        )}

        {!msg._localPreview && kind === "audio" && url && (
          <div className="audioCard">
            <span className="audioIcon" aria-hidden>
              🎵
            </span>
            <audio
              controls
              className="media-audio"
              preload="metadata"
              onLoadedMetadata={notifyMediaLayout}
            >
              <source src={url} type={mime || undefined} />
            </audio>
          </div>
        )}

        {!msg._localPreview && kind === "document" && url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="docCard"
          >
            <span className="docIcon">{docExtension(docDisplayName(msg))}</span>
            <span className="docInfo">
              <span className="docName">{docDisplayName(msg)}</span>
              <span className="docAction">Abrir documento</span>
            </span>
          </a>
        )}

        {textOnly && <p className="bubbleText">{caption}</p>}
        {caption && kind && <p className="bubbleText bubbleCaption">{caption}</p>}

        <div className={`meta${hasMedia ? " metaMedia" : ""}`}>
          <span className="metaTime">{timeLabel}</span>
          {checks && (
            <span className={`msg-status ${checks.className}`}>{checks.text}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadPreview({ preview, progress, onMediaLayout }) {
  const mime = preview.mimeType || "";
  const notify = () => onMediaLayout?.();

  if (preview.kind === "image" && preview.url) {
    return (
      <div className="mediaCard">
        <img src={preview.url} alt="" className="media-img" onLoad={notify} />
        {progress < 100 && <span className="uploadPct">{progress}%</span>}
      </div>
    );
  }

  if (preview.kind === "video" && preview.url) {
    return (
      <div className="mediaCard">
        <video
          src={preview.url}
          controls
          className="media-video"
          preload="metadata"
          playsInline
          onLoadedMetadata={notify}
        >
          {mime ? <source src={preview.url} type={mime} /> : null}
        </video>
        {progress < 100 && <span className="uploadPct">{progress}%</span>}
      </div>
    );
  }

  if (preview.kind === "audio" && preview.url) {
    return (
      <div className="audioCard">
        <span className="audioIcon" aria-hidden>
          🎵
        </span>
        <audio
          controls
          className="media-audio"
          preload="metadata"
          onLoadedMetadata={notify}
        >
          <source src={preview.url} type={mime || undefined} />
        </audio>
        {progress < 100 && <span className="uploadPct">{progress}%</span>}
      </div>
    );
  }

  const name = preview.name || "Documento";
  return (
    <div className="docCard docCardStatic">
      <span className="docIcon">{docExtension(name)}</span>
      <span className="docInfo">
        <span className="docName">{name}</span>
        <span className="docAction">
          {progress < 100 ? `Subiendo ${progress}%` : "Documento"}
        </span>
      </span>
    </div>
  );
}
