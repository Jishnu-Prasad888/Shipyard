import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CheckCircle2, Eye, EyeOff, Github, Loader2, XCircle } from 'lucide-react'
import { RootState } from '../../store'
import { setSettings } from '../../store/settingsSlice'
import { fetchViewer, openExternal, setGitHubToken } from '../../lib/github'

/**
 * GitHub token for this device. Without one, public repositories still work
 * (GitHub allows 60 requests an hour); a token raises that to 5,000 and gives
 * access to private repositories the token can read.
 */
export const GitHubSettingsPanel: React.FC = () => {
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)
  const [token, setToken] = useState(settings.githubToken || '')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'ok'; message: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const save = async (value: string) => {
    const next = { ...settings, githubToken: value.trim() || undefined }
    await window.electron.settings.save(next)
    dispatch(setSettings(next))
    setGitHubToken(value)
  }

  const saveAndTest = async () => {
    setStatus({ kind: 'busy' })
    try {
      await save(token)
      if (!token.trim()) {
        setStatus({ kind: 'ok', message: 'Token removed. Public repositories still work.' })
        return
      }
      const login = await fetchViewer()
      setStatus({ kind: 'ok', message: `Connected as ${login}` })
    } catch (error: any) {
      setStatus({ kind: 'error', message: String(error?.message || error) })
    }
  }

  return (
    <div
      className="aero-panel"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Github className="w-4 h-4" />
        <span className="font-black text-xs uppercase tracking-wider">GitHub</span>
      </div>
      <div className="p-4 space-y-3 text-xs">
        <p style={{ color: 'var(--color-muted)' }}>
          Link a repository to a project (Edit Project › GitHub repository) to see its issues, pull
          requests and commits, and to mention them in tasks as <code>#123</code>. Public
          repositories work without a token, but GitHub then allows only 60 requests an hour.
        </p>
        <label className="block font-black uppercase tracking-wider text-[10px]">
          Personal access token
        </label>
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            spellCheck={false}
            className="aero-input flex-1 px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            className="btn-secondary px-2"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? 'Hide token' : 'Show token'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p style={{ color: 'var(--color-muted)' }}>
          Create a fine-grained token with read-only access to <em>Issues</em>,{' '}
          <em>Pull requests</em>, <em>Contents</em> and <em>Metadata</em> for the repositories you
          use.{' '}
          <button
            type="button"
            className="underline"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => openExternal('https://github.com/settings/personal-access-tokens/new')}
          >
            Create a token
          </button>
          . It is stored only on this computer, in Shipyard&apos;s settings file.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-primary text-xs"
            onClick={saveAndTest}
            disabled={status.kind === 'busy'}
          >
            {status.kind === 'busy' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save and test
          </button>
          {settings.githubToken && (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                setToken('')
                void save('').then(() =>
                  setStatus({
                    kind: 'ok',
                    message: 'Token removed. Public repositories still work.'
                  })
                )
              }}
            >
              Remove token
            </button>
          )}
        </div>
        {status.kind === 'ok' && (
          <p
            className="flex items-center gap-1.5"
            style={{ color: 'var(--color-success, #1a7f37)' }}
          >
            <CheckCircle2 className="w-4 h-4" /> {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p className="flex items-center gap-1.5" style={{ color: 'var(--color-alert, #d94c57)' }}>
            <XCircle className="w-4 h-4" /> {status.message}
          </p>
        )}
      </div>
    </div>
  )
}
