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
    "Eres un asesor de ventas para WhatsApp. "
    "Responde corto, humano y claro. "
    "Nunca inventes datos. "
    "Usa SOLO información del producto. "
    "Máximo 2–3 líneas. "
    "Ayuda al cliente. "
    "No avances el flujo salvo que detectes intención de un camino. "
    "Si hay intención de camino: no respondas texto, devuelve route_id. "
    "Si no sabes: usa fallback amable."
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


def _prefijo_tono(tone: str) -> str:
    t = normalize_text(tone)
    if t == "vendedor":
        return "¡Claro! "
    if t == "premium":
        return "Con gusto. "
    if t == "tecnico":
        return ""
    if t == "agresivo":
        return "¡Vamos! "
    return "Sí 😊 "


def generar_reply_producto(
    message: str,
    product: ProductDataIn,
    tone: str,
    fallback: str,
    chat_history: list[ChatTurnIn],
) -> str:
    texto = corregir_texto(normalize_text(message))
    pref = _prefijo_tono(tone)
    nombre = _campo_producto(product, "name") or "el producto"
    fb = (fallback or "").strip() or (
        "No tengo ese dato a mano 😊 ¿Te ayudo con precio, acceso o formas de pago?"
    )

    if any(k in texto for k in ["precio", "cuesta", "sale", "valor", "cuanto", "cuánto"]):
        precio = _campo_producto(product, "price")
        if precio:
            return f"{pref}El precio de {nombre} es {precio}."
        return fb

    if any(k in texto for k in ["incluye", "inclusiones", "que trae", "que lleva", "bono", "bonos"]):
        incluye = _campo_producto(product, "includes")
        bonos = _campo_producto(product, "bonuses")
        partes = [p for p in [incluye, bonos and f"Bonos: {bonos}" if bonos else ""] if p]
        if partes:
            return f"{pref}{' '.join(partes)}"
        return fb

    if any(k in texto for k in ["garantia", "garantía", "devolucion", "reembolso"]):
        g = _campo_producto(product, "guarantee")
        if g:
            return f"{pref}Garantía: {g}"
        return fb

    if any(k in texto for k in ["acceso", "accedo", "entrega", "recibo", "descarga", "ingreso"]):
        a = _campo_producto(product, "access")
        if a:
            return f"{pref}Acceso/entrega: {a}"
        return fb

    if any(
        k in texto
        for k in ["pago", "pagar", "metodo", "método", "transferencia", "deposito", "qr", "tigo"]
    ):
        p = _campo_producto(product, "paymentMethods")
        if p:
            return f"{pref}Formas de pago: {p}"
        return fb

    if any(k in texto for k in ["mas info", "más info", "informacion", "información", "detalle", "cuentame"]):
        desc = _campo_producto(product, "description")
        if desc:
            return f"{pref}{desc}"
        return fb

    if any(k in texto for k in ["hola", "buenas", "hey", "saludo"]):
        desc = _campo_producto(product, "description")
        if desc:
            return f"{pref}Hola, te cuento sobre {nombre}: {desc}"
        return f"{pref}Hola, ¿en qué te ayudo con {nombre}?"

    faq = _campo_producto(product, "faq")
    if faq and len(texto) > 4:
        for linea in faq.split("\n"):
            ln = normalize_text(linea)
            if ln and any(p in texto for p in ln.split()[:3] if len(p) > 3):
                return f"{pref}{linea.strip()}"

    ultimo_bot = ""
    for turn in reversed(chat_history or []):
        if normalize_text(turn.role) in ("assistant", "bot", "ia"):
            ultimo_bot = turn.text or ""
            break
    if ultimo_bot and any(
        w in normalize_text(ultimo_bot) for w in ["precio", "incluye", "pago"]
    ):
        if any(k in texto for k in ["si", "sí", "ok", "dale", "y eso", "como", "cuanto"]):
            desc = _campo_producto(product, "description")
            if desc:
                return f"{pref}{desc}"

    desc = _campo_producto(product, "description")
    if desc:
        return f"{pref}{desc}"
    return fb


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
