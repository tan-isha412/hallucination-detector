const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { createClient } = require("redis");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PYTHON_SCORER_URL = process.env.PYTHON_SCORER_URL || "http://localhost:8001/internal/score";
const THRESHOLD = 0.5;
const CACHE_TTL_SECONDS = 3600;

// Redis client setup with soft failure handling
let isRedisConnected = false;
const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });

redisClient.on("error", (err) => {
  if (isRedisConnected) {
    console.warn("Redis connection error:", err.message);
  }
  isRedisConnected = false;
});

redisClient.on("connect", () => {
  console.log("Connected to Redis cache");
  isRedisConnected = true;
});

// Attempt Redis connection without crashing on error
redisClient.connect().then(() => {
  isRedisConnected = true;
}).catch((err) => {
  console.warn("Redis unavailable. Proceeding without caching:", err.message);
  isRedisConnected = false;
});

function cacheKey(context, answer) {
  const raw = `${context}||${answer}`;
  return "score:" + crypto.createHash("sha256").update(raw).digest("hex");
}

function computeFallbackFeatures(question, context, answer) {
  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const contextTokens = new Set(normalize(context));
  const answerTokens = normalize(answer);

  if (answerTokens.length === 0) {
    return {
      trust_score: 0.5,
      features: {
        embedding_similarity: 0.5,
        entailment_score: 0.5,
        contradiction_score: 0.2,
        neutral_score: 0.3,
        entity_grounding_ratio: 1.0,
      },
    };
  }

  // Extract proper terms and numbers from answer
  const facts = answer.match(/\b[A-Z0-9][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b/g) || [];
  let groundingRatio = 1.0;
  if (facts.length > 0) {
    const contextLower = context.toLowerCase();
    const groundedCount = facts.filter((f) => contextLower.includes(f.toLowerCase())).length;
    groundingRatio = groundedCount / facts.length;
  }

  const matchingTokens = answerTokens.filter((t) => contextTokens.has(t)).length;
  const similarity = Math.min(1.0, matchingTokens / Math.max(1, answerTokens.length));

  const entailment = Math.min(1.0, Math.max(0.0, 0.4 * similarity + 0.6 * groundingRatio));
  const contradiction = Math.min(1.0, Math.max(0.0, 1.0 - entailment));
  const neutral = Math.min(1.0, Math.max(0.0, Math.abs(1.0 - (entailment + contradiction))));

  const trustScore = Math.round((0.5 * groundingRatio + 0.5 * similarity) * 10000) / 10000;

  return {
    trust_score: trustScore,
    features: {
      embedding_similarity: Math.round(similarity * 1000) / 1000,
      entailment_score: Math.round(entailment * 1000) / 1000,
      contradiction_score: Math.round(contradiction * 1000) / 1000,
      neutral_score: Math.round(neutral * 1000) / 1000,
      entity_grounding_ratio: Math.round(groundingRatio * 1000) / 1000,
    },
  };
}

app.post("/score", async (req, res) => {
  const { question, context, answer } = req.body;

  if (!question || !context || !answer) {
    return res.status(400).json({ error: "question, context, and answer are all required" });
  }

  const key = cacheKey(context, answer);

  if (isRedisConnected) {
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        const result = JSON.parse(cached);
        return res.json({ ...result, cached: true });
      }
    } catch (err) {
      console.warn("Redis read failed, skipping cache:", err.message);
    }
  }

  try {
    const response = await axios.post(
      PYTHON_SCORER_URL,
      { question, context, answer },
      { timeout: 4000 }
    );
    const { trust_score, features } = response.data;
    const decision = trust_score >= THRESHOLD ? "show" : "flag";

    const result = { trust_score, decision, features };

    if (isRedisConnected) {
      try {
        await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(result));
      } catch (err) {
        console.warn("Redis write failed:", err.message);
      }
    }

    return res.json({ ...result, cached: false });
  } catch (err) {
    console.warn(`Python scorer at ${PYTHON_SCORER_URL} unavailable (${err.message}). Using JS fallback scorer.`);
    
    const fallbackData = computeFallbackFeatures(question, context, answer);
    const decision = fallbackData.trust_score >= THRESHOLD ? "show" : "flag";
    const result = {
      trust_score: fallbackData.trust_score,
      decision,
      features: fallbackData.features,
      fallback: true
    };

    return res.json({ ...result, cached: false });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    redisConnected: isRedisConnected,
    pythonScorerUrl: PYTHON_SCORER_URL,
  });
});

// Serve frontend static build if present
const dashboardDist = path.join(__dirname, "../dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/score") && !req.path.startsWith("/health")) {
      res.sendFile(path.join(dashboardDist, "index.html"));
    }
  });
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Express API listening on port ${PORT}`));
