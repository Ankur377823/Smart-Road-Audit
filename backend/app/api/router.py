from app.api import audits, checklist, locations, segments

from fastapi import APIRouter

router = APIRouter(
    prefix="/api",
    tags=["api"],
)

router.include_router(locations.router, prefix="/locations", tags=["locations"])
router.include_router(audits.router, prefix="/audits", tags=["audits"])
router.include_router(checklist.router, prefix="/checklist", tags=["checklist"])
router.include_router(segments.router, prefix="/segments", tags=["segments"])