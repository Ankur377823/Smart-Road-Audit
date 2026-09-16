from fastapi import APIRouter, HTTPException, Query

from app.services.location_service import LocationService


router = APIRouter(
    prefix="/locations",
    tags=["Locations"],
)

location_service = LocationService()


@router.get("/search")
async def search_locations(
    q: str = Query(
        ...,
        min_length=2,
        max_length=200,
        description="Location name, road, area, or landmark to search",
    ),
    limit: int = Query(
        5,
        ge=1,
        le=10,
        description="Maximum number of results",
    ),
):
    """
    Search for locations.

    Example:
        GET /locations/search?q=NIT%20Calicut
    """

    try:
        results = await location_service.search_locations(
            query=q,
            limit=limit,
        )

        return {
            "query": q,
            "results": results,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Location provider is currently unavailable.",
        ) from exc


@router.get("/reverse")
async def reverse_location(
    lat: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Latitude",
    ),
    lng: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Longitude",
    ),
):
    """
    Convert coordinates into a readable location.

    Example:
        GET /locations/reverse?lat=11.3216&lng=75.9341
    """

    try:
        result = await location_service.reverse_geocode(
            latitude=lat,
            longitude=lng,
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="Location could not be identified.",
            )

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Location provider is currently unavailable.",
        ) from exc