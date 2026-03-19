import React, { useEffect, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'

interface ToastProps {
  message: string
  onUndo?: () => void
  onClose: () => void
  duration?: number
}

export const Toast: React.FC<ToastProps> = ({ message, onUndo, onClose, duration = 5000 }) => {
  const [visible, setVisible] = useState(false)

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Auto-dismiss
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const handleUndo = () => {
    onUndo?.()
    handleClose()
  }

  return (
    <div
      style={{
        boxShadow: 'var(--shadow-brutal)',
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
      className="fixed bottom-6 right-6 z-[200] flex items-center gap-4 px-5 py-3.5 surface"
    >
      {/* Accent bar */}
      <div className="brutal-accent absolute top-0 left-0 right-0 h-1" />

      <span className="text-sm font-bold text-text">{message}</span>

      {onUndo && (
        <button
          onClick={handleUndo}
          style={{ color: 'var(--color-primary)' }}
          className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider hover:opacity-80 transition-opacity border-b-2 border-primary pb-px"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Undo
        </button>
      )}

      <button
        onClick={handleClose}
        className="p-1 hover:bg-primary-soft rounded transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-muted" />
      </button>
    </div>
  )
}
