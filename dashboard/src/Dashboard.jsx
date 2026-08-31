import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Database,
  Server,
  Zap,
  Code2,
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
  BarChart3,
  Activity,
  Cpu,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/score";

const PRESETS = [
  {
    id: "grounded-financial",
    name: "Faithful • Q3 Financials",
    category: "Verified Factual",
    badge: "100% Grounded",
    theme: "emerald",
    badgeColor: "text-emerald-700 bg-emerald-50 border-emerald-300",
    headerColor: "bg-emerald-500",
    question: "What was Acme Corp's Q3 revenue and growth rate?",
    context:
      "In Q3 2024, Acme Corp reported total revenue of $4.2M, representing a 12% increase year-over-year. Operating expenses were $2.1M, and cash flow from operations reached $850k.",
    answer:
      "Acme Corp reported $4.2M in revenue for Q3 2024, representing a 12% YoY growth, with operating expenses of $2.1M.",
  },
  {
    id: "entity-hallucination",
    name: "Hallucination • Fake Drug & Cohort",
    category: "Fabricated Entities",
    badge: "Entity Hallucination",
    theme: "rose",
    badgeColor: "text-rose-700 bg-rose-50 border-rose-300",
    headerColor: "bg-rose-500",
    question: "What treatments were evaluated in the Phase II clinical trial?",
    context:
      "The Phase II trial evaluated the efficacy of compound ATX-101 in 140 patients with mild cognitive impairment over a 24-week period. No serious adverse events were documented.",
    answer:
      "The Phase II trial evaluated compound ATX-101 alongside NeuroCor-9 in 350 patients across 48 weeks, showing significant cognitive recovery.",
  },
  {
    id: "contradictory-claim",
    name: "Contradiction • Space Mission",
    category: "Factual Clash",
    badge: "Contradiction",
    theme: "amber",
    badgeColor: "text-amber-800 bg-amber-50 border-amber-300",
    headerColor: "bg-amber-500",
    question: "When did the Orion capsule launch and where did it splash down?",
    context:
      "The Orion capsule launched on November 16, 2022 from Kennedy Space Center and successfully splashed down in the Pacific Ocean on December 11, 2022.",
    answer:
      "The Orion capsule launched in October 2021 from Vandenberg Space Force Base and landed in the Atlantic Ocean in January 2022.",
  },
  {
    id: "extrapolation-specs",
    name: "Extrapolation • Hardware Specs",
    category: "Unsupported Claims",
    badge: "Spec Exaggeration",
    theme: "violet",
    badgeColor: "text-violet-700 bg-violet-50 border-violet-300",
    headerColor: "bg-violet-500",
    question: "What are the battery and cooling specifications of the Ultrabook X1?",
    context:
      "The Ultrabook X1 features an 8-core CPU, 16GB of LPDDR5 memory, and a 65Wh lithium-ion battery rated for up to 14 hours of standard office productivity.",
    answer:
      "The Ultrabook X1 comes with an 8-core CPU, 16GB LPDDR5 RAM, a 65Wh battery lasting 24 hours of 4K video editing, and proprietary liquid nitrogen vapor cooling.",
  },
];

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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-base tracking-wider">
              HD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 tracking-tight">Hallucination Detector</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                  v1.2 RAG
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Context-Faithfulness & Natural Language Inference Scorer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium">
            {/* API Status Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiHealth.status === "online"
                    ? "bg-emerald-500 animate-pulse"
                    : apiHealth.status === "offline"
                    ? "bg-rose-500"
                    : "bg-amber-400"
                }`}
              />
              <span className="font-mono text-[11px]">API: {apiHealth.status}</span>
            </div>

            {/* Redis Cache Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
              <Database className="w-3.5 h-3.5 text-rose-600" />
              <span className="font-mono text-[11px]">Redis Cache (Max 10 Unique)</span>
            </div>

            <button
              onClick={fetchHistory}
              title="Refresh Redis history"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Preset Selection Strip */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Evaluation Presets & Ground Truth Benchmarks
              </h2>
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-slate-900 transition flex items-center gap-1.5 font-medium px-2 py-1 rounded hover:bg-slate-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Inputs
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PRESETS.map((preset) => {
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 relative flex flex-col justify-between shadow-xs ${
                    isSelected
                      ? "border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-md transform -translate-y-0.5"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {preset.category}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{preset.name}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${preset.badgeColor}`}>
                      {preset.badge}
                    </span>
                    <ArrowRight className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2-Column Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Structured Input Form (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Input Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">RAG Context & Candidate Verification</h3>
                </div>
                <button
                  onClick={copyInputText}
                  className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition"
                >
                  {copiedInput ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedInput ? "Copied" : "Copy Fields"}</span>
                </button>
              </div>

              {/* 1. Question */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                    <span>User Query / Question</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">{question.length} chars</span>
                </div>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition"
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
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      Retrieved Knowledge Context{" "}
                      <span className="font-normal text-slate-400">(Ground Truth Source)</span>
                    </span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {context.trim() ? context.trim().split(/\s+/).length : 0} words
                  </span>
                </div>
                <textarea
                  rows={5}
                  className="w-full bg-blue-50/30 border border-blue-200/80 rounded-lg p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition font-mono text-[13px] leading-relaxed resize-y"
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
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-violet-600" />
                    <span>
                      Candidate LLM Answer{" "}
                      <span className="font-normal text-slate-400">(Generated text to score)</span>
                    </span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {answer.trim() ? answer.trim().split(/\s+/).length : 0} words
                  </span>
                </div>
                <textarea
                  rows={4}
                  className="w-full bg-violet-50/30 border border-violet-200/80 rounded-lg p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:bg-white transition font-mono text-[13px] leading-relaxed resize-y"
                  placeholder="Paste candidate model response to inspect for factual hallucinations..."
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 border border-slate-200 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold">
                    ⌘ / Ctrl + Enter
                  </kbd>
                  <span>to evaluate</span>
                </div>

                <button
                  onClick={handleScore}
                  disabled={loading || !context.trim() || !answer.trim()}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:from-indigo-800 active:to-violet-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Evaluating Grounding...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300" />
                      <span>Run Grounding Evaluation</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Entity & Fact Grounding Badge Inspector */}
            {entityAnalysis.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Entity & Numeric Fact Grounding Inspector
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {entityAnalysis.filter((e) => e.isGrounded).length} / {entityAnalysis.length} Grounded
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {entityAnalysis.map((item, idx) => (
                    <span
                      key={idx}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-mono font-medium flex items-center gap-1.5 transition ${
                        item.isGrounded
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-xs"
                          : "bg-rose-50 border-rose-200 text-rose-800 font-bold shadow-xs animate-pulse"
                      }`}
                    >
                      {item.isGrounded ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span>{item.text}</span>
                      <span className="text-[10px] opacity-75">
                        {item.isGrounded ? "Grounded" : "Unverified / Hallucinated"}
                      </span>
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
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Evaluation Failed</div>
                  <div className="mt-1 text-xs text-rose-700">{result.error}</div>
                </div>
              </div>
            )}

            {/* Live Verdict Card */}
            {result && !result.error && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm overflow-hidden relative">
                {/* Top Accent Strip */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    isGrounded
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-gradient-to-r from-rose-500 to-orange-500"
                  }`}
                />

                {/* Verdict Banner */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Evaluation Verdict
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold px-3 py-1.5 rounded-xl border flex items-center gap-2 shadow-xs ${
                          isGrounded
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "bg-rose-50 border-rose-300 text-rose-800"
                        }`}
                      >
                        {isGrounded ? (
                          <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-rose-600" />
                        )}
                        <span>{isGrounded ? "Grounded & Faithful" : "Potential Hallucination"}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trust Score</span>
                    <div
                      className={`text-3xl font-mono font-extrabold tracking-tight ${
                        isGrounded ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {trustScore.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Score Gauge with Dynamic Gradient */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Confidence Score</span>
                    <span className="font-mono">{trustScorePercent}%</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative shadow-inner p-0.5 border border-slate-200">
                    {/* Threshold 0.50 Line */}
                    <div
                      className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-400 z-10"
                      title="Threshold: 0.50"
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isGrounded
                          ? "bg-gradient-to-r from-teal-400 to-emerald-500"
                          : "bg-gradient-to-r from-rose-500 to-amber-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, trustScorePercent))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span className="text-rose-500 font-semibold">0.0 (Flag)</span>
                    <span className="text-slate-500 font-medium">Threshold: 0.50</span>
                    <span className="text-emerald-600 font-semibold">1.0 (Pass)</span>
                  </div>
                </div>

                {/* Feature Metric Bars */}
                <div className="space-y-3.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Multi-Dimensional Feature Decomposition
                    </h4>
                  </div>

                  {result.features && (
                    <div className="space-y-3">
                      <ColorMetricBar
                        label="Entity Grounding Ratio"
                        value={result.features.entity_grounding_ratio}
                        color="bg-emerald-500"
                        bg="bg-emerald-50 border-emerald-100"
                        desc="Fraction of numbers and named entities matched in context"
                      />
                      <ColorMetricBar
                        label="NLI Entailment Probability"
                        value={result.features.entailment_score}
                        color="bg-indigo-600"
                        bg="bg-indigo-50 border-indigo-100"
                        desc="Degree to which context logically guarantees the candidate answer"
                      />
                      <ColorMetricBar
                        label="Semantic Embedding Similarity"
                        value={result.features.embedding_similarity}
                        color="bg-violet-600"
                        bg="bg-violet-50 border-violet-100"
                        desc="Token-level and contextual embedding vector overlap"
                      />
                      <ColorMetricBar
                        label="NLI Contradiction Risk"
                        value={result.features.contradiction_score}
                        color="bg-rose-500"
                        bg="bg-rose-50 border-rose-100"
                        inverted
                        desc="Probability of factual clash with source context (lower is better)"
                      />
                      <ColorMetricBar
                        label="NLI Neutral Divergence"
                        value={result.features.neutral_score}
                        color="bg-amber-500"
                        bg="bg-amber-50 border-amber-100"
                        desc="Information not verifiable or directly proved by context"
                      />
                    </div>
                  )}
                </div>

                {/* Latency & Raw JSON Drawer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-400" />
                    <span>{result.cached ? "⚡ Redis Cache Hit (0ms)" : `⏱ ${latencyMs || 0}ms`}</span>
                  </div>
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="hover:text-indigo-600 transition flex items-center gap-1 font-semibold"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{showRawJson ? "Hide JSON" : "Inspect JSON"}</span>
                  </button>
                </div>

                {showRawJson && (
                  <div className="relative pt-2">
                    <pre className="bg-slate-900 text-slate-100 text-xs font-mono p-4 rounded-xl overflow-x-auto max-h-52 leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                    <button
                      onClick={copyJsonPayload}
                      className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 px-2 font-mono"
                    >
                      {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedJson ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!result && !loading && (
              <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-8 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                  <Search className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-800">Ready to Evaluate</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Select one of the benchmark presets above or enter custom retrieved context and click{" "}
                  <span className="font-semibold text-indigo-600">Run Grounding Evaluation</span>.
                </p>
              </div>
            )}

            {/* Redis History Panel (Strictly Latest 10 Unique Items) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-rose-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Redis Cache Runs <span className="font-mono text-slate-400">({redisHistory.length}/10 Max)</span>
                  </h4>
                </div>
                {redisHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-slate-400 hover:text-rose-600 transition flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {redisHistory.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-mono">
                  No evaluations in Redis cache yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
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
                        className="pt-2.5 first:pt-0 cursor-pointer group flex items-center justify-between gap-3 text-xs hover:bg-slate-50 p-2 rounded-xl transition"
                      >
                        <div className="truncate flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition">
                            {item.answer}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                            {item.cached && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                CACHED
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <span
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg border shadow-2xs ${
                              isPass
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
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
      <footer className="border-t border-slate-200 bg-white py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Hallucination Detector</span>
            <span>•</span>
            <span>RAG Grounding & NLI Factual Faithfulness Engine</span>
          </div>
          <div>Decision Threshold: 0.50 (Pass ≥ 0.50)</div>
        </div>
      </footer>
    </div>
  );
}

function ColorMetricBar({ label, value = 0, color = "bg-indigo-600", bg = "bg-slate-50", desc, inverted = false }) {
  const percent = Math.round(value * 100);
  const isOptimal = inverted ? value < 0.35 : value >= 0.5;

  return (
    <div className={`p-2.5 rounded-xl border ${bg} space-y-1.5 transition`}>
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="font-mono text-slate-900 font-bold text-xs">{value.toFixed(3)}</span>
      </div>
      <div className="h-2 w-full bg-white/80 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-2xs">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {desc && <div className="text-[10px] text-slate-500 leading-tight">{desc}</div>}
    </div>
  );
}
