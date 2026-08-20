import {
  getUpgradeRecommendation,
  shouldShowPlanUpgrade,
} from "./planCatalog";

const PLAN_LIMIT_CODES = new Set([
  "PLAN_LIMIT_WHATSAPP",
  "PLAN_LIMIT_FLUJOS",
  "PLAN_LIMIT_CONTACTOS",
  "PLAN_INACTIVE",
]);

const SUBTITLES = {
  PLAN_LIMIT_WHATSAPP: "Tu plan actual no permite agregar más líneas de WhatsApp.",
  PLAN_LIMIT_FLUJOS: "Tu plan actual no permite crear más flujos.",
  PLAN_LIMIT_CONTACTOS: "Tu plan actual llegó al máximo de contactos permitidos.",
  PLAN_INACTIVE: "Tu plan no está activo.",
};

export function formatPlanLimitValue(value) {
  if (value === null || value === -1) return "Ilimitado";
  if (value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "—";
}

/** Extrae payload de ApiError, fetch JSON o objeto plano */
export function extractPlanLimitPayload(error) {
  if (!error || typeof error !== "object") return null;

  const nested =
    error.payload ||
    error.details?.data ||
    error.data ||
    null;

  const code = error.code || nested?.code;
  if (!PLAN_LIMIT_CODES.has(code)) return null;

  return {
    ok: false,
    code,
    error: nested?.error || error.message || error.error,
    limite: nested?.limite ?? error.limite,
    usados: nested?.usados ?? error.usados,
    plan: nested?.plan ?? error.plan,
  };
}

export function isPlanLimitError(error) {
  return Boolean(extractPlanLimitPayload(error));
}

export function buildPlanLimitMessage(error, planNombre = null) {
  const payload = extractPlanLimitPayload(error);
  if (!payload) return null;

  const planKey = (planNombre || payload.plan || "free").toLowerCase();
  const recommendation =
    getUpgradeRecommendation(planKey) || "Tu plan Agency incluye capacidad personalizada.";

  return {
    title: "Has alcanzado el límite de tu plan",
    subtitle: SUBTITLES[payload.code] || payload.error || "Tu plan no permite esta acción.",
    code: payload.code,
    limite: payload.limite,
    usados: payload.usados,
    limiteLabel: formatPlanLimitValue(payload.limite),
    usadosLabel: formatPlanLimitValue(payload.usados),
    recommendation,
    showUpgrade: shouldShowPlanUpgrade(planKey),
    planKey,
    rawError: payload.error,
  };
}
