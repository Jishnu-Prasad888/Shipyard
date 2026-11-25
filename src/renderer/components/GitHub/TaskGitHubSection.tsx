import React, { useEffect, useMemo, useState } from 'react'
import { Github, Link2, Loader2, Plus, Search } from 'lucide-react'
import {
  formatRef,
  GitHubItem,
  GitHubRef,
  listIssues,
  listPullRequests,
  parseSingleReference,
  refKey,
  taskReferences
} from '../../lib/github'
import { GitHubItemRow, GitHubRefList } from './GitHubItems'

interface Props {
  title: string
  description: string
  notes: string
  links: GitHubRef[]
  onChangeLinks: (links: GitHubRef[]) => void
  /** The project's linked repository (owner/repo), if any. */
  repo: string | null
}

/**
 * GitHub issues, pull requests and commits for a task: ones linked
 * explicitly plus ones mentioned in its title, description or notes.
 */
export const TaskGitHubSection: React.FC<Props> = ({
  title,
  description,
  notes,
  links,
  onChangeLinks,
  repo
}) => {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [browseItems, setBrowseItems] = useState<GitHubItem[] | null>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [browseFilter, setBrowseFilter] = useState('')

  // Mentions are read from the text only once typing pauses, so typing
  // "#1234" doesn't look up #1, #12 and #123 on the way.
  const [settledText, setSettledText] = useState({ title, description, notes })
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledText({ title, description, notes }), 800)
    return () => window.clearTimeout(timer)
  }, [title, description, notes])

  const refs = useMemo(
    () => taskReferences({ ...settledText, githubLinks: links }, repo),
    [settledText, links, repo]
  )
  const linkedKeys = new Set(links.map(refKey))

  const addRef = (ref: GitHubRef) => {
    if (linkedKeys.has(refKey(ref))) return
    onChangeLinks([...links, ref])
  }

  const handleAdd = () => {
    const ref = parseSingleReference(input, repo)
    if (!ref) {
      setInputError(
        repo
          ? 'Enter a GitHub link, #123, owner/repo#123 or a commit SHA'
          : 'Enter a GitHub link or owner/repo#123 (link a repository to the project to use #123)'
      )
      return
    }
    addRef(ref)
    setInput('')
    setInputError(null)
  }

  const openBrowser = async () => {
    if (!repo) return
    setBrowsing(true)
    setBrowseError(null)
    try {
      const [issues, pulls] = await Promise.all([listIssues(repo), listPullRequests(repo)])
      setBrowseItems(
        [...pulls, ...issues].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      )
    } catch (error: any) {
      setBrowseError(String(error?.message || error))
    }
  }

  const visibleBrowseItems = (browseItems || []).filter((item) => {
    if (linkedKeys.has(refKey(item.ref))) return false
    const q = browseFilter.trim().toLowerCase()
    if (!q) return true
    return (
      item.title.toLowerCase().includes(q) ||
      String(item.ref.number) === q.replace('#', '') ||
      item.author?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <label
        className="flex items-center gap-2 text-sm font-semibold mb-2"
        style={{ color: 'var(--color-text)' }}
      >
        <Github className="w-4 h-4" />
        GitHub
        {repo && (
          <span
            className="text-[10px] font-mono font-normal"
            style={{ color: 'var(--color-muted)' }}
          >
            {repo}
          </span>
        )}
      </label>

      {refs.length > 0 ? (
        <GitHubRefList
          refs={refs}
          defaultRepo={repo}
          onRemove={(ref) => onChangeLinks(links.filter((link) => refKey(link) !== refKey(ref)))}
        />
      ) : (
        <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
          Link issues, pull requests or commits, or mention them in the notes (e.g.{' '}
          <code>{repo ? '#12' : 'owner/repo#12'}</code>).
        </p>
      )}

      <div className="flex gap-2 mt-2">
        <div className="relative flex-1">
          <Link2
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--color-muted)' }}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setInputError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder={repo ? 'Paste a link, #123 or a commit SHA' : 'Paste a GitHub link'}
            className="aero-input w-full pl-8 pr-2 py-1.5 text-xs"
          />
        </div>
        <button type="button" onClick={handleAdd} className="btn-secondary text-xs px-3">
          <Plus className="w-3.5 h-3.5" /> Link
        </button>
        {repo && (
          <button
            type="button"
            onClick={() => (browsing ? setBrowsing(false) : void openBrowser())}
            className="btn-secondary text-xs px-3"
          >
            <Search className="w-3.5 h-3.5" /> {browsing ? 'Close' : 'Browse'}
          </button>
        )}
      </div>
      {inputError && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-alert, #d94c57)' }}>
          {inputError}
        </p>
      )}

      {browsing && (
        <div
          className="mt-2 p-2 border rounded-md space-y-1.5 max-h-72 overflow-y-auto"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
        >
          <input
            type="text"
            value={browseFilter}
            onChange={(e) => setBrowseFilter(e.target.value)}
            placeholder="Filter open issues and pull requests…"
            className="aero-input w-full px-2 py-1.5 text-xs"
            autoFocus
          />
          {browseError && (
            <p className="text-xs" style={{ color: 'var(--color-alert, #d94c57)' }}>
              {browseError}
            </p>
          )}
          {!browseItems && !browseError && (
            <div
              className="flex items-center gap-2 text-xs py-2"
              style={{ color: 'var(--color-muted)' }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading {repo}…
            </div>
          )}
          {browseItems && visibleBrowseItems.length === 0 && (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>
              Nothing open to link.
            </p>
          )}
          {visibleBrowseItems.map((item) => (
            <GitHubItemRow
              key={refKey(item.ref)}
              item={item}
              defaultRepo={repo}
              compact
              actions={
                <button
                  type="button"
                  onClick={() => addRef(item.ref)}
                  className="btn-secondary text-[10px] px-2 py-1 shrink-0"
                  title={`Link ${formatRef(item.ref, repo)}`}
                >
                  <Plus className="w-3 h-3" /> Link
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
