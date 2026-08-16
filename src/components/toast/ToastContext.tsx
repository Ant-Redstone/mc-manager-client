import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import './Toast.css'

export type ToastType = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  leaving?: boolean
}

interface ToastApi {
  /** Show a transient notification in the bottom-right stack. */
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TOAST_TTL_MS = 3200
const TOAST_EXIT_MS = 240

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Monotonic counter for keys, so two toasts raised in the same tick stay
  // distinct without relying on Date.now()/Math.random().
  const nextId = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = (nextId.current += 1)
    setToasts((prev) => [...prev, { id, message, type }])
    // Mark it leaving so it can animate out, then remove it.
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    }, TOAST_TTL_MS - TOAST_EXIT_MS)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_TTL_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? 'leaving' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
