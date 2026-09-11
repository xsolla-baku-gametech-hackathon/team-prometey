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

DIVERGING_RATE_TABLE = {
    # Same as STARTER_TABLE, but legendary_sword's weight is bumped from 10
    # to 14 without updating advertised_rates to match -- true rate becomes
    # ~1.4% against an advertised 1%, planted so /audit's suggested_weight
    # has something real to fix.
    "table_id": "diverging_chest",
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
        {"id": "legendary_sword", "rarity": "legendary", "weight": 14},
    ],
    "pity": None,
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


def test_change_password_updates_login(client: TestClient):
    body = signup(client)
    token = body["access_token"]
    res = client.put(
        "/user/password",
        json={"current_password": "testpass123", "new_password": "newpassword456"},
        headers=auth_headers(token),
    )
    assert res.status_code == 200

    assert client.post("/auth/login", json={"email": "user@example.com", "password": "testpass123"}).status_code == 401
    assert client.post("/auth/login", json={"email": "user@example.com", "password": "newpassword456"}).status_code == 200


def test_change_password_rejects_wrong_current_password(client: TestClient):
    body = signup(client)
    token = body["access_token"]
    res = client.put(
        "/user/password",
        json={"current_password": "wrongpassword", "new_password": "newpassword456"},
        headers=auth_headers(token),
    )
    assert res.status_code == 401


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


# ── Compliance regions ───────────────────────────────────────────────────


def test_demo_audit_requires_no_auth_and_returns_real_results(client: TestClient):
    res = client.post("/demo/audit")
    assert res.status_code == 200
    body = res.json()
    assert body["blocked"] is False
    assert body["compliance"]["overall_status"] in ("red", "yellow", "green")
    # The bundled buggy sample's planted bugs should surface every time.
    flags = {f["item_id"]: f for f in body["compliance"]["item_flags"]}
    assert flags["legendary_sword"]["status"] == "red"


def test_demo_audit_rejects_unknown_region(client: TestClient):
    res = client.post("/demo/audit", json={"region": "atlantis"})
    assert res.status_code == 422


def test_demo_audit_ignores_client_supplied_pull_count(client: TestClient):
    # There's no num_pulls field on the request at all -- confirms the
    # endpoint can't be pushed into an expensive simulation from the client.
    res = client.post("/demo/audit", json={"region": "global", "num_pulls": 999_999_999})
    assert res.status_code == 200
    assert res.json()["simulation"]["num_pulls"] < 1_000_000


def test_regions_endpoint_lists_the_bundled_packs(client: TestClient):
    res = client.get("/regions")
    assert res.status_code == 200
    regions = res.json()
    assert set(regions) == {"global", "belgium", "netherlands", "china", "south_korea"}
    assert regions["belgium"]["min_pp_floor"] < regions["global"]["min_pp_floor"]


def test_audit_rejects_unknown_region(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    res = client.post(f"/tables/{table_id}/audit", json={"region": "atlantis"}, headers=auth_headers(token))
    assert res.status_code == 422


def test_audit_persists_and_returns_the_chosen_region(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    res = client.post(f"/tables/{table_id}/audit", json={"region": "belgium", "seed": 1}, headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["region"] == "belgium"
    assert res.json()["compliance"]["region_id"] == "belgium"

    history = client.get(f"/tables/{table_id}/history", headers=auth_headers(token)).json()
    assert history[0]["region"] == "belgium"


def test_audit_defaults_to_global_region(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "One", "table": STARTER_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    res = client.post(f"/tables/{table_id}/audit", json={"seed": 1}, headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["region"] == "global"


def test_failing_item_includes_a_suggested_weight(client: TestClient):
    token = signup(client)["access_token"]
    table_id = client.post(
        "/tables", json={"name": "Buggy", "table": DIVERGING_RATE_TABLE}, headers=auth_headers(token)
    ).json()["id"]

    res = client.post(f"/tables/{table_id}/audit", json={"num_pulls": 300_000, "seed": 99}, headers=auth_headers(token))
    assert res.status_code == 200
    flags = {f["item_id"]: f for f in res.json()["compliance"]["item_flags"]}
    assert flags["legendary_sword"]["status"] == "red"
    assert flags["legendary_sword"]["suggested_weight"] is not None
    assert flags["rare_sword"]["status"] == "green"
    assert flags["rare_sword"]["suggested_weight"] is None


# ── Admin ────────────────────────────────────────────────────────────────


def test_signup_grants_admin_when_email_is_allowlisted(client: TestClient, monkeypatch):
    import app.auth as auth_module

    monkeypatch.setattr(auth_module, "_ADMIN_EMAILS", {"admin@example.com"})
    body = signup(client, "admin@example.com")
    assert body["user"]["is_admin"] is True

    other = signup(client, "regular@example.com")
    assert other["user"]["is_admin"] is False


def test_login_retroactively_grants_admin_when_added_to_allowlist(client: TestClient, monkeypatch):
    import app.auth as auth_module

    body = signup(client, "future-admin@example.com")
    assert body["user"]["is_admin"] is False

    monkeypatch.setattr(auth_module, "_ADMIN_EMAILS", {"future-admin@example.com"})
    res = client.post("/auth/login", json={"email": "future-admin@example.com", "password": "testpass123"})
    assert res.json()["user"]["is_admin"] is True


def test_admin_routes_reject_non_admin_users(client: TestClient):
    token = signup(client)["access_token"]
    assert client.get("/admin/users", headers=auth_headers(token)).status_code == 403
    assert (
        client.patch("/admin/users/whatever/plan", json={"plan": "studio"}, headers=auth_headers(token)).status_code
        == 403
    )


def test_admin_can_list_users_and_change_plans(client: TestClient, monkeypatch):
    import app.auth as auth_module

    monkeypatch.setattr(auth_module, "_ADMIN_EMAILS", {"admin@example.com"})
    admin_token = signup(client, "admin@example.com")["access_token"]
    regular = signup(client, "regular@example.com")

    listing = client.get("/admin/users", headers=auth_headers(admin_token))
    assert listing.status_code == 200
    emails = {u["email"] for u in listing.json()}
    assert {"admin@example.com", "regular@example.com"} <= emails

    updated = client.patch(
        f"/admin/users/{regular['user']['id']}/plan", json={"plan": "studio"}, headers=auth_headers(admin_token)
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["plan"] == "studio"

    # The change is real, not just echoed back -- the affected user sees it too.
    me = client.get("/user/me", headers=auth_headers(regular["access_token"]))
    assert me.json()["plan"] == "studio"


def test_admin_plan_update_rejects_unknown_plan(client: TestClient, monkeypatch):
    import app.auth as auth_module

    monkeypatch.setattr(auth_module, "_ADMIN_EMAILS", {"admin@example.com"})
    admin_token = signup(client, "admin@example.com")["access_token"]
    regular = signup(client, "regular@example.com")

    res = client.patch(
        f"/admin/users/{regular['user']['id']}/plan", json={"plan": "gold"}, headers=auth_headers(admin_token)
    )
    assert res.status_code == 422
