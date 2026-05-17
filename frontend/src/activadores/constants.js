export const TIPOS_ACTIVADOR = [
  { value: "palabra_unica", label: "Palabra clave única" },
  { value: "multiples_palabras", label: "Varias palabras clave" },
  { value: "cualquier_mensaje", label: "Cualquier mensaje" },
];

export function labelTipoActivador(tipo) {
  const found = TIPOS_ACTIVADOR.find((t) => t.value === tipo);
  return found?.label || "Palabra clave única";
}

export function displayActivadorTrigger(a) {
  if (a.tipo_activador === "cualquier_mensaje") return "Cualquier mensaje";
  if (a.tipo_activador === "multiples_palabras") {
    return a.palabras_clave_text || a.palabras_clave_array?.join(", ") || a.palabra_clave || "—";
  }
  return a.palabra_clave || a.frase || "—";
}
