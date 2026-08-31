import json
import os
import numpy as np
from sklearn.metrics import classification_report, roc_auc_score, f1_score, accuracy_score

def evaluate_model(predictions_file):
    if not os.path.exists(predictions_file):
        print(f"Predictions file {predictions_file} not found.")
        return

    y_true = []
    y_pred = []
    y_scores = []

    with open(predictions_file, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            item = json.loads(line)
            y_true.append(item['label'])
            score = item.get('trust_score', item.get('score', 0.5))
            y_scores.append(score)
            y_pred.append(1 if score >= 0.5 else 0)

    print("Accuracy:", accuracy_score(y_true, y_pred))
    print("F1-Score:", f1_score(y_true, y_pred, zero_division=0))
    try:
        print("ROC-AUC:", roc_auc_score(y_true, y_scores))
    except Exception:
        pass
    print("\nDetailed Report:\n", classification_report(y_true, y_pred, zero_division=0))

if __name__ == '__main__':
    evaluate_model("data/test_predictions.jsonl")
