const BRAND_ICON = "/assets/brand/logo-macbot-crm-icon.svg";
const BRAND_LOGO = "/assets/brand/logo-macbot-crm.svg";
const BRAND_FAVICON = "/assets/brand/favicon.svg";

function renderFaviconLink() {
  return `<link rel="icon" type="image/svg+xml" href="${BRAND_FAVICON}">`;
}

function renderMacBotLogoNavbar({ href = "/login", className = "mb-premium__logo" } = {}) {
  return `
<a href="${href}" class="${className}" aria-label="MacBot CRM inicio">
  <img class="mb-premium__logo-icon" src="${BRAND_ICON}" width="32" height="32" alt="" aria-hidden="true">
  <span class="mb-premium__logo-text">
    <span class="mb-premium__logo-name">MacBot</span>
    <span class="mb-premium__logo-sub">CRM</span>
  </span>
</a>`;
}

function renderMacBotLogoFull({ className = "mb-brand__logo-full", width = 200 } = {}) {
  return `<img class="${className}" src="${BRAND_LOGO}" width="${width}" height="${Math.round(width * 44 / 220)}" alt="MacBot CRM">`;
}

module.exports = {
  BRAND_ICON,
  BRAND_LOGO,
  BRAND_FAVICON,
  renderFaviconLink,
  renderMacBotLogoNavbar,
  renderMacBotLogoFull,
};
