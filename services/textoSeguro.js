/**
 * Unicode seguro para WhatsApp / Supabase: repara sustitutos rotos, conserva emojis válidos.
 */

function contieneEmoji(texto) {
  const s = String(texto ?? "");
  if (!s) return false;
  try {
    if (/\p{Extended_Pictographic}/u.test(s)) return true;
  } catch (_) {
    /* Node sin flag u */
  }
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s);
}

function sanitizarUnicodeRoto(texto) {
  let s = typeof texto === "string" ? texto : String(texto ?? "");
  try {
    s = s.normalize("NFC");
  } catch (_) {
    /* ignore */
  }

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      if (i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          out += s[i] + s[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      continue;
    }
    if (c === 0) continue;
    out += s[i];
  }

  return out;
}

function logEmojiDebug(etapa, texto) {
  const s = String(texto ?? "");
  console.log(`[EMOJI DEBUG] ${etapa}:`, s);
  console.log(
    `[EMOJI DEBUG] ${etapa} meta:`,
    JSON.stringify({ length: s.length, hasEmoji: contieneEmoji(s) })
  );
}

module.exports = {
  contieneEmoji,
  sanitizarUnicodeRoto,
  logEmojiDebug,
};
