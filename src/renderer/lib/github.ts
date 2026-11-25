/**
 * GitHub integration: finding issue / pull request / commit references in
 * task text, and reading them (plus repository activity) from the GitHub API.
 *
 * Reference forms understood:
 *   https://github.com/owner/repo/issues/12     (also /pull/12, /commit/<sha>)
 *   owner/repo#12                               issue or pull request
 *   owner/repo@1a2b3c4                          commit (7–40 hex characters)
 *   #12                                         in the project's linked repo
 */

export type GitHubRefKind = 'issue' | 'commit'

export interface GitHubRef {
  kind: GitHubRefKind
  /** owner/repo */
  repo: string
  /** Issue or pull request number. */
  number?: number
  /** Commit SHA as written (7–40 characters). */
  sha?: string
}

const REPO = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}'
const REPO_RE = new RegExp(`^${REPO}$`)

export const isValidRepo = (value: string): boolean =>
  REPO_RE.test(value.trim()) && !value.trim().endsWith('.git')

/** Accepts owner/repo, a github.com URL, or a clone URL; returns owner/repo. */
export const normalizeRepo = (value: string): string | null => {
  let v = value.trim()
  if (!v) return null
  v = v.replace(/^git@github\.com:/i, '')
  v = v.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
  v = v.replace(/\.git$/i, '').replace(/\/+$/, '')
  const [owner, repo] = v.split('/')
  if (!owner || !repo) return null
  const candidate = `${owner}/${repo}`
  return isValidRepo(candidate) ? candidate : null
}

export const refKey = (ref: GitHubRef): string =>
  ref.kind === 'commit'
    ? `${ref.repo.toLowerCase()}@${(ref.sha || '').toLowerCase()}`
    : `${ref.repo.toLowerCase()}#${ref.number}`

export const formatRef = (ref: GitHubRef, defaultRepo?: string | null): string => {
  const sameRepo = !!defaultRepo && defaultRepo.toLowerCase() === ref.repo.toLowerCase()
  if (ref.kind === 'commit')
    return `${sameRepo ? '' : ref.repo + '@'}${(ref.sha || '').slice(0, 7)}`
  return `${sameRepo ? '' : ref.repo}#${ref.number}`
}

export const refUrl = (ref: GitHubRef): string =>
  ref.kind === 'commit'
    ? `https://github.com/${ref.repo}/commit/${ref.sha}`
    : `https://github.com/${ref.repo}/issues/${ref.number}`

/** Plain text of note HTML, so tag attributes (colors etc.) are not scanned. */
const textOf = (value: string): string =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))

