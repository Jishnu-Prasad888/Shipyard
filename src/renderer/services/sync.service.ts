import { Settings } from '@shared/types'

export interface SyncStatus {
  isSyncing: boolean
  syncEnabled: boolean
  unsyncedCount: number
  lastSyncTime: number | null
  lastSyncResult?: any
}

export const getSyncStatus = async (): Promise<SyncStatus> => {
  try {
    return await window.electron.sync.status()
  } catch (error) {
    console.warn('sync:status failed', error)
    return {
      isSyncing: false,
      syncEnabled: false,
      unsyncedCount: 0,
      lastSyncTime: null,
      lastSyncResult: { success: false, message: 'Sync not available' }
    }
  }
}

export const pushSync = async () => {
  try {
    return await window.electron.sync.push()
  } catch (error) {
    console.warn('sync:push failed', error)
    return { success: false, message: 'Sync not available' }
  }
}

export const pullSync = async () => {
  try {
    return await window.electron.sync.pull()
  } catch (error) {
    console.warn('sync:pull failed', error)
    return { success: false, message: 'Sync not available' }
  }
}

export const saveSettings = async (settings: Settings) => window.electron.settings.save(settings)
