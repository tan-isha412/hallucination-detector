import json

sources = {}
with open("data/RAGTruth/dataset/source_info.jsonl", "r", encoding="utf-8") as file:
    for line in file:
        item = json.loads(line)
        sources[item["source_id"]] = item

print(f"Loaded {len(sources)} sources")

rows = []
with open("data/RAGTruth/dataset/response.jsonl", "r", encoding="utf-8") as file:
    for line in file:
        item = json.loads(line)
        source = sources.get(item["source_id"])
        if source is None:
            continue  # skip if no matching source (shouldn't happen, but be safe)
        if item.get("quality") in ("truncated", "incorrect_refusal"):
            continue  # skip low-quality rows per our Day 1 plan

        label = "grounded" if item["labels"] == [] else "hallucinated"

        rows.append({
            "question": source["prompt"],
            "context": source["source_info"],
            "answer": item["response"],
            "label": label,
            "hallucination_type": item["labels"][0]["label_type"] if item["labels"] else "none",
            "source_dataset": "ragtruth",
            "source_id": item["source_id"]
        })



print(f"Built {len(rows)} labeled rows")
print(rows[0])


with open("data/normalized_ragtruth.jsonl", "w", encoding="utf-8") as out:
    for row in rows:
        out.write(json.dumps(row) + "\n")

print("Written to data/normalized_ragtruth.jsonl")