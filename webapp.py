"""
TradingAgents Web App — FastAPI backend.
Start: python webapp.py
Port: WEBAPP_PORT env var (default 7788)
"""
import asyncio
import json
import os
import smtplib
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

# ---------------------------------------------------------------------------
# App & config
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent
REPORTS_DIR = ROOT / "reports"
PRESETS_FILE = Path.home() / ".tradingagents" / "presets.json"

app = FastAPI(title="TradingAgents Web App")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount app/ directory for JSX/CSS static assets
app.mount("/static", StaticFiles(directory=str(ROOT / "app")), name="static")

# ---------------------------------------------------------------------------
# In-memory run store  { run_id -> RunState }
# ---------------------------------------------------------------------------
_runs: dict[str, dict[str, Any]] = {}
_executor = ThreadPoolExecutor(max_workers=1)


def _active_run() -> dict | None:
    """Return the currently running run, or None."""
    for r in _runs.values():
        if r["status"] == "running":
            return r
    return None


# ---------------------------------------------------------------------------
# Routes: static
# ---------------------------------------------------------------------------
@app.get("/")
async def serve_index():
    # Use Path.cwd() so the test can monkeypatch chdir to a tmp dir with index.html.
    # In production, webapp.py is run from the project root, so cwd == ROOT.
    index = Path.cwd() / "index.html"
    if not index.exists():
        index = ROOT / "index.html"
    return FileResponse(str(index))


# Report markdown files: /reports/{folder}/{path}
@app.get("/reports/{folder}/{file_path:path}")
async def serve_report_file(folder: str, file_path: str):
    target = REPORTS_DIR / folder / file_path
    if not target.exists():
        raise HTTPException(status_code=404)
    return FileResponse(str(target))


# ---------------------------------------------------------------------------
# Routes: /api/reports
# ---------------------------------------------------------------------------
@app.get("/api/reports")
async def list_reports():
    if not REPORTS_DIR.exists():
        return JSONResponse([])
    entries = []
    for folder in sorted(REPORTS_DIR.iterdir(), reverse=True):
        if not folder.is_dir():
            continue
        meta_path = folder / "meta.json"
        meta: dict = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        # Parse ts from folder name: TICKER_YYYYMMDD_HHMMSS
        parts = folder.name.split("_")
        ts = ""
        if len(parts) >= 3:
            d, t = parts[-2], parts[-1]
            if len(d) == 8 and len(t) == 6:
                ts = f"{d[:4]}-{d[4:6]}-{d[6:]} {t[:2]}:{t[2:4]}"
        entries.append({
            "folder": folder.name,
            "ticker": meta.get("ticker", parts[0] if parts else folder.name),
            "ts": ts,
            "company": meta.get("company", ""),
        })
    return JSONResponse(entries)


