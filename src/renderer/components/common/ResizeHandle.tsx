import React from 'react'

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
    <div
      className="absolute bottom-2 right-2 w-4 h-4 cursor-se-resize"
      style={{
        border: '2px dashed var(--color-border-strong)',
        background: 'var(--color-background)',
        borderRadius: '4px',
        boxShadow: '1px 1px 0 var(--color-border-strong)'
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · Double-click to reset"
    />
  )
}
