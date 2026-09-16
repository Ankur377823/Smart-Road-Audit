# SmartRoad Audit API

## Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Create a local PostgreSQL database and then set `DATABASE_URL` in `.env`.
Use the database name that exists on your local Postgres server, for example:

```text
DATABASE_URL=postgresql+psycopg://postgres:krishna123@localhost:5432/smartroad
```

If the database does not exist yet, create it before starting the API:

```sql
CREATE DATABASE smartroad;
```

## Run

Run the app from the `backend` directory so Python can import the `app` package:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`.

- Health check: `GET /health`
- Create audit: `POST /audits`
- Read audit: `GET /audits/{audit_id}`
- Read segments: `GET /audits/{audit_id}/segments`
- Read checklist: `GET /audits/{audit_id}/checklist`
- Interactive docs: `GET /docs`

## MVP behavior

The default `DEMO_MODE=true` runs deterministic provider adapters for road geometry,
elevation, routes, and places. This makes the workflow usable without Google
credentials while preserving the service boundaries for real provider integration.

Copy `.env.example` to `.env` and provide `GOOGLE_MAPS_API_KEY` when the live
provider adapters are implemented.

## Test

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```
