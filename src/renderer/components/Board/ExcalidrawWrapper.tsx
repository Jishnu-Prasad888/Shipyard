import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface ExcalidrawWrapperProps {
  boardId: string
  lists: any[]
  onClose: () => void
}

// This component is currently unused - card connections are handled inline via CardDetailsModal
export const ExcalidrawWrapper: React.FC<ExcalidrawWrapperProps> = ({
  boardId,
  lists,
  onClose
}) => {
  const [connections, setConnections] = useState<any[]>([])

  useEffect(() => {
    loadConnections()
  }, [boardId])

  const loadConnections = async () => {
    const allConnections = await window.electron.db.findAll('connections')
    const boardConnections = allConnections.filter((c: any) => c.boardId === boardId)
    setConnections(boardConnections)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Card Connections</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-soft transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">Card connections are managed within card details</p>
          <p className="text-sm">Open a card and use the "Connected Cards" section to link cards</p>
          <p className="text-sm mt-4">
            {connections.length} connections in this board across {lists.length} lists
          </p>
        </div>
      </div>
    </div>
  )
}
