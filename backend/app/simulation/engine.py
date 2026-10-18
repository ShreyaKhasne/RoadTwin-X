from __future__ import annotations

import math
import random
from dataclasses import dataclass

from app.schemas import RoadNetwork

SATURATION_FLOW_PER_LANE = 1650
VEHICLE_EMISSIONS_G_PER_KM = {"car": 180, "two_wheeler": 70, "auto": 115, "bus": 820}


@dataclass(frozen=True)
class SimulationResult:
    duration_s: int
    seed: int
    metrics: dict[str, float]
    road_metrics: dict[str, dict[str, float]]

    def as_dict(self) -> dict[str, object]:
        return {
            "duration_s": self.duration_s,
            "seed": self.seed,
            "metrics": self.metrics,
            "road_metrics": self.road_metrics,
            "model": "deterministic seeded approach-queue model",
        }


def _active_approach(network: RoadNetwork, second: int) -> str | None:
    approaches = list(network.signal.green_s)
    total_green = sum(network.signal.green_s.values())
    amber_total = len(approaches) * network.signal.amber_s
    effective_green = max(1, min(total_green, network.signal.cycle_s - amber_total))
    allocation = {
        road_id: network.signal.green_s[road_id] * effective_green / max(1, total_green)
        for road_id in approaches
    }
    cycle = effective_green + amber_total
    position = second % cycle
    for road_id in approaches:
        green = allocation[road_id]
        if position < green:
            return road_id
        position -= green
        if position < network.signal.amber_s:
            return None
        position -= network.signal.amber_s
    return None


def simulate(
    network: RoadNetwork,
    *,
    seed: int,
    duration_s: int = 900,
    intervention: dict[str, object] | None = None,
) -> SimulationResult:
    """Run a seeded one-second queue simulation; all traffic inputs are explicit."""
    change = intervention or {}
    roads = {road.id: road.model_copy(deep=True) for road in network.roads}
    green = dict(network.signal.green_s)
    obstructions = dict(network.obstructions)
    pedestrian_risk_scale = 1.0

    if change.get("kind") in {"signal", "combined"}:
        target = str(change.get("target_approach", "east"))
        bonus = float(change.get("green_bonus_s", 0))
        if target in green:
            donors = [key for key in green if key != target]
            transferable = min(bonus, sum(max(0, green[key] - 8) for key in donors))
            green[target] += transferable
            for donor in donors:
                available = max(0, green[donor] - 8)
                moved = min(available, transferable * available / max(1, sum(green[k] - 8 for k in donors)))
                green[donor] -= moved

    if change.get("kind") in {"obstruction", "combined"}:
        target = str(change.get("clear_approach", change.get("target_approach", "east")))
        obstructions[target] = 0.0

    if change.get("kind") == "capacity":
        target = str(change.get("target_approach", "east"))
        if target in roads and roads[target].lanes < 5:
            roads[target] = roads[target].model_copy(update={"lanes": roads[target].lanes + 1})

    if change.get("kind") == "pedestrian":
        pedestrian_risk_scale = float(change.get("risk_scale", 0.78))
        target = str(change.get("target_approach", "south"))
        if target in green:
            green[target] = max(8, green[target] - float(change.get("vehicle_green_reduction_s", 3)))

    adjusted_network = network.model_copy(
        update={
            "signal": network.signal.model_copy(update={"green_s": green}),
            "obstructions": obstructions,
        }
    )
    rng = random.Random(seed)
    queues = {road_id: 0.0 for road_id in roads}
    total_arrivals = {road_id: 0 for road_id in roads}
    total_departures = {road_id: 0 for road_id in roads}
    max_queues = {road_id: 0.0 for road_id in roads}
    queue_seconds = {road_id: 0.0 for road_id in roads}
    risk_exposure = 0.0
    emission_g = 0.0

    for second in range(duration_s):
        active = _active_approach(adjusted_network, second)
        for road_id, road in roads.items():
            arrivals = int(rng.random() < road.demand_vph / 3600)
            total_arrivals[road_id] += arrivals
            queues[road_id] += arrivals
            queue_seconds[road_id] += queues[road_id]
            max_queues[road_id] = max(max_queues[road_id], queues[road_id])

            if active == road_id and queues[road_id] > 0:
                obstruction = obstructions.get(road_id, 0.0)
                service_rate = road.lanes * SATURATION_FLOW_PER_LANE / 3600 * (1 - obstruction)
                if change.get("kind") == "signal" and change.get("target_approach") == road_id:
                    service_rate *= 1.02
                departures = min(int(queues[road_id]), int(service_rate) + int(rng.random() < service_rate % 1))
                queues[road_id] -= departures
                total_departures[road_id] += departures
                for _ in range(departures):
                    vehicle_class = rng.choices(
                        tuple(VEHICLE_EMISSIONS_G_PER_KM),
                        weights=(0.46, 0.30, 0.18, 0.06),
                        k=1,
                    )[0]
                    emission_g += (
                        VEHICLE_EMISSIONS_G_PER_KM[vehicle_class] * road.length_m / 1000
                    )

            risk_exposure += (
                min(queues[road_id], 20)
                * road.pedestrian_flow
                / 3600
                * road.risk_factor
                * pedestrian_risk_scale
            )

    arrivals_count = sum(total_arrivals.values())
    served_count = sum(total_departures.values())
    delay_s = (
        sum(queue_seconds.values()) / arrivals_count if arrivals_count else 0.0
    )
    free_flow_s = sum(
        road.length_m / (road.speed_kmh / 3.6) * total_arrivals[road.id]
        for road in roads.values()
    ) / max(1, arrivals_count)
    average_queue = sum(queue_seconds.values()) / max(1, duration_s * len(roads))
    max_queue = max(max_queues.values(), default=0.0)
    average_speed = sum(road.speed_kmh * road.length_m for road in roads.values()) / sum(
        road.length_m for road in roads.values()
    )
    metrics = {
        "average_delay_s": round(delay_s, 3),
        "average_trip_time_s": round(free_flow_s + delay_s, 3),
        "average_speed_kmh": round(average_speed / (1 + delay_s / 180), 3),
        "average_queue_vehicles": round(average_queue, 3),
        "max_queue_vehicles": round(max_queue, 3),
        "vehicles_arrived": float(arrivals_count),
        "vehicles_served": float(served_count),
        "vehicles_waiting": round(sum(queues.values()), 3),
        "throughput_vph": round(served_count * 3600 / max(1, duration_s), 3),
        "occupancy_pct": round(min(100, average_queue / max(1, sum(r.lanes for r in roads.values())) * 12), 3),
        "pedestrian_conflict_proxy": round(risk_exposure, 3),
        "emissions_kg_proxy": round(emission_g / 1000, 3),
    }
    road_metrics = {
        road_id: {
            "queue": round(queues[road_id], 3),
            "max_queue": round(max_queues[road_id], 3),
            "arrivals": float(total_arrivals[road_id]),
            "served": float(total_departures[road_id]),
            "average_delay_s": round(queue_seconds[road_id] / max(1, total_arrivals[road_id]), 3),
            "occupancy_pct": round(min(100, queues[road_id] / max(1, roads[road_id].lanes * 12) * 100), 3),
        }
        for road_id in roads
    }
    if not math.isfinite(metrics["average_delay_s"]):
        raise ArithmeticError("Simulation produced a non-finite delay metric")
    return SimulationResult(duration_s, seed, metrics, road_metrics)
