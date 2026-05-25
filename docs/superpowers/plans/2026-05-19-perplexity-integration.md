# Perplexity AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Perplexity as a supported LLM provider (models `sonar` and `sonar-pro`) by wiring it into the existing 4-file OpenAI-compatible provider pattern.

**Architecture:** Perplexity's API is OpenAI-compatible at `https://api.perplexity.ai`, so it joins the `_OPENAI_COMPATIBLE` tuple in `factory.py` and gets entries in `openai_client.py`, `api_key_env.py`, and `model_catalog.py`. No new client class is needed — `OpenAIClient` dispatches to `NormalizedChatOpenAI` automatically.

**Tech Stack:** Python, pytest, `langchain_openai.ChatOpenAI`, existing `tradingagents.llm_clients` module

---

## File Map

| File | Change |
|------|--------|
| `tradingagents/llm_clients/factory.py` | Add `"perplexity"` to `_OPENAI_COMPATIBLE` tuple |
| `tradingagents/llm_clients/openai_client.py` | Add `"perplexity": "https://api.perplexity.ai"` to `_PROVIDER_BASE_URL` |
| `tradingagents/llm_clients/api_key_env.py` | Add `"perplexity": "PERPLEXITY_API_KEY"` to `PROVIDER_API_KEY_ENV` |
| `tradingagents/llm_clients/model_catalog.py` | Add `"perplexity"` entry with `sonar` (quick) and `sonar-pro` (deep) |
| `tests/test_api_key_env.py` | Add `"perplexity"` to provider set assertion + parametrized fixture |
| `tests/test_perplexity.py` | New test file: factory routing, base URL, API key error, model catalog |

---

## Task 1: Write failing tests for Perplexity registration

**Files:**
- Create: `tests/test_perplexity.py`

- [ ] **Step 1: Write the failing test file**

```python
"""Tests for Perplexity provider registration in the LLM client stack."""

from __future__ import annotations

import pytest

from tradingagents.llm_clients.api_key_env import get_api_key_env
from tradingagents.llm_clients.factory import _OPENAI_COMPATIBLE, create_llm_client
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS
from tradingagents.llm_clients.openai_client import OpenAIClient, _PROVIDER_BASE_URL


def test_perplexity_in_openai_compatible_tuple():
    assert "perplexity" in _OPENAI_COMPATIBLE


def test_factory_returns_openai_client_for_perplexity(monkeypatch):
    monkeypatch.setenv("PERPLEXITY_API_KEY", "pplx-test-key")
    client = create_llm_client("perplexity", "sonar")
    assert isinstance(client, OpenAIClient)
    assert client.provider == "perplexity"
    assert client.model == "sonar"


def test_perplexity_base_url():
    assert _PROVIDER_BASE_URL["perplexity"] == "https://api.perplexity.ai"


def test_perplexity_api_key_env():
    assert get_api_key_env("perplexity") == "PERPLEXITY_API_KEY"


def test_missing_perplexity_api_key_raises(monkeypatch):
    monkeypatch.delenv("PERPLEXITY_API_KEY", raising=False)
    client = create_llm_client("perplexity", "sonar-pro")
    with pytest.raises(ValueError, match="PERPLEXITY_API_KEY"):
        client.get_llm()


def test_perplexity_model_catalog_has_quick_and_deep():
    options = MODEL_OPTIONS["perplexity"]
    quick_ids = [model_id for _, model_id in options["quick"]]
    deep_ids = [model_id for _, model_id in options["deep"]]
    assert "sonar" in quick_ids
    assert "sonar-pro" in deep_ids


def test_perplexity_sonar_and_sonar_pro_pass_model_validation():
    from tradingagents.llm_clients.validators import validate_model
    assert validate_model("perplexity", "sonar") is True
    assert validate_model("perplexity", "sonar-pro") is True


def test_perplexity_unknown_model_emits_warning(monkeypatch):
    import warnings
    monkeypatch.setenv("PERPLEXITY_API_KEY", "pplx-test-key")
    client = create_llm_client("perplexity", "not-a-real-perplexity-model")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        # get_llm instantiates the ChatOpenAI; intercept after warn_if_unknown_model
        try:
            client.get_llm()
        except Exception:
            pass
    assert any("not-a-real-perplexity-model" in str(w.message) for w in caught)
```

- [ ] **Step 2: Run the tests to confirm they all fail**

