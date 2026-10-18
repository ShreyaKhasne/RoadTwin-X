from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class Road(BaseModel):
    id: str
    label: str
    length_m: float = Field(gt=0)
    lanes: int = Field(ge=1, le=5)
    speed_kmh: float = Field(gt=0, le=100)
    demand_vph: float = Field(ge=0, le=5000)
    pedestrian_flow: float = Field(ge=0, le=5000)
    risk_factor: float = Field(ge=0, le=10)
    condition: Literal["good", "fair", "poor"] = "good"


class Signal(BaseModel):
    cycle_s: int = Field(ge=30, le=240)
    green_s: dict[str, int]
    amber_s: int = Field(ge=1, le=10)


class RoadNetwork(BaseModel):
    id: str
    name: str
    city: str
    synthetic: bool = True
    seed: int = 42
    roads: list[Road] = Field(min_length=4)
    signal: Signal
    obstructions: dict[str, float] = Field(default_factory=dict)
    bus_stop_approach: str = "west"
    crossings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_approaches(self) -> "RoadNetwork":
        road_ids = {road.id for road in self.roads}
        if len(road_ids) != len(self.roads):
            raise ValueError("Road identifiers must be unique")
        if not set(self.signal.green_s).issubset(road_ids):
            raise ValueError("Signal timing references an unknown road")
        if not set(self.obstructions).issubset(road_ids):
            raise ValueError("Obstruction references an unknown road")
        if any(not 0 <= factor < 1 for factor in self.obstructions.values()):
            raise ValueError("Obstruction factors must be in [0, 1)")
        return self


class Objective(BaseModel):
    text: str = Field(min_length=8, max_length=1000)
    budget: float = Field(default=50000, ge=0, le=10_000_000)
    max_risk_increase_pct: float = Field(default=0, ge=0, le=100)
    target_delay_reduction_pct: float = Field(default=30, ge=0, le=100)
    weights: dict[str, float] = Field(
        default_factory=lambda: {
            "delay": 0.35,
            "queue": 0.15,
            "travel_time": 0.15,
            "throughput": 0.15,
            "pedestrian_risk": 0.15,
            "cost": 0.05,
        }
    )

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or any(weight < 0 for weight in value.values()):
            raise ValueError("Objective weights must be non-empty and non-negative")
        if sum(value.values()) <= 0:
            raise ValueError("At least one objective weight must be positive")
        return value


class ExperimentRequest(BaseModel):
    network: RoadNetwork | None = None
    objective: Objective
    seed: int = Field(default=42, ge=0, le=2_147_483_647)
    duration_s: int = Field(default=900, ge=60, le=3600)


class Intervention(BaseModel):
    id: str
    name: str
    description: str
    cost: float = Field(ge=0)
    kind: Literal["signal", "obstruction", "capacity", "combined", "pedestrian"]
    parameters: dict[str, Any] = Field(default_factory=dict)


class ReportRequest(BaseModel):
    experiment_id: str
    title: str = Field(default="School Gate Junction experiment", max_length=160)
    result: dict[str, Any]


class ScenarioRecord(BaseModel):
    id: str
    kind: str
    created_at: str
    payload: dict[str, Any]
