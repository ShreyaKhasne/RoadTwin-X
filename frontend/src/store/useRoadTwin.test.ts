import { afterEach, describe, expect, it } from "vitest";
import { useRoadTwin } from "./useRoadTwin";

afterEach(() => {
  useRoadTwin.setState({ simulationTime: 0, speed: 1, playing: true });
});

describe("simulation playback state", () => {
  it("applies the selected speed multiplier to the simulation clock", () => {
    useRoadTwin.setState({ simulationTime: 12, speed: 2 });
    useRoadTwin.getState().advance(0.5);
    expect(useRoadTwin.getState().simulationTime).toBe(13);
  });

  it("advances by the requested step at normal speed", () => {
    useRoadTwin.setState({ simulationTime: 4, speed: 1 });
    useRoadTwin.getState().advance(1);
    expect(useRoadTwin.getState().simulationTime).toBe(5);
  });
});
