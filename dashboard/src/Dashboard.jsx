import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  RotateCcw,
  ArrowUpRight,
  Database,
  Server,
  Zap,
  Braces,
  History,
  Trash2,
  Copy,
  Check,
  Search,
  Layers,
  FileText,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  RefreshCw,
  Target,
  CheckCircle,
  XCircle,
  FlaskConical,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/score";

const PRESETS = [
  {
    id: "grounded-financial",
    name: "Faithful — Q3 Financials",
    category: "Verified Factual",
    badge: "100% Grounded",
    accent: "good",
    question: "What was Acme Corp's Q3 revenue and growth rate?",
    context:
      "In Q3 2024, Acme Corp reported total revenue of $4.2M, representing a 12% increase year-over-year. Operating expenses were $2.1M, and cash flow from operations reached $850k.",
    answer:
      "Acme Corp reported $4.2M in revenue for Q3 2024, representing a 12% YoY growth, with operating expenses of $2.1M.",
  },
  {
    id: "entity-hallucination",
    name: "Hallucination — Fake Drug & Cohort",
    category: "Fabricated Entities",
    badge: "Entity Hallucination",
    accent: "bad",
    question: "What treatments were evaluated in the Phase II clinical trial?",
    context:
      "The Phase II trial evaluated the efficacy of compound ATX-101 in 140 patients with mild cognitive impairment over a 24-week period. No serious adverse events were documented.",
    answer:
      "The Phase II trial evaluated compound ATX-101 alongside NeuroCor-9 in 350 patients across 48 weeks, showing significant cognitive recovery.",
  },
  {
    id: "contradictory-claim",
    name: "Contradiction — Space Mission",
    category: "Factual Clash",
    badge: "Contradiction",
    accent: "warn",
    question: "When did the Orion capsule launch and where did it splash down?",
    context:
      "The Orion capsule launched on November 16, 2022 from Kennedy Space Center and successfully splashed down in the Pacific Ocean on December 11, 2022.",
    answer:
      "The Orion capsule launched in October 2021 from Vandenberg Space Force Base and landed in the Atlantic Ocean in January 2022.",
  },
  {
    id: "extrapolation-specs",
    name: "Extrapolation — Hardware Specs",
    category: "Unsupported Claims",
    badge: "Spec Exaggeration",
    accent: "accent",
    question: "What are the battery and cooling specifications of the Ultrabook X1?",
    context:
      "The Ultrabook X1 features an 8-core CPU, 16GB of LPDDR5 memory, and a 65Wh lithium-ion battery rated for up to 14 hours of standard office productivity.",
    answer:
      "The Ultrabook X1 comes with an 8-core CPU, 16GB LPDDR5 RAM, a 65Wh battery lasting 24 hours of 4K video editing, and proprietary liquid nitrogen vapor cooling.",
  },
];

const ACCENTS = {
  good: { text: "text-emerald-800", bar: "bg-stone-900", dot: "bg-emerald-600" },
  bad: { text: "text-red-800", bar: "bg-stone-900", dot: "bg-red-600" },
  warn: { text: "text-amber-800", bar: "bg-stone-900", dot: "bg-amber-600" },
  accent: { text: "text-orange-800", bar: "bg-stone-900", dot: "bg-orange-600" },
};

