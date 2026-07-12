import React from 'react'
import { Move } from 'lucide-react'

interface ResizeHandleProps {
  onMouseDown: (event: React.MouseEvent) => void
  onDoubleClick?: () => void
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ onMouseDown, onDoubleClick }) => {
  const handleMouseDown = (event: React.MouseEvent) => {
    event.stopPropagation()
    onMouseDown(event)
  }

  return (
    <button
      type="button"
      className="absolute bottom-2 right-2 w-7 h-7 rounded-md flex items-center justify-center cursor-se-resize"
      style={{
        border: '2px solid var(--color-border-strong)',
        background: 'var(--color-background)',
        boxShadow: '1px 1px 0 var(--color-border-strong)'
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · Double-click to reset"
    >
      <Move className="w-4 h-4" style={{ color: 'var(--color-muted)' }} />
    </button>
  )
}
