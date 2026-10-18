export interface Road {
  id: string;
  label: string;
  length_m: number;
  lanes: number;
  speed_kmh: number;
  demand_vph: number;
  pedestrian_flow: number;
  risk_factor: number;
  condition: "good" | "fair" | "poor";
}

export interface RoadNetwork {
  id: string;
  name: string;
  city: string;
  synthetic: boolean;
  seed: number;
  roads: Road[];
  signal: { cycle_s: number; green_s: Record<string, number>; amber_s: number };
  obstructions: Record<string, number>;
  bus_stop_approach: string;
  crossings: string[];
}

export interface Metrics {
  average_delay_s: number;
  average_trip_time_s: number;
  average_speed_kmh: number;
  average_queue_vehicles: number;
  max_queue_vehicles: number;
  vehicles_arrived: number;
  vehicles_served: number;
  vehicles_waiting: number;
  throughput_vph: number;
  occupancy_pct: number;
  pedestrian_conflict_proxy: number;
  emissions_kg_proxy: number;
}

export interface Candidate {
  id: string;
  name: string;
  description: string;
  kind: string;
  parameters: Record<string, string | number>;
  cost: number;
  metrics: Metrics;
  road_metrics: Record<string, { queue: number; max_queue: number; arrivals: number; served: number; average_delay_s: number; occupancy_pct: number }>;
  delay_reduction_pct: number;
  risk_change_pct: number;
  score: number;
  feasible: boolean;
  constraints: { within_budget: boolean; safety_ok: boolean; delay_target_met: boolean; reasons: string[] };
}

export interface Experiment {
  experiment_id: string;
  network_id: string;
  seed: number;
  duration_s: number;
  objective: { text: string; budget: number; target_delay_reduction_pct: number; max_risk_increase_pct: number; weights: Record<string, number> };
  parsed_objective: { target_delay_reduction_pct: number; budget: number };
  baseline: { metrics: Metrics; road_metrics: Candidate["road_metrics"]; duration_s: number; seed: number; model: string };
  candidates: Candidate[];
  ranking: string[];
  recommendation: { candidate_id: string | null; explanation: string; feasible_count: number; closest_alternatives: string[]; assumptions: string[] };
}

export interface StoredRecord {
  id: string;
  kind: string;
  created_at: string;
  payload: Record<string, unknown>;
}
