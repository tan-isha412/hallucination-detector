# Hallucination Detector

A modular, production-ready framework for detecting factual hallucinations and evaluating context-faithfulness in Retrieval-Augmented Generation (RAG) and LLM response pipelines.

---

## Overview

Large Language Models (LLMs) frequently generate plausible-sounding yet ungrounded claims or hallucinated facts when synthesizing retrieved context. **Hallucination Detector** provides a multi-layer evaluation pipeline and interactive inspection suite to verify factual consistency between retrieved source passages and candidate responses.

### Key Capabilities

- **Entity & Fact Grounding**: Extracts proper nouns, numerical quantities, temporal expressions, and structured entities to verify strict grounding against context.
- **Natural Language Inference (NLI)**: Quantifies directional entailment, contradiction probability, and neutral divergence.
- **Semantic Embedding Similarity**: Measures token-level and embedding-space overlap between reference passages and candidate outputs.
- **Calibrated Trust Scoring**: Computes a bounded confidence metric (`0.0` – `1.0`) with configurable decision thresholds (`show` vs. `flag`).
- **Low-Latency Caching**: In-memory and Redis-compatible key-value cache layer with TTL to prevent redundant model inference.
- **Interactive Evaluation Dashboard**: Minimalist inspector UI for real-time sample testing, feature breakdown analysis, and benchmark evaluation.

---

## System Architecture

```
                      +-----------------------------+
                      |   Client / Evaluation UI    |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |     Express API Gateway     |
                      |   (Port 3000 / Proxy / TTL) |
                      +-------+--------------+------+
                              |              |
              (Cache Miss)    |              | (Cache Hit)
                              v              v
            +--------------------+   +----------------+
            |  FastAPI Scorer    |   | In-Memory Cache|
            |  (Python / PyTorch)|   | / Redis Store  |
            +--------------------+   +----------------+
```

---

## Project Structure

```
├── dashboard/               # React + Tailwind CSS evaluation dashboard
│   ├── src/                 # Dashboard components and state management
│   ├── index.html           # Web app entry point
│   ├── vite.config.js       # Vite bundler configuration
│   └── package.json         # Dashboard dependencies
├── scripts/                 # ML pipeline, data processing & benchmarking
│   ├── normalize_halueval.py   # HaluEval benchmark standardizer
│   ├── normalize_ragtruth.py   # RAGTruth dataset standardizer
│   ├── clean_and_split.py      # Train/Val/Test stratified splitting
│   ├── combine.py              # Multi-source dataset concatenation
│   ├── generate_synthetic.py   # Perturbation & synthetic hallucination generator
│   ├── extract_features.py     # NLI, entity grounding & similarity feature extraction
│   ├── train_baseline.py       # Logistic Regression & Random Forest baseline trainers
│   ├── train_transformer.py    # DeBERTa / RoBERTa cross-encoder fine-tuning
│   └── evaluate.py             # ROC-AUC, F1, Precision/Recall evaluation suite
├── server/                  # Node.js / Express API gateway
│   └── index.js             # API routes, caching, and fallback scorer
├── services/                # Python ML microservice
│   ├── scorer.py            # FastAPI inference endpoint
│   ├── requirements.txt     # Python runtime dependencies
│   └── DockerFile           # Scorer container definition
├── metadata.json            # Application metadata
└── package.json             # Root workspace scripts & dependencies
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Python**: 3.10 or higher (optional, for ML training scripts and Python microservice)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tan-isha412/hallucination-detector.git
   cd hallucination-detector
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **(Optional) Set up Python ML environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r services/requirements.txt
   ```

---

## Running the Application

### Full-Stack Web Application (API + Dashboard)

Start the production server and dashboard on `http://localhost:3000`:

```bash
npm run dev
```

The application serves:
- The React inspection dashboard at `http://localhost:3000/`
- The scoring API endpoint at `http://localhost:3000/score`
- The health check endpoint at `http://localhost:3000/health`

### Running the Python ML Microservice (Optional)

To run the dedicated Python FastAPI inference engine:

```bash
cd services
uvicorn scorer:app --host 0.0.0.0 --port 8001
```

Set `PYTHON_SCORER_URL=http://localhost:8001/internal/score` in your `.env` file to route inference requests directly through the Python service.

---

## API Reference

### `POST /score`

Evaluates context faithfulness and calculates hallucination probability.

#### Request Headers
```http
Content-Type: application/json
```

#### Request Body
```json
{
  "question": "What was the company's Q3 revenue?",
  "context": "The company reported Q3 revenue of $4.2M, representing a 12% increase year-over-year.",
  "answer": "Q3 revenue reached $4.2M, growing 12% compared to last year."
}
```

#### Response Body (`200 OK`)
```json
{
  "trust_score": 0.9425,
  "decision": "show",
  "features": {
    "embedding_similarity": 0.8850,
    "entailment_score": 0.9620,
    "contradiction_score": 0.0380,
    "neutral_score": 0.0500,
    "entity_grounding_ratio": 1.0000
  },
  "cached": false
}
```

#### Field Definitions

| Field | Type | Description |
|---|---|---|
| `trust_score` | `float` | Aggregate confidence score (`0.0` to `1.0`). Higher is more grounded. |
| `decision` | `string` | Binary verdict based on threshold: `"show"` (grounded) or `"flag"` (hallucinated). |
| `features.embedding_similarity` | `float` | Semantic similarity between candidate answer and retrieved context. |
| `features.entailment_score` | `float` | Estimated probability that context logically entails the candidate answer. |
| `features.contradiction_score` | `float` | Estimated probability of direct contradiction. |
| `features.neutral_score` | `float` | Divergence or unprovable claims probability. |
| `features.entity_grounding_ratio` | `float` | Fraction of answer entities present in reference context. |
| `cached` | `boolean` | Indicates whether the response was served from cache. |

---

### `GET /health`

Health check endpoint returning service status and cache connection state.

```json
{
  "status": "ok",
  "redisConnected": true,
  "pythonScorerUrl": "internal-js-scorer"
}
```

---

## ML Pipeline & Dataset Tooling

The `scripts/` directory contains tools for dataset standardization, synthetic perturbation, feature extraction, and benchmark evaluations:

### 1. Dataset Normalization
Standardize raw benchmark datasets into unified JSONL schemas:
```bash
python scripts/normalize_halueval.py
python scripts/normalize_ragtruth.py
python scripts/combine.py
python scripts/clean_and_split.py
```

### 2. Feature Extraction
Extract multi-dimensional grounding metrics from paired samples:
```bash
python scripts/extract_features.py
```

### 3. Model Training & Benchmarking
Train baseline classifiers or fine-tune transformer cross-encoders:
```bash
python scripts/train_baseline.py
python scripts/train_transformer.py
```

### 4. Evaluation
Evaluate model predictions against ground-truth labels (ROC-AUC, F1, Accuracy):
```bash
python scripts/evaluate.py
```

---

## Configuration

Environment variables can be configured in `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for Express server and dashboard |
| `PYTHON_SCORER_URL` | `""` | Optional URL for Python FastAPI scoring service |
| `REDIS_URL` | `""` | Optional Redis connection string for distributed caching |

---

## License

This project is licensed under the MIT License.
