# Vercel deployment

Import `ShreyaKhasne/RoadTwin-X` from GitHub in Vercel and deploy the repository
root. The root FastAPI entrypoint serves the Vite build and `/api` endpoints
from the same deployment. The production frontend uses the same-origin API URL.
The Vercel deployment is public: visitors can open the app link without signing
in. Use **Share scenario** in the workbench to share the current network and
experiment objective as a link; edits made from a shared link stay local to
that browser unless explicitly exported.

Scenario links contain the network and objective in the URL fragment. Share
only synthetic or otherwise non-sensitive data.

Vercel requires Python project metadata in the root `pyproject.toml`. Its build
script installs frontend dependencies and builds the Vite app before FastAPI
exposes the generated `frontend/dist` files.

The demo defaults to SQLite under `/tmp` on Vercel, because the deployed
filesystem is not durable. Saved reports, scenarios, and network edits may be
lost when a serverless instance is replaced. Set `ROADTWIN_DATABASE_URL` to a
managed database for durable storage.
