# launch-webapp.bat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `launch-webapp.bat` — a double-clickable file that activates the virtual environment, starts `webapp.py` in a minimized console window, waits for the server to respond, then opens the browser automatically.

**Architecture:** Single `.bat` file at the project root, following the same pattern as `run.bat`. Uses `start /min` to spawn the server in a separate named window, `curl` to health-check the HTTP endpoint, an inline PowerShell `Get-CimInstance` call to detect if the server process dies during startup, and `start ""` to open the default browser once the server is ready.

**Tech Stack:** Windows batch scripting, PowerShell (inline one-liners), curl (ships with Windows 10 1803+ and Windows 11)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `launch-webapp.bat` | Double-clickable launcher for the web app |

No existing files are modified.

---

### Task 1: Create launch-webapp.bat

**Files:**
- Create: `launch-webapp.bat`

- [ ] **Step 1: Create the file**

Create `launch-webapp.bat` at the project root with the following exact content:

```bat
@echo off
setlocal

REM Default port 7788; override with WEBAPP_PORT env var
if "%WEBAPP_PORT%"=="" (set PORT=7788) else (set PORT=%WEBAPP_PORT%)

REM Activate virtual environment
call "%~dp0.venv\Scripts\activate.bat"
if errorlevel 1 (
    echo.
    echo ERROR: Could not activate virtual environment.
    echo Make sure .venv exists in the project root.
    pause
    exit /b 1
)

REM Launch server in a minimized console window
start "TradingAgents Web App" /min python "%~dp0webapp.py"

echo Starting TradingAgents web app on port %PORT%...

set ATTEMPTS=0
set MAX_ATTEMPTS=60

:poll
timeout /t 1 /nobreak >nul

REM Check whether the server process is still alive
powershell -nologo -noprofile -command "if (Get-CimInstance Win32_Process -Filter ""Name='python.exe' and CommandLine like '%%webapp.py%%'"") { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
    echo.
    echo ERROR: Web app server exited before becoming ready.
    echo Check the "TradingAgents Web App" console window for the error.
    pause
    exit /b 1
)

REM Try to reach the server
curl -s --max-time 1 -o nul http://localhost:%PORT%/ 2>nul
if not errorlevel 1 goto ready

set /a ATTEMPTS+=1
if %ATTEMPTS% gtr %MAX_ATTEMPTS% (
    echo.
    echo ERROR: Server did not respond after %MAX_ATTEMPTS% seconds.
    echo Check the "TradingAgents Web App" console window for errors.
    pause
    exit /b 1
)

goto poll

:ready
start "" http://localhost:%PORT%/
echo.
echo Web app running -- close the "TradingAgents Web App" window to stop.
```

**Key design notes for reviewers:**
- `%~dp0` expands to the directory of the `.bat` file itself, so all paths work correctly regardless of where the user double-clicks from.
- `setlocal` keeps `PORT` and `ATTEMPTS` from leaking into the parent environment.
- `timeout /t 1 /nobreak >nul` sleeps exactly one second silently; `/nobreak` prevents keypresses from skipping the wait.
- The PowerShell CIM query checks the command line of running `python.exe` processes for the string `webapp.py`. The `%%` in batch produces a literal `%` inside the PowerShell string, which is the LIKE wildcard.
- The process-alive check runs *before* the curl attempt on each iteration. The first iteration has already waited 1 second (from `timeout`), giving Python enough time to appear as a running process before we check.
- `curl -s --max-time 1` is silent (`-s`) and gives up after 1 second if the server isn't listening. Exit code 0 = any HTTP response received (server is up). Exit code non-zero = no response.
- `if not errorlevel 1` means "if the previous command exited with code 0" — the standard Windows batch idiom for success.
- `start "" http://localhost:%PORT%/` opens the URL in the default browser. The empty title `""` is required by `start` when the first non-switch argument is a URL rather than a program name.
- After printing the success message, the script exits naturally, closing the launcher window. The minimized "TradingAgents Web App" window stays in the taskbar.

- [ ] **Step 2: Commit**

```bash
git add launch-webapp.bat
git commit -m "feat: add launch-webapp.bat double-click launcher for web app"
```

---

### Task 2: Smoke Test (manual)

Batch scripts are not amenable to automated unit testing. Verify the three user-facing scenarios manually.

**Files:**
- Test: `launch-webapp.bat` (manual run)

- [ ] **Step 1: Happy path — server starts cleanly**

Double-click `launch-webapp.bat` from Windows Explorer (not from a terminal — this simulates what a user does).

Expected sequence:
1. A console window titled **"TradingAgents Web App"** appears minimized in the taskbar
2. The launcher window prints: `Starting TradingAgents web app on port 7788...`
3. Within ~5–15 seconds the **default browser opens** to `http://localhost:7788/`
4. The launcher prints: `Web app running -- close the "TradingAgents Web App" window to stop.` and closes on its own
5. The web UI is accessible and functional in the browser

- [ ] **Step 2: WEBAPP_PORT env var is respected**

From a terminal (cmd or PowerShell), set the port and run the launcher:

```bat
set WEBAPP_PORT=8080
launch-webapp.bat
```

Expected:
- The "TradingAgents Web App" console window starts the server on port 8080 (visible in its output)
- The launcher polls `http://localhost:8080/`
- Browser opens to `http://localhost:8080/`

- [ ] **Step 3: Error path — server crashes on startup**

Simulate a crash by temporarily breaking the server. Rename `webapp.py` to `webapp.py.bak`, then double-click `launch-webapp.bat`.

Expected:
1. The minimized "TradingAgents Web App" window flashes briefly then disappears (Python exits immediately — `webapp.py` not found)
2. Within ~2 seconds the launcher prints:
   ```
   ERROR: Web app server exited before becoming ready.
   Check the "TradingAgents Web App" console window for the error.
   ```
3. The launcher **pauses** (does not close) so the user can read the message

Restore `webapp.py.bak` → `webapp.py` after the test.

---

## Self-Review

**Spec coverage:**
| Spec requirement | Covered by |
|---|---|
| Activate `.venv\Scripts\activate.bat` | Task 1 — `call "%~dp0.venv\Scripts\activate.bat"` |
| Launch in minimized window titled "TradingAgents Web App" | Task 1 — `start "TradingAgents Web App" /min python` |
| Poll `http://localhost:7788` with curl once per second | Task 1 — `:poll` loop with `curl` + `timeout /t 1` |
| Check process alive during polling | Task 1 — PowerShell `Get-CimInstance` check |
| If server exits early: print error, exit 1, pause | Task 1 — `errorlevel 1` branch after process check |
| Open browser to `http://localhost:7788` | Task 1 — `start "" http://localhost:%PORT%/` |
| Print success message | Task 1 — `echo Web app running...` |
| Launcher window closes; server window stays | Task 1 — script exits naturally; server started via `start` |
| Defaults to port 7788, respects `WEBAPP_PORT` | Task 1 — `PORT` variable with env var fallback |
| Port in use → same error path as crash | Task 1 — server exits immediately → process check catches it |

All requirements covered. No placeholders or ambiguities.
