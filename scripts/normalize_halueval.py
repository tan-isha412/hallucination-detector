import json

def process_paired_file(path, context_key, answer_correct_key, answer_wrong_key, question_key=None):
    rows = []
    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            item = json.loads(line)
            question = item.get(question_key, "") if question_key else ""
            context = item[context_key]

            # grounded row
            rows.append({
                "question": question,
                "context": context,
                "answer": item[answer_correct_key],
                "label": "grounded",
                "hallucination_type": "none",
                "source_dataset": "halueval"
            })

            # hallucinated row
            rows.append({
                "question": question,
                "context": context,
                "answer": item[answer_wrong_key],
                "label": "hallucinated",
                "hallucination_type": "unsupported_addition",  # HaluEval doesn't sub-categorize
                "source_dataset": "halueval"
            })
    return rows

all_rows = []

# qa_data.json — knowledge, question, right_answer, hallucinated_answer
all_rows += process_paired_file(
    "data/HaluEval/data/qa_data.json",
    context_key="knowledge",
    answer_correct_key="right_answer",
    answer_wrong_key="hallucinated_answer",
    question_key="question"
)

# dialogue_data.json — knowledge, dialogue_history, right_response, hallucinated_response
all_rows += process_paired_file(
    "data/HaluEval/data/dialogue_data.json",
    context_key="knowledge",
    answer_correct_key="right_response",
    answer_wrong_key="hallucinated_response",
    question_key="dialogue_history"
)

# summarization_data.json — check exact field names yourself before running,
# likely: document, right_summary, hallucinated_summary
all_rows += process_paired_file(
    "data/HaluEval/data/summarization_data.json",
    context_key="document",
    answer_correct_key="right_summary",
    answer_wrong_key="hallucinated_summary"
)

print(f"Built {len(all_rows)} rows from paired files")

with open("data/normalized_halueval.jsonl", "w", encoding="utf-8") as out:
    for row in all_rows:
        out.write(json.dumps(row) + "\n")

print("Written to data/normalized_halueval.jsonl")