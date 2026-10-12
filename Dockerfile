# Stage 1: Build React 19 Frontend Dashboard
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
# Vite inlines VITE_* variables at build time; Render passes service env vars as build args
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_GOOGLE_MAP_ID=""
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}     VITE_GOOGLE_MAP_ID=${VITE_GOOGLE_MAP_ID}
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend + Static Frontend Serving
# Pothole detection runs in the browser (ONNX model ships in the frontend build), so there is no
# PyTorch here; this keeps the container well inside small free-tier memory limits.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/app ./app

# Copy built frontend assets so FastAPI serves the dashboard at root URL /
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist

EXPOSE 8000 10000

# Run FastAPI server with uvicorn (binds to Render's dynamic PORT or default 10000)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
