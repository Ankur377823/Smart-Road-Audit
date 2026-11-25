from app.api.routes import audits, checklist, locations, potholes, roads, segments

from fastapi import APIRouter

router = APIRouter()

# locations.router already carries the /locations prefix
router.include_router(locations.router, tags=["locations"])
router.include_router(audits.router, tags=["audits"])
router.include_router(checklist.router, tags=["checklist"])
router.include_router(segments.router, tags=["segments"])
router.include_router(roads.router, tags=["roads"])
router.include_router(potholes.router, tags=["potholes"])
