import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.db.database import init_db
from app.main import app


@pytest.fixture(autouse=True)
def postgres_test_database(monkeypatch):
    database_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to run PostgreSQL integration tests")

    monkeypatch.setattr(config.settings, "database_url", database_url)
    init_db()
    with psycopg.connect(database_url) as connection:
        connection.execute(
            "TRUNCATE TABLE checklist_items, segments, audits CASCADE"
        )


def test_create_and_read_audit():
    with TestClient(app) as client:
        response = client.post(
            "/audits",
            json={
                "center_lat": 12.9716,
                "center_lng": 77.5946,
                "radius_m": 1000,
                "road_class": "collector",
            },
        )
        assert response.status_code == 201
        summary = response.json()
        assert summary["status"] == "completed"
        assert summary["segment_count"] == 2
        assert summary["checklist_count"] == 5

        detail = client.get(f"/audits/{summary['id']}")
        assert detail.status_code == 200
        assert len(detail.json()["segments"]) == 2


def test_missing_audit_returns_404():
    with TestClient(app) as client:
        response = client.get("/audits/does-not-exist")
        assert response.status_code == 404


def test_list_audits_returns_summary():
    with TestClient(app) as client:
        first = client.post(
            "/audits",
            json={
                "center_lat": 12.9716,
                "center_lng": 77.5946,
                "radius_m": 1000,
                "road_class": "collector",
            },
        )
        second = client.post(
            "/audits",
            json={
                "center_lat": 12.9726,
                "center_lng": 77.5956,
                "radius_m": 1500,
                "road_class": "arterial",
            },
        )

        assert first.status_code == 201
        assert second.status_code == 201

        response = client.get("/audits")
        assert response.status_code == 200
        audits = response.json()
        assert len(audits) == 2
        assert audits[0]["segment_count"] in {2, 3}
        assert audits[0]["checklist_count"] == 5


def test_database_init_runs_when_saving_directly():

    from app.db.database import get_audit, save_audit

    audit = {
        "id": "audit-1",
        "center_lat": 12.9716,
        "center_lng": 77.5946,
        "radius_m": 1000,
        "road_class": "collector",
        "status": "completed",
        "compliance_score": 82.4,
        "created_at": "2026-09-16T00:00:00+00:00",
        "segments": [{"id": "seg-1", "name": "Stretch 1", "risk_score": 80}],
        "checklist": [{"section": "A", "item": "B", "status": "screened", "evidence": "demo"}],
    }

    save_audit(audit)

    assert get_audit("audit-1")["id"] == "audit-1"
