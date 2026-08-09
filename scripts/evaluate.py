import os
import argparse
import pandas as pd
import joblib
from sklearn.metrics import precision_recall_fscore_support, classification_report, confusion_matrix

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

FEATURE_COLS = [
    "embedding_similarity", "entailment_score",
    "contradiction_score", "neutral_score", "entity_grounding_ratio"
]

def evaluate(model_path, test_path):
    model = joblib.load(model_path)
    test_df = pd.read_json(test_path, lines=True)

    X_test = test_df[FEATURE_COLS]
    y_test = (test_df["label"] == "hallucinated").astype(int)
    y_pred = model.predict(X_test)

    print("\n--- Overall ---")
    print(classification_report(y_test, y_pred, target_names=["grounded", "hallucinated"]))
    print(confusion_matrix(y_test, y_pred))

    test_df["pred"] = y_pred
    test_df["true"] = y_test.values

    print("\n--- By source_dataset ---")
    for source in test_df["source_dataset"].unique():
        subset = test_df[test_df["source_dataset"] == source]
        p, r, f1, _ = precision_recall_fscore_support(
            subset["true"], subset["pred"], average="binary", zero_division=0
        )
        print(f"{source}: P={p:.3f} R={r:.3f} F1={f1:.3f} (n={len(subset)})")

    print("\n--- By hallucination_type (hallucinated rows only) ---")
    halluc = test_df[test_df["true"] == 1]
    for htype in halluc["hallucination_type"].unique():
        rows = halluc[halluc["hallucination_type"] == htype]
        caught = (rows["pred"] == 1).sum()
        print(f"{htype}: caught {caught}/{len(rows)} ({caught/len(rows)*100:.1f}%)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=os.path.join(PROJECT_ROOT, "models", "baseline_xgboost.joblib"))
    parser.add_argument("--test", default=os.path.join(PROJECT_ROOT, "data", "splits", "test_features.jsonl"))
    args = parser.parse_args()
    evaluate(args.model, args.test)