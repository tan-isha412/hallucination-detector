import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/score";
const THRESHOLD = 0.5;

const EXAMPLES = [
  {
    id: "faithful",
    label: "Faithful summary",
    question: "What was Acme Corp's Q3 revenue and growth rate?",
    context:
      "In Q3 2024, Acme Corp reported total revenue of $4.2M, representing a 12% increase year-over-year. Operating expenses were $2.1M, and cash flow from operations reached $850k.",
    answer:
      "Acme Corp reported $4.2M in revenue for Q3 2024, a 12% increase year-over-year, with operating expenses of $2.1M.",
  },
  {
    id: "invented",
    label: "Invented entities",
    question: "What treatments were evaluated in the Phase II clinical trial?",
    context:
      "The Phase II trial evaluated the efficacy of compound ATX-101 in 140 patients with mild cognitive impairment over a 24-week period. No serious adverse events were documented.",
    answer:
      "The Phase II trial evaluated compound ATX-101 alongside NeuroCor-9 in 350 patients across 48 weeks, showing significant cognitive recovery.",
  },
  {
    id: "contradiction",
    label: "Contradiction",
    question: "When did the Orion capsule launch and where did it splash down?",
    context:
      "The Orion capsule launched on November 16, 2022 from Kennedy Space Center and successfully splashed down in the Pacific Ocean on December 11, 2022.",
    answer:
      "The Orion capsule launched in October 2021 from Vandenberg Space Force Base and landed in the Atlantic Ocean in January 2022.",
  },
  {
    id: "exaggeration",
    label: "Exaggerated specs",
    question: "What are the battery and cooling specifications of the Ultrabook X1?",
    context:
      "The Ultrabook X1 features an 8-core CPU, 16GB of LPDDR5 memory, and a 65Wh lithium-ion battery rated for up to 14 hours of standard office productivity.",
    answer:
      "The Ultrabook X1 comes with an 8-core CPU, 16GB LPDDR5 RAM, a 65Wh battery lasting 24 hours of 4K video editing, and proprietary liquid nitrogen vapor cooling.",
  },
];

const SIGNALS = [
  { key: "entity_grounding_ratio", label: "Names and numbers found in source" },
  { key: "entailment_score", label: "Entailment" },
  { key: "embedding_similarity", label: "Similarity to source" },
  { key: "contradiction_score", label: "Contradiction", lowerIsBetter: true },
  { key: "neutral_score", label: "Unverifiable", lowerIsBetter: true },
];

// Names and numbers are the claims we can check word-for-word against the source.
// Keep this in step with extractFacts() in server/index.js.
const FACT_RE = /\$?\d+(?:,\d{3})*(?:\.\d+)?[A-Za-z%]*|\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/g;
const NOT_FACTS = new Set(
  "The A An In On At And Or But With By For From To Of As It Its This That These Those There They He She We No Not What When Where Which Who How Why Is Are Was Were".split(" ")
);

function appearsIn(term, sourceLower) {
  const t = term.toLowerCase();
  const joinsNumber = (ch, next) => /[a-z0-9]/.test(ch || "") || (/[.,]/.test(ch || "") && /\d/.test(next || ""));
  for (let i = sourceLower.indexOf(t); i !== -1; i = sourceLower.indexOf(t, i + 1)) {
    const end = i + t.length;
    const before = joinsNumber(sourceLower[i - 1], sourceLower[i - 2]);
    const after = joinsNumber(sourceLower[end], sourceLower[end + 1]);
    if (!before && !after) return true;
  }
  return false;
}

function markUp(answer, context) {
  const source = (context || "").toLowerCase();
  const parts = [];
  let last = 0;
  for (const m of (answer || "").matchAll(FACT_RE)) {
    if (NOT_FACTS.has(m[0])) continue;
    if (m.index > last) parts.push({ text: answer.slice(last, m.index) });
    parts.push({ text: m[0], found: appearsIn(m[0], source) });
    last = m.index + m[0].length;
  }
  if (last < (answer || "").length) parts.push({ text: answer.slice(last) });
  return parts;
}

