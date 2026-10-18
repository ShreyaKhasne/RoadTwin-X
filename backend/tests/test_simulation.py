from pathlib import Path

from app.schemas import RoadNetwork
from app.simulation.engine import _active_approach, simulate
from app.simulation.experiments import generate_candidates, run_experiment
from app.schemas import ExperimentRequest, Objective

NETWORK_FILE = Path(__file__).resolve().parents[2] / "data" / "sample_network.json"
NETWORK = RoadNetwork.model_validate_json(NETWORK_FILE.read_text(encoding="utf-8"))


def test_signal_has_one_active_approach_or_clearance():
    states = {_active_approach(NETWORK, second) for second in range(200)}
    assert states == {"north", "south", "east", "west", None}


def test_seeded_traffic_is_repeatable_and_demand_is_served():
    first = simulate(NETWORK, seed=17, duration_s=300).as_dict()
    second = simulate(NETWORK, seed=17, duration_s=300).as_dict()
    assert first == second
    assert first["metrics"]["vehicles_arrived"] > 0
    assert first["metrics"]["vehicles_served"] > 0
    assert first["metrics"]["max_queue_vehicles"] >= first["metrics"]["average_queue_vehicles"]


def test_candidate_plans_have_distinct_parameters():
    candidates = generate_candidates(NETWORK)
    assert len(candidates) >= 5
    assert len({candidate.kind for candidate in candidates}) == 5
    assert candidates[0].parameters != candidates[1].parameters


def test_experiment_enforces_budget_and_safety_constraints():
    objective = Objective(
        text="Reduce delay by at least 30%, within budget",
        budget=9000,
        target_delay_reduction_pct=0,
        max_risk_increase_pct=0,
    )
    result = run_experiment(
        ExperimentRequest(objective=objective, seed=23, duration_s=300), NETWORK
    )
    assert len(result["candidates"]) == 5
    assert all(
        candidate["feasible"] == (
            candidate["constraints"]["within_budget"]
            and candidate["constraints"]["safety_ok"]
            and candidate["constraints"]["delay_target_met"]
        )
        for candidate in result["candidates"]
    )
    assert result["recommendation"]["feasible_count"] == sum(
        candidate["feasible"] for candidate in result["candidates"]
    )


def test_target_can_produce_an_explicitly_infeasible_result():
    objective = Objective(
        text="Reduce delay 99% and stay within the budget",
        budget=1,
        target_delay_reduction_pct=99,
    )
    result = run_experiment(ExperimentRequest(objective=objective, duration_s=120), NETWORK)
    assert result["recommendation"]["candidate_id"] is None
    assert result["recommendation"]["feasible_count"] == 0
