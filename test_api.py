def test_health_and_network(client):
    assert client.get("/api/health").json()["status"] == "ok"
    network = client.get("/api/network")
    assert network.status_code == 200
    assert network.json()["name"] == "School Gate Junction"


def test_full_experiment_persistence_and_report_flow(client):
    payload = {
        "objective": {
            "text": "Reduce average vehicle delay by at least 30%, keep pedestrian risk stable, under budget",
            "budget": 30000,
            "target_delay_reduction_pct": 0,
            "max_risk_increase_pct": 0,
        },
        "seed": 42,
        "duration_s": 240,
    }
    result = client.post("/api/experiments", json=payload)
    assert result.status_code == 200
    experiment = result.json()
    assert len(experiment["candidates"]) == 5

    saved = client.get(f"/api/scenarios/{experiment['experiment_id']}")
    assert saved.status_code == 200
    assert saved.json()["payload"]["seed"] == 42

    report = client.post(
        "/api/reports",
        json={
            "experiment_id": experiment["experiment_id"],
            "title": "Acceptance test",
            "result": experiment,
        },
    )
    assert report.status_code == 200
    report_id = report.json()["id"]
    assert client.get(f"/api/reports/{report_id}").json()["payload"]["result"]["baseline"]
    assert any(row["id"] == report_id for row in client.get("/api/reports").json())


def test_invalid_network_and_incomplete_report_are_rejected(client):
    bad_network = client.put("/api/network", json={"id": "broken", "roads": []})
    assert bad_network.status_code == 422
    bad_report = client.post(
        "/api/reports", json={"experiment_id": "missing", "result": {"metrics": {}}}
    )
    assert bad_report.status_code == 422