const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Dashboard() {
  const [question, setQuestion] = useState(EXAMPLES[0].question);
  const [context, setContext] = useState(EXAMPLES[0].context);
  const [answer, setAnswer] = useState(EXAMPLES[0].answer);
  const [exampleId, setExampleId] = useState(EXAMPLES[0].id);

  // `run` is a snapshot of what was scored, so the result never drifts from the text it describes.
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [health, setHealth] = useState({ state: "checking" });
  const [copied, setCopied] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/history");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.history)) setHistory(data.history.slice(0, 10));
    } catch {
      // History is a convenience; the page works without it.
    }
  }, []);

  useEffect(() => {
    fetch("/health")
      .then((res) => res.json())
      .then((data) =>
        setHealth({
          state: "online",
          scorer: data.pythonScorerUrl === "internal-js-scorer" ? "built-in scorer" : "model scorer",
        })
      )
      .catch(() => setHealth({ state: "offline" }));
    fetchHistory();
  }, [fetchHistory]);

  const canRun = context.trim() && answer.trim() && !loading;

  // On narrow screens the result sits below the form, so bring it into view once it arrives.
  const resultRef = useRef(null);
  useEffect(() => {
    if ((run || error) && window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [run, error]);

  const check = useCallback(async () => {
    if (!context.trim() || !answer.trim() || loading) return;
    const sent = { question: question.trim(), context: context.trim(), answer: answer.trim() };
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sent),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered with status ${res.status}.`);
      setRun({ result: data, ...sent, ms: Math.round(performance.now() - started) });
      fetchHistory();
    } catch (e) {
      setRun(null);
      setError(e.message || "The check could not be completed.");
    } finally {
      setLoading(false);
    }
  }, [question, context, answer, loading, fetchHistory]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        check();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [check]);

  const loadExample = (ex) => {
    setQuestion(ex.question);
    setContext(ex.context);
    setAnswer(ex.answer);
    setExampleId(ex.id);
    setRun(null);
    setError(null);
  };

  const clearAll = () => {
    setQuestion("");
    setContext("");
    setAnswer("");
    setExampleId(null);
    setRun(null);
    setError(null);
  };

  const openHistoryItem = (item) => {
    setQuestion(item.question || "");
    setContext(item.context || "");
    setAnswer(item.answer || "");
    setExampleId(null);
    setError(null);
    setRun({
      result: { trust_score: item.trust_score, decision: item.decision, features: item.features, cached: true },
      question: item.question || "",
      context: item.context || "",
      answer: item.answer || "",
      ms: null,
    });
  };

  const clearHistory = async () => {
    try {
      await fetch("/history", { method: "DELETE" });
      setHistory([]);
    } catch {
      // Leave the list as it is if the server could not be reached.
    }
  };

  const edit = (setter) => (e) => {
    setter(e.target.value);
    setExampleId(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 shrink-0 border-b border-neutral-200 px-5 lg:px-8 flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <span className="font-semibold tracking-tight">Hallucination Detector</span>
          <span className="hidden sm:inline text-sm text-neutral-500">Grounding check for RAG answers</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <span
            className={`size-2 rounded-full ${
              health.state === "online" ? "bg-emerald-600" : health.state === "offline" ? "bg-red-600" : "bg-neutral-300"
            }`}
          />
          {health.state === "online" && <span>Online, {health.scorer}</span>}
          {health.state === "offline" && <span>Server unreachable</span>}
          {health.state === "checking" && <span>Connecting</span>}
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <main className="px-5 lg:px-8 py-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">Check an answer against its source</h1>
            <p className="mt-1.5 text-neutral-600 max-w-xl">
              Paste the passage your model was given and the answer it wrote. Anything the answer states that the
              source doesn't support gets flagged.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-500 mr-1">Examples</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => loadExample(ex)}
                  aria-pressed={exampleId === ex.id}
                  className={`h-8 px-3 rounded text-sm border transition-colors ${
                    exampleId === ex.id
                      ? "border-accent bg-accent/5 text-accent font-medium"
                      : "border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:text-neutral-950"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-5">
              <Field id="question" label="Question" hint="optional">
                <input
                  id="question"
                  type="text"
                  className="field h-10 px-3"
                  placeholder="What was asked?"
                  value={question}
                  onChange={edit(setQuestion)}
                />
              </Field>

              <Field id="context" label="Source" hint="what the model was given" count={`${words(context)} words`}>
                <textarea
                  id="context"
                  rows={6}
                  className="field p-3 resize-y"
                  placeholder="Paste the retrieved passage or reference text"
                  value={context}
                  onChange={edit(setContext)}
                />
              </Field>

              <Field id="answer" label="Answer" hint="what the model wrote" count={`${words(answer)} words`}>
                <textarea
                  id="answer"
                  rows={4}
                  className="field p-3 resize-y"
                  placeholder="Paste the answer you want checked"
                  value={answer}
                  onChange={edit(setAnswer)}
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={check}
                disabled={!canRun}
                className="h-10 px-5 rounded bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:bg-neutral-200 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Checking" : "Check answer"}
              </button>
              <button
                onClick={clearAll}
                className="h-10 px-3 rounded text-sm text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
              >
                Clear
              </button>
              <span className="ml-auto hidden sm:block text-sm text-neutral-500">
                <kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>Enter</kbd>
              </span>
            </div>

            <Recent items={history} onOpen={openHistoryItem} onClear={clearHistory} />
          </div>
        </main>

        <aside
          ref={resultRef}
          aria-live="polite"
          className="border-t lg:border-t-0 lg:border-l border-neutral-200 bg-neutral-50 px-5 lg:px-8 py-8"
        >
          <div className={`lg:sticky lg:top-8 transition-opacity ${loading ? "opacity-50" : ""}`}>
            <h2 className="text-sm font-medium text-neutral-500">Result</h2>
            {error && (
              <div className="mt-4 border-l-2 border-red-600 pl-3">
                <p className="font-medium text-red-700">The check didn't run</p>
                <p className="mt-1 text-sm text-neutral-700">{error}</p>
              </div>
            )}
            {!error && !run && (
              <p className="mt-4 text-neutral-600">
                Nothing checked yet. The score runs from 0 to 1, and an answer needs {THRESHOLD.toFixed(2)} or more to
                count as grounded.
              </p>
            )}
            {!error && run && (
              <Result
                run={run}
                copied={copied}
                onCopy={() => {
                  navigator.clipboard.writeText(JSON.stringify(run.result, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, hint, count, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label} <span className="font-normal text-neutral-500">· {hint}</span>
        </label>
        {count && <span className="text-xs text-neutral-500 tabular-nums">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Result({ run, copied, onCopy }) {
  const { result } = run;
  const grounded = result.decision === "show";
  const score = result.trust_score ?? 0;
  const parts = useMemo(() => markUp(run.answer, run.context), [run.answer, run.context]);
  const facts = parts.filter((p) => p.found !== undefined);
  const missing = facts.filter((p) => !p.found).length;

  // The score can clear the threshold while individual claims are still unsupported; say so.
  const tone = !grounded
    ? { title: "Likely hallucinated", text: "text-red-700", bar: "bg-red-600" }
    : missing > 0
    ? { title: "Passed, with unsupported details", text: "text-amber-700", bar: "bg-amber-500" }
    : { title: "Grounded", text: "text-emerald-700", bar: "bg-emerald-600" };

  let summary;
  if (facts.length === 0) summary = "The answer has no names or numbers to look up, so it was scored on wording alone.";
  else if (missing === 0) summary = "Every name and number in the answer appears in the source.";
  else
    summary = `${missing} of ${facts.length} names and numbers in the answer ${
      missing === 1 ? "doesn't" : "don't"
    } appear in the source.`;

  const origin = [
    result.cached ? "From cache" : run.ms != null ? `${run.ms} ms` : null,
    result.fallback ? "built-in lexical scorer" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mt-3">
      <p className={`text-2xl font-semibold tracking-tight ${tone.text}`}>{tone.title}</p>
      <p className="mt-1 text-neutral-700">{summary}</p>

      <div className="mt-6 flex items-end justify-between">
        <span className="font-mono text-5xl font-medium tracking-tight tabular-nums leading-none">
          {score.toFixed(2)}
        </span>
        <span className="text-sm text-neutral-500">trust score</span>
      </div>
      <div className="mt-3 relative h-2 rounded-sm bg-neutral-200">
        <div
          className={`absolute inset-y-0 left-0 rounded-sm ${tone.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, score * 100))}%` }}
        />
        <div className="absolute -inset-y-1 w-px bg-neutral-900" style={{ left: `${THRESHOLD * 100}%` }} />
      </div>
      <div className="mt-1.5 grid grid-cols-3 text-xs text-neutral-500 font-mono">
        <span>0</span>
        <span className="text-center">{THRESHOLD.toFixed(2)} to pass</span>
        <span className="text-right">1</span>
      </div>

      <h3 className="mt-8 text-sm font-medium">Answer, checked against the source</h3>
      <p className="mt-2 rounded border border-neutral-200 bg-white p-3 leading-7">
        {parts.map((p, i) =>
          p.found === undefined ? (
            <span key={i}>{p.text}</span>
          ) : (
            <span key={i} className={p.found ? "fact-found" : "fact-missing"}>
              {p.text}
            </span>
          )
        )}
      </p>
      {facts.length > 0 && (
        <p className="mt-2 text-xs text-neutral-500">
          <span className="fact-missing">Marked</span> is not in the source.{" "}
          <span className="fact-found">Underlined</span> is.
        </p>
      )}

      {result.features && (
        <>
          <h3 className="mt-8 text-sm font-medium">Signals</h3>
          <dl className="mt-2 border-b border-neutral-200">
            {SIGNALS.map(({ key, label, lowerIsBetter }) => {
              const value = result.features[key] ?? 0;
              return (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(0,1fr)_88px_40px] items-center gap-3 border-t border-neutral-200 py-2 text-sm"
                >
                  <dt className="text-neutral-700">
                    {label}
                    {lowerIsBetter && <span className="text-neutral-400"> · lower is better</span>}
                  </dt>
                  <div className="h-1.5 rounded-sm bg-neutral-200">
                    <div
                      className="h-full rounded-sm bg-neutral-700"
                      style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
                    />
                  </div>
                  <dd className="text-right font-mono tabular-nums">{value.toFixed(2)}</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-neutral-600 hover:text-neutral-950">
          Raw response{origin && <span className="text-neutral-400"> · {origin}</span>}
        </summary>
        <div className="relative mt-2">
          <pre className="max-h-60 overflow-auto rounded bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100">
            {JSON.stringify(result, null, 2)}
          </pre>
          <button
            onClick={onCopy}
            className="absolute right-2 top-2 rounded bg-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-600"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </details>
    </div>
  );
}

function Recent({ items, onOpen, onClear }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Recent checks</h2>
        <button onClick={onClear} className="text-sm text-neutral-500 hover:text-red-700">
          Clear list
        </button>
      </div>
      <ul className="mt-2 border-b border-neutral-200">
        {items.map((item, i) => {
          const ok = item.decision === "show";
          return (
            <li key={item.id || i} className="border-t border-neutral-200">
              <button
                onClick={() => onOpen(item)}
                className="w-full grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 text-left text-sm hover:bg-neutral-50"
              >
                <span className={`font-mono tabular-nums font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>
                  {Number(item.trust_score).toFixed(2)}
                </span>
                <span className="truncate text-neutral-800">{item.answer}</span>
                <time className="text-xs text-neutral-500 tabular-nums">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
