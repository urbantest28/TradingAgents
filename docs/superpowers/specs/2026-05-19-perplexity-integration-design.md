# Perplexity AI Integration Design

**Date:** 2026-05-19  
**Status:** Approved

## Summary

Add Perplexity as a full LLM provider so any agent — particularly the News Analyst, Sentiment Analyst, and Market Analyst — can use Perplexity's online search-enabled models (`sonar`, `sonar-pro`). Perplexity's API is OpenAI-compatible, so it slots into the existing `OpenAIClient` path with no new client file required.

## Motivation

The News Analyst currently uses yfinance headlines as its news source. Perplexity's `sonar-pro` model searches the live web natively during inference, producing richer, more current research with source citations — a direct upgrade for news-driven agents with zero agent-level code changes.

## Scope

**In scope:**
- Add `perplexity` as a supported LLM provider (models: `sonar`, `sonar-pro`)
- Wire into the existing 4-file provider pattern (OpenAI-compatible path)
- CLI model selection support for both quick and deep modes

**Out of scope:**
- Perplexity as a separate news data vendor (Option B)
- Surfacing Perplexity citations as structured footnotes in reports
- Replacing yfinance for price/market data (not a Perplexity capability)

## Architecture

Perplexity uses the OpenAI-compatible chat completions API at `https://api.perplexity.ai`. It joins the `_OPENAI_COMPATIBLE` tuple in `openai_client.py` alongside xAI, DeepSeek, OpenRouter, etc. The factory dispatches it to `OpenAIClient` automatically — no new client class needed.

## File Changes

### `tradingagents/llm_clients/openai_client.py`
- Add `"perplexity"` to the `_OPENAI_COMPATIBLE` tuple
- Add `"perplexity": "https://api.perplexity.ai"` to `_PROVIDER_BASE_URL`

### `tradingagents/llm_clients/api_key_env.py`
- Add `"perplexity": "PERPLEXITY_API_KEY"` to `PROVIDER_API_KEY_ENV`

### `tradingagents/llm_clients/model_catalog.py`
- Add `"perplexity"` entry to `MODEL_OPTIONS` with:
  - **quick:** `sonar` — fast web-search model, good for quick news summaries
  - **deep:** `sonar-pro` — full research model, recommended for News Analyst

### `tradingagents/llm_clients/factory.py`
- No changes required — already dispatches any `_OPENAI_COMPATIBLE` provider to `OpenAIClient`

## Data Flow

```
User config: provider="perplexity", model="sonar-pro"
  → factory.create_llm_client("perplexity", "sonar-pro")
    → OpenAIClient(model="sonar-pro", provider="perplexity")
      → base_url = "https://api.perplexity.ai"
      → api_key = os.environ["PERPLEXITY_API_KEY"]
      → returns NormalizedChatOpenAI instance

News Analyst node:
  → llm.bind_tools([get_news, get_global_news])
  → sonar-pro receives prompt + available tools
  → sonar-pro searches the web natively (built into model inference)
  → sonar-pro produces report; yfinance tools available but rarely needed
  → citations embedded inline in content text

Sentiment / Market Analyst nodes:
  → pre-fetched data (yfinance headlines, StockTwits, Reddit) injected into prompt
  → sonar-pro interprets pre-fetched data AND augments with live web context
  → single LLM call, no tool-calling
```

## Error Handling

| Scenario | Behavior |
|---|---|
| `PERPLEXITY_API_KEY` not set | `OpenAIClient.get_llm()` raises `ValueError` with env var name — consistent with all other keyed providers |
| Invalid model name | `warn_if_unknown_model()` warns but does not hard-fail — consistent with OpenRouter behavior |
| API errors (rate limit, network) | Surface as standard LangChain exceptions — no special handling needed |

## Known Limitations

- **Citations dropped:** Perplexity's API returns a `citations` field alongside `content`. The existing `normalize_content()` extracts text only; citations are silently dropped. Report text references sources inline, so this is acceptable. Surfacing citations as structured footnotes is a future enhancement.
- **Tool calls:** sonar-pro supports function calling but will rarely invoke the yfinance `get_news` / `get_global_news` tools since it searches natively. The tools remain bound and callable if the model chooses.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PERPLEXITY_API_KEY` | Yes | API key from perplexity.ai — add to `.env` file |

## Testing

- Add `"perplexity"` to any provider-enumeration tests covering all known providers
- Add `"sonar"` and `"sonar-pro"` to model validation tests
- Mock `PERPLEXITY_API_KEY` in tests using the same pattern as other provider keys