```
pytest tests/test_perplexity.py -v
```

Expected: All 8 tests FAIL (ImportError or AssertionError — `"perplexity"` does not yet exist in any of the target files).

---

## Task 2: Add Perplexity to `factory.py`

**Files:**
- Modify: `tradingagents/llm_clients/factory.py:6-12`

- [ ] **Step 1: Add `"perplexity"` to `_OPENAI_COMPATIBLE`**

Replace:
```python
_OPENAI_COMPATIBLE = (
    "openai", "xai", "deepseek",
    "qwen", "qwen-cn",
    "glm", "glm-cn",
    "minimax", "minimax-cn",
    "ollama", "openrouter",
)
```

With:
```python
_OPENAI_COMPATIBLE = (
    "openai", "xai", "deepseek",
    "qwen", "qwen-cn",
    "glm", "glm-cn",
    "minimax", "minimax-cn",
    "ollama", "openrouter",
    "perplexity",
)
```

- [ ] **Step 2: Run targeted test to confirm factory routing passes**

```
pytest tests/test_perplexity.py::test_perplexity_in_openai_compatible_tuple tests/test_perplexity.py::test_factory_returns_openai_client_for_perplexity -v
```

Expected: Both PASS (remaining tests still fail — that's expected at this step).

---

## Task 3: Add Perplexity base URL to `openai_client.py`

**Files:**
- Modify: `tradingagents/llm_clients/openai_client.py:150-161`

- [ ] **Step 1: Add `"perplexity"` entry to `_PROVIDER_BASE_URL`**

Replace:
```python
_PROVIDER_BASE_URL = {
    "xai":        "https://api.x.ai/v1",
    "deepseek":   "https://api.deepseek.com",
    "qwen":       "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "qwen-cn":    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "glm":        "https://api.z.ai/api/paas/v4/",
    "glm-cn":     "https://open.bigmodel.cn/api/paas/v4/",
    "minimax":    "https://api.minimax.io/v1",
    "minimax-cn": "https://api.minimaxi.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama":     "http://localhost:11434/v1",
}
```

With:
```python
_PROVIDER_BASE_URL = {
    "xai":        "https://api.x.ai/v1",
    "deepseek":   "https://api.deepseek.com",
    "perplexity": "https://api.perplexity.ai",
    "qwen":       "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "qwen-cn":    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "glm":        "https://api.z.ai/api/paas/v4/",
    "glm-cn":     "https://open.bigmodel.cn/api/paas/v4/",
    "minimax":    "https://api.minimax.io/v1",
    "minimax-cn": "https://api.minimaxi.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama":     "http://localhost:11434/v1",
}
```

- [ ] **Step 2: Run targeted tests**

```
pytest tests/test_perplexity.py::test_perplexity_base_url tests/test_perplexity.py::test_missing_perplexity_api_key_raises -v
```

Expected: Both PASS. The base URL test passes immediately. The `ValueError` test passes because `get_llm()` now finds the provider in `_PROVIDER_BASE_URL`, looks up the (missing) env var, and raises.

---

## Task 4: Add Perplexity API key env var to `api_key_env.py`

**Files:**
- Modify: `tradingagents/llm_clients/api_key_env.py:17-35`

- [ ] **Step 1: Add `"perplexity"` entry to `PROVIDER_API_KEY_ENV`**

Replace:
```python
PROVIDER_API_KEY_ENV: dict[str, Optional[str]] = {
    "openai":     "OPENAI_API_KEY",
    "anthropic":  "ANTHROPIC_API_KEY",
    "google":     "GOOGLE_API_KEY",
    "azure":      "AZURE_OPENAI_API_KEY",
    "xai":        "XAI_API_KEY",
    "deepseek":   "DEEPSEEK_API_KEY",
    # Dual-region providers each carry their own account; keys are not
    # interchangeable between the international and China endpoints.
    "qwen":       "DASHSCOPE_API_KEY",
    "qwen-cn":    "DASHSCOPE_CN_API_KEY",
    "glm":        "ZHIPU_API_KEY",
    "glm-cn":     "ZHIPU_CN_API_KEY",
    "minimax":    "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    # Local runtimes do not authenticate.
    "ollama":     None,
}
```

With:
```python
PROVIDER_API_KEY_ENV: dict[str, Optional[str]] = {
    "openai":     "OPENAI_API_KEY",
    "anthropic":  "ANTHROPIC_API_KEY",
    "google":     "GOOGLE_API_KEY",
    "azure":      "AZURE_OPENAI_API_KEY",
    "xai":        "XAI_API_KEY",
    "deepseek":   "DEEPSEEK_API_KEY",
    "perplexity": "PERPLEXITY_API_KEY",
    # Dual-region providers each carry their own account; keys are not
    # interchangeable between the international and China endpoints.
    "qwen":       "DASHSCOPE_API_KEY",
    "qwen-cn":    "DASHSCOPE_CN_API_KEY",
    "glm":        "ZHIPU_API_KEY",
    "glm-cn":     "ZHIPU_CN_API_KEY",
    "minimax":    "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    # Local runtimes do not authenticate.
    "ollama":     None,
}
```

- [ ] **Step 2: Run targeted test**

```
pytest tests/test_perplexity.py::test_perplexity_api_key_env -v
```

Expected: PASS.

---

## Task 5: Add Perplexity to `model_catalog.py`

**Files:**
- Modify: `tradingagents/llm_clients/model_catalog.py:76` (inside `MODEL_OPTIONS` dict)

- [ ] **Step 1: Add `"perplexity"` entry to `MODEL_OPTIONS`**

Add the following entry inside `MODEL_OPTIONS` after the `"deepseek"` block and before the `"qwen"` entries:

```python
    "perplexity": {
        "quick": [
            ("Sonar - Fast web-search model, good for quick news summaries", "sonar"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("Sonar Pro - Full research model, recommended for News Analyst", "sonar-pro"),
            ("Sonar - Fast web-search model", "sonar"),
            ("Custom model ID", "custom"),
        ],
    },
```

The full diff context — replace the lines between the `deepseek` block closing `},` and the `# Qwen` comment:

```python
    "deepseek": {
        "quick": [
            ("DeepSeek V4 Flash - Latest V4 fast model", "deepseek-v4-flash"),
            ("DeepSeek V3.2", "deepseek-chat"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("DeepSeek V4 Pro - Latest V4 flagship model", "deepseek-v4-pro"),
            ("DeepSeek V3.2 (thinking)", "deepseek-reasoner"),
            ("DeepSeek V3.2", "deepseek-chat"),
            ("Custom model ID", "custom"),
        ],
    },
    "perplexity": {
        "quick": [
            ("Sonar - Fast web-search model, good for quick news summaries", "sonar"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("Sonar Pro - Full research model, recommended for News Analyst", "sonar-pro"),
            ("Sonar - Fast web-search model", "sonar"),
            ("Custom model ID", "custom"),
        ],
    },
    # Qwen: same model IDs across global (dashscope-intl) and China
```

- [ ] **Step 2: Run catalog and validation tests**

```
pytest tests/test_perplexity.py::test_perplexity_model_catalog_has_quick_and_deep tests/test_perplexity.py::test_perplexity_sonar_and_sonar_pro_pass_model_validation -v
```

Expected: Both PASS.

---

## Task 6: Update existing provider-enumeration test in `test_api_key_env.py`

**Files:**
- Modify: `tests/test_api_key_env.py:17-29` and `tests/test_api_key_env.py:32-51`

- [ ] **Step 1: Add `"perplexity"` to the expected set in `test_every_select_llm_provider_choice_has_an_entry`**

Replace:
```python
    expected = {
        "openai", "google", "anthropic", "xai", "deepseek",
        "qwen", "qwen-cn",
        "glm", "glm-cn",
        "minimax", "minimax-cn",
        "openrouter", "azure", "ollama",
    }
```

With:
```python
    expected = {
        "openai", "google", "anthropic", "xai", "deepseek",
        "perplexity",
        "qwen", "qwen-cn",
        "glm", "glm-cn",
        "minimax", "minimax-cn",
        "openrouter", "azure", "ollama",
    }
```

- [ ] **Step 2: Add `("perplexity", "PERPLEXITY_API_KEY")` to the `test_known_providers_resolve` parametrize list**

Replace:
```python
@pytest.mark.parametrize(
    "provider,env_var",
    [
        ("openai",     "OPENAI_API_KEY"),
        ("anthropic",  "ANTHROPIC_API_KEY"),
        ("google",     "GOOGLE_API_KEY"),
        ("azure",      "AZURE_OPENAI_API_KEY"),
        ("xai",        "XAI_API_KEY"),
        ("deepseek",   "DEEPSEEK_API_KEY"),
        ("qwen",       "DASHSCOPE_API_KEY"),
        ("qwen-cn",    "DASHSCOPE_CN_API_KEY"),
        ("glm",        "ZHIPU_API_KEY"),
        ("glm-cn",     "ZHIPU_CN_API_KEY"),
        ("minimax",    "MINIMAX_API_KEY"),
        ("minimax-cn", "MINIMAX_CN_API_KEY"),
        ("openrouter", "OPENROUTER_API_KEY"),
    ],
)
```

With:
```python
@pytest.mark.parametrize(
    "provider,env_var",
    [
        ("openai",       "OPENAI_API_KEY"),
        ("anthropic",    "ANTHROPIC_API_KEY"),
        ("google",       "GOOGLE_API_KEY"),
        ("azure",        "AZURE_OPENAI_API_KEY"),
        ("xai",          "XAI_API_KEY"),
        ("deepseek",     "DEEPSEEK_API_KEY"),
        ("perplexity",   "PERPLEXITY_API_KEY"),
        ("qwen",         "DASHSCOPE_API_KEY"),
        ("qwen-cn",      "DASHSCOPE_CN_API_KEY"),
        ("glm",          "ZHIPU_API_KEY"),
        ("glm-cn",       "ZHIPU_CN_API_KEY"),
        ("minimax",      "MINIMAX_API_KEY"),
        ("minimax-cn",   "MINIMAX_CN_API_KEY"),
        ("openrouter",   "OPENROUTER_API_KEY"),
    ],
)
```

- [ ] **Step 3: Run the updated api_key_env tests**

```
pytest tests/test_api_key_env.py -v
```

Expected: All tests PASS including the two updated ones.

---

## Task 7: Run the full test suite and commit

**Files:** None (verification + commit only)

- [ ] **Step 1: Run all Perplexity tests**

```
pytest tests/test_perplexity.py -v
```

Expected: All 8 tests PASS.

- [ ] **Step 2: Run the full test suite to catch regressions**

```
pytest -v
```

Expected: All tests PASS. No failures introduced.

- [ ] **Step 3: Commit**

```bash
git add tradingagents/llm_clients/factory.py \
        tradingagents/llm_clients/openai_client.py \
        tradingagents/llm_clients/api_key_env.py \
        tradingagents/llm_clients/model_catalog.py \
        tests/test_perplexity.py \
        tests/test_api_key_env.py
git commit -m "feat(llm): add Perplexity as OpenAI-compatible provider (sonar, sonar-pro)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Add `"perplexity"` to `_OPENAI_COMPATIBLE` | Task 2 |
| Add `"perplexity": "https://api.perplexity.ai"` to `_PROVIDER_BASE_URL` | Task 3 |
| Add `"perplexity": "PERPLEXITY_API_KEY"` to `PROVIDER_API_KEY_ENV` | Task 4 |
| Add `sonar` (quick) and `sonar-pro` (deep) to `MODEL_OPTIONS` | Task 5 |
| `factory.py` needs no changes (spec says so) | Factory dispatch is handled by adding to `_OPENAI_COMPATIBLE` in Task 2 — `factory.py` is the file that defines this tuple |
| Missing `PERPLEXITY_API_KEY` raises `ValueError` | Task 1 test + Task 3 implementation |
| Unknown model name warns (does not hard-fail) | Task 1 `test_perplexity_unknown_model_emits_warning` |
| Provider enumeration tests updated | Task 6 |

### Placeholder scan

No TBDs, TODOs, or "similar to above" references. All code blocks are complete and self-contained.

### Type consistency

- `_OPENAI_COMPATIBLE` is a `tuple[str, ...]` — adding `"perplexity"` matches.
- `_PROVIDER_BASE_URL` is `dict[str, str]` — `"https://api.perplexity.ai"` is a `str`, matches.
- `PROVIDER_API_KEY_ENV` is `dict[str, Optional[str]]` — `"PERPLEXITY_API_KEY"` is a `str`, matches.
- `MODEL_OPTIONS` entries are `Dict[str, List[Tuple[str, str]]]` — the new `"perplexity"` entry follows the exact same structure as `"deepseek"`.
- `get_model_options("perplexity", "quick")` and `get_model_options("perplexity", "deep")` will work because the key is in `MODEL_OPTIONS` — no changes to `get_model_options` needed.
