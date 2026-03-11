import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  X, Database, Moon, Sun, Key, RefreshCw, Upload,
  Download, CheckCircle, XCircle, Loader, Wifi, WifiOff, Package, Type
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

  // ── Font state ──
  const [fontFamily, setFontFamily] = useState<string>(settings.fontFamily || '')
  const [fontSearch, setFontSearch] = useState('')
  const [availableFonts, setAvailableFonts] = useState<string[]>([])
  const [fontsDetected, setFontsDetected] = useState(false)
  const fontListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadStatus()
    detectFonts()
  }, [])

  // ── System font detection via canvas ──
  const CANDIDATE_FONTS = [
    // Windows
    'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math',
    'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
    'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia',
    'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode',
    'Malgun Gothic', 'Microsoft Sans Serif', 'Palatino Linotype',
    'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Historic',
    'Sitka', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Yu Gothic', 'Cascadia Code', 'Cascadia Mono',
    // macOS
    'American Typewriter', 'Andale Mono', 'Arial Narrow', 'Avenir', 'Avenir Next',
    'Baskerville', 'Big Caslon', 'Bradley Hand', 'Brush Script MT',
    'Chalkboard SE', 'Chalkduster', 'Charter', 'Cochin', 'Copperplate',
    'Courier', 'Didot', 'Futura', 'Geneva', 'Gill Sans', 'Helvetica',
    'Helvetica Neue', 'Herculanum', 'Hoefler Text', 'Impact', 'Iowan Old Style',
    'Kefa', 'Lucida Grande', 'Luminari', 'Marker Felt', 'Menlo', 'Monaco',
    'Noteworthy', 'Optima', 'Palatino', 'Papyrus', 'Phosphate',
    'PT Mono', 'PT Sans', 'PT Serif', 'Rockwell', 'Savoye LET',
    'SignPainter', 'Skia', 'Snell Roundhand', 'Superclarendon', 'Thonburi',
    'Times', 'Trattatello', 'Zapfino',
    // Linux
    'Ubuntu', 'Ubuntu Mono', 'Ubuntu Condensed', 'Noto Sans', 'Noto Serif',
    'Noto Mono', 'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono',
    'Liberation Sans', 'Liberation Serif', 'Liberation Mono',
    'Cantarell', 'Droid Sans', 'Droid Serif', 'Droid Sans Mono',
    // Common Google / Popular fonts
    'Inter', 'Poppins', 'Raleway', 'Montserrat', 'Open Sans', 'Roboto',
    'Lato', 'Oswald', 'Source Sans Pro', 'Source Code Pro', 'Noto Sans',
    'Merriweather', 'Playfair Display', 'Nunito', 'Fira Code', 'Fira Sans',
    'JetBrains Mono', 'IBM Plex Mono', 'IBM Plex Sans', 'IBM Plex Serif',
    'Inconsolata', 'Hack', 'Iosevka', 'Roboto Mono', 'Space Mono',
    'Overpass', 'Overpass Mono', 'Anonymous Pro'
  ]

  const detectFonts = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const test = 'mmmmmmmmmmlli'
    const size = '72px'
    const bases = ['monospace', 'sans-serif', 'serif']
    const baseWidth: Record<string, number> = {}
    for (const base of bases) {
      ctx.font = `${size} ${base}`
      baseWidth[base] = ctx.measureText(test).width
    }
    const found = [...new Set(CANDIDATE_FONTS)].filter(font => {
      for (const base of bases) {
        ctx.font = `${size} '${font}', ${base}`
        if (ctx.measureText(test).width !== baseWidth[base]) return true
      }
      return false
    })
    setAvailableFonts(found.sort((a, b) => a.localeCompare(b)))
    setFontsDetected(true)
  }

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
      const updatedSettings = { theme, firebaseEnabled, syncEnabled, firebaseConfig, fontFamily: fontFamily || undefined }
      const result = await window.electron.settings.save(updatedSettings)
      dispatch(setSettings({ theme, firebaseEnabled, syncEnabled, firebaseConfig, fontFamily: fontFamily || undefined }))

      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
        window.electron.darkMode.toggle(true)
      } else {
        document.documentElement.classList.remove('dark')
        window.electron.darkMode.toggle(false)
      }

      // Apply font immediately
      if (fontFamily) {
        document.documentElement.style.setProperty('--font-ui', `'${fontFamily}', system-ui, sans-serif`)
      } else {
        document.documentElement.style.removeProperty('--font-ui')
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

  // ── Filtered font list (must be at top level — no hooks inside JSX) ──
  const filteredFonts = useMemo(
    () => availableFonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase())),
    [availableFonts, fontSearch]
  )

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

          {/* ── TYPOGRAPHY ── */}
          <div className="p-4 border-2" style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}>
            <h3 className="font-black text-[10px] uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <Type className="w-3.5 h-3.5" />
              Typography
            </h3>

            {!fontsDetected ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                <Loader className="w-3.5 h-3.5 animate-spin" /> Scanning system fonts…
              </div>
            ) : (
              <div className="space-y-3">
                {/* Current font preview */}
                <div
                  className="px-3 py-2 border-2 text-center"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>Preview</p>
                  <p
                    className="text-base"
                    style={{
                      fontFamily: fontFamily ? `'${fontFamily}', system-ui` : 'inherit',
                      color: 'var(--color-text)'
                    }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    {fontFamily || 'Default (Poppins / Inter / system-ui)'}
                  </p>
                </div>

                {/* Search */}
                <input
                  type="text"
                  value={fontSearch}
                  onChange={e => setFontSearch(e.target.value)}
                  placeholder={`Search ${availableFonts.length} system fonts…`}
                  className="w-full px-3 py-2 border-2 text-xs font-bold outline-none"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-background)',
                    color: 'var(--color-text)'
                  }}
                />

                {/* Font list */}
                <div
                  ref={fontListRef}
                  className="border-2 overflow-auto"
                  style={{ borderColor: 'var(--color-border)', maxHeight: '200px' }}
                >
                  {/* Reset to default option */}
                  <button
                    onClick={() => setFontFamily('')}
                    className="w-full text-left px-3 py-2 border-b flex items-center justify-between transition-all"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: fontFamily === '' ? 'var(--color-primary)' : 'transparent',
                      color: fontFamily === '' ? 'white' : 'var(--color-muted)'
                    }}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">Default (System)</span>
                    {fontFamily === '' && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
                  </button>

                  {/* Filtered & sorted font list */}
                  {filteredFonts.map(font => (
                    <button
                      key={font}
                      onClick={() => setFontFamily(font)}
                      className="w-full text-left px-3 py-2 border-b flex items-center justify-between group transition-all"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: fontFamily === font ? 'var(--color-primary)' : 'transparent',
                        color: fontFamily === font ? 'white' : 'var(--color-text)'
                      }}
                      onMouseOver={e => { if (fontFamily !== font) e.currentTarget.style.background = 'var(--color-primary-soft)' }}
                      onMouseOut={e => { if (fontFamily !== font) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontFamily: `'${font}', system-ui`, fontSize: '14px' }}>{font}</span>
                      {fontFamily === font && <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'white' }} />}
                    </button>
                  ))}

                  {filteredFonts.length === 0 && (
                    <p className="text-center text-xs py-4" style={{ color: 'var(--color-muted)' }}>No fonts match "{fontSearch}"</p>
                  )}

                </div>
                <p className="text-[9px] font-bold" style={{ color: 'var(--color-muted)' }}>
                  {availableFonts.length} fonts detected on your system · Click Save Settings to apply
                </p>
              </div>
            )}
          </div>


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
