from __future__ import annotations

import re
import uuid
from typing import Any

from app.schemas import ExperimentRequest, Intervention, Objective, RoadNetwork
from app.simulation.engine import simulate


def parse_objective(text: str, objective: Objective) -> dict[str, float]:
    """Interpret supported natural-language hints; controls remain authoritative."""
    target = objective.target_delay_reduction_pct
    budget = objective.budget
    match = re.search(r"(\d{1,3})\s*%\s*(?:reduction|less|lower|cut)", text, re.I)
    if match:
        target = min(100.0, max(0.0, float(match.group(1))))
    money = re.search(r"(?:budget|under|within|below)\D{0,12}(?:\$|₹|rs\.?\s*)?([\d,]+)", text, re.I)
    if money:
        budget = min(10_000_000.0, float(money.group(1).replace(",", "")))
    return {"target_delay_reduction_pct": target, "budget": budget}


def generate_candidates(network: RoadNetwork) -> list[Intervention]:
    busiest = max(network.roads, key=lambda road: road.demand_vph)
    obstruction_target = max(network.obstructions, key=network.obstructions.get, default=busiest.id)
    turn_target = busiest.id
    pedestrian_target = max(network.roads, key=lambda road: road.pedestrian_flow).id
    return [
        Intervention(
            id="adaptive-signal",
            name="Demand-weighted signal timing",
            description=f"Shift 8 seconds of green allocation toward the busiest {busiest.label} approach.",
            cost=8500,
            kind="signal",
            parameters={"target_approach": busiest.id, "green_bonus_s": 8},
        ),
        Intervention(
            id="clear-roadside",
            name="Clear roadside obstruction",
            description=f"Remove the modeled obstruction from the {obstruction_target} approach.",
            cost=6200,
            kind="obstruction",
            parameters={"target_approach": obstruction_target},
        ),
        Intervention(
            id="turning-capacity",
            name="Temporary turning-lane capacity",
            description=f"Model one additional discharge lane on {turn_target}; no physical design is implied.",
            cost=18000,
            kind="capacity",
            parameters={"target_approach": turn_target},
        ),
        Intervention(
            id="coordinated-package",
            name="Signal plus obstruction package",
            description="Combine a smaller green-time shift with modeled obstruction removal.",
            cost=26700,
            kind="combined",
            parameters={
                "target_approach": busiest.id,
                "green_bonus_s": 5,
                "clear_approach": obstruction_target,
            },
        ),
        Intervention(
            id="school-crossing-phase",
            name="School crossing protection phase",
            description=f"Reduce the south-bound vehicle green allocation and lower its relative exposure proxy at {pedestrian_target}.",
            cost=11200,
            kind="pedestrian",
            parameters={
                "target_approach": pedestrian_target,
                "risk_scale": 0.78,
                "vehicle_green_reduction_s": 3,
            },
        ),
    ]


def _percent_change(before: float, after: float, lower_is_better: bool = True) -> float:
    if before == 0:
        return 0.0
    return round((after - before) / abs(before) * 100, 2) * (-1 if lower_is_better else 1)


def _score(
    baseline: dict[str, float],
    metrics: dict[str, float],
    cost: float,
    weights: dict[str, float],
) -> float:
    improvement = {
        "delay": _percent_change(baseline["average_delay_s"], metrics["average_delay_s"]),
        "queue": _percent_change(baseline["average_queue_vehicles"], metrics["average_queue_vehicles"]),
        "travel_time": _percent_change(baseline["average_trip_time_s"], metrics["average_trip_time_s"]),
        "throughput": _percent_change(
            baseline["throughput_vph"], metrics["throughput_vph"], lower_is_better=False
        ),
        "pedestrian_risk": _percent_change(
            baseline["pedestrian_conflict_proxy"], metrics["pedestrian_conflict_proxy"]
        ),
        "cost": -min(100, cost / 500),
    }
    total_weight = sum(weights.values())
    return round(sum(improvement.get(key, 0) * weight for key, weight in weights.items()) / total_weight, 3)


