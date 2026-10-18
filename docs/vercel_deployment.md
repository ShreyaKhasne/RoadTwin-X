# Vercel deployment

Import `ShreyaKhasne/RoadTwin-X` from GitHub in Vercel and deploy the repository
root. The root FastAPI entrypoint serves the Vite build and `/api` endpoints
from the same deployment. The production frontend uses the same-origin API URL.

Vercel requires Python project metadata in the root `pyproject.toml`. Its build
script installs frontend dependencies and builds the Vite app before FastAPI
exposes the generated `frontend/dist` files.

The demo defaults to SQLite under `/tmp` on Vercel, because the deployed
filesystem is not durable. Saved reports, scenarios, and network edits may be
lost when a serverless instance is replaced. Set `ROADTWIN_DATABASE_URL` to a
managed database for durable storage.
