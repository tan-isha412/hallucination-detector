import json
import re
import numpy as np

def extract_named_entities_and_numbers(text):
    return re.findall(r'\b[A-Z0-9][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b', text)

def extract_features(question, context, answer):
    tokens_ctx = set(re.findall(r'\b\w+\b', context.lower()))
    tokens_ans = re.findall(r'\b\w+\b', answer.lower())

    if not tokens_ans:
        return [0.5, 0.5, 0.0, 0.5, 1.0]

    matching = sum(1 for t in tokens_ans if t in tokens_ctx)
    sim = matching / max(1, len(tokens_ans))

    entities = extract_named_entities_and_numbers(answer)
    if entities:
        grounded = sum(1 for e in entities if e.lower() in context.lower())
        grounding_ratio = grounded / len(entities)
    else:
        grounding_ratio = 1.0

    entailment = min(1.0, 0.45 * sim + 0.55 * grounding_ratio)
    contradiction = max(0.0, 1.0 - entailment)
    neutral = max(0.05, 1.0 - (entailment + contradiction))

    return [sim, entailment, contradiction, neutral, grounding_ratio]

if __name__ == '__main__':
    sample_ctx = "The James Webb Space Telescope was launched in December 2021."
    sample_ans = "The James Webb Space Telescope was launched in December 2021 by Ariane 5."
    print("Features:", extract_features("", sample_ctx, sample_ans))
