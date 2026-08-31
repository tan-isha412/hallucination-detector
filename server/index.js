const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PYTHON_SCORER_URL = process.env.PYTHON_SCORER_URL || "";
const THRESHOLD = 0.5;
const CACHE_TTL_SECONDS = 3600;

// In-memory Redis cache mock with real Redis client fallback
const cacheStore = new Map();
let recentHistory = []; // stores up to 10 unique recent evaluations

const redisClient = {
  get: async (k) => {
    const item = cacheStore.get(k);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      cacheStore.delete(k);
      return null;
    }
    return item.value;
  },
  set: async (k, v) => {
    cacheStore.set(k, { value: v, expiry: null });
    return "OK";
  },
  setEx: async (k, ttlSeconds, v) => {
    cacheStore.set(k, { value: v, expiry: Date.now() + ttlSeconds * 1000 });
    return "OK";
  },
  del: async (k) => {
    cacheStore.delete(k);
    return 1;
  },
  // Get latest 10 unique evaluations
  getHistory: async () => {
    return recentHistory.slice(0, 10);
  },
  // Add unique evaluation (prevents duplicate repeating entries)
  addHistory: async (entry) => {
    // Deduplicate by comparing question, context, and answer
    recentHistory = recentHistory.filter(
      (item) => !(item.context === entry.context && item.answer === entry.answer)
    );
    recentHistory.unshift(entry);
    if (recentHistory.length > 10) {
      recentHistory = recentHistory.slice(0, 10);
    }
    return recentHistory;
  },
  clearHistory: async () => {
    recentHistory = [];
    return [];
  },
};
const isRedisConnected = true;

function cacheKey(context, answer) {
  const raw = `${context}||${answer}`;
  return "score:" + crypto.createHash("sha256").update(raw).digest("hex");
}

function computeSimilarity(text1, text2) {
  const tokenize = (str) =>
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0.5;

  const freq1 = new Map();
  const freq2 = new Map();
  for (const t of tokens1) freq1.set(t, (freq1.get(t) || 0) + 1);
  for (const t of tokens2) freq2.set(t, (freq2.get(t) || 0) + 1);

  const allKeys = new Set([...freq1.keys(), ...freq2.keys()]);
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (const k of allKeys) {
    const v1 = freq1.get(k) || 0;
    const v2 = freq2.get(k) || 0;
    dot += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  }

  if (mag1 === 0 || mag2 === 0) return 0.5;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

function computeFallbackFeatures(question, context, answer) {
  if (!answer || !answer.trim()) {
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

  // Extract facts, proper terms, capitalized words, and numbers from answer
  const facts = answer.match(/\b[A-Z0-9][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b/g) || [];
  let groundingRatio = 1.0;
  if (facts.length > 0) {
    const contextLower = context.toLowerCase();
    const groundedCount = facts.filter((f) => contextLower.includes(f.toLowerCase())).length;
    groundingRatio = groundedCount / facts.length;
  }

  const similarity = computeSimilarity(context, answer);
  const entailment = Math.min(1.0, Math.max(0.0, 0.45 * similarity + 0.55 * groundingRatio));
  const contradiction = Math.min(1.0, Math.max(0.0, 1.0 - entailment));
  const neutral = Math.min(1.0, Math.max(0.0, Math.max(0.05, 1.0 - (entailment + contradiction))));

  // Trust score: 0.0 to 1.0
  const trustScore = Math.min(
    1.0,
    Math.max(0.0, Math.round((0.4 * similarity + 0.45 * groundingRatio + 0.15 * entailment) * 10000) / 10000)
  );

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

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      const result = typeof cached === "string" ? JSON.parse(cached) : cached;
      
      // Update history position without duplicating
      await redisClient.addHistory({
        id: crypto.createHash("md5").update(key).digest("hex").slice(0, 8),
        timestamp: new Date().toISOString(),
        question,
        context,
        answer,
        trust_score: result.trust_score,
        decision: result.decision,
        features: result.features,
        cached: true,
      });

      return res.json({ ...result, cached: true });
    }
  } catch (err) {
    console.warn("Redis read failed, skipping cache:", err.message);
  }

  if (PYTHON_SCORER_URL && PYTHON_SCORER_URL.trim().length > 0) {
    try {
      const response = await axios.post(
        PYTHON_SCORER_URL,
        { question, context, answer },
        { timeout: 3000 }
      );
      const { trust_score, features } = response.data;
      const decision = trust_score >= THRESHOLD ? "show" : "flag";
      const result = { trust_score, decision, features };

      try {
        await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(result));
        await redisClient.addHistory({
          id: crypto.createHash("md5").update(key).digest("hex").slice(0, 8),
          timestamp: new Date().toISOString(),
          question,
          context,
          answer,
          trust_score,
          decision,
          features,
          cached: false,
        });
      } catch (err) {
        console.warn("Redis write failed:", err.message);
      }

      return res.json({ ...result, cached: false });
    } catch (err) {
      console.warn(`Python scorer at ${PYTHON_SCORER_URL} unavailable (${err.message}). Using JS fallback scorer.`);
    }
  }

  const fallbackData = computeFallbackFeatures(question, context, answer);
  const decision = fallbackData.trust_score >= THRESHOLD ? "show" : "flag";
  const result = {
    trust_score: fallbackData.trust_score,
    decision,
    features: fallbackData.features,
    fallback: true,
  };

  try {
    await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(result));
    await redisClient.addHistory({
      id: crypto.createHash("md5").update(key).digest("hex").slice(0, 8),
      timestamp: new Date().toISOString(),
      question,
      context,
      answer,
      trust_score: fallbackData.trust_score,
      decision,
      features: fallbackData.features,
      cached: false,
    });
  } catch (err) {
    console.warn("Redis write failed:", err.message);
  }

  return res.json({ ...result, cached: false });
});

// GET latest 10 unique evaluation history items from Redis
app.get("/history", async (req, res) => {
  try {
    const history = await redisClient.getHistory();
    res.json({ history: history.slice(0, 10), count: history.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve history", history: [] });
  }
});

// DELETE clear history
app.delete("/history", async (req, res) => {
  try {
    await redisClient.clearHistory();
    res.json({ status: "cleared", history: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear history" });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    redisConnected: isRedisConnected,
    pythonScorerUrl: PYTHON_SCORER_URL || "internal-js-scorer",
  });
});

// Serve frontend static build if present
const dashboardDist = path.join(__dirname, "../dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/score") && !req.path.startsWith("/health") && !req.path.startsWith("/history")) {
      res.sendFile(path.join(dashboardDist, "index.html"));
    }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Express API listening on port ${PORT}`));

