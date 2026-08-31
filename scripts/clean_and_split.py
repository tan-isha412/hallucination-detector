import json
import os
import random

def clean_and_split(input_path, train_path, val_path, test_path, train_ratio=0.8, val_ratio=0.1):
    if not os.path.exists(input_path):
        print(f"File {input_path} not found.")
        return

    with open(input_path, 'r', encoding='utf-8') as f:
        data = [json.loads(line) for line in f if line.strip()]

    random.seed(42)
    random.shuffle(data)

    n_total = len(data)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)

    train_data = data[:n_train]
    val_data = data[n_train:n_train + n_val]
    test_data = data[n_train + n_val:]

    for path, split_data in [(train_path, train_data), (val_path, val_data), (test_path, test_data)]:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            for item in split_data:
                f.write(json.dumps(item) + '\n')

    print(f"Split {n_total} items into {len(train_data)} train, {len(val_data)} val, {len(test_data)} test.")

if __name__ == '__main__':
    clean_and_split("data/combined.jsonl", "data/train.jsonl", "data/val.jsonl", "data/test.jsonl")
