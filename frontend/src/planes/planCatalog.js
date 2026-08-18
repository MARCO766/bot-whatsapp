/** Textos comerciales MacBot — solo UI (no altera límites en backend). */

export function canonizarPlanUi(planKey) {
  const key = String(planKey || "free").toLowerCase();
  if (key === "starter" || key === "pro" || key === "macbot") return "macbot";
  if (key === "agency") return "agency";
  if (key === "free") return "free";
  return "free";
}

export function getPlanNombreUi(planKey) {
  const c = canonizarPlanUi(planKey);
  if (c === "macbot") return "MACBOT";
  if (c === "agency") return "Agency";
  return "Free";
}

const LIMITES_MACBOT_UI = ["2 WhatsApp", "20 flujos"];

export const PLAN_LIMITS = {
  free: ["1 WhatsApp", "100 contactos", "1 flujo"],
  macbot: LIMITES_MACBOT_UI,
  starter: LIMITES_MACBOT_UI,
  pro: LIMITES_MACBOT_UI,
  agency: ["WhatsApps personalizados", "Contactos personalizados", "Flujos personalizados"],
};

const BENEFICIOS_MACBOT = [
  "Agente Rápido",
  "IA Python básica",
  "Seguimientos CRM",
  "Remarketing 24h",
  "Lector de pagos",
  "Conversiones",
  "Etiquetas",
  "Métricas básicas",
  "IA avanzada",
  "Agente IA Pro",
  "OpenAI Node",
  "Métricas avanzadas",
  "Dashboard de ventas",
  "Embudos de conversión",
  "Estadísticas de remarketing",
  "Versionado de flujos",
  "Carpetas de flujos",
  "Exportar / Importar flujos",
  "Mini embudos RM24H",
  "OCR avanzado lector de pagos",
  "Historial de conversiones",
  "Prioridad en procesamiento",
  "Acceso anticipado a nuevas funciones",
  "Soporte prioritario",
];

export const PLAN_BENEFITS = {
  free: [
    "Agente Rápido",
    "CRM básico",
    "Bandeja WhatsApp",
  ],
  macbot: BENEFICIOS_MACBOT,
  starter: BENEFICIOS_MACBOT,
  pro: BENEFICIOS_MACBOT,
  agency: [
    "Todo Pro",
    "Multi cuenta futura",
    "Marca blanca futura",
    "Implementación personalizada",
    "Soporte VIP",
    "Asesoría directa",
    "Funciones empresariales futuras",
  ],
};

export const PLAN_TAGLINES = {
  free: "Ideal para probar MacBot.",
  macbot: "El plan de MacBot para operar WhatsApp, flujos y CRM.",
  starter: "El plan de MacBot para operar WhatsApp, flujos y CRM.",
  pro: "El plan de MacBot para operar WhatsApp, flujos y CRM.",
  agency: "Para agencias y empresas.",
};

export function getPlanBenefits(planKey) {
  const key = canonizarPlanUi(planKey);
  return PLAN_BENEFITS[key] || PLAN_BENEFITS.free;
}

export function getPlanLimits(planKey) {
  const key = canonizarPlanUi(planKey);
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}

export function getUpgradeRecommendation(planKey) {
  const key = canonizarPlanUi(planKey);
  if (key === "agency") return null;
  if (key === "macbot") return "Habla con ventas para el plan Agency.";
  return "Actualiza a Starter por $18/mes.";
}

export function shouldShowPlanUpgrade(planKey) {
  return canonizarPlanUi(planKey) !== "agency";
}

export function getUpgradeAction(planKey) {
  const key = canonizarPlanUi(planKey);
  if (key === "agency") return { type: "none" };
  if (key === "macbot") {
    return {
      type: "contact",
      label: "Contactar ventas",
      href: "mailto:ventas@macbot.app?subject=Plan%20Agency%20MacBot",
    };
  }
  return { type: "pricing", label: "Mejorar plan" };
}
