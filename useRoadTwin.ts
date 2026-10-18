import { create } from "zustand";
import type { Candidate, Experiment, RoadNetwork } from "../types";

type Tab = "workbench" | "experiments" | "analytics" | "reports" | "data";
type View = "iso" | "top" | "street";

interface RoadTwinState {
  network: RoadNetwork | null;
  selectedRoad: string;
  playing: boolean;
  simulationTime: number;
  speed: number;
  view: View;
  tab: Tab;
  experiment: Experiment | null;
  reports: Array<{ id: string; created_at: string; payload: Record<string, unknown> }>;
  scenarios: Array<{ id: string; created_at: string }>;
  selectedCandidate: string | null;
  busy: boolean;
  error: string | null;
  setNetwork: (network: RoadNetwork) => void;
  selectRoad: (id: string) => void;
  setPlaying: (value: boolean) => void;
  advance: (seconds: number) => void;
  setSpeed: (value: number) => void;
  setView: (view: View) => void;
  setTab: (tab: Tab) => void;
  setExperiment: (experiment: Experiment | null) => void;
  setReports: (reports: RoadTwinState["reports"]) => void;
  setScenarios: (scenarios: RoadTwinState["scenarios"]) => void;
  setSelectedCandidate: (id: string | null) => void;
  setBusy: (value: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRoadTwin = create<RoadTwinState>((set) => ({
  network: null,
  selectedRoad: "east",
  playing: true,
  simulationTime: 0,
  speed: 1,
  view: "iso",
  tab: "workbench",
  experiment: null,
  reports: [],
  scenarios: [],
  selectedCandidate: null,
  busy: false,
  error: null,
  setNetwork: (network) => set({ network }),
  selectRoad: (selectedRoad) => set({ selectedRoad }),
  setPlaying: (playing) => set({ playing }),
  advance: (seconds) => set((state) => ({ simulationTime: state.simulationTime + seconds * state.speed })),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setExperiment: (experiment) => set({ experiment, selectedCandidate: experiment?.recommendation.candidate_id ?? null }),
  setReports: (reports) => set({ reports }),
  setScenarios: (scenarios) => set({ scenarios }),
  setSelectedCandidate: (selectedCandidate) => set({ selectedCandidate }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));

export const selectedPlan = (candidates: Candidate[], id: string | null) =>
  candidates.find((candidate) => candidate.id === id) ?? null;
