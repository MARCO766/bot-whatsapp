const BRAND = "MacBot CRM";

function pageTitle(section) {
  if (!section) return BRAND;
  const trimmed = String(section).trim();
  if (!trimmed || trimmed === BRAND) return BRAND;
  return `${trimmed} | ${BRAND}`;
}

module.exports = { BRAND, pageTitle };
