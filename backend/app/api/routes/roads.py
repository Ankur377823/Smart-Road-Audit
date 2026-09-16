from fastapi import APIRouter, HTTPException, Query

from app.services.road_snap_service import (
    RoadSnapService,
)

router = APIRouter(
    prefix="/roads",
    tags=["Roads"],
)


@router.get("/snap")
async def snap_point_to_road(
    lat: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Latitude of the selected point",
    ),
    lng: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Longitude of the selected point",
    ),
):
    """
    Snap a user-selected coordinate to
    the nearest road using Google Roads API.
    """

    try:
        result = await RoadSnapService().snap_point(
            latitude=lat,
            longitude=lng,
        )

        return {
            "original": {
                "latitude": result.original_latitude,
                "longitude": result.original_longitude,
            },
            "snapped": {
                "latitude": result.snapped_latitude,
                "longitude": result.snapped_longitude,
            },
            "place_id": result.place_id,
            "found": result.found,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to snap the selected point to a road.",
        ) from exc


@router.get("/nearest")
async def find_nearest_road(
    lat: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Latitude of the selected point",
    ),
    lng: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Longitude of the selected point",
    ),
):
    """
    Find the nearest road to a user-selected coordinate
    using Google Roads API.
    """

    try:
        result = (
            await RoadSnapService().find_nearest_road(
                latitude=lat,
                longitude=lng,
            )
        )

        return {
            "original": {
                "latitude": result.original_latitude,
                "longitude": result.original_longitude,
            },
            "snapped": {
                "latitude": result.snapped_latitude,
                "longitude": result.snapped_longitude,
            },
            "place_id": result.place_id,
            "found": result.found,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to find the nearest road.",
        ) from exc