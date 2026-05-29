import pytest
from fastapi.testclient import TestClient


def test_root_serves_index(tmp_path, monkeypatch):
    """GET / must return HTML."""
    (tmp_path / "index.html").write_text("<html>ok</html>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import importlib, sys
    sys.modules.pop("webapp", None)
    import webapp
    client = TestClient(webapp.app)
    r = client.get("/")
    assert r.status_code == 200
    assert "html" in r.headers["content-type"]


def test_api_reports_returns_list(tmp_path, monkeypatch):
    """GET /api/reports must return a JSON list."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import importlib, sys
    sys.modules.pop("webapp", None)
    import webapp
    client = TestClient(webapp.app)
    r = client.get("/api/reports")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_api_presets_crud(tmp_path, monkeypatch):
    """Preset CRUD: create, list, update, delete."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    # Override presets file location to tmp
    monkeypatch.setenv("HOME", str(tmp_path))
    import importlib, sys
    sys.modules.pop("webapp", None)
    import webapp
    # Patch presets file path
    webapp.PRESETS_FILE = tmp_path / "presets.json"
    client = TestClient(webapp.app)

    # Create
    r = client.post("/api/presets", json={"name": "Test", "ticker": "SPY"})
    assert r.status_code == 201
    created = r.json()
    assert created["name"] == "Test"
    pid = created["id"]

    # List
    r = client.get("/api/presets")
    assert any(p["id"] == pid for p in r.json())

    # Update
    r = client.put(f"/api/presets/{pid}", json={"name": "Updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"

    # Delete
    r = client.delete(f"/api/presets/{pid}")
    assert r.status_code == 200
    assert not any(p["id"] == pid for p in client.get("/api/presets").json())


def test_launch_run_conflict(tmp_path, monkeypatch):
    """Second POST /api/runs while one is running returns 409."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import importlib, sys
    sys.modules.pop("webapp", None)
    import webapp
    webapp.PRESETS_FILE = tmp_path / "presets.json"
    # Inject a fake running run
    webapp._runs["fake-run-id"] = {
        "run_id": "fake-run-id",
        "status": "running",
        "selections": {},
        "events": [],
        "report_folder": None,
        "error": None,
        "queue": None,
        "loop": None,
    }
    client = TestClient(webapp.app)
    r = client.post("/api/runs", json={"ticker": "AAPL", "analysts": []})
    assert r.status_code == 409
    # Cleanup
    del webapp._runs["fake-run-id"]


def test_get_api_key_present(tmp_path, monkeypatch):
    """GET /api/env/api-key/anthropic returns present:true when key is set."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.get("/api/env/api-key/anthropic")
    assert r.status_code == 200
    data = r.json()
    assert data["env_var"] == "ANTHROPIC_API_KEY"
    assert data["present"] is True


def test_get_api_key_absent(tmp_path, monkeypatch):
    """GET /api/env/api-key/anthropic returns present:false when key is missing."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.get("/api/env/api-key/anthropic")
    assert r.status_code == 200
    data = r.json()
    assert data["env_var"] == "ANTHROPIC_API_KEY"
    assert data["present"] is False


def test_get_api_key_ollama_no_key_required(tmp_path, monkeypatch):
    """GET /api/env/api-key/ollama returns present:true with env_var:null."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.get("/api/env/api-key/ollama")
    assert r.status_code == 200
    data = r.json()
    assert data["env_var"] is None
    assert data["present"] is True


def test_get_api_key_unknown_provider(tmp_path, monkeypatch):
    """GET /api/env/api-key/<unknown> returns present:true (no key check possible for unknown providers)."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.get("/api/env/api-key/not-a-real-provider")
    assert r.status_code == 200
    data = r.json()
    assert data["env_var"] is None
    assert data["present"] is True


def test_post_api_key_saves_to_env(tmp_path, monkeypatch):
    """POST /api/env/api-key writes key to .env file and sets os.environ."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.post("/api/env/api-key", json={"provider": "openai", "key": "sk-openai-test"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["env_var"] == "OPENAI_API_KEY"
    # Key exported into the live process env
    import os
    assert os.environ.get("OPENAI_API_KEY") == "sk-openai-test"
    # .env file created and contains the key
    env_file = tmp_path / ".env"
    assert env_file.exists()
    content = env_file.read_text(encoding="utf-8")
    assert "OPENAI_API_KEY" in content
    assert "sk-openai-test" in content


def test_post_api_key_rejects_empty_key(tmp_path, monkeypatch):
    """POST /api/env/api-key with an empty key string returns 400."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.post("/api/env/api-key", json={"provider": "openai", "key": ""})
    assert r.status_code == 400


def test_post_api_key_rejects_no_key_provider(tmp_path, monkeypatch):
    """POST /api/env/api-key for a no-key provider (ollama) returns 400."""
    (tmp_path / "index.html").write_text("<html/>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    import sys
    sys.modules.pop("webapp", None)
    import webapp
    from fastapi.testclient import TestClient
    client = TestClient(webapp.app)
    r = client.post("/api/env/api-key", json={"provider": "ollama", "key": "sk-whatever"})
    assert r.status_code == 400
