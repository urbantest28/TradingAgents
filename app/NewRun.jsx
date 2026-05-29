// NewRun.jsx — run configuration form with preset support.
// Calls POST /api/runs on submit; parent navigates to #/monitor/{run_id}.

const { useState, useEffect } = React;

// ── Provider / model catalogue ────────────────────────────────────────────────
const PROVIDERS = ["anthropic", "openai", "google", "groq", "ollama", "perplexity"];

const SHALLOW_MODELS = {
  anthropic:   ["claude-haiku-4-5", "claude-haiku-3-5"],
  openai:      ["gpt-4o-mini", "gpt-4.1-mini", "o4-mini"],
  google:      ["gemini-2.0-flash", "gemini-2.5-flash-preview-05-20"],
  groq:        ["llama-3.3-70b-versatile", "llama3-8b-8192"],
  ollama:      ["llama3.2", "mistral", "phi3"],
  perplexity:  ["sonar", "sonar-pro"],
};

const DEEP_MODELS = {
  anthropic:   ["claude-sonnet-4-5", "claude-sonnet-4-6", "claude-opus-4-5"],
  openai:      ["gpt-4o", "gpt-4.1", "o3", "o4-mini"],
  google:      ["gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-preview-05-20"],
  groq:        ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"],
  ollama:      ["llama3.1:70b", "mixtral", "qwen2.5:72b"],
  perplexity:  ["sonar-pro", "sonar-reasoning-pro"],
};

const ANALYSTS = ["market", "social", "news", "fundamentals"];
const LANGUAGES = ["English", "Chinese", "Spanish", "French", "Japanese", "Korean", "German"];

function isCrypto(ticker) {
  return /^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|DOT|MATIC)$/i.test(ticker.trim());
}

// ── Preset helpers ─────────────────────────────────────────────────────────────
async function fetchPresets() {
  try {
    const r = await fetch("/api/presets");
    return r.ok ? r.json() : [];
  } catch { return []; }
}

async function savePreset(preset) {
  const r = await fetch("/api/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  return r.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink2, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children, disabled }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{
        padding: "8px 12px", fontSize: 13, border: `1px solid ${COLORS.rule}`,
        borderRadius: 8, background: "white", fontFamily: "Geist, sans-serif",
        color: COLORS.ink, cursor: disabled ? "default" : "pointer",
        appearance: "none",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 30,
      }}
    >
      {children}
    </select>
  );
}

