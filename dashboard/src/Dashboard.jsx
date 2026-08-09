import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/score";

export default function Dashboard() {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  async function handleScore() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context, answer }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      setResult(data);
      setHistory((prev) => [{ question, answer, ...data }, ...prev].slice(0, 10));
    } catch (e) {
      setResult({ error: e.message || "Could not reach the API. Is the backend running?" });
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hallucination Detector</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a question, the retrieved context, and an LLM-generated answer to check if it's grounded.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700">Question</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="What was the company's Q3 revenue?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Context (retrieved document)</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 h-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="The company reported Q3 revenue of $4.2M, up 12% YoY..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Answer (LLM-generated)</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-2 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Revenue was $4.2M in Q3, driven largely by new enterprise contracts."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>

        <button
          onClick={handleScore}
          disabled={loading || !question || !context || !answer}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Scoring..." : "Check for hallucination"}
        </button>
      </div>

      {result && result.error && (
        <div className="p-4 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm">
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <div
          className={`p-4 rounded-lg border ${
            result.decision === "show"
              ? "border-green-300 bg-green-50"
              : "border-red-300 bg-red-50"
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-900">
              Trust score: {result.trust_score} —{" "}
              {result.decision === "show" ? "Grounded" : "Flagged"}
            </span>
            {result.cached && (
              <span className="text-xs text-gray-500 italic">cached</span>
            )}
          </div>

          <div className="mt-3 space-y-1">
            {Object.entries(result.features || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-gray-600">{k}</span>
                <span className="font-mono text-gray-800">{v.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-2">Recent checks</h2>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={i}
                className="text-sm border-b border-gray-200 pb-2 flex justify-between gap-4"
              >
                <span className="truncate text-gray-600">{h.answer}</span>
                <span
                  className={`font-mono shrink-0 ${
                    h.decision === "show" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {h.trust_score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}