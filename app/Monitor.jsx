// Monitor.jsx — live run monitor.
// Connects to /api/runs/{runId}/stream (SSE).
// Replays all past events on reconnect.

const { useState, useEffect, useRef } = React;

// All known agents in display order
const ALL_TEAMS = [
  { team: "Analyst Team",       agents: ["Market Analyst", "Sentiment Analyst", "News Analyst", "Fundamentals Analyst"] },
  { team: "Research Team",      agents: ["Bull Researcher", "Bear Researcher", "Research Manager"] },
  { team: "Trading Team",       agents: ["Trader"] },
  { team: "Risk Management",    agents: ["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst"] },
  { team: "Portfolio Mgmt",     agents: ["Portfolio Manager"] },
];

const STATUS_COLOR = {
  pending:     COLORS.muted,
  in_progress: "#3b82f6",
  completed:   "#22c55e",
  error:       "#ef4444",
};

function StatusDot({ status }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: STATUS_COLOR[status] || COLORS.rule,
      flexShrink: 0,
      ...(status === "in_progress" ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
    }} />
  );
}

function AgentTable({ agentStatus }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.rule}` }}>
            <th style={{ textAlign: "left", padding: "8px 12px", color: COLORS.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Team</th>
            <th style={{ textAlign: "left", padding: "8px 12px", color: COLORS.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Agent</th>
            <th style={{ textAlign: "left", padding: "8px 12px", color: COLORS.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ALL_TEAMS.flatMap(({ team, agents }) =>
            agents
              .filter(a => agentStatus[a] !== undefined)
              .map((a, i) => (
                <tr key={a} style={{ borderBottom: `1px solid ${COLORS.rule2}` }}>
                  <td style={{ padding: "8px 12px", color: COLORS.ink2, fontWeight: i === 0 ? 500 : 400 }}>
                    {i === 0 ? team : ""}
                  </td>
                  <td style={{ padding: "8px 12px" }}>{a}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <StatusDot status={agentStatus[a]} />
                      <span style={{ color: STATUS_COLOR[agentStatus[a]] || COLORS.muted, textTransform: "capitalize" }}>
                        {agentStatus[a] || "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MessageFeed({ messages }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const TYPE_COLOR = { Tool: "#a78bfa", Agent: COLORS.ink, User: "#3b82f6", Data: COLORS.muted, System: "#f59e0b", Control: COLORS.muted };

  return (
    <div style={{ height: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, padding: "0 4px" }}>
      {messages.map((m, i) => (
        <div key={i} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
          <span style={{ color: COLORS.muted, flexShrink: 0, fontFamily: "Geist Mono, monospace" }}>{m.timestamp}</span>
          <span style={{ color: TYPE_COLOR[m.msg_type] || COLORS.muted, flexShrink: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", paddingTop: 1 }}>{m.msg_type}</span>
          <span style={{ color: COLORS.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function StatsBar({ stats, elapsed }) {
  const items = [
    ["LLM calls", stats.llm_calls ?? "—"],
    ["Tool calls", stats.tool_calls ?? "—"],
    ["Tokens in", stats.tokens_in != null ? (stats.tokens_in / 1000).toFixed(1) + "k" : "—"],
    ["Tokens out", stats.tokens_out != null ? (stats.tokens_out / 1000).toFixed(1) + "k" : "—"],
    ["Elapsed", elapsed != null ? `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s` : "—"],
  ];
  return (
    <div style={{
      display: "flex", gap: 24, flexWrap: "wrap",
      padding: "12px 16px", background: COLORS.rule2, borderRadius: 10, fontSize: 12,
    }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
          <span style={{ fontFamily: "Geist Mono, monospace", fontWeight: 600, color: COLORS.ink }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function MonitorPage({ runId, onComplete }) {
  const [agentStatus, setAgentStatus] = useState({});
  const [messages, setMessages] = useState([]);
  const [currentSection, setCurrentSection] = useState(null);
  const [stats, setStats] = useState({});
  const [elapsed, setElapsed] = useState(null);
  const [runStatus, setRunStatus] = useState("running");
  const [reportFolder, setReportFolder] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (!runId) return;

    // Check if run already complete (page reload case)
    fetch(`/api/runs/${runId}/status`)
      .then(r => r.json())
      .then(s => {
        if (s.status === "complete" && s.report_folder) {
          setRunStatus("complete");
          setReportFolder(s.report_folder);
          onComplete?.();
          window.location.hash = `/reports/${encodeURIComponent(s.report_folder)}`;
          return;
        }
        if (s.status === "error") {
          setRunStatus("error");
          setErrorMsg(s.error || "Unknown error");
          return;
        }
        connectSSE();
      })
      .catch(() => connectSSE());

    function handleEvent(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ping") return;
        if (data.type === "agent_status") {
          setAgentStatus(s => ({ ...s, [data.agent]: data.status }));
        } else if (data.type === "message") {
          setMessages(ms => [...ms.slice(-199), data]);
        } else if (data.type === "report_section") {
          setCurrentSection(data.content);
        } else if (data.type === "stats") {
          setStats(data);
          setElapsed(data.elapsed_s);
        } else if (data.type === "done") {
          setRunStatus("complete");
          setReportFolder(data.report_folder);
          onComplete?.();
          esRef.current?.close();
        } else if (data.type === "error") {
          setRunStatus("error");
          setErrorMsg(data.message);
          esRef.current?.close();
        }
      } catch (e) {
        console.warn("SSE parse error", e);
      }
    }

    function connectSSE() {
      const es = new EventSource(`/api/runs/${runId}/stream`);
      esRef.current = es;
      es.onmessage = handleEvent;
    }

    return () => esRef.current?.close();
  }, [runId]);

  if (!runId) {
    return (
      <div style={{ maxWidth: 800, margin: "80px auto", textAlign: "center", color: COLORS.muted }}>
        No active run. <a href="#/new-run" style={{ color: COLORS.accent }}>Start one →</a>
      </div>
    );
  }

  const mdHtml = currentSection
    ? (typeof marked !== "undefined" ? marked.parse(currentSection) : currentSection)
    : null;

  return (
    <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>
          Run Monitor
          <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 12, color: COLORS.muted, marginLeft: 12, fontWeight: 400 }}>
            {runId.slice(0, 8)}
          </span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {runStatus === "running" && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3b82f6", fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s ease-in-out infinite" }} />
              Running
            </span>
          )}
          {runStatus === "complete" && reportFolder && (
            <a href={`#/reports/${encodeURIComponent(reportFolder)}`}
              style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: COLORS.ink, color: "white", borderRadius: 8, textDecoration: "none" }}
            >View Full Report →</a>
          )}
        </div>
      </div>

      {/* Error */}
      {runStatus === "error" && (
        <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, fontSize: 13, color: "#dc2626" }}>
          <strong>Run failed:</strong> {errorMsg}
          <a href="#/new-run" style={{ marginLeft: 16, color: "#dc2626", fontWeight: 600 }}>Try Again →</a>
        </div>
      )}

      {/* Stats bar */}
      <StatsBar stats={stats} elapsed={elapsed} />

      {/* Two-column: agent table + messages */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card padding={0}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.rule}` }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Agent Progress</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            <AgentTable agentStatus={agentStatus} />
          </div>
        </Card>
        <Card padding={0}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.rule}` }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Message Feed</span>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <MessageFeed messages={messages} />
          </div>
        </Card>
      </div>

      {/* Current report section */}
      {mdHtml && (
        <Card padding={20}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: COLORS.ink2 }}>Current Report</div>
          <div
            style={{ fontSize: 13, lineHeight: 1.7, color: COLORS.ink }}
            dangerouslySetInnerHTML={{ __html: mdHtml }}
          />
        </Card>
      )}
    </div>
  );
}

window.MonitorPage = MonitorPage;
