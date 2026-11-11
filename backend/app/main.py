import mimetypes
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
    segment_columns = {
        column["name"] for column in inspect(engine).get_columns("segments")
    }
    audit_columns = {
        column["name"] for column in inspect(engine).get_columns("audits")
    }
    if "max_speed" not in segment_columns:
        connection.execute(
            text('ALTER TABLE segments ADD COLUMN max_speed FLOAT')
        )
    if "curve_radius_status" not in segment_columns:
        connection.execute(
            text(
                "ALTER TABLE segments ADD COLUMN curve_radius_status "
                "VARCHAR(30) NOT NULL DEFAULT 'unavailable'"
            )
        )
    if "pedestrian_activity_source" not in segment_columns:
        connection.execute(
            text(
                "ALTER TABLE segments ADD COLUMN "
                "pedestrian_activity_source VARCHAR(50)"
            )
        )
    if "pedestrian_place_count" not in segment_columns:
        connection.execute(
            text("ALTER TABLE segments ADD COLUMN pedestrian_place_count INTEGER")
        )
    if "traffic_delay_percent" not in segment_columns:
        connection.execute(
            text("ALTER TABLE segments ADD COLUMN traffic_delay_percent FLOAT")
        )
    if "traffic_source" not in segment_columns:
        connection.execute(
            text("ALTER TABLE segments ADD COLUMN traffic_source VARCHAR(50)")
        )
    if "terrain_class" not in segment_columns:
        connection.execute(text("ALTER TABLE segments ADD COLUMN terrain_class VARCHAR(50)"))
    if "terrain_class" not in audit_columns:
        connection.execute(text("ALTER TABLE audits ADD COLUMN terrain_class VARCHAR(50)"))
    if "terrain_cross_slope_percent" not in audit_columns:
        connection.execute(text("ALTER TABLE audits ADD COLUMN terrain_cross_slope_percent FLOAT"))
    if "terrain_profile_length_m" not in audit_columns:
        connection.execute(text("ALTER TABLE audits ADD COLUMN terrain_profile_length_m FLOAT"))

    # Migrate values written by the former terrain-as-road-class selector.
    connection.execute(text(
        "UPDATE audits SET terrain_class = CASE road_class "
        "WHEN 'plain_rolling' THEN 'plain' "
        "WHEN 'mountainous_steep' THEN 'mountainous' "
        "ELSE terrain_class END, road_class = 'collector' "
        "WHERE road_class IN ('plain_rolling', 'mountainous_steep')"
    ))
    connection.execute(text(
        "UPDATE segments SET terrain_class = CASE road_class "
        "WHEN 'plain_rolling' THEN 'plain' "
        "WHEN 'mountainous_steep' THEN 'mountainous' "
        "ELSE terrain_class END, road_class = 'collector' "
        "WHERE road_class IN ('plain_rolling', 'mountainous_steep')"
    ))

    pothole_columns = {
        column['name']
        for column in inspect(engine).get_columns('pothole_detections')
    }
    pothole_additions = {
        'client_id': 'VARCHAR(64)',
        'snapped_latitude': 'FLOAT',
        'snapped_longitude': 'FLOAT',
        'location_source': "VARCHAR(20) NOT NULL DEFAULT 'gps'",
        'gps_accuracy_m': 'FLOAT',
        'depth_source': "VARCHAR(20) NOT NULL DEFAULT 'estimated'",
        'width_mm': 'FLOAT',
        'area_m2': 'FLOAT',
        'risk_level': 'VARCHAR(20)',
        'action_priority': 'VARCHAR(30)',
    }
    for name, ddl in pothole_additions.items():
        if name not in pothole_columns:
            connection.execute(
                text(f'ALTER TABLE pothole_detections ADD COLUMN {name} {ddl}')
            )
    if engine.dialect.name == 'postgresql':
        # Potholes without a GPS fix are stored with null coordinates
        connection.execute(text(
            'ALTER TABLE pothole_detections ALTER COLUMN latitude DROP NOT NULL'
        ))
        connection.execute(text(
            'ALTER TABLE pothole_detections ALTER COLUMN longitude DROP NOT NULL'
        ))
        connection.execute(text(
            'ALTER TABLE pothole_detections ALTER COLUMN depth_cm DROP NOT NULL'
        ))
    connection.execute(text(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_pothole_audit_client '
        'ON pothole_detections (audit_id, client_id)'
    ))


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

# Slim images may lack /etc/mime.types; browsers need these for WebAssembly streaming and the ONNX model
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('application/octet-stream', '.onnx')

FRONTEND_DIST = None
for p in candidate_paths:
    if p.is_dir() and (p / 'index.html').is_file():
        FRONTEND_DIST = str(p.resolve())
        print(f'[Frontend] Successfully located compiled React UI at: {FRONTEND_DIST}')
        break

if FRONTEND_DIST:
    # The API is also mounted without the /api prefix for older clients, so paths like /audits/5
    # are both API routes and app pages. Browser page loads ask for HTML: give them the app.
    API_ONLY_PREFIXES = ('/api', '/docs', '/redoc', '/openapi', '/health', '/assets', '/models')

    def index_response():
        # Revalidate on every load: each deploy renames the hashed /assets files and removes the old ones,
        # so a cached index.html would point at files that no longer exist
        return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'), headers={'Cache-Control': 'no-cache'})

    @app.middleware('http')
    async def serve_spa_for_page_loads(request: Request, call_next):
        path = request.url.path
        if (
            request.method == 'GET'
            and 'text/html' in request.headers.get('accept', '')
            and not path.startswith(API_ONLY_PREFIXES)
            and not os.path.isfile(os.path.join(FRONTEND_DIST, path.lstrip('/')))
        ):
            return index_response()
        return await call_next(request)

    assets_dir = os.path.join(FRONTEND_DIST, 'assets')
    if os.path.isdir(assets_dir):
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

    @app.api_route('/', methods=['GET', 'HEAD'])
    def serve_root(request: Request):
        if request.method == 'HEAD':
            return Response(status_code=200)
        return index_response()

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
        return index_response()
else:
    print('[Frontend] No compiled React UI found; running in API-only mode')

    @app.api_route('/', methods=['GET', 'HEAD'])
    def root():
        return {
            'name': settings.APP_NAME,
            'version': '1.0.0',
            'status': 'running',
        }
