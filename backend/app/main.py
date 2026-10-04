import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.api.routes import audits, checklist, locations, segments, roads
from app.core.config import settings
from app.db.database import Base, engine

# Import all models so SQLAlchemy knows about them
from app.models import Audit, ChecklistItem, Segment

from app.api.router import router as api_router


# -------------------------
# Database initialization
# -------------------------

Base.metadata.create_all(bind=engine)

# Keep existing local databases compatible when new report fields are added.
with engine.begin() as connection:
    columns = {
        column['name']
        for column in inspect(engine).get_columns('segments')
    }
    if 'max_speed' not in columns:
        connection.execute(
            text('ALTER TABLE segments ADD COLUMN max_speed FLOAT')
        )


# -------------------------
# FastAPI application
# -------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version='1.0.0',
    description=(
        'Backend API for the SmartRoad Audit system. '
        'The system supports location-based road safety '
        'screening, road segmentation, risk assessment, '
        'and checklist generation.'
    ),
)


# -------------------------
# CORS configuration
# -------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# -------------------------
# Register API routers
# -------------------------

app.include_router(api_router)
app.include_router(api_router, prefix='/api')


# -------------------------
# Health check (handles GET and HEAD for Render)
# -------------------------

@app.api_route('/health', methods=['GET', 'HEAD'])
def health_check():
    return {
        'status': 'healthy',
    }


# -------------------------
# Frontend Static / SPA Serving
# -------------------------

candidate_paths = [
    Path('/app/frontend_dist'),
    Path(__file__).resolve().parent.parent / 'frontend_dist',
    Path(__file__).resolve().parent.parent.parent / 'frontend' / 'dist',
    Path(__file__).resolve().parent.parent / 'frontend' / 'dist',
    Path('frontend_dist'),
    Path('../frontend/dist'),
]

FRONTEND_DIST = None
for p in candidate_paths:
    if p.is_dir() and (p / 'index.html').is_file():
        FRONTEND_DIST = str(p.resolve())
        print(f'[Frontend] Successfully located compiled React UI at: {FRONTEND_DIST}')
        break

if FRONTEND_DIST:
    assets_dir = os.path.join(FRONTEND_DIST, 'assets')
    if os.path.isdir(assets_dir):
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

    @app.api_route('/', methods=['GET', 'HEAD'])
    def serve_root(request: Request):
        if request.method == 'HEAD':
            return Response(status_code=200)
        index_file = os.path.join(FRONTEND_DIST, 'index.html')
        return FileResponse(index_file)

    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        if (
            full_path.startswith('api/')
            or full_path == 'api'
            or full_path.startswith('docs')
            or full_path.startswith('openapi')
            or full_path.startswith('health')
        ):
            raise HTTPException(status_code=404, detail='Not found')
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST, 'index.html')
        return FileResponse(index_file)
else:
    print('[Frontend] No compiled React UI found; running in API-only mode')

    @app.api_route('/', methods=['GET', 'HEAD'])
    def root():
        return {
            'name': settings.APP_NAME,
            'version': '1.0.0',
            'status': 'running',
        }
