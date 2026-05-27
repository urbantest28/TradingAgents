# TradingAgents Web App — Design Spec

**Date:** 2026-05-27  
**Status:** Approved for implementation  
**Scope:** v1 — local web app replacing the CLI, cloud VM deployment deferred to v2

---

## 1. Goal

Replace the terminal CLI with a browser-based web app that is more accessible and production-quality for personal use. The app must:

- Allow a user to configure and launch a TradingAgents analysis run from a browser form
- Show live progress of an active run in the browser (replacing the Rich TUI)
- Continue a run in the background even if the browser tab is closed
- Send an email notification with the final verdict when a run completes
- Allow saving and reusing named run configurations (presets)
- Integrate the existing Trading Reports viewer so everything lives at one URL

Remote access (cloud VM deployment) is explicitly out of scope for v1 but the architecture must be cloud-VM-ready with no code changes required — only environment variable changes.

---

## 2. System Architecture

### Two layers

**Backend — `webapp.py` (FastAPI)**  
A single Python process that replaces `serve.py`. It:
- Serves the frontend (HTML + static files)
- Accepts API requests from the browser
- Launches analysis runs in background threads
- Streams live run progress to the browser via Server-Sent Events (SSE)
- Sends email on run completion
- Reads/writes presets from disk

Start command: `python webapp.py`  
Default port: `7788`  
Port is configurable via `WEBAPP_PORT` env var (for v2 cloud deployment).

**Frontend — `index.html` + `app/*.jsx` (CDN React 18, no build step)**  
A single-page app served at the root URL. No Node.js, no npm, no compilation. JSX files are transpiled in the browser by Babel (same approach as the existing Trading Reports app). Three hash-routed sections share a persistent top nav bar.

### Data flow for a run

```
1. User fills New Run form → clicks "Launch Run"
2. Browser: POST /api/runs  →  FastAPI returns { run_id }
3. Browser: navigates to #/monitor/{run_id}
4. Browser: opens SSE connection to GET /api/runs/{run_id}/stream
5. FastAPI: starts TradingAgentsGraph in a background thread
6. Background thread: streams chunks → pushes events into run's event queue
7. FastAPI SSE handler: reads queue → sends events to browser
8. Browser: updates agent status table, message feed, report panel in real-time
9. On completion: FastAPI sends email → pushes "done" event
10. Browser: shows "View Full Report →" button → navigates to #/reports/{folder}
```

### What is removed

- `serve.py` — deleted (replaced by `webapp.py`)
- `scripts/generate_manifest.py` — deleted (manifest is now a live API call)
- `Trading Reports.html` — deleted (replaced by `index.html`)

---

## 3. Backend Design

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves `index.html` |
| GET | `/static/{path}` | Serves JSX, CSS, image files from `app/` |
| GET | `/reports/{folder}/{path}` | Serves report markdown files from disk |
| GET | `/api/reports` | Returns list of all report folders (live, replaces manifest) |
| GET | `/api/presets` | Returns list of saved presets |
| POST | `/api/presets` | Creates a new preset |
| PUT | `/api/presets/{id}` | Updates an existing preset |
| DELETE | `/api/presets/{id}` | Deletes a preset |
| POST | `/api/runs` | Launches a new run, returns `{ run_id }` |
| GET | `/api/runs/{run_id}/stream` | SSE stream of live run events |
| GET | `/api/runs/{run_id}/status` | Returns current run state snapshot (for reconnect) |

### Background run management

- Only one run may be active at a time (v1, personal use). Attempting to launch a second run while one is running returns a `409 Conflict` response and the browser shows an error prompting the user to wait.
- Each run is assigned a UUID (`run_id`) at launch time
- FastAPI uses a `ThreadPoolExecutor` to run `TradingAgentsGraph.graph.stream()` in a background thread (the graph code is synchronous and cannot be made async without changes)
- Each run has an in-memory `asyncio.Queue` for events
- The SSE handler reads from this queue and forwards events to the connected browser
- If the browser disconnects and reconnects, the SSE endpoint replays all past events from a stored event log before resuming live events — this ensures the monitor page always shows the full picture after a page refresh

### Run state (in-memory, per run_id)

```python
{
    "run_id": str,
    "status": "running" | "complete" | "error",
    "selections": dict,          # ticker, date, analysts, etc.
    "events": list,              # all events emitted so far (for replay)
    "report_folder": str | None, # set on completion, e.g. "NVDA_20260527_143022"
    "error": str | None,
}
```

Completed run state persists in memory until the server restarts. It does not need to survive restarts because the report files are on disk and browsable via the Reports section.

### SSE event schema

All events are JSON with a `type` field:

| type | payload fields | description |
|------|---------------|-------------|
| `agent_status` | `agent`, `status` | Agent moved to pending/in_progress/completed |
| `message` | `msg_type`, `content`, `timestamp` | New message or tool call |
| `report_section` | `section`, `content` | Report section updated |
| `stats` | `llm_calls`, `tool_calls`, `tokens_in`, `tokens_out`, `elapsed_s` | Periodic stats update |
| `done` | `report_folder`, `verdict` | Run completed successfully |
| `error` | `message` | Run failed with error |

### Email

- Sent via Python's built-in `smtplib` (no extra dependency)
- Triggered only on successful completion
- Subject: `TradingAgents: {ticker} → {verdict}`
- Body: one paragraph — run details (ticker, date, analysts) and the final portfolio manager verdict text
- Config via `.env`:

