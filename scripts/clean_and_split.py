import pandas as pd

df = pd.read_json("data/combined_dataset.jsonl", lines=True)
print(df.shape)
print(df["label"].value_counts())
print(df["hallucination_type"].value_counts())
print(df["source_dataset"].value_counts())

before = len(df)

df = df[df["context"].str.strip().str.len() > 0]
df = df[df["answer"].str.strip().str.len() > 0]
df = df.drop_duplicates(subset=["context", "answer"])
df = df[df["context"] != df["answer"]]

print(f"Dropped {before - len(df)} junk rows, {len(df)} remain")

df["group_key"] = df["source_id"].fillna(df["question"]).astype(str)
from sklearn.model_selection import GroupShuffleSplit

gss = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=42)
train_idx, temp_idx = next(gss.split(df, groups=df["group_key"]))
train_df = df.iloc[train_idx]
temp_df = df.iloc[temp_idx]

gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=42)
val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df["group_key"]))
val_df = temp_df.iloc[val_idx]
test_df = temp_df.iloc[test_idx]

print(len(train_df), len(val_df), len(test_df))

train_groups = set(train_df["group_key"])
val_groups = set(val_df["group_key"])
test_groups = set(test_df["group_key"])

print("Train/val overlap:", len(train_groups & val_groups))
print("Train/test overlap:", len(train_groups & test_groups))
print("Val/test overlap:", len(val_groups & test_groups))

import os
os.makedirs("data/splits", exist_ok=True)

train_df.to_json("data/splits/train.jsonl", orient="records", lines=True)
val_df.to_json("data/splits/val.jsonl", orient="records", lines=True)
test_df.to_json("data/splits/test.jsonl", orient="records", lines=True)