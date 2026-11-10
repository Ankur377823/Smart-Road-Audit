from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routes import audits, checklist, locations, segments,roads
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
            text("ALTER TABLE segments ADD COLUMN max_speed FLOAT")
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


# -------------------------
# FastAPI application
# -------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "Backend API for the SmartRoad Audit system. "
        "The system supports location-based road safety "
        "screening, road segmentation, risk assessment, "
        "and checklist generation."
    ),
)


# -------------------------
# CORS configuration
# -------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# Register API routers
# -------------------------

app.include_router(api_router)
app.include_router(api_router, prefix="/api")


# -------------------------
# Root endpoint
# -------------------------

@app.get("/")
def root():
    """
    Basic API health response.
    """

    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
    }


# -------------------------
# Health check
# -------------------------

@app.get("/health")
def health_check():
    """
    Check whether the API is running.
    """

    return {
        "status": "healthy",
    }
