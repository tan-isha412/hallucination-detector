import os
import time
import pandas as pd
import torch
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer, AutoModelForSequenceClassification,
    TrainingArguments, Trainer
)
from sklearn.metrics import precision_recall_fscore_support, accuracy_score

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

MODEL_NAME = "microsoft/deberta-v3-small"

# ---------- Load data (reuse the same splits, just don't need the engineered features here) ----------

train_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "train.jsonl"), lines=True)
val_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "val.jsonl"), lines=True)
test_df = pd.read_json(os.path.join(PROJECT_ROOT, "data", "splits", "test.jsonl"), lines=True)

train_df["label_id"] = (train_df["label"] == "hallucinated").astype(int)
val_df["label_id"] = (val_df["label"] == "hallucinated").astype(int)
test_df["label_id"] = (test_df["label"] == "hallucinated").astype(int)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

class HallucinationDataset(Dataset):
    def __init__(self, df):
        self.contexts = df["context"].tolist()
        self.answers = df["answer"].tolist()
        self.labels = df["label_id"].tolist()

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        encoding = tokenizer(
            self.contexts[idx], self.answers[idx],
            truncation=True, max_length=512, padding="max_length"
        )
        item = {k: torch.tensor(v) for k, v in encoding.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

train_ds = HallucinationDataset(train_df)
val_ds = HallucinationDataset(val_df)
test_ds = HallucinationDataset(test_df)

model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = logits.argmax(axis=1)
    p, r, f1, _ = precision_recall_fscore_support(labels, preds, average="binary")
    acc = accuracy_score(labels, preds)
    return {"accuracy": acc, "precision": p, "recall": r, "f1": f1}

training_args = TrainingArguments(
    output_dir=os.path.join(PROJECT_ROOT, "models", "deberta_checkpoints"),
    num_train_epochs=2,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    logging_steps=50,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    compute_metrics=compute_metrics,
)

trainer.train()

# ---------- Evaluate on test set, timing latency too ----------

start = time.time()
results = trainer.evaluate(test_ds)
elapsed = time.time() - start

print("\n--- DeBERTa Test Results ---")
print(results)
print(f"Latency: {elapsed / len(test_ds) * 1000:.1f} ms per row")

model.save_pretrained(os.path.join(PROJECT_ROOT, "models", "deberta_final"))
tokenizer.save_pretrained(os.path.join(PROJECT_ROOT, "models", "deberta_final"))