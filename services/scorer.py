import os
import joblib
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Hallucination Scorer Service")

MODEL_PATH = os.getenv("MODEL_PATH", "models/baseline_xgboost.joblib")

def load_or_create_model(model_path):
    os.makedirs(os.path.dirname(os.path.abspath(model_path)), exist_ok=True)
    if os.path.exists(model_path):
        return joblib.load(model_path)
    
    print(f"Model file '{model_path}' not found. Training baseline XGBoost classifier on synthetic data...")
    import xgboost as xgb
    import numpy as np

    # Feature order: ["embedding_similarity", "entailment_score", "contradiction_score", "neutral_score", "entity_grounding_ratio"]
    # 0 = grounded, 1 = hallucinated
    X_synthetic = np.array([
        [0.85, 0.90, 0.05, 0.05, 1.00],
        [0.92, 0.95, 0.02, 0.03, 1.00],
        [0.78, 0.82, 0.08, 0.10, 0.90],
        [0.88, 0.89, 0.04, 0.07, 0.95],
        [0.20, 0.10, 0.85, 0.05, 0.10],
        [0.30, 0.15, 0.75, 0.10, 0.20],
        [0.15, 0.05, 0.90, 0.05, 0.00],
        [0.25, 0.20, 0.70, 0.10, 0.15],
    ])
    y_synthetic = np.array([0, 0, 0, 0, 1, 1, 1, 1])

    clf = xgb.XGBClassifier(n_estimators=50, max_depth=3, learning_rate=0.1, random_state=42)
    clf.fit(X_synthetic, y_synthetic)
    joblib.dump(clf, model_path)
    print(f"Baseline classifier saved to {model_path}")
    return clf

classifier = load_or_create_model(MODEL_PATH)

embed_model = None
nli_tokenizer = None
nli_model = None
nlp = None

def init_models():
    global embed_model, nli_tokenizer, nli_model, nlp
    try:
        from sentence_transformers import SentenceTransformer
        embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    except Exception as e:
        print(f"Notice: SentenceTransformer model loading deferred or failed: {e}")

    try:
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        nli_tokenizer = AutoTokenizer.from_pretrained("roberta-large-mnli")
        nli_model = AutoModelForSequenceClassification.from_pretrained("roberta-large-mnli")
        nli_model.eval()
    except Exception as e:
        print(f"Notice: RoBERTa NLI model loading deferred or failed: {e}")

    try:
        import spacy
        nlp = spacy.load("en_core_web_sm")
    except Exception as e:
        print(f"Notice: SpaCy model loading deferred or failed: {e}")

try:
    init_models()
except Exception as err:
    print(f"Models initialization warning: {err}")

def embedding_similarity(context, answer):
    if embed_model is not None:
        from sentence_transformers import util
        embeds = embed_model.encode([context, answer], convert_to_tensor=True)
        return util.cos_sim(embeds[0], embeds[1]).item()
    
    # Fallback token Jaccard similarity
    ctx_words = set(context.lower().split())
    ans_words = answer.lower().split()
    if not ans_words:
        return 0.5
    matches = sum(1 for w in ans_words if w in ctx_words)
    return min(1.0, matches / len(ans_words))

def entailment_scores(context, answer):
    if nli_model is not None and nli_tokenizer is not None:
        import torch
        inputs = nli_tokenizer(context, answer, truncation=True, max_length=512, return_tensors="pt")
        with torch.no_grad():
            logits = nli_model(**inputs).logits
        probs = torch.softmax(logits, dim=1)[0]
        return {"contradiction_score": probs[0].item(), "neutral_score": probs[1].item(), "entailment_score": probs[2].item()}
    
    sim = embedding_similarity(context, answer)
    return {
        "contradiction_score": max(0.0, round(1.0 - sim, 4)),
        "neutral_score": 0.1,
        "entailment_score": max(0.0, round(sim, 4))
    }

def entity_grounding_ratio(context, answer):
    facts = []
    if nlp is not None:
        doc = nlp(answer)
        facts = [ent.text for ent in doc.ents]
    
    facts += re.findall(r'\b\d+(?:\.\d+)?\b', answer)
    if not facts:
        facts = [w for w in answer.split() if w.istitle()]

    if not facts:
        return 1.0
    context_lower = context.lower()
    return sum(1 for f in facts if f.lower() in context_lower) / len(facts)

class ScoreRequest(BaseModel):
    question: str
    context: str
    answer: str

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": classifier is not None}

@app.post("/internal/score")
def score(req: ScoreRequest):
    try:
        sim = embedding_similarity(req.context, req.answer)
        nli = entailment_scores(req.context, req.answer)
        grounding = entity_grounding_ratio(req.context, req.answer)

        features = {
            "embedding_similarity": float(sim),
            "entailment_score": float(nli["entailment_score"]),
            "contradiction_score": float(nli["contradiction_score"]),
            "neutral_score": float(nli["neutral_score"]),
            "entity_grounding_ratio": float(grounding)
        }
        feature_order = ["embedding_similarity", "entailment_score", "contradiction_score", "neutral_score", "entity_grounding_ratio"]
        X = [[features[f] for f in feature_order]]
        prob_hallucinated = float(classifier.predict_proba(X)[0][1])

        return {"trust_score": round(1 - prob_hallucinated, 4), "features": features}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")
