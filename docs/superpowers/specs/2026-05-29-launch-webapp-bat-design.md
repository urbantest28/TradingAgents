# Design: launch-webapp.bat

**Date:** 2026-05-29
**Status:** Approved

## Problem

Starting the web app requires opening a terminal, navigating to the project directory, and running `python webapp.py`. The goal is to make launching as easy as double-clicking a file.

## Solution

A new `launch-webapp.bat` at the project root. It follows the same pattern as the existing `run.bat` (CLI launcher).

## Behaviour

1. Activate `.venv\Scripts\activate.bat`
2. Launch `python webapp.py` in a new minimized console window titled "TradingAgents Web App"
3. Poll `http://localhost:7788` with `curl` once per second until it responds (server is ready)
4. During polling, also check whether the server process is still alive — if it exited early (e.g. startup error), print an error message and exit rather than looping forever
5. Open the default browser to `http://localhost:7788`
6. Print: "Web app running — close the 'TradingAgents Web App' window to stop"
7. Launcher window closes; minimized server window remains in the taskbar

## Files Changed

| File | Change |
|------|--------|
| `launch-webapp.bat` | New file — the launcher |

No changes to `webapp.py` or any other existing file.

## Dependencies

- `curl` — ships with Windows 10 (1803+) and Windows 11; no installation required
- `.venv` virtual environment at project root (same requirement as `run.bat`)

## Port

Defaults to `7788` (matches `webapp.py` default). If `WEBAPP_PORT` env var is set, the bat reads it and uses that port for both the health-check poll and the browser URL.

## Error Cases

| Condition | Behaviour |
|-----------|-----------|
| Server starts successfully | Browser opens automatically |
| Server process exits before becoming ready | Launcher prints error, exits with code 1, pauses so user can read the message |
| Port already in use | Server process exits immediately → same error path as above |
