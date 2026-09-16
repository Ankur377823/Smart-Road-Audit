from app.api.routes import audits, checklist, locations, roads, segments

from fastapi import APIRouter

router = APIRouter()

router.include_router(locations.router, prefix="/locations", tags=["locations"])
router.include_router(audits.router, tags=["audits"])
router.include_router(checklist.router, tags=["checklist"])
router.include_router(segments.router, tags=["segments"])
router.include_router(roads.router, tags=["roads"])