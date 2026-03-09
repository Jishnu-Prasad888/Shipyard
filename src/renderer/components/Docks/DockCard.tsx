import React from 'react'
import { Grid, Calendar, ArrowRight } from 'lucide-react'

interface DockCardProps {
  board: any
  onClick: () => void
}

export const DockCard: React.FC<DockCardProps> = ({ board, onClick }) => {
  const boardColor = board.color || '#2563eb'

  return (
    <div
      onClick={onClick}
      className="card group cursor-pointer animate-brutal-in"
      style={{ borderTopWidth: '4px', borderTopColor: boardColor }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 border-2 flex items-center justify-center transition-all duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5"
          style={{
            backgroundColor: boardColor + '15',
            borderColor: boardColor,
            boxShadow: `2px 2px 0 ${boardColor}`
          }}
        >
          <Grid className="w-5 h-5" style={{ color: boardColor }} />
        </div>

        <ArrowRight
          className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-150 group-hover:translate-x-0.5"
          style={{ color: boardColor }}
        />
      </div>

      <h3 className="font-black text-sm uppercase tracking-tight" style={{ color: 'var(--color-text)' }}>
        {board.name}
      </h3>

      <span
        className="text-[9px] uppercase tracking-widest font-black"
        style={{ color: 'var(--color-muted)' }}
      >
        Board #{board.id.substring(0, 6)}
      </span>

      {board.description && (
        <p
          className="text-xs mt-2 leading-relaxed line-clamp-2"
          style={{ color: 'var(--color-muted)' }}
        >
          {board.description}
        </p>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between mt-3 pt-3 border-t-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="meta">
          <Calendar className="w-3 h-3" />
          <span className="font-black">
            {new Date(board.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        </div>

        <span
          className="text-[9px] font-black uppercase px-2 py-0.5 border"
          style={{
            borderColor: boardColor,
            color: boardColor,
            background: boardColor + '15'
          }}
        >
          Kanban
        </span>
      </div>

      {/* Bottom accent */}
      <div
        className="absolute bottom-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: boardColor }}
      />
    </div>
  )
}