# ---------------------------------------------------------------------------
# Routes: /api/presets
# ---------------------------------------------------------------------------
def _load_presets() -> list:
    if not PRESETS_FILE.exists():
        return []
    try:
        return json.loads(PRESETS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_presets(presets: list) -> None:
    PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PRESETS_FILE.write_text(json.dumps(presets, indent=2), encoding="utf-8")


@app.get("/api/presets")
async def get_presets():
    return JSONResponse(_load_presets())


@app.post("/api/presets")
async def create_preset(request: Request):
    data = await request.json()
    presets = _load_presets()
    preset = {**data, "id": uuid.uuid4().hex[:8]}
    presets.append(preset)
    _save_presets(presets)
    return JSONResponse(preset, status_code=201)


@app.put("/api/presets/{preset_id}")
async def update_preset(preset_id: str, request: Request):
    data = await request.json()
    presets = _load_presets()
    for i, p in enumerate(presets):
        if p.get("id") == preset_id:
            presets[i] = {**p, **data, "id": preset_id}
            _save_presets(presets)
            return JSONResponse(presets[i])
    raise HTTPException(status_code=404, detail="Preset not found")


@app.delete("/api/presets/{preset_id}")
async def delete_preset(preset_id: str):
    presets = _load_presets()
    new_presets = [p for p in presets if p.get("id") != preset_id]
    if len(new_presets) == len(presets):
        raise HTTPException(status_code=404, detail="Preset not found")
    _save_presets(new_presets)
    return JSONResponse({"ok": True})


# ---------------------------------------------------------------------------
# Routes: /api/runs
# ---------------------------------------------------------------------------
@app.post("/api/runs")
async def launch_run(request: Request):
    if _active_run():
        raise HTTPException(status_code=409, detail="A run is already in progress")
    body = await request.json()
    run_id = uuid.uuid4().hex
    loop = asyncio.get_event_loop()
    run_state: dict[str, Any] = {
        "run_id": run_id,
        "status": "running",
        "selections": body,
        "events": [],
        "report_folder": None,
        "error": None,
        "queue": asyncio.Queue(),
        "loop": loop,
    }
    _runs[run_id] = run_state
    _executor.submit(_run_analysis_thread, run_id, body, loop)
    return JSONResponse({"run_id": run_id}, status_code=202)


@app.get("/api/runs/{run_id}/status")
async def run_status(run_id: str):
    run = _runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return JSONResponse({
        "run_id": run_id,
        "status": run["status"],
        "report_folder": run["report_folder"],
        "error": run["error"],
        "event_count": len(run["events"]),
    })


@app.get("/api/runs/{run_id}/stream")
async def run_stream(run_id: str):
    run = _runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def generator():
        # Replay past events first
        for event in list(run["events"]):
            yield {"data": json.dumps(event)}
        # Then stream new ones
        q: asyncio.Queue = run["queue"]
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=30)
                yield {"data": json.dumps(event)}
                if event.get("type") in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "ping"})}

    return EventSourceResponse(generator())


# ---------------------------------------------------------------------------
# Background run thread
# ---------------------------------------------------------------------------
def _push_event(run_state: dict, event: dict) -> None:
    """Push an SSE event — append to replay log and enqueue for live clients."""
    run_state["events"].append(event)
    run_state["loop"].call_soon_threadsafe(run_state["queue"].put_nowait, event)


