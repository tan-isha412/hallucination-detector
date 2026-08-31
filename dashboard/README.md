# Hallucination Detector Dashboard

The web-based evaluation and inspection frontend for the Hallucination Detector pipeline.

## Overview

- **Interactive Sample Evaluator**: Test queries, reference documents, and candidate LLM answers in real time.
- **Metric Breakdown**: Visualizes NLI probabilities (entailment, contradiction, neutrality), entity grounding ratios, and embedding similarity.
- **Decision Verdicts**: Configurable trust thresholding (`0.50`) with instant verification badges.
- **Preset Benchmarks**: Quick-load ground-truth and hallucinated reference cases.

## Development

```bash
# From dashboard directory
npm install
npm run dev
```
