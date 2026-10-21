/**
 * Keeps the pothole scanner's unsaved session on the phone (IndexedDB), so recorded potholes survive a
 * tab reload, the browser being killed in the background, or navigating away mid-audit.
 * Every call fails soft: if storage is unavailable the scanner still works, just without recovery.
 */
const DB_NAME = 'smartroad-scanner'
const STORE = 'session'
const KEY = 'current'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, action) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Saves { potholes, surveyDistanceM, auditId }; returns false if storage failed (e.g. quota). */
export async function storeScanSession(session) {
  try {
    await withStore('readwrite', (store) => store.put({ ...session, updatedAt: Date.now() }, KEY))
    return true
  } catch (err) {
    console.warn('Could not store scan session:', err?.message || err)
    return false
  }
}

export async function loadScanSession() {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) || null
  } catch {
    return null
  }
}

export async function clearScanSession() {
  try {
    await withStore('readwrite', (store) => store.delete(KEY))
  } catch {
    // Nothing to clear
  }
}