```
EMAIL_FROM=you@gmail.com
EMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_TO=you@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

Email is optional — if `EMAIL_FROM` is not set, the notification is silently skipped.

### New Python dependencies

```
fastapi
uvicorn[standard]
python-multipart
```

All other imports (`smtplib`, `json`, `threading`, `asyncio`, `uuid`) are Python standard library.

---

## 4. Frontend Structure

### Entry point

`index.html` — replaces `Trading Reports.html`. Same CDN React 18 + Babel approach. Loads all `app/*.jsx` files.

### File layout

```
TradingAgents/
├── webapp.py                  ← new
├── index.html                 ← new (replaces Trading Reports.html)
├── app/
│   ├── data.jsx               ← updated: reads /api/reports, /api/presets
│   ├── App.jsx                ← updated: adds new-run + monitor routes
│   ├── NewRun.jsx             ← new
│   ├── Monitor.jsx            ← new
│   ├── Hub.jsx                ← unchanged
│   ├── StoryView.jsx          ← unchanged
│   ├── tweaks-panel.jsx       ← unchanged
│   └── ui.jsx                 ← unchanged
```

### Routing

Hash-based routing (same pattern as existing app):

| Hash | Page |
|------|------|
| `#/new-run` | New Run form |
| `#/monitor/{run_id}` | Live monitor for a run |
| `#/` or `#/reports` | Reports hub (existing Hub.jsx) |
| `#/reports/{folder}` | Report detail (existing StoryView.jsx) |

Default route (empty hash) redirects to `#/new-run`.

### Nav bar

Persistent across all pages. Three items: **New Run** · **Monitor** · **Reports**. Monitor item shows a pulsing indicator when a run is active.

### New Run page (`NewRun.jsx`)

- Preset selector dropdown at top with "New preset" and "Save current as preset" actions
- Form fields matching current CLI steps 1–8:
  - Ticker symbol (text input with validation)
  - Analysis date (date picker, defaults to today)
  - Output language (dropdown)
  - Analysts (checkbox group, Fundamentals hidden for crypto tickers)
  - Research depth (segmented control: 1 / 2 / 3)
  - LLM provider (dropdown)
  - Shallow thinker model (dropdown, options filtered by provider)
  - Deep thinker model (dropdown, options filtered by provider)
  - Provider-specific thinking config (conditional: shown only for Google/OpenAI/Anthropic)
- "Launch Run" button — disabled until required fields are filled
- On submit: POST `/api/runs`, then navigate to `#/monitor/{run_id}`

### Monitor page (`Monitor.jsx`)

- Connects to `/api/runs/{run_id}/stream` on mount
- If browser was closed and reopened: status endpoint is polled once on mount to check if run is still active; if complete, redirects straight to report
- Four panels matching the current TUI layout:
  - **Agent progress table** — teams and agents with Pending / In Progress / Completed status
  - **Message feed** — scrolling list of agent messages and tool calls (newest at top)
  - **Current report** — markdown-rendered panel showing the most recently updated report section
  - **Stats bar** — agents done, LLM calls, tool calls, tokens in/out, elapsed time
- On `done` event: shows a "View Full Report →" button linking to `#/reports/{folder}`
- On `error` event: shows error message with a "Try Again" link to `#/new-run`

### Reports section (migrated from Trading Reports.html)

`Hub.jsx` and `StoryView.jsx` are kept unchanged. The modifications are in `data.jsx` and `App.jsx`:
- `REPORT_MANIFEST` constant and `generate_manifest.py` dependency removed from `data.jsx`
- `loadManifest()` async function added to `data.jsx` that calls `GET /api/reports`
- `App.jsx` calls `loadManifest()` on mount instead of mapping over the static `REPORT_MANIFEST` constant

The tweaks panel, markdown rendering, verdict display, confidence gauge, and all visual behaviour are preserved exactly.

---

## 5. Data Model

### Presets

Stored at `~/.tradingagents/presets.json` as a JSON array.

```json
[
  {
    "id": "a1b2c3d4",
    "name": "My NVDA Setup",
    "ticker": "NVDA",
    "analysts": ["market", "news", "fundamentals"],
    "research_depth": 2,
    "llm_provider": "anthropic",
    "shallow_thinker": "claude-haiku-4-5",
    "deep_thinker": "claude-sonnet-4-6",
    "output_language": "English",
    "anthropic_effort": "high",
    "google_thinking_level": null,
    "openai_reasoning_effort": null
  }
]
```

The `ticker` field is optional — a preset can capture model/analyst preferences without locking in a specific stock.

### Reports manifest (API response)

`GET /api/reports` scans the configured reports directory and returns:

```json
[
  {
    "folder": "NVDA_20260527_143022",
    "ticker": "NVDA",
    "ts": "2026-05-27 14:30",
    "company": "NVIDIA Corporation"
  }
]
```

Read from each folder's `meta.json`. Sorted newest-first.

---

## 6. Configuration

All runtime configuration via environment variables (`.env` file at project root):

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBAPP_PORT` | `7788` | Port the server listens on |
| `WEBAPP_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for cloud VM) |
| `EMAIL_FROM` | — | Sender email address (omit to disable email) |
| `EMAIL_APP_PASSWORD` | — | SMTP app password |
| `EMAIL_TO` | — | Recipient email address |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |

All existing `TRADINGAGENTS_*` env vars are unchanged.

---

## 7. v2 Cloud VM Notes (out of scope for v1)

When deploying to a cloud VM:
- Set `WEBAPP_HOST=0.0.0.0` to accept external connections
- Set `WEBAPP_PORT` as needed
- Add authentication (HTTP Basic Auth or a simple token header) before exposing publicly
- Use a process manager (e.g. `systemd` or `pm2`) to keep `webapp.py` running
- No code changes required — only env var changes

---

## 8. Files Deleted After Migration

- `serve.py`
- `scripts/generate_manifest.py`
- `Trading Reports.html`
