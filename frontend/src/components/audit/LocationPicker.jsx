import { useEffect, useRef, useState } from "react";

import { snapToRoad } from "../../services/api";

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const GOOGLE_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAP_ID ||
  "DEMO_MAP_ID";

function LocationPicker({
  selectedLocation,
  onLocationSelect,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);

  const [googleLoaded, setGoogleLoaded] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState("");

  const [searching, setSearching] =
    useState(false);

  const [locating, setLocating] =
    useState(false);

  const [snapping, setSnapping] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
   * ========================================================
   * LOAD GOOGLE MAPS
   * ========================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function loadGoogleMaps() {
      try {
        if (!GOOGLE_MAPS_API_KEY) {
          throw new Error(
            "Google Maps API key is not configured."
          );
        }

        /*
         * Google Maps may already be loaded
         * by another component.
         */
        if (window.google?.maps) {
          await initializeLibraries();

          if (!cancelled) {
            setGoogleLoaded(true);
          }

          return;
        }

        /*
         * Check whether another instance of this
         * component is already loading Google Maps.
         */
        const existingScript =
          document.querySelector(
            'script[data-smartroad-google-maps="true"]'
          );

        if (existingScript) {
          await waitForGoogleMaps();
          await initializeLibraries();

          if (!cancelled) {
            setGoogleLoaded(true);
          }

          return;
        }

        /*
         * Create Google Maps script.
         */
        const script =
          document.createElement("script");

        script.src =
          `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            GOOGLE_MAPS_API_KEY
          )}&v=weekly`;

        script.async = true;
        script.defer = true;

        script.dataset.smartroadGoogleMaps =
          "true";

        const loaded = new Promise(
          (resolve, reject) => {
            script.onload = resolve;

            script.onerror = () =>
              reject(
                new Error(
                  "Failed to load Google Maps."
                )
              );
          }
        );

        document.head.appendChild(script);

        await loaded;
        await waitForGoogleMaps();
        await initializeLibraries();

        if (!cancelled) {
          setGoogleLoaded(true);
        }
      } catch (err) {
        console.error(
          "Google Maps loading failed:",
          err
        );

        if (!cancelled) {
          setError(
            err.message ||
              "Unable to load Google Maps."
          );
        }
      }
    }

    async function initializeLibraries() {
      if (!window.google?.maps) {
        throw new Error(
          "Google Maps is not available."
        );
      }

      await window.google.maps.importLibrary(
        "maps"
      );

      await window.google.maps.importLibrary(
        "marker"
      );

      const geocodingLibrary =
        await window.google.maps.importLibrary(
          "geocoding"
        );

      geocoderRef.current =
        new geocodingLibrary.Geocoder();
    }

    function waitForGoogleMaps() {
      return new Promise(
        (resolve, reject) => {
          const timeout =
            setTimeout(() => {
              reject(
                new Error(
                  "Google Maps failed to initialize."
                )
              );
            }, 15000);

          const check =
            setInterval(() => {
              if (window.google?.maps) {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
              }
            }, 100);
        }
      );
    }

    loadGoogleMaps();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ========================================================
   * INITIALIZE MAP
   * ========================================================
   */

  useEffect(() => {
    if (
      !googleLoaded ||
      !mapRef.current ||
      mapInstanceRef.current
    ) {
      return;
    }

    let cancelled = false;

    async function initializeMap() {
      try {
        const { Map } =
          await window.google.maps.importLibrary(
            "maps"
          );

        const { AdvancedMarkerElement } =
          await window.google.maps.importLibrary(
            "marker"
          );

        if (cancelled || !mapRef.current) {
          return;
        }

        /*
         * Default map center.
         * Bengaluru is used until the user
         * selects/searches for a location.
         */
        const defaultCenter = {
          lat: 12.9716,
          lng: 77.5946,
        };

        const hasSelectedLocation =
          selectedLocation &&
          Number.isFinite(
            Number(selectedLocation.latitude)
          ) &&
          Number.isFinite(
            Number(selectedLocation.longitude)
          );

        const initialCenter =
          hasSelectedLocation
            ? {
                lat: Number(
                  selectedLocation.latitude
                ),
                lng: Number(
                  selectedLocation.longitude
                ),
              }
            : defaultCenter;

        /*
         * Create Google Map.
         */
        const map =
          new Map(mapRef.current, {
            center: initialCenter,

            zoom: hasSelectedLocation
              ? 17
              : 12,

            mapId: GOOGLE_MAP_ID,

            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,

            gestureHandling: "greedy",
          });

        mapInstanceRef.current = map;

        /*
         * Add marker if a location was already selected.
         */
        if (hasSelectedLocation) {
          const marker =
            createMarker(
              AdvancedMarkerElement,
              map,
              initialCenter
            );

          markerRef.current = marker;
        }

        /*
         * User clicks directly on the map.
         */
        map.addListener(
          "click",
          async (event) => {
            if (!event.latLng) {
              return;
            }

            const latitude =
              event.latLng.lat();

            const longitude =
              event.latLng.lng();

            await selectPoint(
              latitude,
              longitude
            );
          }
        );
      } catch (err) {
        console.error(
          "Map initialization failed:",
          err
        );

        if (!cancelled) {
          setError(
            err.message ||
              "Unable to initialize Google Maps."
          );
        }
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
    };
  }, [googleLoaded]);

  /*
   * ========================================================
   * SYNC MARKER WITH SELECTED LOCATION
   * ========================================================
   */

  useEffect(() => {
    if (
      !googleLoaded ||
      !mapInstanceRef.current ||
      !selectedLocation
    ) {
      return;
    }

    const latitude = Number(
      selectedLocation.latitude
    );

    const longitude = Number(
      selectedLocation.longitude
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    updateMarker(
      latitude,
      longitude
    );
  }, [
    selectedLocation,
    googleLoaded,
  ]);

  /*
   * ========================================================
   * CREATE ADVANCED MARKER
   * ========================================================
   */

  function createMarker(
    AdvancedMarkerElement,
    map,
    position
  ) {
    const marker =
      new AdvancedMarkerElement({
        map,
        position,
        gmpDraggable: true,
        title: "Audit location",
      });

    marker.addEventListener(
      "gmp-dragend",
      async (event) => {
        const markerPosition =
          event.latLng ||
          marker.position;

        if (!markerPosition) {
          return;
        }

        let latitude;
        let longitude;

        /*
         * Handle Google LatLng object.
         */
        if (
          typeof markerPosition.lat ===
          "function"
        ) {
          latitude =
            markerPosition.lat();

          longitude =
            markerPosition.lng();
        } else {
          /*
           * Handle LatLngLiteral.
           */
          latitude =
            Number(markerPosition.lat);

          longitude =
            Number(markerPosition.lng);
        }

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        /*
         * Snap dragged point to nearest road.
         */
        await selectPoint(
          latitude,
          longitude
        );
      }
    );

    return marker;
  }

  /*
   * ========================================================
   * UPDATE MARKER
   * ========================================================
   */

  async function updateMarker(
    latitude,
    longitude
  ) {
    if (
      !mapInstanceRef.current ||
      !window.google?.maps
    ) {
      return;
    }

    const {
      AdvancedMarkerElement,
    } = await window.google.maps.importLibrary(
      "marker"
    );

    const position = {
      lat: latitude,
      lng: longitude,
    };

    /*
     * Create marker if it doesn't exist.
     */
    if (!markerRef.current) {
      markerRef.current =
        createMarker(
          AdvancedMarkerElement,
          mapInstanceRef.current,
          position
        );
    } else {
      /*
       * Move existing marker.
       */
      markerRef.current.position =
        position;

      markerRef.current.map =
        mapInstanceRef.current;
    }

    /*
     * Center map on selected point.
     */
    mapInstanceRef.current.panTo(
      position
    );

    mapInstanceRef.current.setZoom(17);
  }

  /*
   * ========================================================
   * SNAP POINT TO ROAD
   * ========================================================
   */

  async function snapPoint(
    latitude,
    longitude
  ) {
    try {
      setSnapping(true);

      const result =
        await snapToRoad(
          latitude,
          longitude
        );

      if (
        result?.found &&
        result?.snapped?.latitude != null &&
        result?.snapped?.longitude != null
      ) {
        return {
          latitude: Number(
            result.snapped.latitude
          ),

          longitude: Number(
            result.snapped.longitude
          ),

          place_id:
            result.place_id || null,
        };
      }

      /*
       * If Google doesn't find a road,
       * keep the original point.
       */
      return {
        latitude,
        longitude,
        place_id: null,
      };
    } catch (err) {
      console.error(
        "Road snapping failed:",
        err
      );

      /*
       * Don't block location selection
       * if Roads API temporarily fails.
       */
      return {
        latitude,
        longitude,
        place_id: null,
      };
    } finally {
      setSnapping(false);
    }
  }

  /*
   * ========================================================
   * REVERSE GEOCODE
   * ========================================================
   */

  async function reverseGeocodePoint(
    latitude,
    longitude
  ) {
    let name =
      "Selected Road Point";

    let address =
      `${latitude.toFixed(
        6
      )}, ${longitude.toFixed(6)}`;

    if (!geocoderRef.current) {
      return {
        name,
        address,
      };
    }

    try {
      const result =
        await geocoderRef.current.geocode({
          location: {
            lat: latitude,
            lng: longitude,
          },
        });

      const firstResult =
        result.results?.[0];

      if (!firstResult) {
        return {
          name,
          address,
        };
      }

      address =
        firstResult.formatted_address ||
        address;

      /*
       * Try to get the road name first.
       */
      const roadComponent =
        firstResult.address_components?.find(
          (component) =>
            component.types?.includes(
              "route"
            )
        );

      /*
       * Fall back to locality.
       */
      const localityComponent =
        firstResult.address_components?.find(
          (component) =>
            component.types?.includes(
              "locality"
            )
        );

      name =
        roadComponent?.long_name ||
        localityComponent?.long_name ||
        firstResult.name ||
        name;

      return {
        name,
        address,
      };
    } catch (err) {
      console.error(
        "Reverse geocoding failed:",
        err
      );

      return {
        name,
        address,
      };
    }
  }

  /*
   * ========================================================
   * SELECT POINT
   * ========================================================
   */

  async function selectPoint(
    latitude,
    longitude
  ) {
    try {
      setError("");

      /*
       * First snap user's point to
       * Google's road network.
       */
      const snapped =
        await snapPoint(
          latitude,
          longitude
        );

      const finalLatitude =
        snapped.latitude;

      const finalLongitude =
        snapped.longitude;

      /*
       * Move marker to snapped road point.
       */
      await updateMarker(
        finalLatitude,
        finalLongitude
      );

      /*
       * Get readable address.
       */
      const {
        name,
        address,
      } =
        await reverseGeocodePoint(
          finalLatitude,
          finalLongitude
        );

      /*
       * Send normalized location
       * to CreateAudit.jsx.
       */
      onLocationSelect({
        place_id:
          snapped.place_id,

        name,

        address,

        latitude:
          finalLatitude,

        longitude:
          finalLongitude,
      });
    } catch (err) {
      console.error(
        "Location selection failed:",
        err
      );

      /*
       * Fallback to original point.
       */
      onLocationSelect({
        place_id: null,

        name:
          "Selected Road Point",

        address:
          `${latitude.toFixed(
            6
          )}, ${longitude.toFixed(6)}`,

        latitude,

        longitude,
      });

      setError(
        "Point selected, but road snapping or address lookup failed."
      );
    }
  }

  /*
   * ========================================================
   * SEARCH LOCATION
   * ========================================================
   */

  async function handleSearch(
    event
  ) {
    event.preventDefault();

    const query =
      searchQuery.trim();

    if (!query) {
      return;
    }

    if (!geocoderRef.current) {
      setError(
        "Google Maps is still loading."
      );

      return;
    }

    try {
      setSearching(true);
      setError("");

      const result =
        await geocoderRef.current.geocode({
          address: query,
        });

      const firstResult =
        result.results?.[0];

      if (!firstResult) {
        setError(
          "No location found. Try a road name, area, or address."
        );

        return;
      }

      const location =
        firstResult.geometry.location;

      const latitude =
        typeof location.lat ===
        "function"
          ? location.lat()
          : Number(location.lat);

      const longitude =
        typeof location.lng ===
        "function"
          ? location.lng()
          : Number(location.lng);

      /*
       * Search result also goes through
       * road snapping.
       */
      await selectPoint(
        latitude,
        longitude
      );

      setSearchQuery(
        firstResult.formatted_address ||
          query
      );
    } catch (err) {
      console.error(
        "Location search failed:",
        err
      );

      setError(
        err.message ||
          "Unable to search this location."
      );
    } finally {
      setSearching(false);
    }
  }

  /*
   * ========================================================
   * CURRENT LOCATION
   * ========================================================
   */

  function handleCurrentLocation() {
    if (!navigator.geolocation) {
      setError(
        "Geolocation is not supported by this browser."
      );

      return;
    }

    setLocating(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude =
            position.coords.latitude;

          const longitude =
            position.coords.longitude;

          await selectPoint(
            latitude,
            longitude
          );
        } catch (err) {
          console.error(
            "Current location selection failed:",
            err
          );

          setError(
            "Unable to select your current location."
          );
        } finally {
          setLocating(false);
        }
      },

      (geoError) => {
        let message =
          "Unable to get your current location.";

        if (
          geoError.code ===
          geoError.PERMISSION_DENIED
        ) {
          message =
            "Location permission was denied. You can select the point manually on the map.";
        }

        setError(message);
        setLocating(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  /*
   * ========================================================
   * UI
   * ========================================================
   */

  return (
    <div className="space-y-4">

      {/* Search + Current Location */}
      <div className="flex flex-col gap-3 md:flex-row">

        <div
          className="flex flex-1 gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearch(event);
                }
              }}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value
                )
              }
              placeholder="Search road, area, or address..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() =>
                  setSearchQuery("")
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={
              searching ||
              snapping ||
              !googleLoaded
            }
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching
              ? "Searching..."
              : snapping
              ? "Snapping..."
              : "Search"}
          </button>
        </div>

        <button
          type="button"
          onClick={
            handleCurrentLocation
          }
          disabled={
            locating ||
            snapping ||
            !googleLoaded
          }
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locating
            ? "Locating..."
            : "⌖ Use Current Location"}
        </button>
      </div>

      {/* Instructions */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">

        <span className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            1
          </span>

          Search a road or area
        </span>

        <span className="hidden text-slate-300 sm:inline">
          →
        </span>

        <span className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            2
          </span>

          Click the exact road point
        </span>

        <span className="hidden text-slate-300 sm:inline">
          →
        </span>

        <span className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            3
          </span>

          Point automatically snaps to road
        </span>
      </div>

      {/* ====================================================
          MAP
          ==================================================== */}

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">

        {/*
         * IMPORTANT:
         * h-[480px] is required here.
         *
         * h-480px is NOT a valid Tailwind class.
         */}
        <div
          ref={mapRef}
          className="h-[480px] w-full"
        />

        {!googleLoaded &&
          !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
              <div className="rounded-xl bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
                Loading Google Maps...
              </div>
            </div>
          )}

        {snapping && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg">
            Snapping point to road...
          </div>
        )}

        {error && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-xl border border-red-200 bg-white/95 px-4 py-3 text-sm text-red-700 shadow-sm backdrop-blur">
            {error}
          </div>
        )}
      </div>

      {/* Selected Location */}
      {selectedLocation && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">

          <div className="flex items-start gap-4">

            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              📍
            </div>

            <div className="min-w-0">

              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Selected Road Point
              </p>

              <h3 className="mt-1 font-semibold text-slate-900">
                {selectedLocation.name ||
                  "Selected Road Point"}
              </h3>

              <p className="mt-1 text-sm text-slate-600">
                {selectedLocation.address}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">

                <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  Lat:{" "}
                  {Number(
                    selectedLocation.latitude
                  ).toFixed(6)}
                </span>

                <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  Lng:{" "}
                  {Number(
                    selectedLocation.longitude
                  ).toFixed(6)}
                </span>

                {selectedLocation.place_id && (
                  <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-green-600">
                    ✓ Road matched
                  </span>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedLocation && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
          No road point selected yet. Search for a
          location or click directly on the map.
        </div>
      )}
    </div>
  );
}

export default LocationPicker;