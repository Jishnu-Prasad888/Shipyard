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

const COLLECTIONS: Record<string, string> = {
  folders: 'workspaces',
  docks: 'projects',
  lists: 'columns',
  cards: 'tasks',
  subcards: 'subtasks'
}

const LEGACY_COLLECTIONS: Record<string, string> = {
  workspaces: 'folders',
  projects: 'docks',
  columns: 'lists',
  tasks: 'cards',
  subtasks: 'subcards'
}

const FIELD_ALIASES: Record<string, string> = {
  parentId: 'parentWorkspaceId',
  folderId: 'workspaceId',
  dockId: 'projectId',
  listId: 'columnId',
  cardId: 'taskId',
  connectedCardIds: 'connectedTaskIds',
  connectedListIds: 'connectedColumnIds',
  subCards: 'subtasks',
  lists: 'columns',
  cards: 'tasks'
}

const LEGACY_FIELDS = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([legacy, canonical]) => [canonical, legacy])
)

const VALUE_ALIASES: Record<string, string> = {
  'card-to-card': 'task-to-task',
  'list-to-list': 'column-to-column'
}

const LEGACY_VALUES = Object.fromEntries(
  Object.entries(VALUE_ALIASES).map(([legacy, canonical]) => [canonical, legacy])
)

type FirebaseRecord = Record<string, unknown>
type IdentifiedFirebaseRecord = FirebaseRecord & { id: string }

export const canonicalCollectionName = (name: string): string => COLLECTIONS[name] || name

const renameFields = (
  value: unknown,
  aliases: Record<string, string>,
  valueAliases: Record<string, string>,
  preferTargetFields: boolean
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => renameFields(item, aliases, valueAliases, preferTargetFields))
  }
  if (typeof value === 'string') return valueAliases[value] || value
  if (!value || typeof value !== 'object') return value
  const record = value as FirebaseRecord
  const renamed: FirebaseRecord = Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      aliases[key] || key,
      renameFields(item, aliases, valueAliases, preferTargetFields)
    ])
  )
  for (const [source, target] of Object.entries(aliases)) {
    const preferred = preferTargetFields ? target : source
    if (Object.prototype.hasOwnProperty.call(record, preferred)) {
      renamed[target] = renameFields(record[preferred], aliases, valueAliases, preferTargetFields)
    }
  }
  return renamed
}

export const normalizeFirebaseRecord = (
  collectionName: string,
  data: unknown
): { collection: string; data: FirebaseRecord } => ({
  collection: canonicalCollectionName(collectionName),
  data: renameFields(data, FIELD_ALIASES, VALUE_ALIASES, true) as FirebaseRecord
})

export const legacyFirebaseRecord = (
  collectionName: string,
  data: unknown
): { collection: string; data: FirebaseRecord } => {
  const canonicalName = canonicalCollectionName(collectionName)
  return {
    collection: LEGACY_COLLECTIONS[canonicalName] || canonicalName,
    data: renameFields(data, LEGACY_FIELDS, LEGACY_VALUES, false) as FirebaseRecord
  }
}

export const firebaseWriteTargets = (
  collectionName: string,
  data: unknown
): Array<{ collection: string; data: FirebaseRecord; schemaVersion: 1 | 2 }> => {
  const canonical = normalizeFirebaseRecord(collectionName, data)
  const legacy = legacyFirebaseRecord(collectionName, canonical.data)
  if (canonical.collection === legacy.collection) {
    return [
      {
        collection: canonical.collection,
        data: { ...legacy.data, ...canonical.data },
        schemaVersion: 2 as const
      }
    ]
  }
  return [
    { ...canonical, schemaVersion: 2 as const },
    { ...legacy, schemaVersion: 1 as const }
  ]
}

export const resolveFirebaseRecords = (
  canonical: IdentifiedFirebaseRecord[],
  legacy: IdentifiedFirebaseRecord[]
): IdentifiedFirebaseRecord[] => {
  const resolved = new Map<string, { value: IdentifiedFirebaseRecord; canonical: boolean }>()
  for (const value of legacy) resolved.set(value.id, { value, canonical: false })
  for (const value of canonical) {
    const current = resolved.get(value.id)
    const currentModified = Number(current?.value?._lastModified || 0)
    const candidateModified = Number(value._lastModified || 0)
    if (!current || candidateModified >= currentModified) {
      resolved.set(value.id, { value, canonical: true })
    }
  }
  return Array.from(resolved.values()).map((item) => item.value)
}

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
        const targets = firebaseWriteTargets(record.table, record.data)
        for (const target of targets) {
          const reference = doc(this.db, target.collection, record.recordId)
          if (record.operation === 'DELETE') {
            batch.delete(reference)
          } else if (record.operation === 'CREATE' || record.operation === 'UPDATE') {
            batch.set(
              reference,
              {
                ...target.data,
                schemaVersion: target.schemaVersion,
                _syncedAt: Date.now(),
                _lastModified: record.timestamp
              },
              { merge: true }
            )
          }
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
    const canonicalName = canonicalCollectionName(collectionName)
    const legacyName = LEGACY_COLLECTIONS[canonicalName]
    try {
      const canonicalSnapshot = await getDocs(collection(this.db, canonicalName))
      const canonicalRows: IdentifiedFirebaseRecord[] = canonicalSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }))
      if (!legacyName || legacyName === canonicalName) {
        return canonicalRows.map((item) => normalizeFirebaseRecord(canonicalName, item).data)
      }
      const legacySnapshot = await getDocs(collection(this.db, legacyName))
      const legacyRows: IdentifiedFirebaseRecord[] = legacySnapshot.docs.map((item) => ({
        ...normalizeFirebaseRecord(legacyName, item.data()).data,
        id: item.id
      }))
      return resolveFirebaseRecords(canonicalRows, legacyRows)
    } catch (error) {
      console.error(`Error fetching ${canonicalName}:`, error)
      return []
    }
  }

  async upsertDocument(collectionName: string, id: string, data: FirebaseRecord): Promise<boolean> {
    if (!this.db) return false
    try {
      const targets = firebaseWriteTargets(collectionName, data)
      const modified = data._lastModified || Date.now()
      await Promise.all(
        targets.map((target) =>
          setDoc(
            doc(this.db!, target.collection, id),
            { ...target.data, schemaVersion: target.schemaVersion, _lastModified: modified },
            { merge: true }
          )
        )
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
      const canonicalName = canonicalCollectionName(collectionName)
      const legacyName = LEGACY_COLLECTIONS[canonicalName]
      await Promise.all([
        deleteDoc(doc(this.db, canonicalName, id)),
        ...(legacyName && legacyName !== canonicalName
          ? [deleteDoc(doc(this.db, legacyName, id))]
          : [])
      ])
      return true
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error)
      return false
    }
  }
}
