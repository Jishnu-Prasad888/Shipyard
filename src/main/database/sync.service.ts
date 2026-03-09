import { DatabaseService } from './database.service.js'

const SYNCED_TABLES = ['folders', 'docks', 'boards', 'lists', 'cards']

export class SyncService {
  private static instance: SyncService
  private databaseService: DatabaseService
  private firebaseService: any = null
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing = false
  private syncEnabled = false
  private lastSyncTime: number | null = null
  private lastSyncResult: { success: boolean; message: string } | null = null

  private constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
  }

  static getInstance(databaseService: DatabaseService): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(databaseService)
    }
    return SyncService.instance
  }

  async initialize(config: any): Promise<{ success: boolean; message: string }> {
    try {
      // Validate required fields
      if (!config?.apiKey || !config?.projectId || !config?.authDomain) {
        return { success: false, message: 'Missing required Firebase config fields (apiKey, projectId, authDomain)' }
      }

      // Reset old instance if re-initializing
      if (this.firebaseService) {
        this.stopSync()
        this.firebaseService = null
      }

      const { initializeApp, getApps, getApp } = await import('firebase/app')
      const { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, writeBatch } =
        await import('firebase/firestore')

      // Avoid duplicate app error
      const existingApps = getApps()
      const app = existingApps.length > 0 ? getApp() : initializeApp(config)
      const db = getFirestore(app)

      this.firebaseService = { db, writeBatch, doc, setDoc, deleteDoc, getDocs, collection }
      this.syncEnabled = true

      return { success: true, message: 'Firebase connected successfully' }
    } catch (error: any) {
      console.error('Firebase initialization error:', error)
      this.syncEnabled = false
      return { success: false, message: error?.message || 'Firebase initialization failed' }
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.firebaseService) {
      return { success: false, message: 'Firebase not initialized. Check your config.' }
    }
    try {
      const { db, getDocs, collection } = this.firebaseService
      // Try a lightweight read
      await getDocs(collection(db, '_shipyard_ping'))
      return { success: true, message: 'Connection successful ✓' }
    } catch (error: any) {
      // Permission denied is actually OK — it means we reached Firebase
      if (error?.code === 'permission-denied') {
        return { success: true, message: 'Reached Firebase (permission denied on ping — configure Firestore rules)' }
      }
      return { success: false, message: error?.message || 'Connection failed' }
    }
  }

  private startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }
    // Sync every 60 seconds
    this.syncInterval = setInterval(async () => {
      await this.pushToFirebase()
    }, 60000)
  }

  enableAutoSync() {
    if (this.syncEnabled) {
      this.startAutoSync()
    }
  }

  async pushToFirebase(): Promise<{ success: boolean; message: string }> {
    if (!this.syncEnabled || !this.firebaseService) {
      return { success: false, message: 'Firebase not configured' }
    }
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' }
    }

    this.isSyncing = true
    try {
      const unsyncedRecords = this.databaseService.getUnsyncedRecords()
      if (unsyncedRecords.length === 0) {
        this.lastSyncTime = Date.now()
        this.lastSyncResult = { success: true, message: 'Everything already synced' }
        return this.lastSyncResult
      }

      const { db, writeBatch, doc } = this.firebaseService
      const batch = writeBatch(db)

      for (const record of unsyncedRecords) {
        const data = record.data ? JSON.parse(record.data) : null
        const docRef = doc(db, record.table, record.recordId)
        switch (record.operation) {
          case 'CREATE':
          case 'UPDATE':
            if (data) {
              batch.set(docRef, { ...data, _syncedAt: Date.now(), _lastModified: record.timestamp }, { merge: true })
            }
            break
          case 'DELETE':
            batch.delete(docRef)
            break
        }
      }

      await batch.commit()
      const syncedIds = unsyncedRecords.map((r: any) => r.id)
      this.databaseService.markAsSynced(syncedIds)

      this.lastSyncTime = Date.now()
      this.lastSyncResult = { success: true, message: `Pushed ${unsyncedRecords.length} changes to Firebase` }
      return this.lastSyncResult
    } catch (error: any) {
      const result = { success: false, message: error?.message || 'Push failed' }
      this.lastSyncResult = result
      return result
    } finally {
      this.isSyncing = false
    }
  }

  // Alias for backward compat
  async startSync(): Promise<{ success: boolean; message: string }> {
    return this.pushToFirebase()
  }

  async pullFromFirebase(): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
    if (!this.syncEnabled || !this.firebaseService) {
      return { success: false, message: 'Firebase not configured' }
    }

    try {
      const { db, getDocs, collection } = this.firebaseService
      const counts: Record<string, number> = {}

      for (const tableName of SYNCED_TABLES) {
        try {
          const snapshot = await getDocs(collection(db, tableName))
          let count = 0

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data()
            // Strip internal sync fields
            const { _syncedAt, _lastModified, ...record } = data
            record.id = docSnap.id

            const existing = this.databaseService.findById(tableName, docSnap.id)
            if (existing) {
              // Only overwrite if remote is newer
              const remoteTs = _lastModified || 0
              const localTs = existing.updatedAt || existing.createdAt || 0
              if (remoteTs >= localTs) {
                try { this.databaseService.update(tableName, docSnap.id, record) } catch {}
                count++
              }
            } else {
              try { this.databaseService.create(tableName, record) } catch {}
              count++
            }
          }

          counts[tableName] = count
        } catch (err) {
          console.warn(`Could not pull ${tableName}:`, err)
        }
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      return {
        success: true,
        message: `Pulled ${total} records from Firebase`,
        counts
      }
    } catch (error: any) {
      return { success: false, message: error?.message || 'Pull failed' }
    }
  }

  getSyncStatus() {
    const unsyncedCount = this.databaseService.getUnsyncedRecords().length
    return {
      isSyncing: this.isSyncing,
      syncEnabled: this.syncEnabled,
      unsyncedCount,
      lastSyncTime: this.lastSyncTime,
      lastSyncResult: this.lastSyncResult
    }
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.syncEnabled = false
  }
}
