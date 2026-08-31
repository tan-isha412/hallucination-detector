import json
import glob
import os

def combine_datasets(input_files, output_file):
    combined = []
    for filepath in input_files:
        if not os.path.exists(filepath):
            continue
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    item = json.loads(line)
                    combined.append(item)

    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        for item in combined:
            f.write(json.dumps(item) + '\n')

    print(f"Combined {len(combined)} samples into {output_file}")

if __name__ == '__main__':
    inputs = glob.glob("data/normalized_*.jsonl")
    combine_datasets(inputs, "data/combined.jsonl")
