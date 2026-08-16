import { useEffect, useState } from 'react'

const BLUEMAP_KEY = 'mcm.bluemap_url'
const SETTINGS_EVENT = 'mcm:settings'

// The BlueMap base URL, preferring a value saved in this browser and falling
// back to the build-time VITE_BLUEMAP_URL when nothing is saved.
export function getBlueMapUrl(): string {
  try {
    const stored = localStorage.getItem(BLUEMAP_KEY)
    if (stored) return stored
  } catch {
    // localStorage may be unavailable (e.g. private mode) — fall through.
  }
  return (import.meta.env.VITE_BLUEMAP_URL as string | undefined) ?? ''
}

export function setBlueMapUrl(url: string): void {
  try {
    const trimmed = url.trim()
    if (trimmed) localStorage.setItem(BLUEMAP_KEY, trimmed)
    else localStorage.removeItem(BLUEMAP_KEY)
  } catch {
    // Ignore persistence errors; the in-memory value still updates below.
  }
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

// Subscribe to the saved BlueMap URL, re-rendering when it changes — in this
// tab via the custom event, or in another tab via the storage event.
export function useBlueMapUrl(): string {
  const [url, setUrl] = useState(getBlueMapUrl)
  useEffect(() => {
    const sync = () => setUrl(getBlueMapUrl())
    window.addEventListener(SETTINGS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return url
}
