import React, { useState } from 'react'
import { X, Database, Moon, Sun, Key } from 'lucide-react'
import { FirebaseConfig } from './FirebaseConfig'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store'
import { setSettings } from '../../store/settingsSlice'

interface SettingsModalProps {
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  const [theme, setTheme] = useState(settings.theme)
  const [firebaseEnabled, setFirebaseEnabled] = useState(settings.firebaseEnabled || false)
  const [syncEnabled, setSyncEnabled] = useState(settings.syncEnabled || false)
  const [firebaseConfig, setFirebaseConfig] = useState(settings.firebaseConfig)

  const handleSave = async () => {
    const updatedSettings = {
      theme,
      firebaseEnabled,
      syncEnabled,
      firebaseConfig
    }

    await window.electron.settings.save(updatedSettings)
    dispatch(setSettings(updatedSettings))

    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      window.electron.darkMode.toggle(true)
    } else {
      document.documentElement.classList.remove('dark')
      window.electron.darkMode.toggle(false)
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div
        className="w-full max-w-lg animate-brutal-in"
        style={{
          background: 'var(--color-surface)',
          border: '4px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-brutal-lg)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b-4"
          style={{ background: 'var(--color-primary)', borderColor: 'var(--color-border-strong)' }}
        >
          <h2 className="text-lg font-black text-white uppercase tracking-wider">Settings</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-white text-white flex items-center justify-center font-black hover:bg-white/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme */}
          <div
            className="p-4 border-2"
            style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
          >
            <h3 className="font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              Appearance
            </h3>
            <div className="flex gap-3">
              {(['light', 'dark'] as const).map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 px-4 py-2 border-2 cursor-pointer font-black text-xs uppercase tracking-wider transition-all duration-100 ${
                    theme === t ? '' : ''
                  }`}
                  style={{
                    borderColor: theme === t ? 'var(--color-primary)' : 'var(--color-border)',
                    background: theme === t ? 'var(--color-primary)' : 'transparent',
                    color: theme === t ? 'white' : 'var(--color-text)',
                    boxShadow: theme === t ? 'var(--shadow-brutal-sm)' : 'none'
                  }}
                >
                  <input
                    type="radio"
                    checked={theme === t}
                    onChange={() => setTheme(t)}
                    className="sr-only"
                  />
                  {t === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* Firebase Configuration */}
          <div
            className="p-4 border-2"
            style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
          >
            <h3 className="font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              Firebase Sync
            </h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className="w-10 h-6 border-2 relative transition-all duration-100 cursor-pointer"
                style={{
                  borderColor: firebaseEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                  background: firebaseEnabled ? 'var(--color-primary)' : 'transparent',
                  boxShadow: firebaseEnabled ? 'var(--shadow-brutal-sm)' : 'none'
                }}
                onClick={() => setFirebaseEnabled(!firebaseEnabled)}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 border transition-all duration-150"
                  style={{
                    left: firebaseEnabled ? '20px' : '2px',
                    background: firebaseEnabled ? 'white' : 'var(--color-muted)',
                    borderColor: 'var(--color-border-strong)'
                  }}
                />
              </div>
              <span className="font-black text-xs uppercase tracking-wider">Enable Firebase Sync</span>
            </label>

            {firebaseEnabled && (
              <div className="mt-3">
                <FirebaseConfig config={firebaseConfig} onConfigChange={setFirebaseConfig} />
              </div>
            )}

            {firebaseEnabled && firebaseConfig && (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className="w-10 h-6 border-2 relative transition-all duration-100 cursor-pointer"
                    style={{
                      borderColor: syncEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                      background: syncEnabled ? 'var(--color-primary)' : 'transparent',
                      boxShadow: syncEnabled ? 'var(--shadow-brutal-sm)' : 'none'
                    }}
                    onClick={() => setSyncEnabled(!syncEnabled)}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 border transition-all duration-150"
                      style={{
                        left: syncEnabled ? '20px' : '2px',
                        background: syncEnabled ? 'white' : 'var(--color-muted)',
                        borderColor: 'var(--color-border-strong)'
                      }}
                    />
                  </div>
                  <span className="font-black text-xs uppercase tracking-wider">Auto-Sync</span>
                </label>
              </div>
            )}
          </div>

          {/* Database Info */}
          <div
            className="p-4 border-2"
            style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
          >
            <h3 className="font-black text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database
            </h3>
            <p className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
              All data is stored locally on your device. Enable Firebase sync to backup to the cloud.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-6 py-4 border-t-4"
          style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-background)' }}
        >
          <button onClick={onClose} className="btn-secondary text-xs uppercase tracking-wider">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary text-xs uppercase tracking-wider">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