def run_experiment(request: ExperimentRequest, network: RoadNetwork) -> dict[str, Any]:
    parsed = parse_objective(request.objective.text, request.objective)
    baseline = simulate(network, seed=request.seed, duration_s=request.duration_s).as_dict()
    base_metrics = baseline["metrics"]
    candidates = []
    for intervention in generate_candidates(network):
        result = simulate(
            network,
            seed=request.seed,
            duration_s=request.duration_s,
            intervention={"kind": intervention.kind, **intervention.parameters},
        ).as_dict()
        metrics = result["metrics"]
        delay_reduction = _percent_change(base_metrics["average_delay_s"], metrics["average_delay_s"])
        risk_increase = (
            (metrics["pedestrian_conflict_proxy"] - base_metrics["pedestrian_conflict_proxy"])
            / max(1, base_metrics["pedestrian_conflict_proxy"])
            * 100
        )
        within_budget = intervention.cost <= parsed["budget"]
        safety_ok = risk_increase <= request.objective.max_risk_increase_pct
        target_met = delay_reduction >= parsed["target_delay_reduction_pct"]
        feasible = within_budget and safety_ok and target_met
        reasons = []
        if not within_budget:
            reasons.append("estimated cost exceeds the configured budget")
        if not safety_ok:
            reasons.append("pedestrian-conflict proxy exceeds the hard limit")
        if not target_met:
            reasons.append(
                f"delay reduction {delay_reduction:.1f}% is below the {parsed['target_delay_reduction_pct']:.1f}% target"
            )
        candidates.append(
            {
                "id": intervention.id,
                "name": intervention.name,
                "description": intervention.description,
                "kind": intervention.kind,
                "parameters": intervention.parameters,
                "cost": intervention.cost,
                "metrics": metrics,
                "road_metrics": result["road_metrics"],
                "delay_reduction_pct": round(delay_reduction, 2),
                "risk_change_pct": round(risk_increase, 2),
                "score": _score(base_metrics, metrics, intervention.cost, request.objective.weights),
                "feasible": feasible,
                "constraints": {
                    "within_budget": within_budget,
                    "safety_ok": safety_ok,
                    "delay_target_met": target_met,
                    "reasons": reasons,
                },
                "model": result["model"],
            }
        )
    feasible_candidates = [candidate for candidate in candidates if candidate["feasible"]]
    ranked = sorted(feasible_candidates, key=lambda candidate: candidate["score"], reverse=True)
    selected = ranked[0] if ranked else None
    explanation = (
        f"{selected['name']} ranked highest among {len(feasible_candidates)} feasible simulated plans "
        f"(score {selected['score']}). Delay changed by {selected['delay_reduction_pct']:.1f}%; "
        f"the pedestrian-conflict proxy changed by {selected['risk_change_pct']:.1f}%. "
        "These are synthetic, uncalibrated model outputs."
        if selected
        else "No candidate satisfies every configured hard constraint. Review the closest candidates and relax or revise the objective only if justified."
    )
    experiment_id = str(uuid.uuid4())
    return {
        "experiment_id": experiment_id,
        "network_id": network.id,
        "seed": request.seed,
        "duration_s": request.duration_s,
        "objective": request.objective.model_dump(),
        "parsed_objective": parsed,
        "baseline": baseline,
        "candidates": candidates,
        "ranking": [candidate["id"] for candidate in ranked],
        "recommendation": {
            "candidate_id": selected["id"] if selected else None,
            "explanation": explanation,
            "feasible_count": len(feasible_candidates),
            "closest_alternatives": [
                candidate["id"]
                for candidate in sorted(candidates, key=lambda item: item["score"], reverse=True)[:3]
            ],
            "assumptions": [
                "Synthetic demand and signal timing; not calibrated to field observations.",
                "Pedestrian conflict value is a relative queue-exposure proxy, not accident probability.",
                "Candidate costs are illustrative assumptions.",
            ],
        },
    }
