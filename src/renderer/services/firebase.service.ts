import { initializeApp, FirebaseApp, FirebaseOptions } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch
} from 'firebase/firestore'

type FirebaseRecord = Record<string, unknown>

export class FirebaseService {
  private static instance: FirebaseService | null = null
  private app: FirebaseApp | null = null
  private db: Firestore | null = null
  private initialized = false

  private constructor(config: FirebaseOptions) {
    try {
      this.app = initializeApp(config)
      this.db = getFirestore(this.app)
      this.initialized = true
    } catch (error) {
      console.error('Firebase initialization error:', error)
    }
  }

  static getInstance(config?: FirebaseOptions): FirebaseService {
    if (!FirebaseService.instance && config) FirebaseService.instance = new FirebaseService(config)
    return FirebaseService.instance!
  }

  static resetInstance(): void {
    FirebaseService.instance = null
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async sync(
    syncData: Array<{
      id: string
      operation: string
      table: string
      recordId: string
      data: FirebaseRecord
      timestamp: number
    }>
  ): Promise<{ success: boolean; message: string }> {
    if (!this.db) return { success: false, message: 'Firebase not initialized' }
    try {
      const batch = writeBatch(this.db)
      for (const record of syncData) {
        const reference = doc(this.db, record.table, record.recordId)
        if (record.operation === 'DELETE') {
          batch.delete(reference)
        } else if (record.operation === 'CREATE' || record.operation === 'UPDATE') {
          batch.set(
            reference,
            {
              ...record.data,
              schemaVersion: 2,
              _syncedAt: Date.now(),
              _lastModified: record.timestamp
            },
            { merge: true }
          )
        }
      }
      await batch.commit()
      return { success: true, message: `Successfully synced ${syncData.length} records` }
    } catch (error) {
      console.error('Sync error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown sync error'
      }
    }
  }

  async fetchCollection(collectionName: string): Promise<FirebaseRecord[]> {
    if (!this.db) return []
    try {
      const snapshot = await getDocs(collection(this.db, collectionName))
      return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))
    } catch (error) {
      console.error(`Error fetching ${collectionName}:`, error)
      return []
    }
  }

  async upsertDocument(collectionName: string, id: string, data: FirebaseRecord): Promise<boolean> {
    if (!this.db) return false
    try {
      const modified = data._lastModified || Date.now()
      await setDoc(
        doc(this.db, collectionName, id),
        { ...data, schemaVersion: 2, _lastModified: modified },
        { merge: true }
      )
      return true
    } catch (error) {
      console.error(`Error upserting to ${collectionName}:`, error)
      return false
    }
  }

  async deleteDocument(collectionName: string, id: string): Promise<boolean> {
    if (!this.db) return false
    try {
      await deleteDoc(doc(this.db, collectionName, id))
      return true
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error)
      return false
    }
  }
}
