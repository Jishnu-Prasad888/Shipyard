import React, { useState, useEffect } from 'react'
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
  const [syncStatus, setSyncStatus] = useState<any>(null)

  useEffect(() => {
    loadSyncStatus()
  }, [])

  const loadSyncStatus = async () => {
    const status = await window.electron.sync.status()
    setSyncStatus(status)
  }

  const handleSave = async () => {
    const updatedSettings = {
      theme,
      firebaseEnabled,
      syncEnabled,
      firebaseConfig
    }

    await window.electron.settings.save(updatedSettings)
    dispatch(setSettings(updatedSettings))

    // Apply theme
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      window.electron.darkMode.toggle(true)
    } else {
      document.documentElement.classList.remove('dark')
      window.electron.darkMode.toggle(false)
    }

    onClose()
  }

  const handleSyncNow = async () => {
    const result = await window.electron.sync.start()
    alert(result.message)
    loadSyncStatus()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="w-full max-w-2xl surface rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-primary-soft transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme */}
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              Theme
            </h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={theme === 'light'}
                  onChange={() => setTheme('light')}
                  className="text-primary"
                />
                Light
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={theme === 'dark'}
                  onChange={() => setTheme('dark')}
                  className="text-primary"
                />
                Dark
              </label>
            </div>
          </div>

          {/* Firebase Configuration */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Key className="w-4 h-4" />
              Firebase Sync
            </h3>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={firebaseEnabled}
                onChange={(e) => setFirebaseEnabled(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Enable Firebase Sync
            </label>

            {firebaseEnabled && (
              <FirebaseConfig config={firebaseConfig} onConfigChange={setFirebaseConfig} />
            )}

            {firebaseEnabled && firebaseConfig && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={syncEnabled}
                    onChange={(e) => setSyncEnabled(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  Auto-sync
                </label>

                {syncStatus && (
                  <div className="p-4 bg-primary-soft rounded-lg">
                    <p className="text-sm">
                      <span className="font-medium">Sync Status:</span>{' '}
                      {syncStatus.isSyncing ? 'Syncing...' : 'Idle'}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Unsynced Items:</span>{' '}
                      {syncStatus.unsyncedCount}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleSyncNow}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
                >
                  Sync Now
                </button>
              </>
            )}
          </div>

          {/* Database Info */}
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database
            </h3>
            <p className="text-sm text-muted">
              All data is stored locally on your device. Enable Firebase sync to backup to the
              cloud.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg hover:bg-primary-soft transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
