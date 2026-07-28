import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, CheckSquare, Link2, FileText } from 'lucide-react'
import { TaskDetailsModal } from './TaskDetailsModal'

interface TaskProps {
  task: any
  onUpdate: () => void
}

export const Task: React.FC<TaskProps> = ({ task, onUpdate }) => {
  const [showDetails, setShowDetails] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  const completedSubtasks = task.subtasks?.filter((subtask: any) => subtask.completed)?.length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const tags = typeof task.tags === 'string' ? JSON.parse(task.tags || '[]') : task.tags || []
  const connectedIds =
    typeof task.connectedTaskIds === 'string'
      ? JSON.parse(task.connectedTaskIds || '[]')
      : task.connectedTaskIds || []
  const status =
    typeof task.status === 'string' && task.status.startsWith('{')
      ? JSON.parse(task.status)
      : task.status

  const isOverdue = task.deadline && task.deadline < Date.now()
  const taskColor = task.color || '#2563eb'

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          borderLeftColor: taskColor,
          borderLeftWidth: '4px'
        }}
        className="card group"
        onClick={() => setShowDetails(true)}
        {...attributes}
        {...listeners}
      >
        {/* Top accent line */}
        {task.color && (
          <div
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: `linear-gradient(90deg, ${task.color}, transparent)` }}
          />
        )}

        {/* Status badge */}
        {status && status.name && (
          <div className="mb-2">
            <span
              className="text-[10px] px-2 py-0.5 font-black uppercase tracking-wider border-2"
              style={{
                backgroundColor: (status.color || '#7c3aed') + '15',
                color: status.color || '#7c3aed',
                borderColor: status.color || '#7c3aed'
              }}
            >
              {status.name}
            </span>
          </div>
        )}

        {/* Title */}
        <h4
          className="font-black text-sm leading-tight break-words whitespace-pre-wrap"
          style={{
            color: 'var(--color-text)',
            textDecoration: status?.name === 'Done' ? 'line-through' : 'none',
            opacity: status?.name === 'Done' ? 0.65 : 1
          }}
        >
          {task.title}
        </h4>

        {/* Description preview */}
        {task.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-muted)' }}>
            {task.description}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map((tag: any) => (
              <span
                key={tag.id}
                className="text-[9px] px-1.5 py-0.5 font-black uppercase tracking-wider border"
                style={{
                  backgroundColor: (tag.color || '#2563eb') + '15',
                  color: tag.color || '#2563eb',
                  borderColor: tag.color || '#2563eb'
                }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[9px] font-black text-muted">+{tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer metadata */}
        <div
          className="flex items-center gap-3 mt-2 pt-2 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {task.deadline && (
            <div
              className={`flex items-center gap-1 text-[10px] font-black ${isOverdue ? 'text-red-600' : ''}`}
              style={!isOverdue ? { color: 'var(--color-muted)' } : {}}
            >
              <Calendar className="w-3 h-3" />
              <span>
                {new Date(task.deadline).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          )}

          {totalSubtasks > 0 && (
            <div
              className="flex items-center gap-1 text-[10px] font-black"
              style={{ color: completedSubtasks === totalSubtasks ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              <CheckSquare className="w-3 h-3" />
              <span>{completedSubtasks}/{totalSubtasks}</span>
            </div>
          )}

          {connectedIds.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-black" style={{ color: 'var(--color-muted)' }}>
              <Link2 className="w-3 h-3" />
              <span>{connectedIds.length}</span>
            </div>
          )}

          {task.notes && (
            <div className="flex items-center text-[10px]" style={{ color: 'var(--color-muted)' }}>
              <FileText className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>

      {showDetails && (
        <TaskDetailsModal
          task={task}
          onClose={() => setShowDetails(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}
