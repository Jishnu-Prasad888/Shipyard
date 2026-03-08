import { DatabaseService } from './database.service.js'

export class SyncService {
  private static instance: SyncService
  private databaseService: DatabaseService
  private firebaseService: any = null
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing = false
  private syncEnabled = false

  private constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
  }

  static getInstance(databaseService: DatabaseService): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(databaseService)
    }
    return SyncService.instance
  }

  async initialize(config: any) {
    try {
      // Dynamically import firebase
      const { initializeApp } = await import('firebase/app')
      const { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, writeBatch } =
        await import('firebase/firestore')

      const app = initializeApp(config)
      const db = getFirestore(app)

      this.firebaseService = {
        db,
        writeBatch,
        doc,
        setDoc,
        deleteDoc,
        getDocs,
        collection
      }

      this.syncEnabled = true
      this.startAutoSync()
    } catch (error) {
      console.error('Firebase initialization error:', error)
      this.syncEnabled = false
    }
  }

  private startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // Sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.startSync()
    }, 30000)
  }

  async startSync(): Promise<{ success: boolean; message: string }> {
    if (!this.syncEnabled || !this.firebaseService) {
      return { success: false, message: 'Sync not enabled or Firebase not configured' }
    }

    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' }
    }

    this.isSyncing = true

    try {
      // Get unsynced records
      const unsyncedRecords = this.databaseService.getUnsyncedRecords()

      if (unsyncedRecords.length === 0) {
        return { success: true, message: 'No records to sync' }
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
              batch.set(
                docRef,
                {
                  ...data,
                  _syncedAt: Date.now(),
                  _lastModified: record.timestamp
                },
                { merge: true }
              )
            }
            break
          case 'DELETE':
            batch.delete(docRef)
            break
        }
      }

      await batch.commit()

      // Mark records as synced
      const syncedIds = unsyncedRecords.map((r: any) => r.id)
      this.databaseService.markAsSynced(syncedIds)

      return {
        success: true,
        message: `Successfully synced ${unsyncedRecords.length} records`
      }
    } catch (error) {
      console.error('Sync error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown sync error'
      }
    } finally {
      this.isSyncing = false
    }
  }

  getSyncStatus() {
    const unsyncedCount = this.databaseService.getUnsyncedRecords().length
    return {
      isSyncing: this.isSyncing,
      syncEnabled: this.syncEnabled,
      unsyncedCount,
      lastSync: null
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
