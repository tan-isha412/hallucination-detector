from sentence_transformers import SentenceTransformer, util
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
embed_model = SentenceTransformer("all-MiniLM-L6-v2")

def embedding_similarity(context, answer):
    embeds = embed_model.encode([context, answer], convert_to_tensor=True)
    return util.cos_sim(embeds[0], embeds[1]).item()



nli_tokenizer = AutoTokenizer.from_pretrained("roberta-large-mnli")
nli_model = AutoModelForSequenceClassification.from_pretrained("roberta-large-mnli")
nli_model.eval()

# roberta-large-mnli label order: 0=contradiction, 1=neutral, 2=entailment
def entailment_scores(context, answer):
    inputs = nli_tokenizer(context, answer, truncation=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        logits = nli_model(**inputs).logits
    probs = torch.softmax(logits, dim=1)[0]
    return {
        "contradiction_score": probs[0].item(),
        "neutral_score": probs[1].item(),
        "entailment_score": probs[2].item()
    }

import spacy
import re

nlp = spacy.load("en_core_web_sm")

def entity_grounding_ratio(context, answer):
    doc = nlp(answer)
    entities = [ent.text for ent in doc.ents]
    numbers = re.findall(r'\b\d+(?:\.\d+)?\b', answer)
    facts = entities + numbers

    if not facts:
        return 1.0  # no checkable facts means nothing to contradict

    context_lower = context.lower()
    found = sum(1 for f in facts if f.lower() in context_lower)
    return found / len(facts)



def self_consistency_score(question, context, generate_fn, n=3):
    answers = [generate_fn(question, context) for _ in range(n)]
    answers = [a for a in answers if a]
    if len(answers) < 2:
        return None
    embeds = embed_model.encode(answers, convert_to_tensor=True)
    sims = []
    for i in range(len(answers)):
        for j in range(i + 1, len(answers)):
            sims.append(util.cos_sim(embeds[i], embeds[j]).item())
    return sum(sims) / len(sims)


import os
import json
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

def add_features(df):
    rows = []
    for idx, row in df.iterrows():
        context, answer = row["context"], row["answer"]

        sim = embedding_similarity(context, answer)
        nli = entailment_scores(context, answer)
        grounding = entity_grounding_ratio(context, answer)

        record = row.to_dict()
        record["embedding_similarity"] = sim
        record["entailment_score"] = nli["entailment_score"]
        record["contradiction_score"] = nli["contradiction_score"]
        record["neutral_score"] = nli["neutral_score"]
        record["entity_grounding_ratio"] = grounding
        rows.append(record)

        if (idx + 1) % 50 == 0:
            print(f"Processed {idx + 1}/{len(df)}")

    return pd.DataFrame(rows)

for split in ["train", "val", "test"]:
    path = os.path.join(PROJECT_ROOT, "data", "splits", f"{split}.jsonl")
    df = pd.read_json(path, lines=True)
    print(f"Extracting features for {split} ({len(df)} rows)...")
    featured = add_features(df)
    out_path = os.path.join(PROJECT_ROOT, "data", "splits", f"{split}_features.jsonl")
    featured.to_json(out_path, orient="records", lines=True)
    print(f"Saved {out_path}")