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
    # Class identity check by name — test_ollama_base_url.py reloads
    # openai_client, which can detach the top-level OpenAIClient import.
    assert type(client).__name__ == "OpenAIClient"
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
        try:
            client.get_llm()
        except Exception:
            pass
    assert any("not-a-real-perplexity-model" in str(w.message) for w in caught)
