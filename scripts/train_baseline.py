import os
import pandas as pd
import xgboost as xgb
from sklearn.metrics import precision_recall_fscore_support, classification_report, confusion_matrix
import joblib
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
FEATURE_COLS = [
    "embedding_similarity",
    "entailment_score",
    "contradiction_score",
    "neutral_score",
    "entity_grounding_ratio"
]

# ---------- Load feature files ----------

train_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "train_features.jsonl"), lines=True)
val_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "val_features.jsonl"), lines=True)
test_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "test_features.jsonl"), lines=True)

print(f"Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

# ---------- Prepare X/y ----------

def prepare_xy(df):
    X = df[FEATURE_COLS]
    y = (df["label"] == "hallucinated").astype(int)  # 1 = hallucinated, 0 = grounded
    return X, y

X_train, y_train = prepare_xy(train_df)
X_val, y_val = prepare_xy(val_df)
X_test, y_test = prepare_xy(test_df)

# ---------- Train ----------

model = xgb.XGBClassifier(
    n_estimators=200,
    max_depth=4,
    learning_rate=0.1,
    eval_metric="logloss",
    random_state=42
)

model.fit(
    X_train, y_train,
    eval_set=[(X_val, y_val)],
    verbose=True
)

# ---------- Evaluate on test set ----------

y_pred = model.predict(X_test)

print("\n--- Test Set Classification Report ---")
print(classification_report(y_test, y_pred, target_names=["grounded", "hallucinated"]))

print("\n--- Confusion Matrix ---")
print(confusion_matrix(y_test, y_pred))

# ---------- Break results out by source_dataset ----------

print("\n--- Performance by source_dataset ---")
test_df["pred"] = y_pred
test_df["true"] = y_test.values
for source in test_df["source_dataset"].unique():
    subset = test_df[test_df["source_dataset"] == source]
    p, r, f1, _ = precision_recall_fscore_support(
        subset["true"], subset["pred"], average="binary", zero_division=0
    )
    print(f"{source}: precision={p:.3f} recall={r:.3f} f1={f1:.3f} (n={len(subset)})")

# ---------- Break results out by hallucination_type ----------

print("\n--- Performance by hallucination_type (hallucinated rows only) ---")
halluc_subset = test_df[test_df["true"] == 1]
for htype in halluc_subset["hallucination_type"].unique():
    rows = halluc_subset[halluc_subset["hallucination_type"] == htype]
    caught = (rows["pred"] == 1).sum()
    print(f"{htype}: caught {caught}/{len(rows)} ({caught/len(rows)*100:.1f}%)")

# ---------- Feature importance ----------

print("\n--- Feature Importance ---")
importances = model.feature_importances_
for name, score in sorted(zip(FEATURE_COLS, importances), key=lambda x: -x[1]):
    print(f"{name}: {score:.4f}")

# ---------- Save model ----------

os.makedirs(os.path.join(PROJECT_ROOT, "models"), exist_ok=True)
model_path = os.path.join(PROJECT_ROOT, "models", "baseline_xgboost.joblib")
joblib.dump(model, model_path)
print(f"\nModel saved to {model_path}")