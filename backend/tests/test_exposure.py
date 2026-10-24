"""Public exposure of docs/schema/metrics (BE-17).

Production nginx currently forwards only /api/, /media/ and /health to the
backend, so /docs, /openapi.json and /metrics were hidden by the proxy rather
than by the app. A future nginx change (or a direct container request) must not
be the only thing standing between the public and the whole API surface.
"""

from __future__ import annotations


def _route_paths(app) -> set[str]:
    return {getattr(route, "path", "") for route in app.routes}


def test_production_disables_docs_and_moves_metrics(monkeypatch):
    from app.main import create_app, settings

    monkeypatch.setattr(settings, "env", "production")
    app = create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None
    paths = _route_paths(app)
    assert "/docs" not in paths
    assert "/openapi.json" not in paths
    assert "/metrics" not in paths
    assert "/internal/metrics" in paths


def test_development_keeps_docs_and_metrics(monkeypatch):
    from app.main import create_app, settings

    monkeypatch.setattr(settings, "env", "development")
    app = create_app()

    assert app.docs_url == "/docs"
    assert app.redoc_url == "/redoc"
    assert app.openapi_url == "/openapi.json"
    paths = _route_paths(app)
    assert "/docs" in paths
    assert "/openapi.json" in paths
    assert "/metrics" in paths
    assert "/internal/metrics" not in paths
