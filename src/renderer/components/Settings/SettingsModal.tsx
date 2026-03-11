import React, { useState, useEffect } from 'react'
import {
  X, Database, Moon, Sun, Key, RefreshCw, Upload,
  Download, CheckCircle, XCircle, Loader, Wifi, WifiOff, Package
} from 'lucide-react'
import { FirebaseConfig } from './FirebaseConfig'
import { ExportModal } from './ExportModal'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store'
import { setSettings } from '../../store/settingsSlice'

interface SettingsModalProps {
  onClose: () => void
}

type SyncOp = 'idle' | 'saving' | 'testing' | 'pushing' | 'pulling'

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  const [theme, setTheme] = useState(settings.theme)
  const [firebaseEnabled, setFirebaseEnabled] = useState(settings.firebaseEnabled || false)
  const [syncEnabled, setSyncEnabled] = useState(settings.syncEnabled || false)
  const [firebaseConfig, setFirebaseConfig] = useState<any>(settings.firebaseConfig || {})

  const [op, setOp] = useState<SyncOp>('idle')
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [saved, setSaved] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const status = await window.electron.sync.status()
      setSyncStatus(status)
    } catch {}
  }

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    setTimeout(() => setFeedback(null), 5000)
  }

  const handleSave = async () => {
    setOp('saving')
    try {
      const updatedSettings = { theme, firebaseEnabled, syncEnabled, firebaseConfig }
      const result = await window.electron.settings.save(updatedSettings)
      dispatch(setSettings({ theme, firebaseEnabled, syncEnabled, firebaseConfig }))

      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
        window.electron.darkMode.toggle(true)
      } else {
        document.documentElement.classList.remove('dark')
        window.electron.darkMode.toggle(false)
      }

      // If settings:save returned an _initResult, show it
      if (result?._initResult) {
        showFeedback(result._initResult.success, result._initResult.message)
      } else {
        showFeedback(true, 'Settings saved')
      }

      setSaved(true)
      await loadStatus()
    } catch (err: any) {
      showFeedback(false, err?.message || 'Failed to save')
    } finally {
      setOp('idle')
    }
  }

  const handleTest = async () => {
    setOp('testing')
    setFeedback(null)
    try {
      // Save first so the main process has the latest config
      await window.electron.settings.save({ theme, firebaseEnabled: true, syncEnabled, firebaseConfig })
      const result = await window.electron.sync.test()
      showFeedback(result.success, result.message)
    } catch (err: any) {
      showFeedback(false, err?.message || 'Test failed')
    } finally {
      setOp('idle')
    }
  }

  const handlePush = async () => {
    setOp('pushing')
    setFeedback(null)
    try {
      const result = await window.electron.sync.push()
      showFeedback(result.success, result.message)
      await loadStatus()
    } catch (err: any) {
      showFeedback(false, err?.message || 'Push failed')
    } finally {
      setOp('idle')
    }
  }

  const handlePull = async () => {
    setOp('pulling')
    setFeedback(null)
    try {
      const result = await window.electron.sync.pull()
      showFeedback(result.success, result.message + (result.counts ? ` (${JSON.stringify(result.counts)})` : ''))
      await loadStatus()
    } catch (err: any) {
      showFeedback(false, err?.message || 'Pull failed')
    } finally {
      setOp('idle')
    }
  }

  const isLoading = op !== 'idle'


  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <div
      className="w-10 h-6 border-2 relative transition-all duration-100 cursor-pointer shrink-0"
      style={{
        borderColor: value ? 'var(--color-primary)' : 'var(--color-border)',
        background: value ? 'var(--color-primary)' : 'transparent',
        boxShadow: value ? 'var(--shadow-brutal-sm)' : 'none'
      }}
      onClick={onChange}
    >
      <div
        className="absolute top-0.5 w-4 h-4 border transition-all duration-150"
        style={{
          left: value ? '18px' : '2px',
          background: value ? 'white' : 'var(--color-muted)',
          borderColor: 'var(--color-border-strong)'
        }}
      />
    </div>
  )

  const configComplete = firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.authDomain

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col animate-brutal-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '4px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal-lg)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b-4 shrink-0"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h2 className="text-base font-black text-white uppercase tracking-wider">Settings</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-white text-white flex items-center justify-center hover:bg-white/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">

          {/* ── APPEARANCE ── */}
          <div className="p-4 border-2" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}>
            <h3 className="font-black text-[10px] uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              {theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              Appearance
            </h3>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 px-4 py-2 border-2 cursor-pointer font-black text-xs uppercase tracking-wider transition-all duration-100"
                  style={{
                    borderColor: theme === t ? 'var(--color-primary)' : 'var(--color-border)',
                    background: theme === t ? 'var(--color-primary)' : 'transparent',
                    color: theme === t ? 'white' : 'var(--color-text)',
                    boxShadow: theme === t ? 'var(--shadow-brutal-sm)' : 'none'
                  }}
                >
                  <input type="radio" checked={theme === t} onChange={() => setTheme(t)} className="sr-only" />
                  {t === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* ── FIREBASE SYNC ── */}
          <div className="border-2" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}>
            {/* Firebase header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b-2"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
            >
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
                <Key className="w-3.5 h-3.5" />
                Firebase Sync
              </h3>

              {/* Connection badge */}
              {syncStatus && (
                <div className="flex items-center gap-1.5">
                  {syncStatus.syncEnabled ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} />
                      <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Not connected</span>
                    </>
                  )}
                  {syncStatus.unsyncedCount > 0 && (
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 border"
                      style={{ borderColor: '#d97706', color: '#d97706', background: '#d9770615' }}
                    >
                      {syncStatus.unsyncedCount} pending
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Enable toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <Toggle value={firebaseEnabled} onChange={() => setFirebaseEnabled(!firebaseEnabled)} />
                <div>
                  <span className="font-black text-xs uppercase tracking-wider">Enable Firebase</span>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    Sync your data across devices via Firestore
                  </p>
                </div>
              </label>

              {/* Config fields */}
              {firebaseEnabled && (
                <div className="space-y-3">
                  <FirebaseConfig config={firebaseConfig} onConfigChange={setFirebaseConfig} />

                  {/* Auto-sync toggle */}
                  {configComplete && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <Toggle value={syncEnabled} onChange={() => setSyncEnabled(!syncEnabled)} />
                      <div>
                        <span className="font-black text-xs uppercase tracking-wider">Auto-Sync (every 60s)</span>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          Automatically push local changes to Firebase
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Action buttons */}
                  {configComplete && (
                    <div className="pt-2 border-t-2 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                        Manual Actions
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {/* Test */}
                        <button
                          onClick={handleTest}
                          disabled={isLoading}
                          className="flex flex-col items-center gap-1 px-3 py-3 border-2 text-xs font-black uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
                          style={{
                            borderColor: 'var(--color-cyan)',
                            color: 'var(--color-cyan)',
                            background: 'var(--color-cyan)10',
                            boxShadow: '2px 2px 0 var(--color-cyan)'
                          }}
                          onMouseOver={e => { if (!isLoading) e.currentTarget.style.transform = 'translate(-1px,-1px)' }}
                          onMouseOut={e => { e.currentTarget.style.transform = '' }}
                        >
                          {op === 'testing' ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Test
                        </button>

                        {/* Push */}
                        <button
                          onClick={handlePush}
                          disabled={isLoading}
                          className="flex flex-col items-center gap-1 px-3 py-3 border-2 text-xs font-black uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
                          style={{
                            borderColor: 'var(--color-primary)',
                            color: 'var(--color-primary)',
                            background: 'var(--color-primary)10',
                            boxShadow: '2px 2px 0 var(--color-primary)'
                          }}
                          onMouseOver={e => { if (!isLoading) e.currentTarget.style.transform = 'translate(-1px,-1px)' }}
                          onMouseOut={e => { e.currentTarget.style.transform = '' }}
                        >
                          {op === 'pushing' ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          Push
                        </button>

                        {/* Pull */}
                        <button
                          onClick={handlePull}
                          disabled={isLoading}
                          className="flex flex-col items-center gap-1 px-3 py-3 border-2 text-xs font-black uppercase tracking-wider transition-all duration-100 disabled:opacity-40"
                          style={{
                            borderColor: 'var(--color-violet)',
                            color: 'var(--color-violet)',
                            background: 'var(--color-violet)10',
                            boxShadow: '2px 2px 0 var(--color-violet)'
                          }}
                          onMouseOver={e => { if (!isLoading) e.currentTarget.style.transform = 'translate(-1px,-1px)' }}
                          onMouseOut={e => { e.currentTarget.style.transform = '' }}
                        >
                          {op === 'pulling' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Pull
                        </button>
                      </div>

                      <p className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                        <strong>Push</strong> — upload local changes · <strong>Pull</strong> — download from Firebase · Save first!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback banner */}
              {feedback && (
                <div
                  className="flex items-center gap-2 px-3 py-2 border-2 text-xs font-bold animate-brutal-in"
                  style={{
                    borderColor: feedback.ok ? '#059669' : '#dc2626',
                    background: feedback.ok ? '#05966910' : '#dc262610',
                    color: feedback.ok ? '#059669' : '#dc2626'
                  }}
                >
                  {feedback.ok
                    ? <CheckCircle className="w-4 h-4 shrink-0" />
                    : <XCircle className="w-4 h-4 shrink-0" />
                  }
                  <span className="break-all">{feedback.msg}</span>
                </div>
              )}

              {/* Last sync info */}
              {syncStatus?.lastSyncTime && (
                <p className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                  Last sync: {new Date(syncStatus.lastSyncTime).toLocaleTimeString()}
                  {syncStatus.lastSyncResult && ` — ${syncStatus.lastSyncResult.message}`}
                </p>
              )}
            </div>
          </div>

          {/* ── DATA EXPORT ── */}
          <div className="border-2" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}>
            <div
              className="flex items-center gap-2 px-4 py-3 border-b-2"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
            >
              <Package className="w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} />
              <h3 className="font-black text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>Export Data</h3>
            </div>
            <div className="p-4">
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-muted)' }}>
                Export your Ports, Docks, Ships, Manifests and Cargo to JSON, CSV, or Markdown.
                The export wizard lets you pick exactly which items to include.
              </p>
              <button
                onClick={() => setShowExportModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 font-black text-xs uppercase tracking-wider transition-all duration-100"
                style={{
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)',
                  background: 'var(--color-primary)10',
                  boxShadow: '2px 2px 0 var(--color-primary)'
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)' }}
                onMouseOut={e => { e.currentTarget.style.transform = '' }}
              >
                <Download className="w-4 h-4" />
                Open Export Wizard
              </button>
            </div>
          </div>



          {/* ── DATABASE INFO ── */}
          <div className="p-4 border-2" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}>
            <h3 className="font-black text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <Database className="w-3.5 h-3.5" />
              Storage
            </h3>
            <p className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
              Data is stored locally via SQLite. Firebase sync is optional — set up a Firestore database and paste the Web SDK config above.
            </p>
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-[10px] font-black uppercase tracking-wider underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Open Firebase Console →
            </a>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-5 py-3 border-t-4 shrink-0"
          style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-background)' }}
        >
          <button onClick={onClose} className="btn-secondary text-xs uppercase tracking-wider">
            {saved ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="btn-primary text-xs uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
          >
            {op === 'saving' ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Settings
          </button>
        </div>
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  )
}
