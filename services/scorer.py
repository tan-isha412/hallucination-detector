import os
import re
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Hallucination Scorer Service")

class ScoreRequest(BaseModel):
    question: str = ""
    context: str
    answer: str

def compute_similarity(context: str, answer: str) -> float:
    def tokenize(text):
        return [w.lower() for w in re.findall(r'\b\w+\b', text)]
    
    tokens1 = tokenize(context)
    tokens2 = tokenize(answer)
    if not tokens1 or not tokens2:
        return 0.5
    
    set1, set2 = set(tokens1), set(tokens2)
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.5

def extract_named_entities_and_numbers(text: str):
    return re.findall(r'\b[A-Z0-9][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b', text)

def compute_grounding_ratio(context: str, answer: str) -> float:
    entities = extract_named_entities_and_numbers(answer)
    if not entities:
        return 1.0
    context_lower = context.lower()
    grounded = sum(1 for e in entities if e.lower() in context_lower)
    return grounded / len(entities)

@app.post("/internal/score")
def score(payload: ScoreRequest):
    context = payload.context
    answer = payload.answer
    question = payload.question

    sim = compute_similarity(context, answer)
    grounding = compute_grounding_ratio(context, answer)

    entailment = min(1.0, max(0.0, 0.45 * sim + 0.55 * grounding))
    contradiction = min(1.0, max(0.0, 1.0 - entailment))
    neutral = min(1.0, max(0.0, max(0.05, 1.0 - (entailment + contradiction))))

    trust_score = round(float(np.clip(0.4 * sim + 0.45 * grounding + 0.15 * entailment, 0.0, 1.0)), 4)

    return {
        "trust_score": trust_score,
        "features": {
            "embedding_similarity": round(float(sim), 4),
            "entailment_score": round(float(entailment), 4),
            "contradiction_score": round(float(contradiction), 4),
            "neutral_score": round(float(neutral), 4),
            "entity_grounding_ratio": round(float(grounding), 4)
        }
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("scorer:app", host="0.0.0.0", port=port, reload=False)
