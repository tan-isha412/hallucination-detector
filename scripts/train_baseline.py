import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier

def train_baseline(train_file, val_file, model_type="rf"):
    print(f"Training baseline {model_type} classifier on extracted features...")

if __name__ == '__main__':
    train_baseline("data/train.jsonl", "data/val.jsonl")
