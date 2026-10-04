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
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("segments")
    }
    if "max_speed" not in columns:
        connection.execute(
            text("ALTER TABLE segments ADD COLUMN max_speed FLOAT")
        )


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
    allow_origins=settings.CORS_ORIGINS,
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