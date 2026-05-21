"""
MacBot — detector de intención local (solo scoring; Node sigue el flujo).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MacBot Python IA", version="1.0.0")

CORRECCIONES = {
    "presio": "precio",
    "presios": "precios",
    "kiero": "quiero",
    "qiero": "quiero",
    "depositoo": "deposito",
    "cuantoo": "cuanto",
    "tranferencia": "transferencia",
    "transferecia": "transferencia",
}

ALIAS_PALABRAS = {
    "cuadrito": "qr",
    "cuadro": "qr",
    "codigo": "qr",
    "escanear": "qr",
}


class RouteIn(BaseModel):
    id: str
    name: str
    synonyms: list[str] = Field(default_factory=list)
    priority: int = 50


class DetectIntentRequest(BaseModel):
    message: str = ""
    context: str = ""
    routes: list[RouteIn] = Field(default_factory=list)
    threshold: int = 40


class DetectIntentResponse(BaseModel):
    intent: str = ""
    score: int = 0
    route_id: str | None = None
    matched: bool = False


class ProductDataIn(BaseModel):
    name: str = ""
    description: str = ""
    price: str = ""
    includes: str = ""
    bonuses: str = ""
    guarantee: str = ""
    access: str = ""
    paymentMethods: str = ""
    faq: str = ""


class ChatTurnIn(BaseModel):
    role: str = ""
    text: str = ""


class DetectIntentProRequest(BaseModel):
    message: str = ""
    threshold: int = 40
    routes: list[RouteIn] = Field(default_factory=list)
    productData: ProductDataIn = Field(default_factory=ProductDataIn)
    tone: str = "amable"
    chat_history: list[ChatTurnIn] = Field(default_factory=list)
    fallbackMessage: str = ""
    enabledConversation: bool = True


class DetectIntentProResponse(BaseModel):
    action: str = "reply"
    intent: str = ""
    score: int = 0
    route_id: str | None = None
    reply: str = ""


PROMPT_INTERNO_PRO = (
    "Eres un asesor de ventas premium por WhatsApp. "
    "Suena humano, cercano y natural (2–4 líneas). "
    "Reescribe la info del producto; no copies campos literales. "
    "Usa 1–3 emojis, beneficio + pregunta suave. "
    "Nunca inventes datos fuera del producto. "
    "Rutas/caminos: solo route_id, sin texto."
)


def normalize_text(text: str) -> str:
    s = str(text or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF]",
        " ",
        s,
        flags=re.UNICODE,
    )
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def corregir_texto(texto_norm: str) -> str:
    if not texto_norm:
        return ""
    partes = []
    for palabra in texto_norm.split():
        p = CORRECCIONES.get(palabra, palabra)
        p = ALIAS_PALABRAS.get(p, p)
        partes.append(p)
    return " ".join(partes)


def score_frase(texto: str, frase: str, nombre_ruta: str) -> int:
    if not frase or not texto:
        return 0
    frase = frase.strip()
    if not frase:
        return 0

    if texto == frase:
        return 60 if frase == normalize_text(nombre_ruta) else 50

    if frase in texto.split() or f" {frase} " in f" {texto} ":
        if frase == normalize_text(nombre_ruta):
            return 60
        return 50

    palabras_frase = frase.split()
    if len(palabras_frase) > 1 and all(p in texto for p in palabras_frase):
        return 45

    for palabra in texto.split():
        if len(palabra) < 3:
            continue
        if palabra in frase or frase in palabra:
            return 20
        if frase.startswith(palabra[:4]) or palabra.startswith(frase[:4]):
            return 20

    return 0


def score_contexto(texto: str, contexto: str) -> int:
    ctx = normalize_text(contexto)
    if not ctx:
        return 0
    bonus = 0
    hints_pago = ["pago", "pagar", "metodo", "forma de pago", "como pago", "prefieres"]
    if any(h in ctx for h in hints_pago):
        if any(w in texto for w in ["qr", "deposito", "banco", "transferencia", "tigo"]):
            bonus += 10
    if normalize_text(ctx) in texto or texto in normalize_text(ctx):
        bonus += 10
    return min(10, bonus)


def score_ruta(texto: str, route: RouteIn, contexto: str) -> int:
    nombre_norm = normalize_text(route.name)
    score = 0

    score = max(score, score_frase(texto, nombre_norm, route.name))

    for syn in route.synonyms:
        syn_norm = normalize_text(syn)
        score = max(score, score_frase(texto, syn_norm, route.name))

    score += score_contexto(texto, contexto)

    prioridad = max(0, min(100, int(route.priority or 0)))
    score += round(prioridad * 0.1)

    return min(100, score)


def detectar_ruta_ganadora(
    message: str, routes: list[RouteIn], threshold: int, context: str = ""
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    normalizado = normalize_text(message)
    corregido = corregir_texto(normalizado)
    ranking: list[dict[str, Any]] = []
    for route in routes:
        if not route.id or not route.name:
            continue
        sc = score_ruta(corregido, route, context)
        ranking.append(
            {
                "id": route.id,
                "name": route.name,
                "score": sc,
                "priority": route.priority,
            }
        )
    ranking.sort(key=lambda x: (-x["score"], -x["priority"]))
    winner = ranking[0] if ranking else None
    if winner and winner["score"] >= threshold:
        return winner, ranking
    return None, ranking


def _campo_producto(product: ProductDataIn, key: str) -> str:
    val = getattr(product, key, "") or ""
    return str(val).strip()


PERSONAJES_DBZ = ["goku", "vegeta", "kid buu", "buu", "dragon ball", "dbz"]
PERSONAJES_PALABRAS = [
    "goku",
    "vegeta",
    "buu",
    "personaje",
    "personajes",
    "muestra",
    "muestras",
    "dragon",
    "papel",
    "figura",
]


def _texto_producto_completo(product: ProductDataIn) -> str:
    return " ".join(
        [
            _campo_producto(product, "includes"),
            _campo_producto(product, "faq"),
            _campo_producto(product, "description"),
            _campo_producto(product, "bonuses"),
        ]
    ).lower()


def _es_incluye_completo(texto: str) -> bool:
    return any(
        k in texto
        for k in [
            "que incluye",
            "que trae",
            "todo incluye",
            "todo trae",
            "que viene",
            "listado",
            "todo el pack",
            "que contiene",
            "incluye todo",
        ]
    )


def clasificar_consulta_intent(texto: str) -> str:
    """Clasifica la pregunta del lead (solo consulta, no ruta de pago)."""
    if any(
        k in texto
        for k in ["estafa", "fraude", "engano", "confianza", "seguro", "legitimo", "real es", "no es estafa"]
    ):
        return "estafa"

    if any(k in texto for k in PERSONAJES_PALABRAS) or any(
        k in texto for k in PERSONAJES_DBZ
    ):
        return "personajes"

    if "bono" in texto and not _es_incluye_completo(texto):
        return "bonos"

    if any(
        k in texto
        for k in ["hijo", "hija", "niño", "nina", "edad", "peque", "chico", "chica", "sirve para"]
    ):
        return "ninos"

    if any(
        k in texto
        for k in ["acceso", "accedo", "entrega", "descarga", "ingreso", "como recibo", "como es el acceso"]
    ):
        return "acceso"

    if any(k in texto for k in ["precio", "cuesta", "sale", "valor", "cuanto", "costo"]):
        return "precio"

    if any(k in texto for k in ["garantia", "devolucion", "reembolso"]):
        return "garantia"

    if any(
        k in texto
        for k in [
            "pago",
            "pagar",
            "metodo",
            "transferencia",
            "deposito",
            "como pago",
            "forma de pago",
        ]
    ):
        return "pago"

    if _es_incluye_completo(texto) or (
        "incluye" in texto and any(k in texto for k in ["todo", "pack", "completo"])
    ):
        return "incluye"

    if any(k in texto for k in ["hola", "buenas", "hey", "saludos"]):
        return "saludo"

    if any(k in texto for k in ["sirve", "funciona", "vale la pena", "me conviene", "bueno para"]):
        return "ninos"

    return "general"


def _recortar(texto: str, max_len: int = 140) -> str:
    t = (texto or "").strip().rstrip(".")
    if len(t) <= max_len:
        return t
    corto = t[: max_len - 3].rsplit(" ", 1)[0]
    return corto + "..."


def _personajes_detectados(texto: str, product: ProductDataIn) -> list[str]:
    corpus = _texto_producto_completo(product)
    nombres = []
    mapa = [
        ("goku", "Goku"),
        ("vegeta", "Vegeta"),
        ("kid buu", "Kid Buu"),
        ("buu", "Kid Buu"),
    ]
    vistos: set[str] = set()
    for key, label in mapa:
        if (key in texto or key in corpus) and label not in vistos:
            nombres.append(label)
            vistos.add(label)
    return nombres


def _pregunta_suave_opcional(intent: str, texto: str) -> str:
    if intent in ("estafa", "bonos", "acceso", "precio", "personajes"):
        return ""
    if intent == "incluye":
        return ""
    if any(w in texto for w in ["gracias", "ok", "listo", "dale"]):
        return ""
    return ""


def _resumen_precio_incluye(includes: str, bonuses: str) -> str:
    """Una línea corta para precio, sin volcar todo el catálogo."""
    partes: list[str] = []
    inc = (includes or "").lower()
    if "plantilla" in inc:
        m = re.search(r"\d[\d.]*\s*plantillas?", inc)
        if m:
            partes.append(f"las {m.group()}")
        else:
            partes.append("las plantillas")
    if bonuses or "bono" in inc:
        partes.append("los 6 bonos gratis" if "6" in (bonuses or inc) else "los bonos incluidos")
    if not partes:
        return ""
    if len(partes) == 1:
        return f"Incluye {partes[0]}."
    return f"Incluye {partes[0]} y {partes[1]}."


def _naturalizar_metodos_pago(metodos: str) -> str:
    m = metodos.strip().rstrip(".")
    if not m:
        return ""
    bajo = m.lower()
    if "qr" in bajo and "deposito" in bajo:
        return "puedes pagar por QR o depósito"
    if "qr" in bajo:
        return "puedes pagar por QR"
    if "deposito" in bajo or "transferencia" in bajo:
        return "puedes pagar por depósito o transferencia"
    if "tigo" in bajo:
        return "también aceptamos Tigo Money"
    return _recortar(f"puedes pagar con {m}", 60)


def _fallback_corto(fallback: str) -> str:
    fb = (fallback or "").strip()
    if fb and len(fb) < 120 and "pack digital ideal" not in fb.lower():
        return fb
    return "Te ayudo 😊 ¿quieres saber precio, qué incluye o cómo recibirlo?"


def generar_reply_por_intent(
    consulta_intent: str,
    product: ProductDataIn,
    tone: str,
    texto: str,
    fallback: str,
) -> str:
    fb = _fallback_corto(fallback)
    extra = _pregunta_suave_opcional(consulta_intent, texto)

    if consulta_intent == "personajes":
        chars = _personajes_detectados(texto, product)
        if chars:
            lista = ", ".join(chars[:-1]) + " y " + chars[-1] if len(chars) > 1 else chars[0]
            msg = (
                f"Sí 😊 trae personajes como {lista} para armar en papel. "
                "Están muy buenos para niños fans de Dragon Ball ✂️"
            )
        else:
            msg = (
                "Sí 😊 trae varios personajes en papel para imprimir y armar. "
                "¿Buscas alguno en particular?"
            )
        return msg

    if consulta_intent == "bonos":
        bon = _campo_producto(product, "bonuses")
        if bon and len(bon) < 100:
            msg = f"Sí 😊 {bon.rstrip('.')}. Vienen incluidos sin costo extra con el acceso."
        else:
            msg = (
                "Sí 😊 los bonos vienen incluidos sin costo extra. "
                "Apenas recibes el acceso, también puedes descargarlos."
            )
        return msg

    if consulta_intent == "ninos":
        return (
            "Sí 😊 es ideal para niños porque los mantiene entretenidos "
            "y estimula su creatividad con actividades de papel."
        )

    if consulta_intent == "acceso":
        acc = _campo_producto(product, "access")
        if acc and len(acc) < 100:
            msg = f"Es digital e inmediato 😊 {_recortar(acc, 100)}"
        else:
            msg = (
                "Es digital e inmediato 😊 Apenas confirmas el pago te enviamos "
                "el acceso para descargarlo desde tu celular o computadora."
            )
        return msg

    if consulta_intent == "precio":
        precio = _campo_producto(product, "price")
        if not precio:
            return fb
        resumen = _resumen_precio_incluye(
            _campo_producto(product, "includes"),
            _campo_producto(product, "bonuses"),
        )
        msg = f"Está en {precio} 😊"
        if resumen:
            msg += f" {resumen}"
        return msg

    if consulta_intent == "estafa":
        return (
            "Te entiendo 😊 Es normal desconfiar. "
            "Es un producto digital y te enviamos el acceso apenas confirmas el pago."
        )

    if consulta_intent == "garantia":
        g = _campo_producto(product, "guarantee")
        if g:
            return f"Tranquilo 😊 {_recortar(g, 120)}"
        return fb

    if consulta_intent == "pago":
        met = _naturalizar_metodos_pago(_campo_producto(product, "paymentMethods"))
        if met:
            return f"Sí 😊 {met.capitalize()}."
        return fb

    if consulta_intent == "incluye":
        inc = _campo_producto(product, "includes")
        bon = _campo_producto(product, "bonuses")
        if inc:
            cuerpo = _recortar(inc, 160)
            if bon:
                cuerpo += f" y {_recortar(bon, 60)}"
            return f"Incluye {cuerpo} 🎁"
        return fb

    if consulta_intent == "saludo":
        return (
            "Hola 😊 qué gusto que escribas. "
            "¿Te cuento precio, qué incluye o cómo recibirlo?"
        )

    faq = _campo_producto(product, "faq")
    if faq and len(texto) > 4:
        for linea in faq.split("\n"):
            ln = normalize_text(linea)
            if ln and any(p in texto for p in ln.split()[:4] if len(p) > 3):
                return f"Sí 😊 {_recortar(linea.strip(), 120)}"

    return fb if not extra else f"{fb} {extra}"


def generar_reply_producto(
    message: str,
    product: ProductDataIn,
    tone: str,
    fallback: str,
    chat_history: list[ChatTurnIn],
) -> str:
    del chat_history, tone  # contexto vía clasificación; tono sutil en plantillas
    texto = corregir_texto(normalize_text(message))
    consulta_intent = clasificar_consulta_intent(texto)
    print("🧠 IA PRO intención consulta:", consulta_intent)
    reply = generar_reply_por_intent(consulta_intent, product, tone, texto, fallback)
    print("💬 IA PRO reply corto:", reply)
    return reply


@app.get("/health")
def health():
    return {"ok": True, "service": "python-ai"}


@app.post("/detect-intent", response_model=DetectIntentResponse)
def detect_intent(body: DetectIntentRequest) -> DetectIntentResponse:
    message = body.message or ""
    context = body.context or ""
    threshold = max(0, min(100, int(body.threshold or 40)))

    print("📩 mensaje:", message)

    winner, ranking = detectar_ruta_ganadora(message, body.routes, threshold, context)
    print("🎯 ganador:", winner)

    if not winner:
        top = ranking[0] if ranking else None
        return DetectIntentResponse(
            intent=top["name"] if top else "",
            score=top["score"] if top else 0,
            route_id=top["id"] if top else None,
            matched=False,
        )

    return DetectIntentResponse(
        intent=winner["name"],
        score=winner["score"],
        route_id=winner["id"],
        matched=True,
    )


@app.post("/detect-intent-pro", response_model=DetectIntentProResponse)
def detect_intent_pro(body: DetectIntentProRequest) -> DetectIntentProResponse:
    message = body.message or ""
    threshold = max(0, min(100, int(body.threshold or 40)))
    print("🤖 AGENTE IA PRO — mensaje:", message)
    print("📋 prompt interno (fijo):", PROMPT_INTERNO_PRO[:80], "...")

    history_ctx = " ".join(
        (t.text or "") for t in (body.chat_history or [])[-4:]
    )
    winner, ranking = detectar_ruta_ganadora(
        message, body.routes, threshold, history_ctx
    )
    print("🎯 ganador Pro:", winner)

    if winner:
        print("➡️ IA PRO sale por ruta:", winner["id"])
        return DetectIntentProResponse(
            action="route",
            intent=winner["name"],
            score=winner["score"],
            route_id=winner["id"],
            reply="",
        )

    top = ranking[0] if ranking else None
    score_bajo = top["score"] if top else 0

    if not body.enabledConversation:
        fb = (body.fallbackMessage or "").strip() or (
            "No entendí bien 😊 ¿Qué opción prefieres?"
        )
        return DetectIntentProResponse(
            action="reply",
            intent="router",
            score=score_bajo,
            reply=fb,
        )

    reply = generar_reply_producto(
        message,
        body.productData,
        body.tone or "amable",
        body.fallbackMessage or "",
        body.chat_history or [],
    )
    print("💬 IA PRO responde:", reply)
    return DetectIntentProResponse(
        action="reply",
        intent="consulta",
        score=score_bajo,
        reply=reply,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
