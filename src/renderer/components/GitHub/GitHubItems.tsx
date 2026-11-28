import { readableText } from '../../lib/ink'
import React, { useEffect, useState } from 'react'
import {
  CircleDot,
  CheckCircle2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Loader2,
  AlertTriangle,
  X,
  ExternalLink
} from 'lucide-react'
import {
  fetchRef,
  formatRef,
  GitHubItem,
  GitHubRef,
  openExternal,
  refKey,
  refUrl
} from '../../lib/github'

const STATE_COLORS = {
  open: '#1a7f37',
  closed: '#cf222e',
  merged: '#8250df',
  draft: '#6e7781',
  commit: '#57606a'
}

export const itemColor = (item: GitHubItem): string => {
  if (!item.state) return STATE_COLORS.commit
  if (item.isPullRequest && item.draft && item.state === 'open') return STATE_COLORS.draft
  if (!item.isPullRequest && item.state === 'closed') return STATE_COLORS.merged
  return STATE_COLORS[item.state]
}

export const ItemIcon: React.FC<{ item: GitHubItem; className?: string }> = ({
  item,
  className = 'w-4 h-4'
}) => {
  const style = { color: itemColor(item) }
  if (item.ref.kind === 'commit') return <GitCommitHorizontal className={className} style={style} />
  if (item.isPullRequest) {
    if (item.state === 'merged') return <GitMerge className={className} style={style} />
    if (item.state === 'closed') return <GitPullRequestClosed className={className} style={style} />
    return <GitPullRequest className={className} style={style} />
  }
  if (item.state === 'closed') return <CheckCircle2 className={className} style={style} />
  return <CircleDot className={className} style={style} />
}

const stateLabel = (item: GitHubItem): string | null => {
  if (!item.state) return null
  if (item.isPullRequest && item.draft && item.state === 'open') return 'Draft'
  return item.state[0].toUpperCase() + item.state.slice(1)
}

const relativeTime = (iso?: string): string => {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

interface ItemRowProps {
  item: GitHubItem
  defaultRepo?: string | null
  /** Extra controls on the right (e.g. "Add as task"). */
  actions?: React.ReactNode
  compact?: boolean
}

/** One issue, pull request or commit. Clicking opens it in the browser. */
export const GitHubItemRow: React.FC<ItemRowProps> = ({ item, defaultRepo, actions, compact }) => {
  const label = stateLabel(item)
  return (
    <div
      className="flex items-start gap-2 px-2.5 py-2 border rounded-md group"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <ItemIcon item={item} className="w-4 h-4 mt-0.5 shrink-0" />
      <button
        type="button"
        onClick={() => openExternal(item.url)}
        className="flex-1 min-w-0 text-left"
        title={`Open ${formatRef(item.ref, defaultRepo)} on GitHub`}
      >
        <div
          className="text-xs font-bold leading-snug break-words group-hover:underline"
          style={{ color: 'var(--color-text)' }}
        >
          {item.title}
        </div>
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[10px] font-semibold"
          style={{ color: 'var(--color-muted)' }}
        >
          <span className="font-mono">{formatRef(item.ref, defaultRepo)}</span>
          {label && (
            <span
              className="px-1.5 py-px rounded-full"
              style={{ background: itemColor(item), color: readableText(itemColor(item)) }}
            >
              {label}
            </span>
          )}
          {item.author && <span>{item.author}</span>}
          {item.updatedAt && !compact && <span>{relativeTime(item.updatedAt)}</span>}
          {!compact &&
            item.labels?.slice(0, 3).map((labelInfo) => (
              <span
                key={labelInfo.name}
                className="px-1.5 py-px rounded-full border"
                style={{ borderColor: labelInfo.color, color: labelInfo.color }}
              >
                {labelInfo.name}
              </span>
            ))}
        </div>
      </button>
      {actions}
    </div>
  )
}

type LoadState =
  { status: 'loading' } | { status: 'ok'; item: GitHubItem } | { status: 'error'; message: string }

/** Loads and shows a list of references; failed ones still show as links. */
export const GitHubRefList: React.FC<{
  refs: { ref: GitHubRef; linked: boolean }[]
  defaultRepo?: string | null
  onRemove?: (ref: GitHubRef) => void
}> = ({ refs, defaultRepo, onRemove }) => {
  const [states, setStates] = useState<Record<string, LoadState>>({})
  const keys = refs.map((entry) => refKey(entry.ref)).join(',')

  useEffect(() => {
    let cancelled = false
    for (const { ref } of refs) {
      const key = refKey(ref)
      setStates((previous) =>
        previous[key]?.status === 'ok' ? previous : { ...previous, [key]: { status: 'loading' } }
      )
      fetchRef(ref)
        .then((item) => {
          if (!cancelled) setStates((previous) => ({ ...previous, [key]: { status: 'ok', item } }))
        })
        .catch((error) => {
          if (!cancelled)
            setStates((previous) => ({
              ...previous,
              [key]: { status: 'error', message: String(error?.message || error) }
            }))
        })
    }
    return () => {
      cancelled = true
    }
    // Reload only when the set of references changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  return (
    <div className="space-y-1.5">
      {refs.map(({ ref, linked }) => {
        const key = refKey(ref)
        const state = states[key]
        const remove =
          linked && onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(ref)}
              className="p-1 opacity-50 hover:opacity-100"
              title="Unlink"
              aria-label={`Unlink ${formatRef(ref, defaultRepo)}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1"
              style={{ color: 'var(--color-muted)' }}
              title="Mentioned in the task's text"
            >
              mention
            </span>
          )
        if (state?.status === 'ok') {
          return (
            <GitHubItemRow
              key={key}
              item={state.item}
              defaultRepo={defaultRepo}
              actions={remove}
              compact
            />
          )
        }
        return (
          <div
            key={key}
            className="flex items-center gap-2 px-2.5 py-2 border rounded-md text-xs"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          >
            {state?.status === 'error' ? (
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--color-warning)' }}
              />
            ) : (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            )}
            <button
              type="button"
              onClick={() => openExternal(refUrl(ref))}
              className="font-mono font-bold hover:underline"
              style={{ color: 'var(--color-text)' }}
            >
              {formatRef(ref, defaultRepo)}
            </button>
            <ExternalLink className="w-3 h-3" />
            {state?.status === 'error' && (
              <span className="flex-1 truncate" title={state.message}>
                {state.message}
              </span>
            )}
            <span className="flex-1" />
            {remove}
          </div>
        )
      })}
    </div>
  )
}