export default function Dashboard() {
  const [question, setQuestion] = useState(PRESETS[0].question);
  const [context, setContext] = useState(PRESETS[0].context);
  const [answer, setAnswer] = useState(PRESETS[0].answer);
  const [activePreset, setActivePreset] = useState(PRESETS[0].id);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redisHistory, setRedisHistory] = useState([]);
  const [apiHealth, setApiHealth] = useState({ status: "checking", redisConnected: true });
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedInput, setCopiedInput] = useState(false);
  const [latencyMs, setLatencyMs] = useState(null);

  // Fetch Redis history from server (ensures strictly 10 items max, deduplicated)
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.history)) {
          setRedisHistory(data.history.slice(0, 10));
        }
      }
    } catch (e) {
      console.warn("Could not fetch history:", e);
    }
  }, []);

  // Check health and initial history
  useEffect(() => {
    fetch("/health")
      .then((res) => res.json())
      .then((data) => {
        setApiHealth({ status: "online", ...data });
      })
      .catch(() => {
        setApiHealth({ status: "offline", redisConnected: false });
      });

    fetchHistory();
  }, [fetchHistory]);

  const handleScore = useCallback(async () => {
    if (!context.trim() || !answer.trim() || loading) return;

    setLoading(true);
    setResult(null);
    const startTime = performance.now();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          context: context.trim(),
          answer: answer.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);

      if (!res.ok) {
        throw new Error(data.error || `Server returned status ${res.status}`);
      }

      setResult(data);
      // Refresh Redis history to get updated latest 10 deduplicated list
      fetchHistory();
    } catch (e) {
      setResult({ error: e.message || "Failed to evaluate grounding score." });
    } finally {
      setLoading(false);
    }
  }, [question, context, answer, loading, fetchHistory]);

  // Keyboard shortcut: Cmd/Ctrl + Enter
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleScore();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleScore]);

  const loadPreset = (preset) => {
    setQuestion(preset.question);
    setContext(preset.context);
    setAnswer(preset.answer);
    setActivePreset(preset.id);
    setResult(null);
  };

  const handleClear = () => {
    setQuestion("");
    setContext("");
    setAnswer("");
    setActivePreset(null);
    setResult(null);
  };

  const handleClearHistory = async () => {
    try {
      await fetch("/history", { method: "DELETE" });
      setRedisHistory([]);
    } catch (e) {
      console.warn("Failed to clear history:", e);
    }
  };

  // Extract entities & numbers from candidate answer to check grounding
  const entityAnalysis = useMemo(() => {
    if (!answer) return [];
    const rawEntities = answer.match(/\b[A-Z0-9][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b/g) || [];
    const unique = Array.from(new Set(rawEntities)).filter(
      (e) => !["The", "A", "An", "In", "On", "At", "And", "Or", "With", "By", "For", "What", "When", "Where", "How", "Why", "Is", "Are"].includes(e)
    );
    const ctxLower = (context || "").toLowerCase();
    return unique.map((entity) => ({
      text: entity,
      isGrounded: ctxLower.includes(entity.toLowerCase()),
    }));
  }, [answer, context]);

  const copyJsonPayload = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const copyInputText = () => {
    const combined = `Question:\n${question}\n\nContext:\n${context}\n\nCandidate Answer:\n${answer}`;
    navigator.clipboard.writeText(combined);
    setCopiedInput(true);
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const isGrounded = result && result.decision === "show";
  const trustScore = result ? result.trust_score : 0;
  const trustScorePercent = Math.round(trustScore * 100);

  return (
    <div className="min-h-screen text-stone-900 flex flex-col antialiased">
      {/* Top Header */}
      <header className="border-b-2 border-stone-900 bg-stone-50/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-stone-900 text-stone-50 flex items-center justify-center font-mono font-bold text-sm">
              HD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-base text-stone-900 tracking-tight">
                  Hallucination Detector
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 border border-stone-300 text-stone-500">
                  v1.2
                </span>
              </div>
              <p className="text-[11px] text-stone-500 hidden sm:block font-mono">
                context-faithfulness &amp; NLI scoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {/* API Status Pill */}
            <div className="flex items-center gap-1.5 px-2 py-1 border border-stone-300 bg-white text-stone-700">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiHealth.status === "online"
                    ? "bg-emerald-600"
                    : apiHealth.status === "offline"
                    ? "bg-red-600"
                    : "bg-amber-500"
                }`}
              />
              <span className="text-[11px]">api:{apiHealth.status}</span>
            </div>

            {/* Redis Cache Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2 py-1 border border-stone-300 bg-white text-stone-700">
              <Database className="w-3 h-3 text-stone-500" />
              <span className="text-[11px]">cache · max 10</span>
            </div>

            <button
              onClick={fetchHistory}
              title="Refresh Redis history"
              className="p-1.5 border border-stone-300 bg-white text-stone-500 hover:text-stone-900 hover:border-stone-900 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {/* Preset Selection Strip */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5 text-stone-500" />
              <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-500">
                Benchmark Presets
              </h2>
            </div>
            <button
              onClick={handleClear}
              className="text-[11px] font-mono text-stone-500 hover:text-stone-900 transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              clear
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PRESETS.map((preset) => {
              const isSelected = activePreset === preset.id;
              const accent = ACCENTS[preset.accent];
              return (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`p-3.5 border text-left transition-all duration-150 relative flex flex-col justify-between bg-white ${
                    isSelected
                      ? "border-stone-900 shadow-hard-sm -translate-x-0.5 -translate-y-0.5"
                      : "border-stone-300 hover:border-stone-500"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-stone-400">
                      {preset.category}
                    </div>
                    <div className="text-sm font-semibold text-stone-900 leading-snug">{preset.name}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[10px] font-mono font-semibold ${accent.text} flex items-center gap-1.5`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
                      {preset.badge}
                    </span>
                    <ArrowUpRight className={`w-3.5 h-3.5 ${isSelected ? "text-stone-900" : "text-stone-300"}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2-Column Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Structured Input Form (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Input Card */}
            <div className="bg-white border border-stone-300 p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-stone-500" />
                  <h3 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600">
                    RAG Input
                  </h3>
                </div>
                <button
                  onClick={copyInputText}
                  className="text-[11px] font-mono text-stone-500 hover:text-stone-900 flex items-center gap-1 transition"
                >
                  {copiedInput ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedInput ? "copied" : "copy"}</span>
                </button>
              </div>

              {/* 1. Question */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-mono font-semibold text-stone-600">
                  <label className="flex items-center gap-1.5">
                    <Search className="w-3 h-3 text-stone-400" />
                    <span>question</span>
                  </label>
                  <span className="text-stone-400">{question.length}</span>
                </div>
                <input
                  type="text"
                  className="w-full bg-stone-50 border border-stone-300 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:bg-white transition"
                  placeholder="e.g. What was the company's Q3 revenue?"
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              {/* 2. Retrieved Context */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-mono font-semibold text-stone-600">
                  <label className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-stone-400" />
                    <span>context <span className="font-normal text-stone-400">— ground truth source</span></span>
                  </label>
                  <span className="text-stone-400">
                    {context.trim() ? context.trim().split(/\s+/).length : 0}w
                  </span>
                </div>
                <textarea
                  rows={5}
                  className="w-full bg-stone-50 border border-stone-300 border-l-2 border-l-orange-700 p-3.5 text-[13px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:border-l-orange-700 focus:bg-white transition font-mono leading-relaxed resize-y"
                  placeholder="Paste retrieved passages, knowledge documents, or reference ground truth..."
                  value={context}
                  onChange={(e) => {
                    setContext(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              {/* 3. Candidate LLM Answer */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-mono font-semibold text-stone-600">
                  <label className="flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-stone-400" />
                    <span>candidate answer <span className="font-normal text-stone-400">— text to score</span></span>
                  </label>
                  <span className="text-stone-400">
                    {answer.trim() ? answer.trim().split(/\s+/).length : 0}w
                  </span>
                </div>
                <textarea
                  rows={4}
                  className="w-full bg-stone-50 border border-stone-300 border-l-2 border-l-stone-900 p-3.5 text-[13px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:border-l-stone-900 focus:bg-white transition font-mono leading-relaxed resize-y"
                  placeholder="Paste candidate model response to inspect for factual hallucinations..."
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-stone-200">
                <div className="text-[11px] text-stone-400 font-mono flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 border border-stone-300 bg-stone-50 text-stone-600 text-[10px] font-semibold">
                    ⌘/Ctrl + Enter
                  </kbd>
                  <span>to evaluate</span>
                </div>

                <button
                  onClick={handleScore}
                  disabled={loading || !context.trim() || !answer.trim()}
                  className="w-full sm:w-auto px-6 py-3 bg-stone-900 hover:bg-stone-800 active:bg-stone-950 disabled:opacity-40 disabled:cursor-not-allowed text-stone-50 text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer border border-stone-900"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-stone-500 border-t-stone-50 rounded-full animate-spin" />
                      <span>Evaluating…</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-orange-400" />
                      <span>Run Evaluation</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Entity & Fact Grounding Badge Inspector */}
            {entityAnalysis.length > 0 && (
              <div className="bg-white border border-stone-300 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-stone-500" />
                    <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600">
                      Entity Grounding
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 border border-stone-300 text-stone-600">
                    {entityAnalysis.filter((e) => e.isGrounded).length}/{entityAnalysis.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {entityAnalysis.map((item, idx) => (
                    <span
                      key={idx}
                      className={`text-[11px] px-2 py-1 border font-mono font-medium flex items-center gap-1.5 transition ${
                        item.isGrounded
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : "bg-red-50 border-red-300 text-red-800 font-semibold"
                      }`}
                    >
                      {item.isGrounded ? (
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-600" />
                      )}
                      <span>{item.text}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Scoring Results & Live Decomposition (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Error Message */}
            {result && result.error && (
              <div className="p-4 border border-red-300 bg-red-50 text-red-800 text-sm flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Evaluation Failed</div>
                  <div className="mt-1 text-xs text-red-700 font-mono">{result.error}</div>
                </div>
              </div>
            )}

            {/* Live Verdict Card */}
            {result && !result.error && (
              <div
                className={`bg-white border-2 p-6 space-y-6 ${
                  isGrounded ? "border-emerald-700" : "border-red-700"
                }`}
              >
                {/* Verdict Banner */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-stone-400">
                      Verdict
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold px-3 py-1.5 border flex items-center gap-2 ${
                          isGrounded
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-red-50 border-red-300 text-red-800"
                        }`}
                      >
                        {isGrounded ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-red-600" />
                        )}
                        <span>{isGrounded ? "Grounded & Faithful" : "Potential Hallucination"}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-stone-400">
                      Trust Score
                    </span>
                    <div
                      className={`text-3xl font-mono font-bold tracking-tight ${
                        isGrounded ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {trustScore.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Score Gauge */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono font-semibold text-stone-600">
                    <span>confidence</span>
                    <span>{trustScorePercent}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-stone-100 border border-stone-300 overflow-hidden relative">
                    {/* Threshold 0.50 Line */}
                    <div
                      className="absolute top-0 bottom-0 left-1/2 w-px bg-stone-900 z-10"
                      title="Threshold: 0.50"
                    />
                    <div
                      className={`h-full transition-all duration-500 ${
                        isGrounded ? "bg-emerald-600" : "bg-red-600"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, trustScorePercent))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-stone-400">
                    <span className="text-red-600 font-semibold">0.0 flag</span>
                    <span>threshold 0.50</span>
                    <span className="text-emerald-700 font-semibold">1.0 pass</span>
                  </div>
                </div>

                {/* Feature Metric Bars */}
                <div className="space-y-3 pt-2 border-t border-stone-200">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-stone-500" />
                    <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600">
                      Feature Breakdown
                    </h4>
                  </div>

                  {result.features && (
                    <div className="space-y-2.5">
                      <MetricBar
                        label="Entity Grounding Ratio"
                        value={result.features.entity_grounding_ratio}
                        desc="Fraction of numbers and named entities matched in context"
                      />
                      <MetricBar
                        label="NLI Entailment Probability"
                        value={result.features.entailment_score}
                        desc="Degree to which context logically guarantees the candidate answer"
                      />
                      <MetricBar
                        label="Semantic Embedding Similarity"
                        value={result.features.embedding_similarity}
                        desc="Token-level and contextual embedding vector overlap"
                      />
                      <MetricBar
                        label="NLI Contradiction Risk"
                        value={result.features.contradiction_score}
                        inverted
                        desc="Probability of factual clash with source context (lower is better)"
                      />
                      <MetricBar
                        label="NLI Neutral Divergence"
                        value={result.features.neutral_score}
                        desc="Information not verifiable or directly proved by context"
                      />
                    </div>
                  )}
                </div>

                {/* Latency & Raw JSON Drawer */}
                <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] font-mono text-stone-500">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3 h-3 text-stone-400" />
                    <span>{result.cached ? "cache hit · 0ms" : `${latencyMs || 0}ms`}</span>
                  </div>
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="hover:text-stone-900 transition flex items-center gap-1 font-semibold"
                  >
                    <Braces className="w-3 h-3" />
                    <span>{showRawJson ? "hide json" : "inspect json"}</span>
                  </button>
                </div>

                {showRawJson && (
                  <div className="relative pt-2">
                    <pre className="bg-stone-900 text-stone-100 text-[11px] font-mono p-4 overflow-x-auto max-h-52 leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                    <button
                      onClick={copyJsonPayload}
                      className="absolute top-4 right-4 p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] flex items-center gap-1 px-2 font-mono"
                    >
                      {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedJson ? "copied" : "copy"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!result && !loading && (
              <div className="bg-white border border-dashed border-stone-300 p-8 text-center space-y-3">
                <div className="w-11 h-11 bg-stone-100 border border-stone-300 text-stone-500 flex items-center justify-center mx-auto">
                  <Search className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-stone-800">Ready to Evaluate</div>
                <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
                  Select one of the benchmark presets above or enter custom retrieved context and click{" "}
                  <span className="font-semibold text-stone-900">Run Evaluation</span>.
                </p>
              </div>
            )}

            {/* Redis History Panel (Strictly Latest 10 Unique Items) */}
            <div className="bg-white border border-stone-300 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-stone-500" />
                  <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600">
                    Cache Runs <span className="text-stone-400">({redisHistory.length}/10)</span>
                  </h4>
                </div>
                {redisHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[11px] text-stone-400 hover:text-red-700 transition flex items-center gap-1 font-mono"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>clear</span>
                  </button>
                )}
              </div>

              {redisHistory.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-stone-400 font-mono">
                  No evaluations in cache yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto divide-y divide-stone-200 pr-1">
                  {redisHistory.map((item, idx) => {
                    const isPass = item.decision === "show";
                    return (
                      <div
                        key={item.id || idx}
                        onClick={() => {
                          setQuestion(item.question || "");
                          setContext(item.context || "");
                          setAnswer(item.answer || "");
                          setResult({
                            trust_score: item.trust_score,
                            decision: item.decision,
                            features: item.features,
                            cached: true,
                          });
                        }}
                        className="pt-2.5 first:pt-0 cursor-pointer group flex items-center justify-between gap-3 text-xs hover:bg-stone-50 p-2 transition"
                      >
                        <div className="truncate flex-1 min-w-0">
                          <div className="font-medium text-stone-800 truncate group-hover:text-stone-900 transition">
                            {item.answer}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                            {item.cached && (
                              <span className="text-[9px] px-1 border border-amber-300 bg-amber-50 text-amber-700">
                                cached
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <span
                            className={`font-mono text-xs font-bold px-1.5 py-0.5 border ${
                              isPass
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : "bg-red-50 text-red-800 border-red-300"
                            }`}
                          >
                            {item.trust_score.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-stone-900 bg-stone-50 py-5 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-500 gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-700">Hallucination Detector</span>
            <span>·</span>
            <span>RAG grounding &amp; NLI factual faithfulness engine</span>
          </div>
          <div>decision threshold: 0.50</div>
        </div>
      </footer>
    </div>
  );
}

function MetricBar({ label, value = 0, desc, inverted = false }) {
  const percent = Math.round(value * 100);
  const isOptimal = inverted ? value < 0.35 : value >= 0.5;
  const fillColor = isOptimal ? "bg-emerald-600" : "bg-red-500";

  return (
    <div className="p-2.5 border border-stone-200 space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="font-mono text-stone-900 font-bold">{value.toFixed(3)}</span>
      </div>
      <div className="h-1.5 w-full bg-stone-100 border border-stone-200 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${fillColor}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {desc && <div className="text-[10px] text-stone-400 leading-tight">{desc}</div>}
    </div>
  );
}
