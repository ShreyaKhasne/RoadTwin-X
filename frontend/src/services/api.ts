import type { Experiment, RoadNetwork, StoredRecord } from "../types";

const API_ROOT = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("RoadTwin API is unreachable. Start the FastAPI service and retry.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `RoadTwin API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getNetwork: () => request<RoadNetwork>("/network"),
  updateNetwork: (network: RoadNetwork) =>
    request<RoadNetwork>("/network", { method: "PUT", body: JSON.stringify(network) }),
  runExperiment: (network: RoadNetwork, objective: Experiment["objective"], seed: number) =>
    request<Experiment>("/experiments", {
      method: "POST",
      body: JSON.stringify({ network, objective, seed, duration_s: 900 }),
    }),
  getReports: () => request<StoredRecord[]>("/reports"),
  saveReport: (experiment: Experiment) =>
    request<StoredRecord>("/reports", {
      method: "POST",
      body: JSON.stringify({
        experiment_id: experiment.experiment_id,
        title: `${experiment.network_id} · ${new Date().toLocaleDateString()}`,
        result: experiment,
      }),
    }),
  getScenarios: () => request<StoredRecord[]>("/scenarios"),
};
