import React from 'react'
import { Folder, ChevronDown, ChevronRight } from 'lucide-react'

interface ProjectWorkspaceProps {
  workspace: any
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  workspace,
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
        <Folder className="w-4 h-4" style={{ color: workspace.color || '#2563eb' }} />
        <span className="flex-1 text-left text-xs font-black uppercase tracking-wider">{workspace.name}</span>
      </button>

      {isExpanded && <div className="ml-5 mt-1 space-y-1">{children}</div>}
    </div>
  )
}
