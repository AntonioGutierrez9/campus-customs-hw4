import { useEffect } from 'react'

// Small confirmation message ("You're logged in") that disappears on its own.
export default function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="toast" role="status">
      <span className="toast-icon" aria-hidden="true">
        ✓
      </span>
      {message}
      <button className="toast-close" onClick={onDone} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
