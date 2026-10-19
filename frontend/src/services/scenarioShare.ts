import type { Experiment, Road, RoadNetwork } from "../types";

export interface SharedScenario {
  version: 1;
  network: RoadNetwork;
  objective: Experiment["objective"];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNumericRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(isFiniteNumber);

function isRoad(value: unknown): value is Road {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.label === "string"
    && isFiniteNumber(value.length_m)
    && isFiniteNumber(value.lanes)
    && isFiniteNumber(value.speed_kmh)
    && isFiniteNumber(value.demand_vph)
    && isFiniteNumber(value.pedestrian_flow)
    && isFiniteNumber(value.risk_factor)
    && (value.condition === "good" || value.condition === "fair" || value.condition === "poor");
}

function isRoadNetwork(value: unknown): value is RoadNetwork {
  if (!isRecord(value) || !isRecord(value.signal)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.city === "string"
    && typeof value.synthetic === "boolean"
    && isFiniteNumber(value.seed)
    && Array.isArray(value.roads)
    && value.roads.length > 0
    && value.roads.every(isRoad)
    && isFiniteNumber(value.signal.cycle_s)
    && isFiniteNumber(value.signal.amber_s)
    && isNumericRecord(value.signal.green_s)
    && isNumericRecord(value.obstructions)
    && typeof value.bus_stop_approach === "string"
    && Array.isArray(value.crossings)
    && value.crossings.every((crossing) => typeof crossing === "string");
}

function isObjective(value: unknown): value is Experiment["objective"] {
  return isRecord(value)
    && typeof value.text === "string"
    && isFiniteNumber(value.budget)
    && isFiniteNumber(value.target_delay_reduction_pct)
    && isFiniteNumber(value.max_risk_increase_pct)
    && isNumericRecord(value.weights);
}

export function createScenarioShareUrl(
  currentUrl: string,
  network: RoadNetwork,
  objective: Experiment["objective"],
): string {
  const url = new URL(currentUrl);
  const payload: SharedScenario = { version: 1, network, objective };
  url.hash = new URLSearchParams({ scenario: JSON.stringify(payload) }).toString();
  return url.toString();
}

export function readSharedScenario(hash: string): SharedScenario | null {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  const encoded = parameters.get("scenario");
  if (encoded === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(encoded);
  } catch {
    throw new Error("This shared scenario link is malformed.");
  }

  if (
    !isRecord(payload)
    || payload.version !== 1
    || !isRoadNetwork(payload.network)
    || !isObjective(payload.objective)
  ) {
    throw new Error("This shared scenario link is invalid or uses an unsupported version.");
  }

  return {
    version: 1,
    network: payload.network,
    objective: payload.objective,
  };
}
