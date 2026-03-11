import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { schema } from './schema.js'
import { v4 as uuidv4 } from 'uuid'

export class DatabaseService {
  private static instance: DatabaseService
  private db: Database.Database
  private initialized = false

 private constructor() {
  const userDataPath = app.getPath('userData')

  // Use different DB files for dev and production
  const dbFileName = app.isPackaged ? 'shipyard.db' : 'shipyard-dev.db'
  const dbPath = path.join(userDataPath, dbFileName)

  // Ensure the directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  this.db = new Database(dbPath)
  this.db.pragma('foreign_keys = ON')
}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  async initialize() {
    if (this.initialized) return

    // Create tables
    this.db.exec(schema)

    // Migration for nested folders
    try {
      this.db.prepare('SELECT parentId FROM folders LIMIT 1').get()
    } catch (e: any) {
      if (e.message.includes('no such column')) {
        this.db.exec(
          'ALTER TABLE folders ADD COLUMN parentId TEXT REFERENCES folders(id) ON DELETE CASCADE'
        )
      }
    }

    // Migration for boards columns (color, tags, description)
    try {
      const boardCols = ['description', 'color', 'tags']
      for (const col of boardCols) {
        try {
          this.db.prepare(`SELECT "${col}" FROM boards LIMIT 1`).get()
        } catch (e: any) {
          if (e.message.includes('no such column')) {
            this.db.exec(`ALTER TABLE boards ADD COLUMN "${col}" TEXT`)
          }
        }
      }
    } catch (err) {
      console.warn('Migration for boards failed:', err)
    }

    // Migration for docks columns (description, tags, color)
    try {
      const dockCols = ['description', 'tags', 'color']
      for (const col of dockCols) {
        try {
          this.db.prepare(`SELECT "${col}" FROM docks LIMIT 1`).get()
        } catch (e: any) {
          if (e.message.includes('no such column')) {
            this.db.exec(`ALTER TABLE docks ADD COLUMN "${col}" TEXT`)
          }
        }
      }
    } catch (err) {
      console.warn('Migration for docks failed:', err)
    }

    // Check if default settings exist
    const settings = this.db.prepare('SELECT * FROM settings WHERE key = ?').get('app_settings')
    if (!settings) {
      const defaultSettings = {
        theme: 'light',
        firebaseEnabled: false,
        syncEnabled: false
      }
      this.db
        .prepare('INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)')
        .run('app_settings', JSON.stringify(defaultSettings), Date.now())
    }

    this.initialized = true
  }