def _run_analysis_thread(run_id: str, selections: dict, loop: asyncio.AbstractEventLoop) -> None:
    """Runs TradingAgentsGraph in a background thread, emitting SSE events."""
    import datetime
    import time

    from cli.main import (
        ANALYST_ORDER,
        MessageBuffer,
        StatsCallbackHandler,
        classify_message_type,
        save_report_to_disk,
        update_analyst_statuses,
    )
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.analyst_execution import (
        AnalystWallTimeTracker,
        build_analyst_execution_plan,
        get_initial_analyst_node,
    )
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    run = _runs[run_id]

    try:
        # --- Build config ---
        config = DEFAULT_CONFIG.copy()
        config["max_debate_rounds"] = int(selections.get("research_depth", 1))
        config["max_risk_discuss_rounds"] = int(selections.get("research_depth", 1))
        config["quick_think_llm"] = selections["shallow_thinker"]
        config["deep_think_llm"] = selections["deep_thinker"]
        config["llm_provider"] = selections["llm_provider"].lower()
        config["backend_url"] = selections.get("backend_url", "")
        config["google_thinking_level"] = selections.get("google_thinking_level")
        config["openai_reasoning_effort"] = selections.get("openai_reasoning_effort")
        config["anthropic_effort"] = selections.get("anthropic_effort")
        config["output_language"] = selections.get("output_language", "English")

        ticker = selections["ticker"].upper()
        analysis_date = selections["analysis_date"]
        raw_analysts = selections.get("analysts", ["market", "news", "fundamentals"])
        selected_analyst_keys = [a for a in ANALYST_ORDER if a in raw_analysts]

        # --- Initialise helper objects ---
        stats_handler = StatsCallbackHandler()
        analyst_execution_plan = build_analyst_execution_plan(
            selected_analyst_keys,
            concurrency_limit=config["analyst_concurrency_limit"],
        )
        wall_time_tracker = AnalystWallTimeTracker(analyst_execution_plan)

        graph = TradingAgentsGraph(
            selected_analyst_keys,
            config=config,
            debug=True,
            callbacks=[stats_handler],
        )

        mb = MessageBuffer()
        mb.init_for_analysis(selected_analyst_keys)

        # Announce all agents as pending
        for agent, status in mb.agent_status.items():
            _push_event(run, {"type": "agent_status", "agent": agent, "status": status})

        # Mark first analyst in_progress
        first_analyst = get_initial_analyst_node(analyst_execution_plan)
        mb.update_agent_status(first_analyst, "in_progress")
        _push_event(run, {"type": "agent_status", "agent": first_analyst, "status": "in_progress"})

        init_state = graph.propagator.create_initial_state(
            ticker, analysis_date,
            asset_type=selections.get("asset_type", "stock"),
        )
        args = graph.propagator.get_graph_args(callbacks=[stats_handler])

        start_time = time.time()
        trace = []

        for chunk in graph.graph.stream(init_state, **args):
            # Messages
            for message in chunk.get("messages", []):
                msg_id = getattr(message, "id", None)
                if msg_id and msg_id in mb._processed_message_ids:
                    continue
                if msg_id:
                    mb._processed_message_ids.add(msg_id)
                msg_type, content = classify_message_type(message)
                if content and content.strip():
                    mb.add_message(msg_type, content)
                    _push_event(run, {
                        "type": "message",
                        "msg_type": msg_type,
                        "content": content,
                        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
                    })
                if hasattr(message, "tool_calls") and message.tool_calls:
                    for tc in message.tool_calls:
                        name = tc["name"] if isinstance(tc, dict) else tc.name
                        args_d = tc["args"] if isinstance(tc, dict) else tc.args
                        mb.add_tool_call(name, args_d)
                        _push_event(run, {
                            "type": "message",
                            "msg_type": "Tool",
                            "content": f"{name}: {str(args_d)[:120]}",
                            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
                        })

            # Analyst statuses
            old_statuses = dict(mb.agent_status)
            update_analyst_statuses(mb, chunk, wall_time_tracker=wall_time_tracker)
            for agent, status in mb.agent_status.items():
                if old_statuses.get(agent) != status:
                    _push_event(run, {"type": "agent_status", "agent": agent, "status": status})

            # Research team
            if chunk.get("investment_debate_state"):
                debate = chunk["investment_debate_state"]
                old_s = dict(mb.agent_status)
                if debate.get("bull_history"):
                    mb.update_report_section("investment_plan",
                        f"### Bull Researcher Analysis\n{debate['bull_history']}")
                    _push_event(run, {"type": "report_section", "section": "investment_plan",
                                      "content": mb.report_sections["investment_plan"]})
                if debate.get("bear_history"):
                    mb.update_report_section("investment_plan",
                        f"### Bear Researcher Analysis\n{debate['bear_history']}")
                    _push_event(run, {"type": "report_section", "section": "investment_plan",
                                      "content": mb.report_sections["investment_plan"]})
                if debate.get("judge_decision"):
                    mb.update_report_section("investment_plan",
                        f"### Research Manager Decision\n{debate['judge_decision']}")
                    _push_event(run, {"type": "report_section", "section": "investment_plan",
                                      "content": mb.report_sections["investment_plan"]})
                    for a in ["Bull Researcher", "Bear Researcher", "Research Manager"]:
                        mb.update_agent_status(a, "completed")
                    mb.update_agent_status("Trader", "in_progress")
                for agent, status in mb.agent_status.items():
                    if old_s.get(agent) != status:
                        _push_event(run, {"type": "agent_status", "agent": agent, "status": status})

            # Trading team
            if chunk.get("trader_investment_plan"):
                mb.update_report_section("trader_investment_plan", chunk["trader_investment_plan"])
                _push_event(run, {"type": "report_section", "section": "trader_investment_plan",
                                  "content": chunk["trader_investment_plan"]})
                if mb.agent_status.get("Trader") != "completed":
                    mb.update_agent_status("Trader", "completed")
                    mb.update_agent_status("Aggressive Analyst", "in_progress")
                    _push_event(run, {"type": "agent_status", "agent": "Trader", "status": "completed"})
                    _push_event(run, {"type": "agent_status", "agent": "Aggressive Analyst", "status": "in_progress"})

            # Risk team
            if chunk.get("risk_debate_state"):
                risk = chunk["risk_debate_state"]
                old_s = dict(mb.agent_status)
                for hist_key, section_key, agent in [
                    ("aggressive_history", "final_trade_decision", "Aggressive Analyst"),
                    ("conservative_history", "final_trade_decision", "Conservative Analyst"),
                    ("neutral_history", "final_trade_decision", "Neutral Analyst"),
                ]:
                    if risk.get(hist_key):
                        mb.update_report_section(section_key,
                            f"### {agent} Analysis\n{risk[hist_key]}")
                        _push_event(run, {"type": "report_section", "section": section_key,
                                          "content": mb.report_sections[section_key]})
                if risk.get("judge_decision"):
                    mb.update_report_section("final_trade_decision",
                        f"### Portfolio Manager Decision\n{risk['judge_decision']}")
                    _push_event(run, {"type": "report_section", "section": "final_trade_decision",
                                      "content": mb.report_sections["final_trade_decision"]})
                    for a in ["Aggressive Analyst", "Conservative Analyst", "Neutral Analyst",
                               "Portfolio Manager"]:
                        mb.update_agent_status(a, "completed")
                for agent, status in mb.agent_status.items():
                    if old_s.get(agent) != status:
                        _push_event(run, {"type": "agent_status", "agent": agent, "status": status})

            # Stats
            stats = stats_handler.get_stats()
            _push_event(run, {
                "type": "stats",
                "llm_calls": stats["llm_calls"],
                "tool_calls": stats["tool_calls"],
                "tokens_in": stats["tokens_in"],
                "tokens_out": stats["tokens_out"],
                "elapsed_s": round(time.time() - start_time, 1),
            })

            trace.append(chunk)

        # --- Save to disk ---
        final_state: dict = {}
        for c in trace:
            final_state.update(c)

        import datetime as _dt
        timestamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        save_path = ROOT / "reports" / f"{ticker}_{timestamp}"
        save_report_to_disk(final_state, ticker, save_path)

        # Write meta.json
        meta: dict = {"ticker": ticker, "analysis_date": analysis_date}
        try:
            import yfinance as yf
            info = yf.Ticker(ticker).fast_info
            price = getattr(info, "last_price", None) or getattr(info, "previous_close", None)
            if price:
                meta["current_price"] = round(float(price), 4)
            long_name = yf.Ticker(ticker).info.get("longName", "")
            if long_name:
                meta["company"] = long_name
        except Exception:
            pass
        (save_path / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

        # Extract verdict
        verdict = ""
        try:
            decision_text = final_state.get("final_trade_decision", "")
            graph.process_signal(decision_text)
            verdict = decision_text[:200].strip()
        except Exception:
            pass

        run["status"] = "complete"
        run["report_folder"] = save_path.name
        _push_event(run, {
            "type": "done",
            "report_folder": save_path.name,
            "verdict": verdict,
        })

        # Email notification
        _send_email(ticker, analysis_date, selections.get("analysts", []),
                    verdict, save_path.name)

    except Exception as exc:
        run["status"] = "error"
        run["error"] = str(exc)
        _push_event(run, {"type": "error", "message": str(exc)})
        raise


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------
def _send_email(ticker: str, analysis_date: str, analysts: list,
                verdict: str, report_folder: str) -> None:
    email_from = os.environ.get("EMAIL_FROM", "")
    if not email_from:
        return  # silently skip
    email_to = os.environ.get("EMAIL_TO", email_from)
    password = os.environ.get("EMAIL_APP_PASSWORD", "")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    body = (
        f"TradingAgents analysis complete.\n\n"
        f"Ticker: {ticker}\n"
        f"Date: {analysis_date}\n"
        f"Analysts: {', '.join(analysts)}\n"
        f"Report folder: {report_folder}\n\n"
        f"Portfolio Manager verdict:\n{verdict}"
    )
    msg = MIMEText(body)
    msg["Subject"] = f"TradingAgents: {ticker} → analysis complete"
    msg["From"] = email_from
    msg["To"] = email_to
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(email_from, password)
            s.send_message(msg)
    except Exception:
        pass  # Email is optional — never crash the run over it


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("WEBAPP_PORT", "7788"))
    host = os.environ.get("WEBAPP_HOST", "127.0.0.1")
    uvicorn.run("webapp:app", host=host, port=port, reload=False)
