"""OpenAPI operation ids must be unique (BE-20).

``shadowing.py`` stacked three route decorators on one function, so FastAPI
emitted duplicate operation ids and warned about it. This test walks the real
app schema instead of trusting the warning.
"""

from __future__ import annotations


def test_all_openapi_operation_ids_are_unique():
    from app.main import create_app

    schema = create_app().openapi()
    operation_ids = [
        operation["operationId"]
        for path_item in schema["paths"].values()
        for operation in path_item.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    assert operation_ids, "OpenAPI must expose operations"
    duplicates = {op for op in operation_ids if operation_ids.count(op) > 1}
    assert duplicates == set()


def test_retired_shadowing_routes_have_distinct_ids():
    from app.main import create_app

    schema = create_app().openapi()["paths"]
    shadowing_ids = [
        operation["operationId"]
        for path, path_item in schema.items()
        if path.startswith("/api/v1/shadowing") or path.endswith("/shadowing-sentences")
        for operation in path_item.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    # 5 shadowing compatibility routes + the videos shadowing-sentences stub.
    assert len(shadowing_ids) == 6
    assert len(set(shadowing_ids)) == 6
