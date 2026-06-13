/** Textos comerciales MacBot — solo UI (no altera límites en backend). */

export const PLAN_LIMITS = {
  free: ["1 WhatsApp", "100 contactos", "1 flujo"],
  starter: ["1 WhatsApp", "1.000 contactos", "10 flujos"],
  pro: ["2 WhatsApp", "2.000 contactos", "20 flujos"],
  agency: ["WhatsApps personalizados", "Contactos personalizados", "Flujos personalizados"],
};

export const PLAN_BENEFITS = {
  free: [
    "Agente Rápido",
    "CRM básico",
    "Bandeja WhatsApp",
  ],
  starter: [
    "Agente Rápido",
    "IA Python básica",
    "Seguimientos CRM",
    "Remarketing 24h",
    "Lector de pagos",
    "Conversiones",
    "Etiquetas",
    "Métricas básicas",
  ],
  pro: [
    "Todo Starter",
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
  ],
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
  starter: "Ideal para emprendedores, afiliados e infoproductores.",
  pro: "Ideal para negocios que ya venden y quieren escalar.",
  agency: "Para agencias y empresas.",
};

export function getPlanBenefits(planKey) {
  const key = String(planKey || "free").toLowerCase();
  return PLAN_BENEFITS[key] || PLAN_BENEFITS.free;
}

export function getPlanLimits(planKey) {
  const key = String(planKey || "free").toLowerCase();
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}

export function getUpgradeRecommendation(planKey) {
  const key = String(planKey || "free").toLowerCase();
  if (key === "agency") return null;
  if (key === "pro") return "Habla con ventas para el plan Agency.";
  if (key === "starter") return "Actualiza a Pro por $35/mes.";
  return "Actualiza a Starter por $18/mes.";
}

export function shouldShowPlanUpgrade(planKey) {
  return String(planKey || "").toLowerCase() !== "agency";
}

export function getUpgradeAction(planKey) {
  const key = String(planKey || "free").toLowerCase();
  if (key === "agency") return { type: "none" };
  if (key === "pro") {
    return {
      type: "contact",
      label: "Contactar ventas",
      href: "mailto:ventas@macbot.app?subject=Plan%20Agency%20MacBot",
    };
  }
  return { type: "pricing", label: "Mejorar plan" };
}
