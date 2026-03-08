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
    backgroundColor: '#f4f8fb'
  })

  // Initialize database
  databaseService = DatabaseService.getInstance()
  await databaseService.initialize()

  // Initialize sync service
  syncService = SyncService.getInstance(databaseService)

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

// IPC Handlers
ipcMain.handle('db:query', async (_event, { operation, table, data, id }) => {
  try {
    switch (operation) {
      case 'findAll':
        return await databaseService.findAll(table)
      case 'findById':
        return await databaseService.findById(table, id)
      case 'create':
        return await databaseService.create(table, data)
      case 'update':
        return await databaseService.update(table, id, data)
      case 'delete':
        return await databaseService.delete(table, id)
      case 'getBoardWithDetails':
        return await databaseService.getBoardWithDetails(id)
      case 'getDocksWithFolders':
        return await databaseService.getDocksWithFolders()
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  } catch (error) {
    console.error('Database error:', error)
    throw error
  }
})

ipcMain.handle('settings:get', async () => {
  return await databaseService.getSettings()
})

ipcMain.handle('settings:save', async (_event, settings) => {
  await databaseService.saveSettings(settings)

  // Update sync service
  if (settings.firebaseEnabled && settings.firebaseConfig) {
    await syncService.initialize(settings.firebaseConfig)
  }

  return settings
})

ipcMain.handle('sync:start', async () => {
  return await syncService.startSync()
})

ipcMain.handle('sync:status', async () => {
  return syncService.getSyncStatus()
})

// Handle dark mode
ipcMain.handle('dark-mode:toggle', async (_event, enabled) => {
  if (mainWindow) {
    if (enabled) {
      mainWindow.webContents.insertCSS(`
        html { background: #0f0c1b; }
      `)
    } else {
      mainWindow.webContents.insertCSS(`
        html { background: #f4f8fb; }
      `)
    }
  }
})
