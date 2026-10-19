import { describe, expect, it } from "vitest";
import { createScenarioShareUrl, readSharedScenario } from "./scenarioShare";
import type { Experiment, RoadNetwork } from "../types";

const network: RoadNetwork = {
  id: "sample",
  name: "Sample Junction",
  city: "Demo City",
  synthetic: true,
  seed: 42,
  roads: [{
    id: "east",
    label: "East Road",
    length_m: 200,
    lanes: 2,
    speed_kmh: 40,
    demand_vph: 500,
    pedestrian_flow: 100,
    risk_factor: 1,
    condition: "good",
  }],
  signal: { cycle_s: 90, green_s: { east: 30 }, amber_s: 3 },
  obstructions: { east: 0 },
  bus_stop_approach: "east",
  crossings: ["east"],
};

const objective: Experiment["objective"] = {
  text: "Reduce delay",
  budget: 30000,
  target_delay_reduction_pct: 30,
  max_risk_increase_pct: 0,
  weights: { delay: 0.5, cost: 0.5 },
};

describe("scenario sharing", () => {
  it("round-trips the network and objective through a share URL", () => {
    const url = createScenarioShareUrl("https://example.test/app?mode=demo", network, objective);
    const shared = readSharedScenario(new URL(url).hash);

    expect(new URL(url).origin).toBe("https://example.test");
    expect(new URL(url).searchParams.get("mode")).toBe("demo");
    expect(shared).toEqual({ version: 1, network, objective });
  });

  it("returns null when a URL does not contain a shared scenario", () => {
    expect(readSharedScenario("")).toBeNull();
  });

  it("rejects malformed or unsupported scenario links", () => {
    expect(() => readSharedScenario("#scenario=%7Bbad")).toThrow("malformed");
    const unsupported = encodeURIComponent(JSON.stringify({ version: 2 }));
    expect(() => readSharedScenario(`#scenario=${unsupported}`)).toThrow("unsupported version");
  });
});
