import json
import random
import time
import collections
import pandas as pd
from sentence_transformers import SentenceTransformer, util
from google import genai
from dotenv import load_dotenv
load_dotenv()
import os
# ---------- Setup ----------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
train_path = os.path.join(PROJECT_ROOT, "data", "splits", "train.jsonl")

train_df = pd.read_json(train_path, lines=True)
grounded = train_df[train_df["label"] == "grounded"].sample(n=15, random_state=42)
all_contexts = train_df["context"].tolist()

embed_model = SentenceTransformer("all-MiniLM-L6-v2")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

GENERATION_PROMPT = """You are a helpful assistant that answers questions using the provided context.
Context:
{context}
Question:
{question}
Answer the question clearly and concisely based on the context above."""


# ---------- LLM call ----------

def generate_answer(question, context, max_retries=3):
    prompt = GENERATION_PROMPT.format(context=context, question=question)
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            return response.text
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e):
                wait = 15  # stay safely under 5/min = 1 call per 12s
                print(f"Rate limited, waiting {wait}s before retry {attempt+1}/{max_retries}...")
                time.sleep(wait)
            else:
                print(f"Generation failed: {e}")
                return None
    return None


# ---------- Corruption strategies ----------

def delete_answer_sentence(context, answer):
    sentences = [s.strip() for s in context.split(".") if s.strip()]
    if len(sentences) < 2:
        return None

    sentence_embeds = embed_model.encode(sentences, convert_to_tensor=True)
    answer_embed = embed_model.encode(answer, convert_to_tensor=True)
    sims = util.cos_sim(answer_embed, sentence_embeds)[0]
    most_similar_idx = sims.argmax().item()

    corrupted_sentences = [s for i, s in enumerate(sentences) if i != most_similar_idx]
    return ". ".join(corrupted_sentences) + "."


def context_swap(context, all_contexts):
    unrelated = random.choice(all_contexts)
    attempts = 0
    while unrelated.strip() == context.strip() and attempts < 5:
        unrelated = random.choice(all_contexts)
        attempts += 1
    return unrelated


def truncate_context(context, keep_ratio=0.35):
    sentences = [s.strip() for s in context.split(".") if s.strip()]
    if len(sentences) < 2:
        return None
    keep_n = max(1, int(len(sentences) * keep_ratio))
    return ". ".join(sentences[:keep_n]) + "."


# ---------- Main loop ----------

strategies = ["delete_sentence", "context_swap", "truncation"]
synthetic_rows = []

for idx, row in grounded.iterrows():
    strategy = strategies[len(synthetic_rows) % 3]  # cycle for balanced counts

    if strategy == "delete_sentence":
        corrupted_context = delete_answer_sentence(row["context"], row["answer"])
    elif strategy == "context_swap":
        corrupted_context = context_swap(row["context"], all_contexts)
    else:
        corrupted_context = truncate_context(row["context"])

    if corrupted_context is None:
        continue

    new_answer = generate_answer(row["question"], corrupted_context)
    if new_answer is None:
        continue

    synthetic_rows.append({
        "question": row["question"],
        "context": corrupted_context,
        "answer": new_answer,
        "label": "hallucinated",
        "hallucination_type": strategy,
        "source_dataset": "synthetic"
    })

    if len(synthetic_rows) % 25 == 0:
        print(f"Generated {len(synthetic_rows)} so far...")


# ---------- Save ----------

with open("data/synthetic_dataset.jsonl", "w", encoding="utf-8") as out:
    for r in synthetic_rows:
        out.write(json.dumps(r) + "\n")

print(f"\nDone. Generated {len(synthetic_rows)} synthetic hallucination rows.")
print(collections.Counter(r["hallucination_type"] for r in synthetic_rows))