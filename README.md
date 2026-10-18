# RoadTwin X

**AI Road Intervention Engineer**  
“Experiment on the digital road before changing the real one.”

RoadTwin X is a local-first digital-twin prototype for exploring a fictional Indian urban intersection. It combines an interactive Three.js workbench, a deterministic seeded traffic model, counterfactual intervention runs, hard-constraint-aware ranking, and a SQLite-backed API. The sample network and traffic are synthetic demonstration data, not surveyed or operational city data.

## Quick start (Windows)

Requirements: Node.js 20+, npm, Python 3.11+.

1. Open two terminals in this folder.
2. In terminal one:

   ```powershell
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r backend\requirements.txt
   python -m uvicorn app.main:app --reload --app-dir backend
   ```

3. In terminal two:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

4. Open the Vite URL shown in the terminal. The API is at `http://127.0.0.1:8000`; interactive API documentation is at `/docs`.

If PowerShell blocks activation, run the commands using `.\.venv\Scripts\python.exe` and `.\.venv\Scripts\uvicorn.exe` instead.

## What works

- A procedural, selectable 3D four-way intersection with roads, curbs, crossings, signals, buildings, roadside objects, pedestrians, and animated mixed traffic.
- Browser-side play/pause, step, reset, speed, camera views, visibility controls, and road selection/editing.
- A time-stepped seeded queue-and-discharge simulator. The same network, intervention, and seed produce the same analytical metrics.
- A deterministic local candidate generator and counterfactual batch that reruns each intervention against the same seed.
- Budget and pedestrian-conflict proxy constraints applied before weighted candidate ranking. Infeasible results are reported rather than silently recommended.
- SQLite persistence for experiment scenarios and generated reports; persisted results remain available after API restart.
- JSON, CSV, and GeoJSON network import/export with API validation; imported coordinates and the sample network remain explicitly synthetic.
- Analytics for baseline and candidate delay, per-approach queues, arrivals, throughput, and the modeled emissions proxy.
- JSON API for network retrieval/editing, experiments, saved scenarios, and reports.

The objective text parser recognizes a delay-reduction percentage and a budget. Other constraints use the visible numeric controls. The local engine is a transparent rules-based system; no external LLM, SUMO service, accident-probability model, or live traffic feed is used.

## Demo flow

1. Start both services and observe School Gate Junction in the Workbench.
2. Select the congested east approach to inspect or edit its lane count and speed limit.
3. Change the objective or budget, then choose **Generate & simulate**.
4. Inspect the counterfactual table, feasibility flags, trade-offs, and recommendation.
5. Save a report to SQLite and use **Export report** to download the evidence as JSON.
6. Refresh the page or restart the API; saved scenario and report records remain available.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Service status |
| GET / PUT | `/api/network` | Read/update the demo network |
| GET | `/api/scenarios` | List persisted experiment scenarios |
| GET | `/api/scenarios/{scenario_id}` | Read a saved scenario |
| POST | `/api/experiments` | Generate, simulate, constrain, rank, and persist candidates |
| POST | `/api/reports` | Persist a report from actual experiment results |
| GET | `/api/reports` | List saved reports |
| GET | `/api/reports/{report_id}` | Retrieve report evidence |

Requests and responses are validated with Pydantic. Invalid inputs return explicit HTTP 4xx errors. API errors are not replaced by fabricated frontend results.

## Tests and production build

```powershell
python -m pytest -c backend\pytest.ini backend\tests -q
cd frontend
npm run build
```

## Model caveats

The analytical backend is a deterministic, discrete-time **approach-queue model**, not a calibrated microscopic driver model. Each approach receives seeded arrivals; green signal time discharges its queue subject to lane capacity and intervention adjustments. Delay, throughput, maximum queue, and pedestrian conflict-zone exposure proxies are calculated from those simulated arrivals/departures. The 3D viewport is an illustrative procedural twin; its live visual agents are not the backend's vehicle-by-vehicle analytical state. Read [the model notes](docs/traffic_model.md) before interpreting comparisons.

Intervention costs and safety factors are explicit demonstration assumptions. The conflict indicator is a relative proxy and is not an estimate of real crash probability. No recommendation should be used as an engineering design without local data, validation, and professional review.

## Project map

- `frontend/` React, TypeScript, R3F workbench, controls, and API client.
- `backend/app/` FastAPI service, SQLite persistence, scenario engine, and optimizer.
- `backend/tests/` deterministic model and API integration tests.
- `data/` synthetic network and sample provenance.
- `docs/` architecture, model assumptions, optimization, and demo notes.
