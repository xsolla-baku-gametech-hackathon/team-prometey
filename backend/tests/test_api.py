"""
API-boundary tests for the SaaS layer (see PROJECT.md section 8).

Complements test_auditor.py, which only exercises validator/simulate/
compliance directly. This file drives the actual HTTP surface -- auth,
cross-user ownership isolation, and plan-gated limits -- since those are
exactly the things a unit test on the core logic can't catch.

Each test gets its own in-memory SQLite database (StaticPool keeps the
single in-memory connection alive across the TestClient's requests) so
tests can't leak state into each other or into the real dev database.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_session
from app.main import app

STARTER_TABLE = {
    "table_id": "starter_chest",
    "advertised_rates": {
        "legendary_sword": 0.01,
        "epic_sword": 0.05,
        "rare_sword": 0.25,
        "common_sword": 0.69,
    },
    "items": [
        {"id": "common_sword", "rarity": "common", "weight": 690},
        {"id": "rare_sword", "rarity": "rare", "weight": 250},
        {"id": "epic_sword", "rarity": "epic", "weight": 50},
        {"id": "legendary_sword", "rarity": "legendary", "weight": 10},
    ],
    "pity": {"target_rarity": "legendary", "guaranteed_within_pulls": 90, "reset_on_trigger": True},
}

BROKEN_TABLE = {
    # Duplicate id -- a blocking validation error, so /audit should refuse
    # to run the simulation and report why instead.
    "table_id": "broken_chest",
    "advertised_rates": {"a": 0.5, "b": 0.5},
    "items": [
        {"id": "a", "rarity": "common", "weight": 1},
        {"id": "a", "rarity": "common", "weight": 1},
    ],
    "pity": None,
}


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_session():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def signup(client: TestClient, email: str = "user@example.com", password: str = "testpass123") -> dict:
    res = client.post("/auth/signup", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Auth ─────────────────────────────────────────────────────────────────


def test_signup_and_login_round_trip(client: TestClient):
    body = signup(client)
    assert body["user"]["email"] == "user@example.com"
    assert body["user"]["plan"] == "free"
    assert body["access_token"]

    res = client.post("/auth/login", json={"email": "user@example.com", "password": "testpass123"})
    assert res.status_code == 200
    assert res.json()["user"]["id"] == body["user"]["id"]


def test_signup_rejects_duplicate_email(client: TestClient):
    signup(client)
    res = client.post("/auth/signup", json={"email": "user@example.com", "password": "anotherpassword"})
    assert res.status_code == 400


def test_login_rejects_wrong_password(client: TestClient):
    signup(client)
    res = client.post("/auth/login", json={"email": "user@example.com", "password": "wrongpassword"})
    assert res.status_code == 401


def test_login_rejects_unknown_email(client: TestClient):
    res = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    assert res.status_code == 401


def test_protected_route_requires_bearer_token(client: TestClient):
    assert client.get("/tables").status_code in (401, 403)


def test_protected_route_rejects_garbage_token(client: TestClient):
    res = client.get("/tables", headers=auth_headers("not-a-real-jwt"))
    assert res.status_code == 401


# ── Table CRUD + ownership isolation ────────────────────────────────────


def test_create_and_fetch_table(client: TestClient):
    token = signup(client)["access_token"]
    res = client.post("/tables", json={"name": "My Chest", "table": STARTER_TABLE}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    table_id = res.json()["id"]

    fetched = client.get(f"/tables/{table_id}", headers=auth_headers(token))
    assert fetched.status_code == 200
    assert fetched.json()["table"]["table_id"] == "starter_chest"


def test_update_table_persists_changes(client: TestClient):
    token = signup(client)["access_token"]
    created = client.post(
        "/tables", json={"name": "My Chest", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()

    renamed_table = {**STARTER_TABLE, "table_id": "starter_chest_v2"}
    res = client.put(
        f"/tables/{created['id']}",
        json={"name": "Renamed Chest", "table": renamed_table},
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Renamed Chest"
    assert res.json()["table"]["table_id"] == "starter_chest_v2"


def test_user_cannot_access_another_users_table(client: TestClient):
    token_a = signup(client, "alice@example.com")["access_token"]
    token_b = signup(client, "bob@example.com")["access_token"]

    table_id = client.post(
        "/tables", json={"name": "Alice's Chest", "table": STARTER_TABLE}, headers=auth_headers(token_a)
    ).json()["id"]

    assert client.get(f"/tables/{table_id}", headers=auth_headers(token_b)).status_code == 404
    assert client.put(
        f"/tables/{table_id}", json={"name": "Hijacked", "table": STARTER_TABLE}, headers=auth_headers(token_b)
    ).status_code == 404
    assert client.delete(f"/tables/{table_id}", headers=auth_headers(token_b)).status_code == 404
    assert client.post(f"/tables/{table_id}/audit", headers=auth_headers(token_b)).status_code == 404

    # And Alice's table is untouched by Bob's attempts.
    assert client.get(f"/tables/{table_id}", headers=auth_headers(token_a)).status_code == 200


def test_delete_table_removes_it(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "My Chest", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    assert client.delete(f"/tables/{table_id}", headers=auth_headers(token)).status_code == 200
    assert client.get(f"/tables/{table_id}", headers=auth_headers(token)).status_code == 404


# ── Plan gating ──────────────────────────────────────────────────────────


def test_free_plan_blocks_second_saved_table(client: TestClient):
    token = signup(client)["access_token"]
    first = client.post("/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token))
    assert first.status_code == 200

    second = client.post("/tables", json={"name": "Two", "table": STARTER_TABLE}, headers=auth_headers(token))
    assert second.status_code == 403


def test_audit_num_pulls_capped_to_plan_limit(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    # Free plan caps at 100k pulls -- requesting far more should be silently
    # capped, not honored or rejected.
    res = client.post(f"/tables/{table_id}/audit", json={"num_pulls": 10_000_000}, headers=auth_headers(token))
    assert res.status_code == 200, res.text
    assert res.json()["simulation"]["num_pulls"] == 100_000


def test_free_plan_history_keeps_only_latest_run(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    client.post(f"/tables/{table_id}/audit", json={"num_pulls": 1000, "seed": 1}, headers=auth_headers(token))
    client.post(f"/tables/{table_id}/audit", json={"num_pulls": 1000, "seed": 2}, headers=auth_headers(token))

    history = client.get(f"/tables/{table_id}/history", headers=auth_headers(token))
    assert history.status_code == 200
    assert len(history.json()) == 1


# ── Audit behavior over HTTP ─────────────────────────────────────────────


def test_audit_on_blocking_table_skips_simulation(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "Broken", "table": BROKEN_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    res = client.post(f"/tables/{table_id}/audit", headers=auth_headers(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["blocked"] is True
    assert body["simulation"] is None
    assert body["compliance"] is None
    assert any(issue["code"] == "duplicate_item_id" for issue in body["validation_issues"])


def test_export_is_gated_off_the_free_plan(client: TestClient):
    res = client.get("/plans")
    assert res.status_code == 200
    plans = res.json()
    assert plans["free"]["export"] is False
    assert plans["studio"]["export"] is True
    assert plans["enterprise"]["export"] is True
