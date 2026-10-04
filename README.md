# SmartRoad Audit

SmartRoad Audit is an AI-powered road safety screening and audit platform. It automates road segmentation, risk assessment, pothole detection using YOLO computer vision, and audit checklist generation.

---

## Architecture Overview

- **Frontend**: React (Vite, Tailwind CSS, GSAP) served via Nginx with reverse proxy to `/api`. Runs on `http://localhost:5173`.
- **Backend**: FastAPI (Python 3.11, Uvicorn, Ultralytics YOLOv8, OpenCV). Runs on `http://localhost:8000`.
- **Database**: PostgreSQL 16 Alpine container with persistent storage volume (`postgres_data`). Runs on `localhost:5432`.

---

## Quick Start with Docker Compose (Recommended)

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v20+ recommended)
- Docker Compose v2+

### 2. Environment Configuration (Optional)
Copy the sample environment file:
```bash
cp .env.example .env
```
*(You can leave default values or configure `GOOGLE_MAPS_API_KEY` if using live Google Maps integration)*

### 3. Build & Run
Start all services in detached mode:
```bash
docker compose up --build -d
```

### 4. Access the Applications
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API Docs (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

### 5. Check Service Status & Logs
```bash
# View running status and health of containers
docker compose ps

# View unified logs
docker compose logs -f

# View backend logs specifically
docker compose logs -f backend
```

### 6. Stop Services
```bash
# Stop and remove containers and networks (data volume preserved)
docker compose down

# Stop and delete database volumes (resets database)
docker compose down -v
```

---

## Service Port Mappings

| Service | Container Port | Host Port | Description |
|---|---|---|---|
| `frontend` | 80 | 5173 | Nginx web server serving React SPA + `/api` proxy |
| `backend` | 8000 | 8000 | FastAPI REST API & YOLO inference engine |
| `db` | 5432 | 5432 | PostgreSQL 16 database |

---

## Local Development (Without Docker)

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```
