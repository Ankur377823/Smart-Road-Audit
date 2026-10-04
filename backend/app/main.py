import os
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
# Health check
# -------------------------

@app.api_route('/health', methods=['GET', 'HEAD'])
def health_check():
    return {
        'status': 'healthy',
    }


# -------------------------
# Frontend Static / SPA Serving
# -------------------------

FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend_dist')
if not os.path.isdir(FRONTEND_DIST):
    FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend', 'dist')

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, 'assets')
    if os.path.isdir(assets_dir):
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

    @app.api_route('/', methods=['GET', 'HEAD'])
    def serve_root(request: Request):
        if request.method == 'HEAD':
            return Response(status_code=200)
        index_file = os.path.join(FRONTEND_DIST, 'index.html')
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return {'name': settings.APP_NAME, 'version': '1.0.0', 'status': 'running'}

    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        if full_path.startswith('api/') or full_path == 'api' or full_path.startswith('docs') or full_path.startswith('openapi'):
            raise HTTPException(status_code=404, detail='Not found')
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST, 'index.html')
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail='Not found')
else:
    @app.api_route('/', methods=['GET', 'HEAD'])
    def root():
        return {
            'name': settings.APP_NAME,
            'version': '1.0.0',
            'status': 'running',
        }
