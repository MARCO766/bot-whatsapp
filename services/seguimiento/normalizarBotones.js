const MAX_BOTONES = 3;
const MAX_TEXTO_BOTON = 20;

function normalizarBotones(botones, pasoId) {
  if (!Array.isArray(botones)) return [];

  return botones
    .slice(0, MAX_BOTONES)
    .map(function (btn, index) {
      const texto = String(btn?.texto || btn?.text || "").trim().slice(0, MAX_TEXTO_BOTON);
      if (!texto) return null;

      const idBase = pasoId || "paso";
      const id = String(btn?.id || "seg_" + idBase + "_b" + index)
        .trim()
        .slice(0, 128);

      return { id, texto };
    })
    .filter(Boolean);
}

module.exports = {
  MAX_BOTONES,
  MAX_TEXTO_BOTON,
  normalizarBotones,
};
