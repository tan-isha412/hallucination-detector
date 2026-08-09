import json

input_files = [
    "data/normalized_ragtruth.jsonl",
    "data/normalized_halueval.jsonl"
]

output_file = "data/combined_dataset.jsonl"

total_written = 0

with open(output_file, "w", encoding="utf-8") as out:
    for path in input_files:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                out.write(line + "\n")
                total_written += 1

print(f"Combined dataset written to {output_file}")
print(f"Total rows: {total_written}")