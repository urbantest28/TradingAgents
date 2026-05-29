// Production app router — supports four hash routes:
//   #/new-run            → NewRun form
//   #/monitor/{run_id}   → Live run monitor
//   #/reports            → Reports hub
//   #/reports/{folder}   → Report detail
// Default (empty hash) redirects to #/new-run.

const { useState, useEffect } = React;

function getHashRoute() {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("monitor/")) {
    return { name: "monitor", runId: h.slice(8) };
  }
  if (h.startsWith("reports/")) {
    return { name: "detail", folder: decodeURIComponent(h.slice(8)) };
  }
  if (h === "reports") return { name: "hub" };
  if (h === "new-run") return { name: "new-run" };
  return { name: "new-run" };
}

// ── Nav bar ──────────────────────────────────────────────────────────────────
function NavBar({ activeRun }) {
  const [route, setRoute] = useState(getHashRoute());
  useEffect(() => {
    const onHash = () => setRoute(getHashRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const items = [
    { label: "New Run", hash: "#/new-run", name: "new-run" },
    { label: "Monitor", hash: activeRun ? `#/monitor/${activeRun}` : "#/monitor/", name: "monitor" },
    { label: "Reports", hash: "#/reports", name: "hub" },
  ];

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "white", borderBottom: `1px solid ${COLORS.rule}`,
      display: "flex", alignItems: "center", gap: 4, padding: "0 24px", height: 48,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 24 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, background: COLORS.ink, color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 12, letterSpacing: -0.5,
        }}>TA</div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.3 }}>TradingAgents</span>
      </div>
      {items.map(({ label, hash, name }) => {
        const active = route.name === name || (name === "hub" && route.name === "detail");
        return (
          <a key={name} href={hash} style={{
            padding: "6px 14px", fontSize: 13, fontWeight: active ? 600 : 400,
            color: active ? COLORS.ink : COLORS.muted,
            borderRadius: 7, textDecoration: "none", position: "relative",
            background: active ? COLORS.rule2 : "transparent",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {label}
            {name === "monitor" && activeRun && (
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
                display: "inline-block",
                animation: "pulse 1.5s ease-in-out infinite",
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [route, setRoute] = useState(getHashRoute());
  const [manifest, setManifest] = useState([]);
  const [reportsIndex, setReportsIndex] = useState({});
  const [indexLoading, setIndexLoading] = useState(true);
  const [activeReport, setActiveReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState(null);

  // Default redirect
  useEffect(() => {
    if (window.location.hash === "" || window.location.hash === "#/") {
      window.location.hash = "/new-run";
    }
  }, []);

  // Hash routing
  useEffect(() => {
    const onHash = () => setRoute(getHashRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load manifest on hub visits
  useEffect(() => {
    if (route.name !== "hub" && manifest.length > 0) return;
    (async () => {
      setIndexLoading(true);
      const m = await loadManifest();
      setManifest(m);
      const idx = {};
      await Promise.all(m.map(async (entry) => {
        const folder = entry.folder;
        const decisionTxt = await fetchText(`reports/${folder}/5_portfolio/decision.md`);
        const traderTxt   = await fetchText(`reports/${folder}/3_trading/trader.md`);
        const decision = parseFieldedMarkdown(decisionTxt || "");
        const trader   = parseFieldedMarkdown(traderTxt || "");
        const verdict = normalizeVerdict(decision.Rating, trader.__final);
        idx[folder] = {
          ticker: entry.ticker, ts: entry.ts, company: entry.company, verdict,
          target: num(decision["Price Target"]),
          stop:   num(trader["Stop Loss"]),
          current: entry.current_price ?? num(trader["Entry Price"]),
          horizon: decision["Time Horizon"],
          summary: firstSentenceShort(decision["Executive Summary"]),
          confidence: confidenceFromReport({ decision, trader, docs: {} }),
        };
      }));
      setReportsIndex(idx);
      setIndexLoading(false);
    })();
  }, [route.name]);

  // Load full report for detail view
  useEffect(() => {
    if (route.name !== "detail" || !route.folder) {
      setActiveReport(null);
      return;
    }
    setReportLoading(true);
    setActiveReport(null);
    (async () => {
      const r = await loadReport(route.folder);
      setActiveReport(r);
      setReportLoading(false);
    })();
  }, [route]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TweaksContext.Provider value={t}>
      <style>{`:root { --accent: ${t.accent}; }`}</style>
      <NavBar activeRun={activeRunId} />

      {route.name === "new-run" && (
        <NewRunPage onRunLaunched={(runId) => {
          setActiveRunId(runId);
          window.location.hash = `/monitor/${runId}`;
        }} />
      )}

      {route.name === "monitor" && (
        <MonitorPage
          runId={route.runId}
          onComplete={() => setActiveRunId(null)}
        />
      )}

      {route.name === "hub" && (
        indexLoading
          ? <FullScreenLoading label="Loading reports…" />
          : <div style={{ minHeight: "calc(100vh - 48px)", background: COLORS.paper,
                          padding: "32px 0", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: 1280 }}>
                <HubArtboard
                  manifest={manifest}
                  index={reportsIndex}
                  onOpen={(folder) => { window.location.hash = `/reports/${encodeURIComponent(folder)}`; }}
                />
              </div>
            </div>
      )}

      {route.name === "detail" && (
        (reportLoading || !activeReport)
          ? <FullScreenLoading label="Loading report…" />
          : (() => {
              const ticker = route.folder.split("_")[0];
              const sameTicker = manifest
                .filter(m => m.ticker === ticker)
                .map(m => ({ ...m, verdict: reportsIndex[m.folder]?.verdict }));
              return (
                <TweaksContext.Provider value={t}>
                  <ReportTweaks t={t} setTweak={setTweak} />
                  <StoryView
                    folder={route.folder}
                    report={activeReport}
                    allRuns={sameTicker}
                    onBack={() => { window.location.hash = "/reports"; }}
                  />
                </TweaksContext.Provider>
              );
            })()
      )}
    </TweaksContext.Provider>
  );
}

function ReportTweaks({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Appearance" />
      <TweakColor label="Accent" value={t.accent}
        options={["#4F5AE6", "#0B7A6E", "#7A4FB5", "#B66431", "#1F8A5B", "#475569"]}
        onChange={(v) => setTweak("accent", v)} />
      <TweakRadio label="Density" value={t.density}
        options={["compact", "cozy"]}
        onChange={(v) => setTweak("density", v)} />
      <TweakRadio label="Hero" value={t.heroSize}
        options={["large", "compact"]}
        onChange={(v) => setTweak("heroSize", v)} />
      <TweakSection label="Show / hide" />
      <TweakToggle label="Confidence gauge" value={t.showConfidence}
        onChange={(v) => setTweak("showConfidence", v)} />
      <TweakToggle label="Bull / bear bar" value={t.showBullBear}
        onChange={(v) => setTweak("showBullBear", v)} />
      <TweakToggle label="Highlight $ / % / x metrics" value={t.highlightMetrics}
        onChange={(v) => setTweak("highlightMetrics", v)} />
    </TweaksPanel>
  );
}

function FullScreenLoading({ label }) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: COLORS.paper, color: COLORS.muted,
      fontFamily: "Geist, system-ui, sans-serif", fontSize: 13,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 12, height: 12, borderRadius: 6,
          border: `2px solid ${COLORS.rule}`, borderTopColor: COLORS.accent,
          animation: "spin 0.7s linear infinite",
        }} />
        {label}
      </div>
    </div>
  );
}

function firstSentenceShort(text) {
  if (!text) return null;
  const s = text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/[*_`]/g, "");
  const m = s.match(/^([^.!?]{20,200}[.!?])/);
  return m ? m[1].trim() : s.slice(0, 180).trim();
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
