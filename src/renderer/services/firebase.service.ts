import { initializeApp, FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore'

export class FirebaseService {
  private static instance: FirebaseService | null = null
  private app: FirebaseApp | null = null
  private db: Firestore | null = null
  private initialized = false

  private constructor(config: any) {
    try {
      this.app = initializeApp(config)
      this.db = getFirestore(this.app)
      this.initialized = true
    } catch (error) {
      console.error('Firebase initialization error:', error)
      this.initialized = false
    }
  }

  static getInstance(config?: any): FirebaseService {
    if (!FirebaseService.instance && config) {
      FirebaseService.instance = new FirebaseService(config)
    }
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
      data: any
      timestamp: number
    }>
  ): Promise<{ success: boolean; message: string }> {
    if (!this.db) {
      return { success: false, message: 'Firebase not initialized' }
    }

    try {
      const batch = writeBatch(this.db)

      for (const record of syncData) {
        const docRef = doc(this.db, record.table, record.recordId)

        switch (record.operation) {
          case 'CREATE':
          case 'UPDATE':
            batch.set(
              docRef,
              {
                ...record.data,
                _syncedAt: Date.now(),
                _lastModified: record.timestamp
              },
              { merge: true }
            )
            break
          case 'DELETE':
            batch.delete(docRef)
            break
        }
      }

      await batch.commit()

      return {
        success: true,
        message: `Successfully synced ${syncData.length} records`
      }
    } catch (error) {
      console.error('Sync error:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown sync error'
      }
    }
  }

  async fetchCollection(collectionName: string): Promise<any[]> {
    if (!this.db) return []

    try {
      const snapshot = await getDocs(collection(this.db, collectionName))
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    } catch (error) {
      console.error(`Error fetching ${collectionName}:`, error)
      return []
    }
  }

  async upsertDocument(collectionName: string, id: string, data: any): Promise<boolean> {
    if (!this.db) return false

    try {
      await setDoc(doc(this.db, collectionName, id), data, { merge: true })
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
