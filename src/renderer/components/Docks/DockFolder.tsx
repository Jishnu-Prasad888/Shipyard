import React from 'react'
import { Folder, ChevronDown, ChevronRight } from 'lucide-react'

interface DockFolderProps {
  folder: any
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export const DockFolder: React.FC<DockFolderProps> = ({
  folder,
  isExpanded,
  onToggle,
  children
}) => {
  return (
    <div>
      <button
        onClick={onToggle}
        className="nav-item w-full"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Folder className="w-4 h-4" style={{ color: folder.color || '#2563eb' }} />
        <span className="flex-1 text-left text-xs font-black uppercase tracking-wider">{folder.name}</span>
      </button>

      {isExpanded && <div className="ml-5 mt-1 space-y-1">{children}</div>}
    </div>
  )
}