  // Serialize values for SQLite (convert arrays/objects to JSON strings)
  private serializeValue(value: any): any {
    if (value === null || value === undefined) return null
    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
      return JSON.stringify(value)
    }
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  }

  // Generic CRUD operations
  findAll(table: string): any[] {
    try {
      return this.db.prepare(`SELECT * FROM "${table}"`).all()
    } catch (error) {
      console.error(`Error finding all in ${table}:`, error)
      return []
    }
  }

  findById(table: string, id: string): any {
    try {
      return this.db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id)
    } catch (error) {
      console.error(`Error finding ${id} in ${table}:`, error)
      return null
    }
  }

  create(table: string, data: any): any {
    const id = data.id || uuidv4()
    const now = Date.now()

    // Build the record with defaults
    const record: Record<string, any> = { id }

    // Copy data fields, serializing as needed
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue
      record[key] = this.serializeValue(value)
    }

    // Ensure timestamps
    if (!record.createdAt) record.createdAt = now
    if (table === 'folders' || table === 'subcards' || table === 'tags') {
      delete record.updatedAt
    } else {
      if (!record.updatedAt) record.updatedAt = now
    }

    const columns = Object.keys(record)
    const placeholders = columns.map(() => '?').join(', ')
    const values = columns.map((col) => record[col])

    // Quote column names to handle reserved words like "order" and "table"
    const quotedColumns = columns.map((c) => `"${c}"`).join(', ')

    try {
      this.db
        .prepare(`INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`)
        .run(...values)

      // Add to sync queue
      this.addToSyncQueue('CREATE', table, id, data)

      return this.findById(table, id)
    } catch (error) {
      console.error(`Error creating in ${table}:`, error)
      throw error
    }
  }

  update(table: string, id: string, data: any): any {
    const now = Date.now()

    // Filter out undefined values and serialize
    const updates: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue
      if (value !== undefined) {
        updates[key] = this.serializeValue(value)
      }
    }

    if (table === 'folders' || table === 'subcards' || table === 'tags') {
      delete updates.updatedAt
    } else {
      if (!updates.updatedAt) updates.updatedAt = now
    }

    const setClauses = Object.keys(updates)
      .map((key) => `"${key}" = ?`)
      .join(', ')
    const values = [...Object.values(updates), id]

    try {
      this.db.prepare(`UPDATE "${table}" SET ${setClauses} WHERE id = ?`).run(...values)

      // Add to sync queue
      this.addToSyncQueue('UPDATE', table, id, data)

      return this.findById(table, id)
    } catch (error) {
      console.error(`Error updating ${id} in ${table}:`, error)
      throw error
    }
  }

  delete(table: string, id: string): boolean {
    try {
      this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id)

      // Add to sync queue
      this.addToSyncQueue('DELETE', table, id, null)

      return true
    } catch (error) {
      console.error(`Error deleting ${id} from ${table}:`, error)
      return false
    }
  }

  // Settings
  getSettings(): any {
    try {
      const settings = this.db
        .prepare('SELECT * FROM settings WHERE key = ?')
        .get('app_settings') as any
      return settings ? JSON.parse(settings.value) : null
    } catch (error) {
      console.error('Error getting settings:', error)
      return { theme: 'light', firebaseEnabled: false, syncEnabled: false }
    }
  }

  saveSettings(settings: any): void {
    try {
      this.db
        .prepare('UPDATE settings SET value = ?, updatedAt = ? WHERE key = ?')
        .run(JSON.stringify(settings), Date.now(), 'app_settings')
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  // Sync Queue
  private addToSyncQueue(operation: string, tableName: string, recordId: string, data: any | null) {
    try {
      const id = uuidv4()
      this.db
        .prepare(
          `INSERT INTO sync_queue (id, operation, "table", recordId, data, timestamp, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, operation, tableName, recordId, data ? JSON.stringify(data) : null, Date.now(), 0)
    } catch (error) {
      // Don't let sync queue errors break the main operation
      console.error('Error adding to sync queue:', error)
    }
  }

  getUnsyncedRecords(): any[] {
    try {
      return this.db
        .prepare('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY timestamp ASC')
        .all()
    } catch (error) {
      console.error('Error getting unsynced records:', error)
      return []
    }
  }

  markAsSynced(ids: string[]) {
    if (ids.length === 0) return
    try {
      const placeholders = ids.map(() => '?').join(', ')
      this.db.prepare(`UPDATE sync_queue SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
    } catch (error) {
      console.error('Error marking as synced:', error)
    }
  }

  // Custom queries
  getDocksWithFolders(): any[] {
    try {
      return this.db
        .prepare(
          `SELECT d.*, f.name as folderName, f.color as folderColor
         FROM docks d
         LEFT JOIN folders f ON d.folderId = f.id
         ORDER BY d.updatedAt DESC`
        )
        .all()
    } catch (error) {
      console.error('Error getting docks with folders:', error)
      return []
    }
  }

  getBoardWithDetails(boardId: string): any {
    try {
      const board = this.db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any
      if (!board) return null

      const lists = this.db
        .prepare('SELECT * FROM lists WHERE boardId = ? ORDER BY "order" ASC')
        .all(boardId) as any[]

      for (const list of lists) {
        const cards = this.db
          .prepare('SELECT * FROM cards WHERE listId = ? ORDER BY "order" ASC')
          .all(list.id) as any[]

        for (const card of cards) {
          card.subCards = this.db
            .prepare('SELECT * FROM subcards WHERE cardId = ? ORDER BY createdAt ASC')
            .all(card.id)
          card.tags = card.tags ? JSON.parse(card.tags) : []
          card.connectedCardIds = card.connectedCardIds ? JSON.parse(card.connectedCardIds) : []
          card.connectedListIds = card.connectedListIds ? JSON.parse(card.connectedListIds) : []
        }

        list.cards = cards
      }

      const connections = this.db
        .prepare('SELECT * FROM connections WHERE boardId = ?')
        .all(boardId) as any[]
      for (const conn of connections) {
        conn.points = conn.points ? JSON.parse(conn.points) : []
      }

      board.lists = lists
      board.connections = connections

      return board
    } catch (error) {
      console.error('Error getting board with details:', error)
      return null
    }
  }

  searchDocks(query: string, tags?: string[]): any[] {
    try {
      let sql = `
        SELECT d.*, f.name as folderName
        FROM docks d
        LEFT JOIN folders f ON d.folderId = f.id
        WHERE d.name LIKE ? OR d.description LIKE ?
      `
      const params: string[] = [`%${query}%`, `%${query}%`]

      if (tags && tags.length > 0) {
        sql += ` AND (`
        const tagConditions = tags.map(() => `d.tags LIKE ?`).join(' OR ')
        sql += tagConditions + ')'
        tags.forEach((tag) => params.push(`%${tag}%`))
      }

      return this.db.prepare(sql).all(...params)
    } catch (error) {
      console.error('Error searching docks:', error)
      return []
    }
  }
}
