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
