export const FLOW_FOLDERS = [
  { id: "ventas_automaticas", label: "Ventas automáticas", icon: "💰" },
  { id: "lanzamientos", label: "Lanzamientos", icon: "🚀" },
  { id: "recuperacion", label: "Recuperación", icon: "🛒" },
  { id: "atencion", label: "Atención", icon: "🎧" },
  { id: "retargeting", label: "Retargeting", icon: "🎯" },
  { id: "evergreen", label: "Evergreen", icon: "♾️" },
  { id: "sin_carpeta", label: "Sin carpeta", icon: "📂" },
];

export const FLOW_STATES = [
  { id: "activo", label: "Activo", color: "#22c55e" },
  { id: "pausado", label: "Pausado", color: "#f59e0b" },
  { id: "borrador", label: "Borrador", color: "#94a3b8" },
  { id: "error", label: "Error", color: "#ef4444" },
];

export const SORT_OPTIONS = [
  { id: "recientes", label: "Más recientes" },
  { id: "usados", label: "Más usados" },
  { id: "conversiones", label: "Más conversiones" },
  { id: "leads", label: "Más leads" },
  { id: "modificacion", label: "Última modificación" },
  { id: "alfabetico", label: "Alfabético" },
];

export const IMPORT_TEMPLATES = [
  { id: "venta_automatica", title: "Venta automática", desc: "Secuencia de venta con seguimiento", icon: "💰" },
  { id: "lanzamiento_domingo", title: "Lanzamiento domingo", desc: "Campaña de lanzamiento semanal", icon: "🚀" },
  { id: "recuperacion_carrito", title: "Recuperación carrito", desc: "Recupera leads que no compraron", icon: "🛒" },
  { id: "seguimiento_whatsapp", title: "Seguimiento WhatsApp", desc: "Recordatorios automáticos", icon: "💬" },
  { id: "retargeting", title: "Retargeting", desc: "Reactiva contactos fríos", icon: "🎯" },
  { id: "atencion_cliente", title: "Atención al cliente", desc: "FAQ y soporte inicial", icon: "🎧" },
];

export const META_STORAGE_KEY = "macbot_flujos_meta_local";

export const NODE_PREVIEW_COLORS = {
  inicio: "#f43f5e",
  contenido: "#14b8a6",
  seguimiento: "#ff6b35",
  espera: "#8b5cf6",
  etiqueta: "#3b82f6",
  conversion: "#facc15",
  conectar: "#22c55e",
};
