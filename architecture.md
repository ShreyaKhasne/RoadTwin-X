# Architecture

The project is a small local-first monorepo. The Vite/React client owns the responsive workbench and the real-time Three.js scene; FastAPI owns reproducible analytical experiments and persistence. The client requests the sample road network and sends its current network/objective to the API for each experiment. No API key is needed.

```text
React workbench ── HTTP/JSON ── FastAPI
      │                            ├─ seeded queue/discharge simulation
      ├─ R3F procedural twin       ├─ rules-based candidate planner
      └─ local playback controls   ├─ constrained weighted ranking
                                   └─ SQLAlchemy / SQLite
```

The demo network has four directed approach edges terminating at one signalized junction. Synthetic demand, signal timings, road parameters, and obstruction factors are data, not hidden constants. The visual twin uses scene-local procedural assets; the analytical run uses the backend network payload and its seed. Viewport animation is for observation, while the returned experiment metrics are computed by the backend. They are intentionally not presented as synchronized per-vehicle traces.

SQLite defaults to `backend/roadtwin.db`. The database is created on service startup. Scenario JSON snapshots and report JSON preserve the actual request, intervention, metrics, constraints, and recommendation.

## Extension boundaries

- Replace or calibrate `app/simulation/engine.py` to use validated traffic counts and a richer agent-based simulator.
- Add an external language-model provider behind the deterministic parser in `app/simulation/experiments.py`; never mislabel the local fallback.
- Add authenticated GIS ingestion before using real networks. Current coordinates and geometry are fictional.
- A future WebSocket/job queue can stream large experiment batches. Current bounded demo batches execute synchronously and report candidate progress in the client.
