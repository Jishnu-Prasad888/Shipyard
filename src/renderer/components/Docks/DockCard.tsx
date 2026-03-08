import React from 'react'
import { Grid, Calendar } from 'lucide-react'

interface DockCardProps {
  board: any
  onClick: () => void
}

export const DockCard: React.FC<DockCardProps> = ({ board, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="card p-5 cursor-pointer group hover:border-primary transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
            <Grid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{board.name}</h3>
          </div>
        </div>
      </div>

      {board.description && (
        <p className="text-xs text-muted mt-1 line-clamp-2">{board.description}</p>
      )}

      <div className="flex items-center gap-3 mt-4 text-[11px] text-muted">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>
            {new Date(board.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
