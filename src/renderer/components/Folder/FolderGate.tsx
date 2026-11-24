import React, { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Globe, HardDrive, Loader, RefreshCw, X } from 'lucide-react'
import type { Settings } from '@shared/types'
import type { SourceDescriptor, SourceStatus } from '../../types/source'

const errorText = (err: unknown): string =>
  typeof err === 'string' ? err : (err as Error)?.message || 'Something went wrong'

const describe = (source: SourceDescriptor): string =>
  source.kind === 'local' ? source.path : `Shared from ${source.address}`

/**
 * Shows the folder picker until a data folder (local or shared over the
 * network) is open, then renders the app.
 */
export const FolderGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SourceStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await window.electron.source.status())
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  useEffect(() => {
    void window.electron.settings.get().then((settings: Partial<Settings>) => {
      const dark = settings?.colorMode === 'dark' || settings?.theme === 'dark'
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('theme-clay', settings?.themeStyle === 'clay')
    })
    window.electron.source
      .status()
      .then(setStatus)
      .catch((err) => setError(errorText(err)))
  }, [])

  if (!status) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ color: 'var(--color-muted)' }}
      >
        {error ? <p className="text-sm">{error}</p> : <Loader className="w-5 h-5 animate-spin" />}
      </div>
    )
  }

  if (status.active && status.reachable) return <>{children}</>

  const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const openFolder = (): Promise<void> =>
    run('pick', async () => {
      const path = await window.electron.source.pickFolder()
      if (path) await window.electron.source.openLocal(path)
    })

  const openRecent = (source: SourceDescriptor): Promise<void> =>
    run(describe(source), async () => {
      if (source.kind === 'local') await window.electron.source.openLocal(source.path)
      else await window.electron.source.openRemote(source.address, source.token)
    })

  const connect = (e: React.FormEvent): void => {
    e.preventDefault()
    void run('remote', () => window.electron.source.openRemote(address, token))
  }

  const unreachable = status.active && !status.reachable ? status.active : null

  return (
    <div
      className="win7-theme aero-shell h-screen overflow-auto flex items-start justify-center p-8"
      style={{ background: 'var(--color-background)', color: 'var(--color-text)' }}
    >
      <div className="w-full max-w-xl space-y-5 my-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Open a folder</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Shipyard keeps your workspaces, projects and tasks as plain JSON files in a folder you
            choose. Pick an empty folder to start fresh, or one you have used before.
          </p>
        </div>

        {(error || unreachable) && (
          <div
            className="aero-panel p-3 text-xs font-semibold flex items-start gap-3"
            style={{ borderColor: '#dc2626', color: '#dc2626' }}
          >
            <span className="flex-1 break-words">
              {unreachable
                ? `Couldn't reach ${unreachable.label || describe(unreachable)}: ${status.error}`
                : error}
            </span>
            {unreachable && (
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={refresh}>
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
        )}

        <div className="aero-panel p-4 space-y-3">
          <button
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm"
            onClick={openFolder}
            disabled={!!busy}
          >
            {busy === 'pick' ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            Open folder…
          </button>

          {status.recent.length > 0 && (
            <div className="space-y-1">
              <p
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: 'var(--color-muted)' }}
              >
                Recent
              </p>
              {status.recent.map((source) => {
                const key = describe(source)
                return (
                  <div key={key} className="flex items-center gap-2">
                    <button
                      className="btn-secondary flex-1 flex items-center justify-start gap-3 px-3 py-2 text-left"
                      onClick={() => openRecent(source)}
                      disabled={!!busy}
                    >
                      {busy === key ? (
                        <Loader className="w-4 h-4 shrink-0 animate-spin" />
                      ) : source.kind === 'local' ? (
                        <HardDrive className="w-4 h-4 shrink-0" />
                      ) : (
                        <Globe className="w-4 h-4 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-black truncate">{source.label}</span>
                        <span
                          className="block text-[10px] truncate"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          {key}
                        </span>
                      </span>
                    </button>
                    <button
                      className="btn-secondary p-2"
                      title="Remove from recent"
                      onClick={() => run('forget', () => window.electron.source.forget(source))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <form className="aero-panel p-4 space-y-3" onSubmit={connect}>
          <div>
            <h2 className="text-sm font-black flex items-center gap-2">
              <Globe className="w-4 h-4" /> Connect to a shared folder
            </h2>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>
              Open a folder shared from another computer on your network. On that computer, open the
              folder and turn on <b>Settings › Data folder › Share on network</b>, or run{' '}
              <code>shipyard-serve &lt;folder&gt;</code>.
            </p>
          </div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="IP address, e.g. 192.168.1.20 or 192.168.1.20:7420"
            className="aero-input w-full px-3 py-2 text-xs font-semibold outline-none"
            style={{ background: 'var(--color-background)', color: 'var(--color-text)' }}
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token"
            className="aero-input w-full px-3 py-2 text-xs font-semibold outline-none font-mono"
            style={{ background: 'var(--color-background)', color: 'var(--color-text)' }}
          />
          <button
            type="submit"
            className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-xs"
            disabled={!!busy || !address.trim() || !token.trim()}
          >
            {busy === 'remote' && <Loader className="w-4 h-4 animate-spin" />}
            Connect
          </button>
        </form>
      </div>
    </div>
  )
}
