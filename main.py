from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.db import SessionLocal, StoredDocument, initialize_database, list_documents
from app.schemas import ExperimentRequest, ReportRequest, RoadNetwork, ScenarioRecord
from app.simulation.experiments import run_experiment

SAMPLE_NETWORK_PATH = Path(__file__).resolve().parents[2] / "data" / "sample_network.json"
with SAMPLE_NETWORK_PATH.open(encoding="utf-8") as sample_file:
    DEFAULT_NETWORK = RoadNetwork.model_validate_json(sample_file.read())

app = FastAPI(title="RoadTwin X API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
current_network = DEFAULT_NETWORK


@app.on_event("startup")
def startup() -> None:
    global current_network
    initialize_database()
    with SessionLocal() as session:
        stored_network = session.get(StoredDocument, "active-network")
        if stored_network and stored_network.kind == "network":
            current_network = RoadNetwork.model_validate_json(stored_network.payload)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def persist(session: Session, kind: str, payload: dict, record_id: str | None = None) -> StoredDocument:
    record = StoredDocument(
        id=record_id or str(uuid.uuid4()),
        kind=kind,
        created_at=datetime.now(timezone.utc),
        payload=json.dumps(payload, separators=(",", ":"), allow_nan=False),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def serialize_document(record: StoredDocument) -> dict:
    return {
        "id": record.id,
        "kind": record.kind,
        "created_at": record.created_at.isoformat(),
        "payload": json.loads(record.payload),
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "product": "RoadTwin X", "engine": "local deterministic"}


@app.get("/api/network", response_model=RoadNetwork)
def get_network() -> RoadNetwork:
    return current_network


@app.put("/api/network", response_model=RoadNetwork)
def update_network(network: RoadNetwork, session: Session = Depends(get_session)) -> RoadNetwork:
    global current_network
    current_network = network
    stored = session.get(StoredDocument, "active-network")
    payload = json.dumps(network.model_dump(), separators=(",", ":"), allow_nan=False)
    if stored:
        stored.payload = payload
        stored.created_at = datetime.now(timezone.utc)
    else:
        session.add(
            StoredDocument(
                id="active-network",
                kind="network",
                created_at=datetime.now(timezone.utc),
                payload=payload,
            )
        )
    session.commit()
    return current_network


@app.get("/api/scenarios", response_model=list[ScenarioRecord])
def get_scenarios(session: Session = Depends(get_session)) -> list[dict]:
    return [serialize_document(record) for record in list_documents(session, "scenario")]


@app.get("/api/scenarios/{scenario_id}", response_model=ScenarioRecord)
def get_scenario(scenario_id: str, session: Session = Depends(get_session)) -> dict:
    record = session.get(StoredDocument, scenario_id)
    if not record or record.kind != "scenario":
        raise HTTPException(status_code=404, detail="Scenario not found")
    return serialize_document(record)


@app.post("/api/experiments")
def create_experiment(
    request: ExperimentRequest,
    session: Session = Depends(get_session),
) -> dict:
    network = request.network or current_network
    try:
        result = run_experiment(request, network)
        persist(session, "scenario", result, result["experiment_id"])
        return result
    except (ArithmeticError, ValueError) as error:
        session.rollback()
        raise HTTPException(status_code=422, detail=f"Experiment could not be evaluated: {error}") from error


@app.post("/api/reports")
def create_report(request: ReportRequest, session: Session = Depends(get_session)) -> dict:
    if "baseline" not in request.result or "candidates" not in request.result:
        raise HTTPException(status_code=422, detail="Report requires saved baseline and candidate simulation results")
    payload = {
        "title": request.title,
        "experiment_id": request.experiment_id,
        "result": request.result,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": "RoadTwin X synthetic demonstration model",
    }
    record = persist(session, "report", payload)
    return serialize_document(record)


@app.get("/api/reports")
def get_reports(session: Session = Depends(get_session)) -> list[dict]:
    return [serialize_document(record) for record in list_documents(session, "report")]


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, session: Session = Depends(get_session)) -> dict:
    record = session.get(StoredDocument, report_id)
    if not record or record.kind != "report":
        raise HTTPException(status_code=404, detail="Report not found")
    return serialize_document(record)
