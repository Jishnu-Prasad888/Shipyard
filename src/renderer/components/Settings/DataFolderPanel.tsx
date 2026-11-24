import React, { useEffect, useState } from 'react'
import { Copy, FolderOpen, Globe, HardDrive, Loader, RefreshCw, Share2 } from 'lucide-react'
import type { ShareStatus, SourceStatus } from '../../types/source'

const errorText = (err: unknown): string =>
  typeof err === 'string' ? err : (err as Error)?.message || 'Something went wrong'

const randomToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')

/** Settings section for the open data folder and network sharing. */
export const DataFolderPanel: React.FC = () => {
  const [source, setSource] = useState<SourceStatus | null>(null)
  const [share, setShare] = useState<ShareStatus | null>(null)
  const [port, setPort] = useState('')
  const [token, setToken] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const applyShare = (next: ShareStatus): void => {
    setShare(next)
    setPort(String(next.port))
    setToken(next.token)
    setReadOnly(next.readOnly)
  }

  useEffect(() => {
    void window.electron.source.status().then(setSource)
    void window.electron.share.status().then(applyShare)
  }, [])

  const active = source?.active
  const isLocal = active?.kind === 'local'

  const switchFolder = async (): Promise<void> => {
    await window.electron.source.close()
    window.location.reload()
  }

  const toggleShare = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (share?.running) {
        applyShare(await window.electron.share.stop())
      } else {
        const portNumber = Number(port)
        if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
          throw new Error('Port must be a number between 1 and 65535')
        }
        applyShare(await window.electron.share.start({ port: portNumber, token, readOnly }))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (label: string, value: string): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(null), 1500)
  }

  const muted = { color: 'var(--color-muted)' }
  const inputStyle = {
    borderColor: 'var(--color-border)',
    background: 'var(--color-background)',
    color: 'var(--color-text)'
  }

  return (
    <div
      className="aero-panel"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b-2"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
      >
        <h3
          className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
          style={muted}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Data Folder
        </h3>
        {source?.portable && (
          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 border">
            Portable
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          {isLocal ? (
            <HardDrive className="w-5 h-5 shrink-0" />
          ) : (
            <Globe className="w-5 h-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black truncate">{active?.label || 'No folder open'}</p>
            <p className="text-[10px] font-semibold truncate" style={muted}>
              {active?.kind === 'local'
                ? active.path
                : active?.kind === 'remote'
                  ? `Shared from ${active.address}`
                  : ''}
            </p>
          </div>
          {active?.kind === 'local' && (
            <button
              className="btn-secondary text-xs"
              onClick={() => window.electron.export.openItem(active.path)}
            >
              Show files
            </button>
          )}
          <button className="btn-secondary text-xs" onClick={switchFolder}>
            Switch folder
          </button>
        </div>

        {isLocal && share && (
          <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start gap-3">
              <Share2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-black uppercase tracking-wider">Share on network</p>
                <p className="text-[10px] font-bold mt-0.5" style={muted}>
                  Lets Shipyard on other computers open this folder by IP address. Anyone with the
                  token can {readOnly ? 'read' : 'read and change'} it. Traffic is not encrypted, so
                  only share on networks you trust or over a VPN.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest" style={muted}>
                  Port
                </span>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                  disabled={share.running}
                  className="aero-input w-full px-3 py-2 text-xs font-semibold outline-none"
                  style={inputStyle}
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest" style={muted}>
                  Access token
                </span>
                <div className="flex gap-1">
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value.trim())}
                    disabled={share.running}
                    className="aero-input w-full px-3 py-2 text-xs font-mono outline-none"
                    style={inputStyle}
                  />
                  <button
                    className="btn-secondary p-2"
                    title="New token"
                    disabled={share.running}
                    onClick={() => setToken(randomToken())}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="btn-secondary p-2"
                    title="Copy token"
                    onClick={() => copy('token', token)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={readOnly}
                disabled={share.running}
                onChange={(e) => setReadOnly(e.target.checked)}
              />
              Read-only (others can view but not edit)
            </label>

            {share.running && (
              <div
                className="flex items-center gap-2 px-3 py-2 border text-xs font-semibold"
                style={{ borderColor: 'var(--color-primary)' }}
              >
                <span className="flex-1">
                  Connect from other computers with{' '}
                  <code className="font-black">
                    {share.address || `this computer's IP:${share.port}`}
                  </code>
                </span>
                {share.address && (
                  <button
                    className="btn-secondary p-1.5"
                    title="Copy address"
                    onClick={() => copy('address', share.address!)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {copied && (
              <p className="text-[10px] font-bold" style={muted}>
                Copied {copied}
              </p>
            )}
            {(error || share.error) && (
              <p className="text-[10px] font-bold" style={{ color: '#dc2626' }}>
                {error || share.error}
              </p>
            )}

            <button
              className={`${share.running ? 'btn-secondary' : 'btn-primary'} w-full flex items-center justify-center gap-2 py-2.5 text-xs`}
              onClick={toggleShare}
              disabled={busy || (!share.running && !token)}
            >
              {busy && <Loader className="w-4 h-4 animate-spin" />}
              {share.running ? 'Stop sharing' : 'Start sharing'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
