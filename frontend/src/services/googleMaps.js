const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID'

let loadingPromise = null

function waitForGoogleMaps(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = setInterval(() => {
      if (window.google?.maps?.importLibrary) {
        clearInterval(check)
        resolve(window.google.maps)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(check)
        reject(new Error('Google Maps failed to initialize.'))
      }
    }, 100)
  })
}

/**
 * Loads the Google Maps JS API once, sharing the script tag used by LocationPicker.
 */
export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (loadingPromise) return loadingPromise
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Google Maps API key is not configured.'))

  loadingPromise = (async () => {
    if (!document.querySelector('script[data-smartroad-google-maps="true"]')) {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly`
      script.async = true
      script.defer = true
      script.dataset.smartroadGoogleMaps = 'true'
      document.head.appendChild(script)
    }
    return waitForGoogleMaps()
  })().catch((err) => {
    loadingPromise = null
    throw err
  })

  return loadingPromise
}
