import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseService } from './database/database.service.js'
import { SyncService } from './database/sync.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let databaseService: DatabaseService
let syncService: SyncService

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#E8F3FA'
  })

  // Initialize database
  databaseService = DatabaseService.getInstance()
  await databaseService.initialize()

  // Initialize sync service
  syncService = SyncService.getInstance(databaseService)

  // ── Auto-restore Firebase from saved settings ──
  const savedSettings = databaseService.getSettings()
  if (savedSettings?.firebaseEnabled && savedSettings?.firebaseConfig) {
    try {
      const result = await syncService.initialize(savedSettings.firebaseConfig)
      console.log('[Firebase] Auto-init on startup:', result.message)
      if (result.success && savedSettings.syncEnabled) {
        syncService.enableAutoSync()
      }
    } catch (err) {
      console.error('[Firebase] Auto-init failed:', err)
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ── IPC: Database ──
ipcMain.handle('db:query', async (_event, { operation, table, data, id }) => {
  try {
    switch (operation) {
      case 'findAll':       return databaseService.findAll(table)
      case 'findById':      return databaseService.findById(table, id)
      case 'create':        return databaseService.create(table, data)
      case 'update':        return databaseService.update(table, id, data)
      case 'delete':        return databaseService.delete(table, id)
      case 'getBoardWithDetails': return databaseService.getBoardWithDetails(id)
      case 'getDocksWithFolders': return databaseService.getDocksWithFolders()
      default:              throw new Error(`Unknown operation: ${operation}`)
    }
  } catch (error) {
    console.error('Database error:', error)
    throw error
  }
})

// ── IPC: Settings ──
ipcMain.handle('settings:get', async () => {
  return databaseService.getSettings()
})

ipcMain.handle('settings:save', async (_event, settings) => {
  databaseService.saveSettings(settings)

  if (settings.firebaseEnabled && settings.firebaseConfig) {
    const result = await syncService.initialize(settings.firebaseConfig)
    if (result.success && settings.syncEnabled) {
      syncService.enableAutoSync()
    } else if (!settings.syncEnabled) {
      syncService.stopSync()
      // Re-init without auto-sync
      await syncService.initialize(settings.firebaseConfig)
    }
    return { ...settings, _initResult: result }
  } else {
    syncService.stopSync()
  }

  return settings
})

// ── IPC: Sync ──
ipcMain.handle('sync:start', async () => {
  return syncService.pushToFirebase()
})

ipcMain.handle('sync:pull', async () => {
  return syncService.pullFromFirebase()
})

ipcMain.handle('sync:test', async () => {
  return syncService.testConnection()
})

ipcMain.handle('sync:status', async () => {
  return syncService.getSyncStatus()
})

// ── IPC: Dark mode ──
ipcMain.handle('dark-mode:toggle', async (_event, enabled) => {
  if (mainWindow) {
    mainWindow.webContents.insertCSS(
      enabled
        ? `html { background: #0f0c1b; }`
        : `html { background: #f4f8fb; }`
    )
  }
})