/** Finds GitHub references in text (HTML is fine), without duplicates. */
export const parseGitHubReferences = (text: string, defaultRepo?: string | null): GitHubRef[] => {
  const found = new Map<string, GitHubRef>()
  const add = (ref: GitHubRef) => {
    if (!isValidRepo(ref.repo)) return
    if (ref.kind === 'issue' && (!ref.number || ref.number <= 0)) return
    const key = refKey(ref)
    if (!found.has(key)) found.set(key, ref)
  }
  // URLs are read from the raw value so links' hrefs count too.
  const urlRe = new RegExp(
    `https?://(?:www\\.)?github\\.com/(${REPO})/(issues|pull|commit)/([0-9a-fA-F]+)`,
    'g'
  )
  for (const m of text.matchAll(urlRe)) {
    if (m[2] === 'commit') {
      if (/^[0-9a-fA-F]{7,40}$/.test(m[3])) add({ kind: 'commit', repo: m[1], sha: m[3] })
    } else if (/^\d+$/.test(m[3])) {
      add({ kind: 'issue', repo: m[1], number: Number(m[3]) })
    }
  }

  // Short forms only in visible text, with URLs removed so they are not
  // matched a second time.
  const plain = textOf(text).replace(/https?:\/\/\S+/g, ' ')
  const qualified = new RegExp(`(?:^|[^\\w/.-])(${REPO})(?:#(\\d+)|@([0-9a-fA-F]{7,40}))\\b`, 'g')
  for (const m of plain.matchAll(qualified)) {
    if (m[2]) add({ kind: 'issue', repo: m[1], number: Number(m[2]) })
    else if (m[3]) add({ kind: 'commit', repo: m[1], sha: m[3] })
  }
  if (defaultRepo && isValidRepo(defaultRepo)) {
    for (const m of plain.matchAll(/(?:^|[\s([{,;:])#(\d{1,7})\b/g)) {
      add({ kind: 'issue', repo: defaultRepo, number: Number(m[1]) })
    }
  }
  return [...found.values()]
}

/** Parses a single reference typed by the user (also accepts #12 or a bare SHA). */
export const parseSingleReference = (
  input: string,
  defaultRepo?: string | null
): GitHubRef | null => {
  const value = input.trim()
  if (!value) return null
  if (defaultRepo && /^[0-9a-fA-F]{7,40}$/.test(value) && /[a-fA-F]/.test(value)) {
    return { kind: 'commit', repo: defaultRepo, sha: value }
  }
  if (defaultRepo && /^#?\d+$/.test(value)) {
    return { kind: 'issue', repo: defaultRepo, number: Number(value.replace('#', '')) }
  }
  return parseGitHubReferences(value, defaultRepo)[0] ?? null
}

// ── API ──────────────────────────────────────────────────────────────

export interface GitHubItem {
  ref: GitHubRef
  title: string
  url: string
  /** open / closed / merged for issues and PRs; undefined for commits. */
  state?: 'open' | 'closed' | 'merged'
  isPullRequest: boolean
  draft?: boolean
  author?: string
  updatedAt?: string
  comments?: number
  labels?: { name: string; color: string }[]
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

const API = 'https://api.github.com'
const CACHE_MS = 2 * 60 * 1000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

let currentToken = ''

/** Sets the personal access token used for requests ('' for anonymous). */
export const setGitHubToken = (token: string | undefined | null): void => {
  const next = (token || '').trim()
  if (next !== currentToken) cache.clear()
  currentToken = next
}

export const hasGitHubToken = (): boolean => currentToken.length > 0

const describeError = (status: number, body: any, remaining: string | null): string => {
  if (status === 401) return 'GitHub rejected the token. Check it in Settings › GitHub.'
  if ((status === 403 || status === 429) && remaining === '0') {
    return currentToken
      ? 'GitHub rate limit reached. Try again in a few minutes.'
      : 'GitHub rate limit reached. Add a token in Settings › GitHub for a much higher limit.'
  }
  if (status === 404) {
    return currentToken
      ? 'Not found on GitHub (or the token cannot see this repository).'
      : 'Not found on GitHub. Private repositories need a token in Settings › GitHub.'
  }
  return body?.message ? `GitHub: ${body.message}` : `GitHub request failed (HTTP ${status})`
}

const request = async <T>(path: string, { fresh = false } = {}): Promise<T> => {
  const key = `${currentToken ? 'auth' : 'anon'} ${path}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`

  const value = (async () => {
    let response: Response
    try {
      response = await fetch(`${API}${path}`, { headers })
    } catch {
      throw new GitHubError('Could not reach GitHub. Check your internet connection.')
    }
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new GitHubError(
        describeError(response.status, body, response.headers.get('x-ratelimit-remaining')),
        response.status
      )
    }
    return body as T
  })()
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

const issueToItem = (repo: string, raw: any, merged?: boolean): GitHubItem => {
  const isPullRequest = !!raw.pull_request || raw.merged_at !== undefined
  const state: GitHubItem['state'] =
    merged || raw.merged_at || raw.pull_request?.merged_at
      ? 'merged'
      : raw.state === 'closed'
        ? 'closed'
        : 'open'
  return {
    ref: { kind: 'issue', repo, number: raw.number },
    title: raw.title || `#${raw.number}`,
    url: raw.html_url || refUrl({ kind: 'issue', repo, number: raw.number }),
    state,
    isPullRequest,
    draft: !!raw.draft,
    author: raw.user?.login,
    updatedAt: raw.updated_at,
    comments: raw.comments,
    labels: (raw.labels || []).map((label: any) => ({
      name: label.name,
      color: `#${label.color || '888888'}`
    }))
  }
}

const enc = (repo: string): string => repo.split('/').map(encodeURIComponent).join('/')

/** Looks up an issue, pull request or commit. */
export const fetchRef = async (ref: GitHubRef): Promise<GitHubItem> => {
  if (ref.kind === 'commit') {
    const raw: any = await request(
      `/repos/${enc(ref.repo)}/commits/${encodeURIComponent(ref.sha || '')}`
    )
    const message: string = raw.commit?.message || ref.sha || ''
    return {
      ref: { ...ref, sha: raw.sha || ref.sha },
      title: message.split('\n')[0],
      url: raw.html_url || refUrl(ref),
      isPullRequest: false,
      author: raw.author?.login || raw.commit?.author?.name,
      updatedAt: raw.commit?.author?.date
    }
  }
  const raw: any = await request(`/repos/${enc(ref.repo)}/issues/${ref.number}`)
  // The issues endpoint marks merged PRs only via pull_request.merged_at.
  return issueToItem(ref.repo, raw)
}

export type IssueFilter = 'open' | 'closed' | 'all'

/** Issues (not pull requests) in a repository, most recently updated first. */
export const listIssues = async (
  repo: string,
  state: IssueFilter = 'open'
): Promise<GitHubItem[]> => {
  const rows: any[] = await request(
    `/repos/${enc(repo)}/issues?state=${state}&sort=updated&per_page=50`
  )
  return rows.filter((row) => !row.pull_request).map((row) => issueToItem(repo, row))
}

export const listPullRequests = async (
  repo: string,
  state: IssueFilter = 'open'
): Promise<GitHubItem[]> => {
  const rows: any[] = await request(
    `/repos/${enc(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=50`
  )
  return rows.map((row) => issueToItem(repo, { ...row, pull_request: {} }, !!row.merged_at))
}

export const listCommits = async (repo: string, limit = 30): Promise<GitHubItem[]> => {
  const rows: any[] = await request(`/repos/${enc(repo)}/commits?per_page=${limit}`)
  return rows.map((raw) => ({
    ref: { kind: 'commit' as const, repo, sha: raw.sha },
    title: String(raw.commit?.message || '').split('\n')[0],
    url: raw.html_url,
    isPullRequest: false,
    author: raw.author?.login || raw.commit?.author?.name,
    updatedAt: raw.commit?.author?.date
  }))
}

export interface RepoInfo {
  fullName: string
  description?: string
  url: string
  stars: number
  openIssues: number
  defaultBranch: string
  isPrivate: boolean
}

export const fetchRepo = async (repo: string): Promise<RepoInfo> => {
  const raw: any = await request(`/repos/${enc(repo)}`)
  return {
    fullName: raw.full_name,
    description: raw.description || undefined,
    url: raw.html_url,
    stars: raw.stargazers_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    defaultBranch: raw.default_branch,
    isPrivate: !!raw.private
  }
}

/** Checks the token; resolves to the GitHub login it belongs to. */
export const fetchViewer = async (): Promise<string> => {
  const raw: any = await request('/user', { fresh: true })
  return raw.login
}

// ── Task storage ──────────────────────────────────────────────────────

/** Explicitly linked references are stored on tasks as `githubLinks`. */
export const parseStoredLinks = (value: unknown): GitHubRef[] => {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.filter(
    (ref: any): ref is GitHubRef =>
      ref &&
      typeof ref.repo === 'string' &&
      isValidRepo(ref.repo) &&
      ((ref.kind === 'issue' && Number.isInteger(ref.number) && ref.number > 0) ||
        (ref.kind === 'commit' &&
          typeof ref.sha === 'string' &&
          /^[0-9a-fA-F]{7,40}$/.test(ref.sha)))
  )
}

/** Every reference of a task: linked ones first, then ones found in its text. */
export const taskReferences = (
  task: { title?: string; description?: string; notes?: string; githubLinks?: unknown },
  defaultRepo?: string | null
): { ref: GitHubRef; linked: boolean }[] => {
  const linked = parseStoredLinks(task.githubLinks)
  const seen = new Set(linked.map(refKey))
  const mentioned = parseGitHubReferences(
    [task.title, task.description, task.notes].filter(Boolean).join('\n'),
    defaultRepo
  ).filter((ref) => !seen.has(refKey(ref)))
  return [
    ...linked.map((ref) => ({ ref, linked: true })),
    ...mentioned.map((ref) => ({ ref, linked: false }))
  ]
}

/** Opens a URL in the system browser. */
export const openExternal = (url: string): void => {
  if (!/^https:\/\/github\.com\//.test(url)) return
  void window.electron.export.openItem(url)
}