function SegmentControl({ value, options, onChange }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${COLORS.rule}`, borderRadius: 8, overflow: "hidden" }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          style={{
            flex: 1, padding: "8px 0", fontSize: 13, fontWeight: value === opt ? 600 : 400,
            border: "none", cursor: "pointer", fontFamily: "Geist, sans-serif",
            background: value === opt ? COLORS.ink : "white",
            color: value === opt ? "white" : COLORS.ink2,
            transition: "background 120ms",
          }}
        >{opt}</button>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function NewRunPage({ onRunLaunched }) {
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [form, setForm] = useState({
    ticker: "",
    analysis_date: new Date().toISOString().split("T")[0],
    output_language: "English",
    analysts: ["market", "news", "fundamentals"],
    research_depth: 2,
    llm_provider: "anthropic",
    shallow_thinker: "claude-haiku-4-5",
    deep_thinker: "claude-sonnet-4-6",
    anthropic_effort: "high",
    google_thinking_level: null,
    openai_reasoning_effort: null,
  });
  const [error, setError] = useState(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    fetchPresets().then(setPresets);
  }, []);

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function toggleAnalyst(a) {
    set("analysts", form.analysts.includes(a)
      ? form.analysts.filter(x => x !== a)
      : [...form.analysts, a]);
  }

  function applyPreset(id) {
    const p = presets.find(p => p.id === id);
    if (!p) return;
    setSelectedPresetId(id);
    const { id: _id, name: _name, ...fields } = p;
    setForm(f => ({ ...f, ...fields }));
  }

  async function handleSavePreset() {
    const name = window.prompt("Preset name:", form.ticker || "My Setup");
    if (!name) return;
    const saved = await savePreset({ ...form, name });
    setPresets(ps => [...ps, saved]);
    setSelectedPresetId(saved.id);
  }

  async function handleLaunch() {
    setError(null);
    if (!form.ticker.trim()) { setError("Ticker is required"); return; }
    setLaunching(true);
    try {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ticker: form.ticker.trim().toUpperCase() }),
      });
      if (r.status === 409) {
        setError("A run is already in progress. Wait for it to finish.");
        setLaunching(false);
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const { run_id } = await r.json();
      onRunLaunched(run_id);
    } catch (e) {
      setError(String(e));
      setLaunching(false);
    }
  }

  const visibleAnalysts = isCrypto(form.ticker)
    ? ANALYSTS.filter(a => a !== "fundamentals")
    : ANALYSTS;

  const canLaunch = form.ticker.trim().length > 0 && !launching;

  return (
    <div style={{ maxWidth: 680, margin: "40px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginBottom: 24 }}>
        New Run
      </h1>

      {/* Preset bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, alignItems: "center" }}>
        <Select value={selectedPresetId} onChange={applyPreset}>
          <option value="">— No preset —</option>
          {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <button onClick={handleSavePreset} style={{
          padding: "8px 14px", fontSize: 13, border: `1px solid ${COLORS.rule}`,
          borderRadius: 8, background: "white", cursor: "pointer", fontFamily: "Geist, sans-serif",
          color: COLORS.ink2, whiteSpace: "nowrap",
        }}>Save current as preset</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Ticker */}
        <Field label="Ticker symbol">
          <input
            value={form.ticker} onChange={e => set("ticker", e.target.value.toUpperCase())}
            placeholder="e.g. NVDA, SPY, BTC"
            style={{
              padding: "8px 12px", fontSize: 13, border: `1px solid ${COLORS.rule}`,
              borderRadius: 8, fontFamily: "Geist, sans-serif", color: COLORS.ink,
            }}
          />
        </Field>

        {/* Analysis date */}
        <Field label="Analysis date">
          <input type="date" value={form.analysis_date}
            max={new Date().toISOString().split("T")[0]}
            onChange={e => set("analysis_date", e.target.value)}
            style={{
              padding: "8px 12px", fontSize: 13, border: `1px solid ${COLORS.rule}`,
              borderRadius: 8, fontFamily: "Geist, sans-serif", color: COLORS.ink,
            }}
          />
        </Field>

        {/* Language */}
        <Field label="Output language">
          <Select value={form.output_language} onChange={v => set("output_language", v)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>

        {/* Analysts */}
        <Field label="Analysts">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {visibleAnalysts.map(a => {
              const on = form.analysts.includes(a);
              return (
                <button key={a} onClick={() => toggleAnalyst(a)} style={{
                  padding: "7px 16px", fontSize: 13, fontWeight: on ? 600 : 400,
                  border: `1px solid ${on ? COLORS.ink : COLORS.rule}`,
                  borderRadius: 8, background: on ? COLORS.ink : "white",
                  color: on ? "white" : COLORS.ink2,
                  cursor: "pointer", fontFamily: "Geist, sans-serif", textTransform: "capitalize",
                }}>{a}</button>
              );
            })}
          </div>
        </Field>

        {/* Research depth */}
        <Field label="Research depth">
          <SegmentControl
            value={form.research_depth}
            options={[1, 2, 3]}
            onChange={v => set("research_depth", v)}
          />
        </Field>

        {/* LLM provider */}
        <Field label="LLM provider">
          <Select value={form.llm_provider} onChange={v => {
            set("llm_provider", v);
            set("shallow_thinker", (SHALLOW_MODELS[v] || [])[0] || "");
            set("deep_thinker", (DEEP_MODELS[v] || [])[0] || "");
          }}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>

        {/* Shallow thinker */}
        <Field label="Shallow thinker">
          <Select value={form.shallow_thinker} onChange={v => set("shallow_thinker", v)}>
            {(SHALLOW_MODELS[form.llm_provider] || []).map(m =>
              <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        {/* Deep thinker */}
        <Field label="Deep thinker">
          <Select value={form.deep_thinker} onChange={v => set("deep_thinker", v)}>
            {(DEEP_MODELS[form.llm_provider] || []).map(m =>
              <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        {/* Provider-specific thinking config */}
        {form.llm_provider === "anthropic" && (
          <Field label="Claude effort">
            <SegmentControl
              value={form.anthropic_effort}
              options={["low", "medium", "high"]}
              onChange={v => set("anthropic_effort", v)}
            />
          </Field>
        )}
        {form.llm_provider === "google" && (
          <Field label="Gemini thinking level">
            <SegmentControl
              value={form.google_thinking_level || "none"}
              options={["none", "low", "high"]}
              onChange={v => set("google_thinking_level", v === "none" ? null : v)}
            />
          </Field>
        )}
        {form.llm_provider === "openai" && (
          <Field label="OpenAI reasoning effort">
            <SegmentControl
              value={form.openai_reasoning_effort || "medium"}
              options={["low", "medium", "high"]}
              onChange={v => set("openai_reasoning_effort", v)}
            />
          </Field>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5",
                        borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={handleLaunch} disabled={!canLaunch}
          style={{
            padding: "12px 24px", fontSize: 14, fontWeight: 600,
            background: canLaunch ? COLORS.ink : COLORS.muted,
            color: "white", border: "none", borderRadius: 10,
            cursor: canLaunch ? "pointer" : "default",
            fontFamily: "Geist, sans-serif", marginTop: 8,
          }}
        >
          {launching ? "Launching…" : "Launch Run"}
        </button>
      </div>
    </div>
  );
}

window.NewRunPage = NewRunPage;
