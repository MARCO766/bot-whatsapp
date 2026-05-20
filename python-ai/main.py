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


@app.get("/health")
def health():
    return {"ok": True, "service": "python-ai"}


@app.post("/detect-intent", response_model=DetectIntentResponse)
def detect_intent(body: DetectIntentRequest) -> DetectIntentResponse:
    message = body.message or ""
    context = body.context or ""
    threshold = max(0, min(100, int(body.threshold or 40)))

    print("📩 mensaje:", message)

    normalizado = normalize_text(message)
    corregido = corregir_texto(normalizado)

    ranking: list[dict[str, Any]] = []
    for route in body.routes:
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
    print("🎯 ganador:", winner)

    if not winner or winner["score"] < threshold:
        return DetectIntentResponse(
            intent=winner["name"] if winner else "",
            score=winner["score"] if winner else 0,
            route_id=winner["id"] if winner else None,
            matched=False,
        )

    return DetectIntentResponse(
        intent=winner["name"],
        score=winner["score"],
        route_id=winner["id"],
        matched=True,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
