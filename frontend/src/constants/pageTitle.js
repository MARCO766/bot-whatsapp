export const BRAND = "MacBot CRM";

export const CRM_PAGE_TITLES = {
  panel: BRAND,
  inbox: "Bandeja",
  flujos: "Flujos",
  activadores: "Activadores",
  etiquetas: "Etiquetas",
  metricas: "Métricas",
  campañas: "Campañas",
  clientes: "Clientes",
  "mi-plan": "Mi Plan",
  ajustes: "Ajustes",
};

export function pageTitle(section) {
  if (!section) return BRAND;
  const trimmed = String(section).trim();
  if (!trimmed || trimmed === BRAND) return BRAND;
  return `${trimmed} | ${BRAND}`;
}

export function titleForVista(vistaId) {
  const section = CRM_PAGE_TITLES[vistaId];
  if (!section || section === BRAND) return BRAND;
  return pageTitle(section);
}
