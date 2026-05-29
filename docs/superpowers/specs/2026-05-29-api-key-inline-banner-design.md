# API Key Inline Banner — Design Spec

**Date:** 2026-05-29  
**Branch:** feat/web-app  
**Status:** Approved

---

## Problem

The CLI's `ensure_api_key()` detects a missing provider API key and prompts the user to paste it (saved to `.env`). The web app has no equivalent — if the key is absent, the run silently fails at the first API call.

---

## Goal

When the user selects an LLM provider that has no API key stored, show an inline banner below the provider dropdown with a password input so they can save the key to `.env` without leaving the browser. Matches the CLI flow. Does not block the Launch Run button.

---

## Architecture

### Backend — `webapp.py`

Two new FastAPI endpoints.

**`GET /api/env/api-key/{provider}`**
- Calls `get_api_key_env(provider)` from `tradingagents/llm_clients/api_key_env.py` to get the env var name.
- Returns `{ "env_var": "ANTHROPIC_API_KEY", "present": true/false }`.
- For providers with no key requirement (ollama, unknown), returns `{ "env_var": null, "present": true }` — no banner shown.
- Presence check: `bool(os.environ.get(env_var))`.

**`POST /api/env/api-key`**
- Body: `{ "provider": "anthropic", "key": "sk-..." }`.
- Resolves env var via `get_api_key_env`, writes to `.env` via `python-dotenv`'s `set_key` (same as CLI), sets `os.environ[env_var]`.
- Returns `{ "ok": true, "env_var": "ANTHROPIC_API_KEY" }`.
- Returns 400 if provider has no key requirement or key is empty.

Both endpoints import from the existing `tradingagents.llm_clients.api_key_env` — no new mapping needed.

### Frontend — `app/NewRun.jsx`

**New state:**
- `apiKeyStatus` — `null` | `{ present: true }` | `{ present: false, env_var: string }`
- `apiKeyInput` — string (controlled password field)
- `apiKeySaving` — bool (loading state for Save button)

**Effect:** `useEffect` on `form.llm_provider` — fetches `GET /api/env/api-key/{provider}`, sets `apiKeyStatus`. Clears `apiKeyInput` on provider change.

**Rendering:** Directly below the LLM provider `<Field>`, conditionally render a banner when `apiKeyStatus?.present === false`:
- Background `#fffbeb`, border `1px solid #fbbf24`, border-radius 8, padding `10px 14px`
- Text: `No {env_var} found. Enter your API key to save to .env:` (font-size 13, color `#92400e`)
- `<input type="password">` styled like existing inputs, value bound to `apiKeyInput`
- "Save key" button; calls `POST /api/env/api-key`; on success sets `apiKeyStatus = { present: true }`, clears input

**No change to `canLaunch`** — Launch Run stays enabled regardless of key status.

---

## Data Flow

```
Provider changes
  → GET /api/env/api-key/{provider}
  → apiKeyStatus = { present: false, env_var: "XAI_API_KEY" }
  → Banner renders below provider field

User types key + clicks Save
  → POST /api/env/api-key { provider, key }
  → os.environ[env_var] = key; set_key(".env", env_var, key)
  → apiKeyStatus = { present: true }
  → Banner hides
```

---

## Error Handling

- Fetch failure (network): `apiKeyStatus` stays `null` — no banner shown, silent (avoids blocking the form on a transient error).
- Save failure (API returns non-ok): show a brief error message inside the banner.
- Empty key submitted: prevented client-side (Save button disabled when input is empty).

---

## Out of Scope

- Listing / deleting existing keys.
- Validating the key against the provider's API.
- Regional provider variants (qwen-cn, glm-cn, etc.) — they map to separate env vars via `get_api_key_env` already; the banner works for them automatically since the provider key is resolved server-side.
