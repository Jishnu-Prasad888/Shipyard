import React, { useState, useEffect } from 'react'
import { X, Calendar, Tag, CheckSquare, Link2, Plus, Trash2, Search } from 'lucide-react'
import { MarkdownEditor } from './MarkdownEditor'
import { SubCard } from './SubCard'

interface CardDetailsModalProps {
  card: any
  listId: string
  onClose: () => void
  onUpdate: () => void
}

const PRESET_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316'
]

export const CardDetailsModal: React.FC<CardDetailsModalProps> = ({ card, onClose, onUpdate }) => {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description || '')
  const [deadlineStr, setDeadlineStr] = useState(
    card.deadline ? new Date(card.deadline).toISOString().split('T')[0] : ''
  )
  const [status, setStatus] = useState<any>(
    typeof card.status === 'string' && card.status.startsWith('{')
      ? JSON.parse(card.status)
      : card.status || null
  )
  const [color, setColor] = useState(card.color || '')
  const [tags, setTags] = useState<any[]>(
    typeof card.tags === 'string' ? JSON.parse(card.tags || '[]') : card.tags || []
  )
  const [subCards, setSubCards] = useState<any[]>(card.subCards || [])
  const [notes, setNotes] = useState(card.notes || '')
  const [availableStatuses, setAvailableStatuses] = useState<any[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newSubCardTitle, setNewSubCardTitle] = useState('')

  // Card linking state
  const [connectedCardIds, setConnectedCardIds] = useState<string[]>(
    typeof card.connectedCardIds === 'string'
      ? JSON.parse(card.connectedCardIds || '[]')
      : card.connectedCardIds || []
  )
  const [showLinkSearch, setShowLinkSearch] = useState(false)
  const [allCards, setAllCards] = useState<any[]>([])
  const [linkSearchQuery, setLinkSearchQuery] = useState('')
  const [connectedCardDetails, setConnectedCardDetails] = useState<any[]>([])

  useEffect(() => {
    loadStatuses()
    loadConnectedCards()
  }, [])

  const loadStatuses = async () => {
    const statuses = await window.electron.db.findAll('statuses')
    setAvailableStatuses(statuses.filter((s: any) => s.boardId === card.boardId))
  }

  const loadConnectedCards = async () => {
    const ids =
      typeof card.connectedCardIds === 'string'
        ? JSON.parse(card.connectedCardIds || '[]')
        : card.connectedCardIds || []

    if (ids.length > 0) {
      const details = await Promise.all(
        ids.map((id: string) => window.electron.db.findById('cards', id))
      )
      setConnectedCardDetails(details.filter(Boolean))
    }
  }

  const handleSave = async () => {
    const updatedCard = {
      ...card,
      title,
      description,
      deadline: deadlineStr ? new Date(deadlineStr).getTime() : null,
      status: status ? JSON.stringify(status) : null,
      color,
      tags: JSON.stringify(tags),
      subCards,
      notes,
      connectedCardIds: JSON.stringify(connectedCardIds),
      updatedAt: Date.now()
    }

    await window.electron.db.update('cards', card.id, updatedCard)
    onUpdate()
    onClose()
  }

  const handleAddTag = () => {
    if (newTagName.trim()) {
      const newTag = {
        id: Date.now().toString(),
        name: newTagName,
        color: PRESET_COLORS[tags.length % PRESET_COLORS.length]
      }
      setTags([...tags, newTag])
      setNewTagName('')
    }
  }

  const handleRemoveTag = (tagId: string) => {
    setTags(tags.filter((t: any) => t.id !== tagId))
  }

  const handleAddSubCard = () => {
    if (newSubCardTitle.trim()) {
      const newSubCard = {
        id: Date.now().toString(),
        title: newSubCardTitle,
        completed: false,
        cardId: card.id,
        createdAt: Date.now()
      }
      setSubCards([...subCards, newSubCard])
      setNewSubCardTitle('')
    }
  }

  const handleToggleSubCard = async (subCardId: string) => {
    const updatedSubCards = subCards.map((sc: any) =>
      sc.id === subCardId ? { ...sc, completed: !sc.completed } : sc
    )
    setSubCards(updatedSubCards)
  }

  const handleDeleteSubCard = async (subCardId: string) => {
    setSubCards(subCards.filter((sc: any) => sc.id !== subCardId))
  }

  const handleCreateStatus = async () => {
    const name = prompt('Enter status name:')
    if (!name) return

    const newStatus = {
      name,
      color: PRESET_COLORS[availableStatuses.length % PRESET_COLORS.length],
      boardId: card.boardId
    }

    const created = await window.electron.db.create('statuses', newStatus)
    setAvailableStatuses([...availableStatuses, created])
    setStatus(created)
  }

  const handleDeleteCard = async () => {
    if (confirm('Are you sure you want to delete this card?')) {
      await window.electron.db.delete('cards', card.id)
      onUpdate()
      onClose()
    }
  }

  // Card linking functions
  const handleOpenLinkSearch = async () => {
    const cards = await window.electron.db.findAll('cards')
    // Filter out current card and already connected cards
    setAllCards(cards.filter((c: any) => c.id !== card.id && !connectedCardIds.includes(c.id)))
    setShowLinkSearch(true)
  }

  const handleLinkCard = async (targetCardId: string) => {
    const newConnectedIds = [...connectedCardIds, targetCardId]
    setConnectedCardIds(newConnectedIds)

    // Also add reverse connection on the target card
    const targetCard = await window.electron.db.findById('cards', targetCardId)
    if (targetCard) {
      const targetConnected =
        typeof targetCard.connectedCardIds === 'string'
          ? JSON.parse(targetCard.connectedCardIds || '[]')
          : targetCard.connectedCardIds || []
      if (!targetConnected.includes(card.id)) {
        targetConnected.push(card.id)
        await window.electron.db.update('cards', targetCardId, {
          connectedCardIds: JSON.stringify(targetConnected),
          updatedAt: Date.now()
        })
      }
    }

    // Update connected details
    const detail = await window.electron.db.findById('cards', targetCardId)
    if (detail) {
      setConnectedCardDetails([...connectedCardDetails, detail])
    }

    // Remove from available list
    setAllCards(allCards.filter((c: any) => c.id !== targetCardId))
    setShowLinkSearch(false)
    setLinkSearchQuery('')
  }

  const handleUnlinkCard = async (targetCardId: string) => {
    const newConnectedIds = connectedCardIds.filter((id) => id !== targetCardId)
    setConnectedCardIds(newConnectedIds)
    setConnectedCardDetails(connectedCardDetails.filter((c: any) => c.id !== targetCardId))

    // Remove reverse connection
    const targetCard = await window.electron.db.findById('cards', targetCardId)
    if (targetCard) {
      const targetConnected =
        typeof targetCard.connectedCardIds === 'string'
          ? JSON.parse(targetCard.connectedCardIds || '[]')
          : targetCard.connectedCardIds || []
      const filtered = targetConnected.filter((id: string) => id !== card.id)
      await window.electron.db.update('cards', targetCardId, {
        connectedCardIds: JSON.stringify(filtered),
        updatedAt: Date.now()
      })
    }
  }

  const filteredLinkCards = allCards.filter((c: any) =>
    c.title.toLowerCase().includes(linkSearchQuery.toLowerCase())
  )

  const completedCount = subCards.filter((sc: any) => sc.completed).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-4xl max-h-[90vh] surface rounded-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 flex-1"
            placeholder="Card title"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteCard}
              className="p-2 rounded-lg hover:bg-alert/10 text-muted hover:text-alert transition"
              title="Delete card"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-soft transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="col-span-2 space-y-6">
              {/* Description */}
              <div>
                <h3 className="font-medium mb-2">Description</h3>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                  rows={4}
                  placeholder="Add a description..."
                />
              </div>

              {/* Subcards */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">
                    Subtasks{' '}
                    {subCards.length > 0 && (
                      <span className="text-sm text-muted font-normal">
                        ({completedCount}/{subCards.length})
                      </span>
                    )}
                  </h3>
                </div>

                {/* Progress bar */}
                {subCards.length > 0 && (
                  <div className="w-full h-2 bg-border rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: `${(completedCount / subCards.length) * 100}%`
                      }}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {subCards.map((subCard: any) => (
                    <SubCard
                      key={subCard.id}
                      subCard={subCard}
                      onToggle={handleToggleSubCard}
                      onDelete={handleDeleteSubCard}
                    />
                  ))}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSubCardTitle}
                      onChange={(e) => setNewSubCardTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubCard()}
                      className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                      placeholder="Add a subtask..."
                    />
                    <button
                      onClick={handleAddSubCard}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes (Markdown) */}
              <div>
                <h3 className="font-medium mb-2">Notes</h3>
                <MarkdownEditor value={notes} onChange={setNotes} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Status */}
              <div className="p-4 border border-border rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  Status
                </h4>
                <select
                  value={status?.id || ''}
                  onChange={(e) => {
                    const selected = availableStatuses.find((s: any) => s.id === e.target.value)
                    setStatus(selected || null)
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                >
                  <option value="">No status</option>
                  {availableStatuses.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateStatus}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  + Create new status
                </button>
              </div>

              {/* Deadline */}
              <div className="p-4 border border-border rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Deadline
                </h4>
                <input
                  type="date"
                  value={deadlineStr}
                  onChange={(e) => setDeadlineStr(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary"
                />
                {deadlineStr && (
                  <button
                    onClick={() => setDeadlineStr('')}
                    className="mt-2 text-sm text-alert hover:underline"
                  >
                    Clear deadline
                  </button>
                )}
              </div>

              {/* Color */}
              <div className="p-4 border border-border rounded-lg">
                <h4 className="font-medium mb-2">Card Color</h4>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(color === c ? '' : c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c
                          ? 'ring-2 ring-offset-2 ring-primary scale-110'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="p-4 border border-border rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </h4>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text focus:outline-none focus:border-primary text-sm"
                      placeholder="New tag..."
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag: any) => (
                      <span
                        key={tag.id}
                        className="tag flex items-center gap-1"
                        style={{ backgroundColor: tag.color + '20', color: tag.color }}
                      >
                        {tag.name}
                        <button
                          onClick={() => handleRemoveTag(tag.id)}
                          className="hover:text-alert"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Connected Cards */}
              <div className="p-4 border border-border rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Connected Cards
                </h4>

                {connectedCardDetails.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {connectedCardDetails.map((connCard: any) => (
                      <div
                        key={connCard.id}
                        className="flex items-center justify-between p-2 rounded-lg border border-border hover:border-primary/50 transition"
                      >
                        <div className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm truncate max-w-[140px]">{connCard.title}</span>
                        </div>
                        <button
                          onClick={() => handleUnlinkCard(connCard.id)}
                          className="p-1 text-muted hover:text-alert transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showLinkSearch ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                      <input
                        type="text"
                        value={linkSearchQuery}
                        onChange={(e) => setLinkSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-surface text-text text-sm focus:outline-none focus:border-primary"
                        placeholder="Search cards..."
                        autoFocus
                      />
                    </div>
                    <div className="max-h-40 overflow-auto space-y-1">
                      {filteredLinkCards.length > 0 ? (
                        filteredLinkCards.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => handleLinkCard(c.id)}
                            className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-primary-soft transition truncate"
                          >
                            {c.title}
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-muted p-2">No cards found</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowLinkSearch(false)
                        setLinkSearchQuery('')
                      }}
                      className="text-xs text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleOpenLinkSearch}
                    className="w-full px-3 py-2 border border-dashed border-border rounded-lg hover:border-primary hover:bg-primary-soft transition text-muted hover:text-primary text-sm"
                  >
                    + Connect to card
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg hover:bg-primary-soft transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
